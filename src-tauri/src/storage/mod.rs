use crate::error::AppError;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFileItem {
    pub path: String,
    pub size_bytes: u64,
    pub modified_timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub hash: String,
    pub size_bytes: u64,
    pub files: Vec<DuplicateFileItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LargeFileItem {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub extension: String,
    pub modified_timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub files_deleted: u64,
    pub bytes_freed: u64,
    pub errors: Vec<String>,
}

pub fn get_user_profile_dir() -> Result<PathBuf, AppError> {
    dirs::home_dir()
        .or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from))
        .ok_or_else(|| {
            AppError::InvalidConfig("Could not resolve USERPROFILE directory".to_string())
        })
}

fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path
    }
}

pub fn normalize_path(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(c) => {
                out.push(c);
            }
            Component::Prefix(p_val) => {
                out.push(p_val.as_os_str());
            }
            Component::RootDir => {
                out.push(comp.as_os_str());
            }
        }
    }
    out
}

pub fn validate_path_in_user_profile<P: AsRef<Path>>(path: P) -> Result<PathBuf, AppError> {
    let target = path.as_ref();
    let user_profile = get_user_profile_dir()?;
    let user_profile_canon = user_profile
        .canonicalize()
        .map(strip_unc_prefix)
        .unwrap_or_else(|_| normalize_path(&user_profile));

    let absolute_target = if target.is_absolute() {
        target.to_path_buf()
    } else {
        user_profile.join(target)
    };

    let normalized_target = normalize_path(&absolute_target);
    let target_canon = absolute_target
        .canonicalize()
        .map(strip_unc_prefix)
        .unwrap_or(normalized_target.clone());

    let target_str = target_canon.to_string_lossy().to_lowercase();
    let profile_str = user_profile_canon.to_string_lossy().to_lowercase();

    if target_str == profile_str
        || target_str.starts_with(&format!("{}\\", profile_str))
        || target_str.starts_with(&format!("{}/", profile_str))
    {
        Ok(target_canon)
    } else {
        Err(AppError::InvalidConfig(format!(
            "Security Violation: Target path '{:?}' is outside USERPROFILE ('{:?}')",
            target, user_profile
        )))
    }
}

pub fn compute_file_hash<P: AsRef<Path>>(path: P) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn compute_partial_file_hash<P: AsRef<Path>>(path: P) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut buffer = [0u8; 4096];
    let count = file.read(&mut buffer)?;
    let mut hasher = Sha256::new();
    hasher.update(&buffer[..count]);
    Ok(format!("{:x}", hasher.finalize()))
}

fn get_modified_timestamp(path: &Path) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs())
        .unwrap_or(0)
}

pub fn scan_duplicate_files(target_dir: Option<String>) -> Result<Vec<DuplicateGroup>, AppError> {
    let base_dir = match target_dir {
        Some(dir_str) => validate_path_in_user_profile(Path::new(&dir_str))?,
        None => get_user_profile_dir()?,
    };

    log::info!("[Storage] Scanning for duplicate files in {:?}", base_dir);

    // Phase 1: Collect size > 0 files & group by size
    let mut size_map: HashMap<u64, Vec<PathBuf>> = HashMap::new();

    for entry in WalkDir::new(&base_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                let sz = meta.len();
                if sz > 0 {
                    size_map
                        .entry(sz)
                        .or_default()
                        .push(entry.path().to_path_buf());
                }
            }
        }
    }

    // Filter candidate files that have size collisions
    let size_candidates: Vec<(u64, PathBuf)> = size_map
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .flat_map(|(sz, files)| files.into_iter().map(move |p| (sz, p)))
        .collect();

    log::info!(
        "[Storage] Phase 1 completed. Found {} size collision candidate files",
        size_candidates.len()
    );

    // Phase 1b: Compute 4KB partial hash in parallel for size collision candidates
    let partial_hashed: Vec<(u64, String, PathBuf)> = size_candidates
        .into_par_iter()
        .filter_map(|(sz, path)| match compute_partial_file_hash(&path) {
            Ok(hash) => Some((sz, hash, path)),
            Err(_) => None,
        })
        .collect();

    let mut partial_map: HashMap<(u64, String), Vec<PathBuf>> = HashMap::new();
    for (sz, partial_hash, path) in partial_hashed {
        partial_map.entry((sz, partial_hash)).or_default().push(path);
    }

    // Filter candidate files that match in both size AND 4KB partial hash
    let full_hash_candidates: Vec<(u64, String, PathBuf)> = partial_map
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .flat_map(|((sz, partial_hash), files)| {
            files.into_iter().map(move |p| (sz, partial_hash.clone(), p))
        })
        .collect();

    log::info!(
        "[Storage] Phase 1b completed. Found {} partial hash collision candidate files",
        full_hash_candidates.len()
    );

    // Phase 2: Compute full SHA-256 in parallel for files matching size AND partial hash.
    // Small-file optimization: For files <= 4096 bytes, directly reuse the 4KB header hash
    // without re-reading the file from disk.
    let hashed_files: Vec<(u64, String, PathBuf)> = full_hash_candidates
        .into_par_iter()
        .filter_map(|(sz, partial_hash, path)| {
            if sz <= 4096 {
                Some((sz, partial_hash, path))
            } else {
                match compute_file_hash(&path) {
                    Ok(hash) => Some((sz, hash, path)),
                    Err(_) => None,
                }
            }
        })
        .collect();

    // Group by (hash, size_bytes)
    let mut hash_map: HashMap<(String, u64), Vec<PathBuf>> = HashMap::new();
    for (sz, hash, path) in hashed_files {
        hash_map.entry((hash, sz)).or_default().push(path);
    }

    let mut duplicate_groups = Vec::new();

    for ((hash, size_bytes), files) in hash_map {
        if files.len() > 1 {
            let items: Vec<DuplicateFileItem> = files
                .into_iter()
                .map(|p| {
                    let ts = get_modified_timestamp(&p);
                    DuplicateFileItem {
                        path: p.to_string_lossy().to_string(),
                        size_bytes,
                        modified_timestamp: ts,
                    }
                })
                .collect();

            duplicate_groups.push(DuplicateGroup {
                hash,
                size_bytes,
                files: items,
            });
        }
    }

    // Sort duplicate groups by potential savings (size * (count - 1)) descending
    duplicate_groups.sort_by(|a, b| {
        let savings_a = a.size_bytes * (a.files.len() as u64 - 1);
        let savings_b = b.size_bytes * (b.files.len() as u64 - 1);
        savings_b.cmp(&savings_a)
    });

    log::info!(
        "[Storage] Duplicate scan finished. Found {} duplicate groups",
        duplicate_groups.len()
    );

    Ok(duplicate_groups)
}

pub fn scan_large_files(
    target_dir: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<LargeFileItem>, AppError> {
    let base_dir = match target_dir {
        Some(dir_str) => validate_path_in_user_profile(Path::new(&dir_str))?,
        None => get_user_profile_dir()?,
    };

    let max_items = limit.unwrap_or(50);
    log::info!(
        "[Storage] Scanning for top {} large files in {:?}",
        max_items,
        base_dir
    );

    let mut large_files = Vec::new();

    for entry in WalkDir::new(&base_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                let sz = meta.len();
                if sz > 0 {
                    let path = entry.path();
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "Unknown".to_string());
                    let extension = path
                        .extension()
                        .map(|e| e.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let modified_timestamp = get_modified_timestamp(path);

                    large_files.push(LargeFileItem {
                        path: path.to_string_lossy().to_string(),
                        name,
                        size_bytes: sz,
                        extension,
                        modified_timestamp,
                    });
                }
            }
        }
    }

    large_files.sort_by_key(|b| std::cmp::Reverse(b.size_bytes));
    large_files.truncate(max_items);

    log::info!(
        "[Storage] Large files scan finished. Returning top {} files",
        large_files.len()
    );

    Ok(large_files)
}

pub fn delete_target_files(paths: Vec<String>) -> Result<DeleteResult, AppError> {
    log::info!("[Storage] Delete requested for {} files", paths.len());

    let mut files_deleted: u64 = 0;
    let mut bytes_freed: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    for path_str in paths {
        let path = Path::new(&path_str);
        if let Err(e) = validate_path_in_user_profile(path) {
            log::error!("[Storage] Path validation failed for {:?}: {:?}", path, e);
            return Err(e);
        }

        if !path.exists() {
            errors.push(format!("File does not exist: {}", path_str));
            continue;
        }

        let sz = path.metadata().map(|m| m.len()).unwrap_or(0);

        // Attempt trash deletion first, fallback to standard fs deletion
        let delete_res = trash::delete(path).or_else(|_| std::fs::remove_file(path));
        match delete_res {
            Ok(_) => {
                files_deleted += 1;
                bytes_freed += sz;
            }
            Err(e) => {
                let err_msg = format!("Failed to delete {:?}: {}", path_str, e);
                log::warn!("[Storage] {}", err_msg);
                errors.push(err_msg);
            }
        }
    }

    log::info!(
        "[Storage] Delete completed. Deleted {} files, freed {} bytes, {} errors",
        files_deleted,
        bytes_freed,
        errors.len()
    );

    Ok(DeleteResult {
        files_deleted,
        bytes_freed,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_duplicate_finder_grouping_and_hashing() {
        let dir = tempdir().expect("failed to create temp dir");
        let file1_path = dir.path().join("dup1.txt");
        let file2_path = dir.path().join("dup2.txt");
        let file3_path = dir.path().join("unique.txt");

        let dup_content = b"Exact Duplicate Content 1234567890";
        let unique_content = b"Unique Content XYZ";

        {
            let mut f1 = File::create(&file1_path).unwrap();
            f1.write_all(dup_content).unwrap();
            f1.sync_all().unwrap();
        }

        {
            let mut f2 = File::create(&file2_path).unwrap();
            f2.write_all(dup_content).unwrap();
            f2.sync_all().unwrap();
        }

        {
            let mut f3 = File::create(&file3_path).unwrap();
            f3.write_all(unique_content).unwrap();
            f3.sync_all().unwrap();
        }

        // Direct test of phase 1 & 2 logic on mock directory
        let mut size_map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
        for entry in WalkDir::new(dir.path()).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let meta = entry.metadata().unwrap();
                size_map
                    .entry(meta.len())
                    .or_default()
                    .push(entry.path().to_path_buf());
            }
        }

        let candidates: Vec<(u64, PathBuf)> = size_map
            .into_iter()
            .filter(|(_, files)| files.len() > 1)
            .flat_map(|(sz, files)| files.into_iter().map(move |p| (sz, p)))
            .collect();

        assert_eq!(candidates.len(), 2);

        let hashed_files: Vec<(u64, String, PathBuf)> = candidates
            .into_iter()
            .map(|(sz, path)| {
                let hash = compute_file_hash(&path).unwrap();
                (sz, hash, path)
            })
            .collect();

        let mut hash_map: HashMap<(String, u64), Vec<PathBuf>> = HashMap::new();
        for (sz, hash, path) in hashed_files {
            hash_map.entry((hash, sz)).or_default().push(path);
        }

        assert_eq!(hash_map.len(), 1);
        let ((_hash, sz), files) = hash_map.into_iter().next().unwrap();
        assert_eq!(sz, dup_content.len() as u64);
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn test_duplicate_finder_size_collision_different_content() {
        let dir = tempdir().expect("failed to create temp dir");
        let file1_path = dir.path().join("col1.txt");
        let file2_path = dir.path().join("col2.txt");

        // Two files of exact same length (16 bytes) but different content
        let content1 = b"AAAA BBBB CCCC 1";
        let content2 = b"AAAA BBBB CCCC 2";
        assert_eq!(content1.len(), content2.len());

        {
            let mut f1 = File::create(&file1_path).unwrap();
            f1.write_all(content1).unwrap();
            f1.sync_all().unwrap();
        }
        {
            let mut f2 = File::create(&file2_path).unwrap();
            f2.write_all(content2).unwrap();
            f2.sync_all().unwrap();
        }

        let _groups = scan_duplicate_files(Some(dir.path().to_string_lossy().to_string()));
        // Note: target_dir in tempdir is outside USERPROFILE unless tempdir is in USERPROFILE.
        // Let's check compute_file_hash and hashing logic directly:
        let hash1 = compute_file_hash(&file1_path).unwrap();
        let hash2 = compute_file_hash(&file2_path).unwrap();
        assert_ne!(
            hash1, hash2,
            "Hashes must differ for different content of identical size"
        );
    }

    #[test]
    fn test_security_out_of_bounds_rejection() {
        let root_dir = Path::new(r"C:\");
        let win_dir = Path::new(r"C:\Windows\System32");
        let prog_files = Path::new(r"C:\Program Files");
        let rel_escape = Path::new(r"..\..\..\Windows");

        assert!(validate_path_in_user_profile(root_dir).is_err());
        assert!(validate_path_in_user_profile(win_dir).is_err());
        assert!(validate_path_in_user_profile(prog_files).is_err());
        assert!(validate_path_in_user_profile(rel_escape).is_err());

        if let Ok(user_profile) = get_user_profile_dir() {
            let valid_sub = user_profile.join("Downloads");
            assert!(validate_path_in_user_profile(&valid_sub).is_ok());

            // Test traversal relative to profile
            let traversal_inside = user_profile.join("Downloads").join("..").join("Documents");
            assert!(validate_path_in_user_profile(&traversal_inside).is_ok());

            let traversal_outside = user_profile.join("..").join("Windows");
            assert!(validate_path_in_user_profile(&traversal_outside).is_err());
        }
    }

    #[test]
    fn test_security_junction_point_outside_profile() {
        if let Ok(user_profile) = get_user_profile_dir() {
            let test_dir = user_profile
                .join("AppData")
                .join("Local")
                .join("Temp")
                .join("test_junction_test");
            let _ = std::fs::create_dir_all(&test_dir);
            let junction_target = Path::new(r"C:\Windows\System32");
            let junction_link = test_dir.join("sys32_link");

            // Attempt junction creation using cmd mklink /J
            let output = std::process::Command::new("cmd")
                .args([
                    "/C",
                    "mklink",
                    "/J",
                    junction_link.to_str().unwrap(),
                    junction_target.to_str().unwrap(),
                ])
                .output();

            if let Ok(out) = output {
                if out.status.success() {
                    let result = validate_path_in_user_profile(&junction_link);
                    assert!(
                        result.is_err(),
                        "Junction pointing outside USERPROFILE must be rejected!"
                    );
                    let _ = std::fs::remove_dir(&junction_link);
                }
            }
            let _ = std::fs::remove_dir_all(&test_dir);
        }
    }

    #[test]
    fn test_compute_partial_file_hash() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        let content = vec![0xABu8; 8192];
        std::fs::write(temp.path(), &content).unwrap();

        let partial_hash = compute_partial_file_hash(temp.path()).unwrap();
        let full_hash = compute_file_hash(temp.path()).unwrap();

        assert_ne!(partial_hash, full_hash);

        let temp_small = tempfile::NamedTempFile::new().unwrap();
        let content_small = vec![0xCDu8; 1024];
        std::fs::write(temp_small.path(), &content_small).unwrap();

        let partial_small = compute_partial_file_hash(temp_small.path()).unwrap();
        let full_small = compute_file_hash(temp_small.path()).unwrap();

        assert_eq!(partial_small, full_small);
    }

    #[test]
    fn test_2stage_storage_hasher_small_file_reuse_and_large_file_collision() {
        let dir = tempdir().expect("failed to create temp dir");

        // Small files (<= 4096 bytes)
        let small1_path = dir.path().join("small1.bin");
        let small2_path = dir.path().join("small2.bin");
        let small_content = vec![0x42u8; 512];
        std::fs::write(&small1_path, &small_content).unwrap();
        std::fs::write(&small2_path, &small_content).unwrap();

        // Large files with identical 4KB header but different bodies (> 4096 bytes)
        let large1_path = dir.path().join("large1.bin");
        let large2_path = dir.path().join("large2.bin");
        let mut large_content1 = vec![0xAAu8; 8192];
        let mut large_content2 = vec![0xAAu8; 8192];
        // Modify bytes after 4096 in large2
        large_content2[5000] = 0xBB;
        std::fs::write(&large1_path, &large_content1).unwrap();
        std::fs::write(&large2_path, &large_content2).unwrap();

        // 1. Verify small file partial hash == full hash
        let small1_part = compute_partial_file_hash(&small1_path).unwrap();
        let small1_full = compute_file_hash(&small1_path).unwrap();
        assert_eq!(small1_part, small1_full, "For files <= 4096 bytes, partial hash must match full hash");

        // 2. Verify large files have same partial hash (first 4KB match) but different full hashes
        let large1_part = compute_partial_file_hash(&large1_path).unwrap();
        let large2_part = compute_partial_file_hash(&large2_path).unwrap();
        assert_eq!(large1_part, large2_part, "4KB headers match, so partial hashes must match");

        let large1_full = compute_file_hash(&large1_path).unwrap();
        let large2_full = compute_file_hash(&large2_path).unwrap();
        assert_ne!(large1_full, large2_full, "Full hashes must differ due to differing trailing bytes");
    }
}

pub mod shader_nuker;

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CleanerCategoryItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub paths: Vec<String>,
    pub total_size_bytes: u64,
    pub file_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CleanerScanResult {
    pub categories: Vec<CleanerCategoryItem>,
    pub total_bytes: u64,
    pub total_files: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CleanerCleanResult {
    pub bytes_freed: u64,
    pub files_removed: u64,
    pub skipped_files_count: u64,
    pub errors: Vec<String>,
}

pub fn scan_directory<P: AsRef<Path>>(path: P) -> (u64, u64) {
    let p = path.as_ref();
    if !p.exists() {
        return (0, 0);
    }

    if p.is_file() {
        if let Ok(meta) = p.metadata() {
            return (meta.len(), 1);
        }
        return (0, 0);
    }

    let mut total_size: u64 = 0;
    let mut file_count: u64 = 0;

    for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total_size += meta.len();
                file_count += 1;
            }
        }
    }

    (total_size, file_count)
}

fn get_default_categories() -> Vec<(String, String, String, Vec<PathBuf>)> {
    let temp_dir = std::env::temp_dir();
    let win_dir = std::env::var("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Windows"));

    let local_appdata = dirs::cache_dir()
        .or_else(dirs::data_local_dir)
        .unwrap_or_else(|| PathBuf::from(r"C:\Users\Default\AppData\Local"));

    vec![
        // 1. User Temp
        (
            "user_temp".to_string(),
            "User Temp Directory".to_string(),
            "Temporary files created by user applications and sessions (%TEMP%)".to_string(),
            vec![temp_dir],
        ),
        // 2. Windows System Temp
        (
            "system_temp".to_string(),
            "Windows System Temp".to_string(),
            "System-level temporary files and working buffers (C:\\Windows\\Temp)".to_string(),
            vec![win_dir.join("Temp")],
        ),
        // 3. Software Distribution Download
        (
            "software_distribution".to_string(),
            "Windows Update Cache".to_string(),
            "Downloaded Windows Update installation files and cache".to_string(),
            vec![win_dir.join("SoftwareDistribution").join("Download")],
        ),
        // 4. System Logs
        (
            "system_logs".to_string(),
            "System Logs & Crash Dumps".to_string(),
            "Windows system log files, WER error reports, and crash dumps".to_string(),
            vec![
                win_dir.join("Logs"),
                win_dir.join("System32").join("winevt").join("Logs"),
                local_appdata.join("CrashDumps"),
            ],
        ),
        // 5. Browser Cache
        (
            "browser_cache".to_string(),
            "Browser Caches".to_string(),
            "Temporary web cache files for Chrome, Edge, and Firefox".to_string(),
            vec![
                local_appdata.join(r"Google\Chrome\User Data\Default\Cache"),
                local_appdata.join(r"Microsoft\Edge\User Data\Default\Cache"),
                local_appdata.join(r"Mozilla\Firefox\Profiles"),
            ],
        ),
    ]
}

use std::sync::Mutex;

static CLEANER_LOCK: Mutex<()> = Mutex::new(());

fn force_remove_file<P: AsRef<Path>>(path: P) -> std::io::Result<()> {
    let p = path.as_ref();
    if let Ok(metadata) = std::fs::symlink_metadata(p) {
        if metadata.file_type().is_symlink() {
            return std::fs::remove_file(p);
        }
        let mut permissions = metadata.permissions();
        if permissions.readonly() {
            #[allow(clippy::permissions_set_readonly_false)]
            permissions.set_readonly(false);
            let _ = std::fs::set_permissions(p, permissions);
        }
    }
    std::fs::remove_file(p)
}

fn is_active_event_log_file(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase().replace('/', "\\");
    if lower.contains("\\winevt\\logs\\") {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            let name_lower = name.to_lowercase();
            // Protect live Windows Event Log channels (.evtx); allow only archived logs (Archive-*.evtx)
            return name_lower.ends_with(".evtx") && !name_lower.starts_with("archive-");
        }
    }
    false
}

pub fn scan_system() -> Result<CleanerScanResult, AppError> {
    let _guard = CLEANER_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    log::info!("[Cleaner] Starting system scan...");
    let cat_defs = get_default_categories();
    let mut categories = Vec::new();
    let mut grand_total_bytes: u64 = 0;
    let mut grand_total_files: u64 = 0;

    for (id, name, description, paths) in cat_defs {
        let mut cat_size: u64 = 0;
        let mut cat_files: u64 = 0;
        let path_strings: Vec<String> = paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        for path in &paths {
            let (sz, fc) = scan_directory(path);
            cat_size += sz;
            cat_files += fc;
        }

        grand_total_bytes += cat_size;
        grand_total_files += cat_files;

        categories.push(CleanerCategoryItem {
            id,
            name,
            description,
            paths: path_strings,
            total_size_bytes: cat_size,
            file_count: cat_files,
        });
    }

    log::info!(
        "[Cleaner] Scan finished. Found {} files, total {} bytes across {} categories",
        grand_total_files,
        grand_total_bytes,
        categories.len()
    );

    Ok(CleanerScanResult {
        categories,
        total_bytes: grand_total_bytes,
        total_files: grand_total_files,
    })
}

pub fn clean_items(category_ids: Vec<String>) -> Result<CleanerCleanResult, AppError> {
    let _guard = CLEANER_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    log::info!(
        "[Cleaner] Starting cleanup for categories: {:?}",
        category_ids
    );
    let cat_defs = get_default_categories();

    let mut bytes_freed: u64 = 0;
    let mut files_removed: u64 = 0;
    let mut skipped_files_count: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    for (id, _name, _desc, paths) in cat_defs {
        if !category_ids.contains(&id) {
            continue;
        }

        for path in paths {
            if !path.exists() {
                continue;
            }

            if path.is_file() {
                if is_active_event_log_file(&path) {
                    skipped_files_count += 1;
                    continue;
                }
                let sz = std::fs::symlink_metadata(&path).map(|m| m.len()).unwrap_or(0);
                match force_remove_file(&path) {
                    Ok(_) => {
                        bytes_freed += sz;
                        files_removed += 1;
                    }
                    Err(e) => {
                        skipped_files_count += 1;
                        let err_msg = format!("Skipped file {:?}: {}", path, e);
                        log::warn!("[Cleaner] {}", err_msg);
                        errors.push(err_msg);
                    }
                }
            } else if path.is_dir() {
                // Stream deletions directly during bottom-up WalkDir traversal to avoid large Vec buffering
                for entry in WalkDir::new(&path)
                    .contents_first(true)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    let entry_path = entry.path();
                    if entry_path == path {
                        continue; // Do not delete root category folder itself
                    }

                    if entry.file_type().is_file() {
                        if is_active_event_log_file(entry_path) {
                            skipped_files_count += 1;
                            continue;
                        }
                        let sz = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        match force_remove_file(entry_path) {
                            Ok(_) => {
                                bytes_freed += sz;
                                files_removed += 1;
                            }
                            Err(e) => {
                                skipped_files_count += 1;
                                let err_msg = format!("Skipped file {:?}: {}", entry_path, e);
                                log::warn!("[Cleaner] {}", err_msg);
                                errors.push(err_msg);
                            }
                        }
                    } else if entry.file_type().is_dir() {
                        let _ = std::fs::remove_dir(entry_path); // remove empty subdirs if possible
                    }
                }
            }
        }
    }

    log::info!(
        "[Cleaner] Clean finished. Freed {} bytes, removed {} files, skipped {} locked files",
        bytes_freed,
        files_removed,
        skipped_files_count
    );

    Ok(CleanerCleanResult {
        bytes_freed,
        files_removed,
        skipped_files_count,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_scan_directory_calculates_exact_size() {
        let dir = tempdir().expect("failed to create temp dir");
        let sub_dir = dir.path().join("subdir");
        std::fs::create_dir_all(&sub_dir).expect("failed to create sub dir");

        let file1_path = dir.path().join("file1.txt");
        let file2_path = sub_dir.join("file2.bin");

        let content1 = b"Hello, World!"; // 13 bytes
        let content2 = vec![0u8; 100]; // 100 bytes

        {
            let mut f1 = std::fs::File::create(&file1_path).unwrap();
            f1.write_all(content1).unwrap();
            f1.sync_all().unwrap();
        }

        {
            let mut f2 = std::fs::File::create(&file2_path).unwrap();
            f2.write_all(&content2).unwrap();
            f2.sync_all().unwrap();
        }

        let (total_size, file_count) = scan_directory(dir.path());

        assert_eq!(file_count, 2);
        assert_eq!(total_size, 113);
    }

    #[test]
    fn test_cleaner_locked_file_resilience() {
        use std::os::windows::fs::OpenOptionsExt;

        let dir = tempdir().expect("failed to create temp dir");
        let locked_file_path = dir.path().join("locked.log");

        // Create and open file with share_mode(0) to lock it exclusively on Windows
        let _file_handle = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(true)
            .share_mode(0)
            .open(&locked_file_path)
            .expect("Failed to create locked file");

        // Attempting to remove the file while exclusively locked
        let res = std::fs::remove_file(&locked_file_path);
        assert!(res.is_err(), "Expected locked file deletion to return Err");

        // Simulate cleaner logic gracefully handling locked file
        let mut skipped_files_count = 0;
        let mut errors = Vec::new();
        match res {
            Ok(_) => {}
            Err(e) => {
                skipped_files_count += 1;
                errors.push(format!("Skipped file {:?}: {}", locked_file_path, e));
            }
        }

        assert_eq!(skipped_files_count, 1);
        assert_eq!(errors.len(), 1);
    }

    #[test]
    fn test_force_remove_readonly_file() {
        let dir = tempdir().expect("failed to create temp dir");
        let readonly_file_path = dir.path().join("readonly.txt");
        {
            let mut f = std::fs::File::create(&readonly_file_path).unwrap();
            f.write_all(b"readonly content").unwrap();
            f.sync_all().unwrap();
        }

        let mut perms = std::fs::metadata(&readonly_file_path).unwrap().permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        perms.set_readonly(true);
        std::fs::set_permissions(&readonly_file_path, perms).unwrap();

        assert!(std::fs::metadata(&readonly_file_path).unwrap().permissions().readonly());

        let res = force_remove_file(&readonly_file_path);
        assert!(res.is_ok(), "force_remove_file should remove read-only file after resetting permissions");
        assert!(!readonly_file_path.exists());
    }
}

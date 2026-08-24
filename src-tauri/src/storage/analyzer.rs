use super::guardrails::resolve_and_normalize_path;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::Emitter;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub is_dir: bool,
    pub modified_timestamp: u64,
    pub children: Option<Vec<FsTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RankedFsItem {
    pub rank: usize,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub modified_timestamp: u64,
    pub item_count: u64,
    pub percentage_of_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskScanResult {
    pub scan_id: String,
    pub root_path: String,
    pub total_bytes: u64,
    pub total_files: u64,
    pub total_dirs: u64,
    pub scan_duration_ms: u64,
    pub tree: FsTreeNode,
    pub top_folders: Vec<RankedFsItem>,
    pub top_files: Vec<RankedFsItem>,
    pub is_cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiskScanProgressPayload {
    pub scan_id: String,
    pub current_path: String,
    pub files_scanned: u64,
    pub directories_scanned: u64,
    pub total_bytes_scanned: u64,
    pub elapsed_ms: u64,
}

// ---------------------------------------------------------------------------
// Cancellation Token Registry
// ---------------------------------------------------------------------------

static CANCELLATION_REGISTRY: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_cancellation_registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    CANCELLATION_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register_cancellation_token(scan_id: &str) -> Arc<AtomicBool> {
    let mut reg = get_cancellation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    reg.entry(scan_id.to_string())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone()
}

pub fn unregister_cancellation_token(scan_id: &str) {
    let mut reg = get_cancellation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    reg.remove(scan_id);
}

pub fn cancel_scan(scan_id: Option<&str>) -> bool {
    let reg = get_cancellation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(id) = scan_id {
        if let Some(token) = reg.get(id) {
            token.store(true, Ordering::SeqCst);
            log::info!("[Storage Analyzer] Cancelled scan with ID '{}'", id);
            return true;
        }
        false
    } else {
        log::info!("[Storage Analyzer] Cancelling all active scans ({})", reg.len());
        for token in reg.values() {
            token.store(true, Ordering::SeqCst);
        }
        true
    }
}

struct CancellationGuard {
    scan_id: String,
}

impl Drop for CancellationGuard {
    fn drop(&mut self) {
        unregister_cancellation_token(&self.scan_id);
    }
}

// ---------------------------------------------------------------------------
// Internal Traversal Data Models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct RawFileEntry {
    path: PathBuf,
    name: String,
    size_bytes: u64,
    extension: Option<String>,
    modified_timestamp: u64,
}

#[derive(Debug)]
#[allow(dead_code)]
struct RawDirNode {
    path: PathBuf,
    name: String,
    modified_timestamp: u64,
    direct_files: Vec<RawFileEntry>,
    sub_dirs: Vec<PathBuf>,
}

fn get_modified_timestamp(path: &Path) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs())
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Tree Aggregation & Sizing Engine
// ---------------------------------------------------------------------------

fn aggregate_dir_tree(
    current_dir: &PathBuf,
    dirs_map: &HashMap<PathBuf, RawDirNode>,
    all_folders: &mut Vec<(PathBuf, String, u64, u64, u64)>, // (path, name, size, item_count, modified)
) -> FsTreeNode {
    let raw_node = dirs_map.get(current_dir);

    let (name, modified_timestamp, direct_files, sub_dirs) = if let Some(n) = raw_node {
        (
            n.name.clone(),
            n.modified_timestamp,
            &n.direct_files,
            &n.sub_dirs,
        )
    } else {
        let name = current_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| current_dir.to_string_lossy().to_string());
        (name, 0, &Vec::new(), &Vec::new())
    };

    let mut children_nodes = Vec::new();
    let mut total_size_bytes = 0u64;
    let mut total_file_count = 0u64;
    let mut total_dir_count = 0u64;

    // Recurse into subdirectories
    for sub_dir_path in sub_dirs {
        let child_tree = aggregate_dir_tree(sub_dir_path, dirs_map, all_folders);
        total_size_bytes += child_tree.size_bytes;
        total_file_count += child_tree.file_count;
        total_dir_count += 1 + child_tree.dir_count;
        children_nodes.push(child_tree);
    }

    // Add direct files
    for file in direct_files {
        total_size_bytes += file.size_bytes;
        total_file_count += 1;
        children_nodes.push(FsTreeNode {
            id: file.path.to_string_lossy().to_string(),
            name: file.name.clone(),
            path: file.path.to_string_lossy().to_string(),
            size_bytes: file.size_bytes,
            file_count: 0,
            dir_count: 0,
            is_dir: false,
            modified_timestamp: file.modified_timestamp,
            children: None,
        });
    }

    // Sort children by size descending
    children_nodes.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    let folder_item_count = total_file_count + total_dir_count;
    all_folders.push((
        current_dir.clone(),
        name.clone(),
        total_size_bytes,
        folder_item_count,
        modified_timestamp,
    ));

    FsTreeNode {
        id: current_dir.to_string_lossy().to_string(),
        name,
        path: current_dir.to_string_lossy().to_string(),
        size_bytes: total_size_bytes,
        file_count: total_file_count,
        dir_count: total_dir_count,
        is_dir: true,
        modified_timestamp,
        children: Some(children_nodes),
    }
}

// ---------------------------------------------------------------------------
// Main Multi-Threaded Filesystem Analyzer
// ---------------------------------------------------------------------------

pub fn scan_directory_tree(
    app: Option<&tauri::AppHandle>,
    target_path: String,
    scan_id_opt: Option<String>,
) -> Result<DiskScanResult, AppError> {
    let scan_id = scan_id_opt.unwrap_or_else(|| format!("scan-{}", Instant::now().elapsed().as_nanos()));
    let cancel_token = register_cancellation_token(&scan_id);
    let _guard = CancellationGuard {
        scan_id: scan_id.clone(),
    };

    let start_instant = Instant::now();
    let root_path_buf = resolve_and_normalize_path(Path::new(&target_path));

    if !root_path_buf.exists() {
        return Err(AppError::InvalidConfig(format!(
            "Target scan path does not exist: {}",
            root_path_buf.display()
        )));
    }

    log::info!(
        "[Storage Analyzer] Starting scan on '{:?}' (scan_id: {})",
        root_path_buf,
        scan_id
    );

    let mut dirs_map: HashMap<PathBuf, RawDirNode> = HashMap::new();
    let mut all_files: Vec<RawFileEntry> = Vec::new();

    let root_name = match root_path_buf.file_name() {
        Some(name) => name.to_string_lossy().to_string(),
        None => root_path_buf.to_string_lossy().to_string(),
    };

    dirs_map.insert(
        root_path_buf.clone(),
        RawDirNode {
            path: root_path_buf.clone(),
            name: root_name,
            modified_timestamp: get_modified_timestamp(&root_path_buf),
            direct_files: Vec::new(),
            sub_dirs: Vec::new(),
        },
    );

    let mut files_scanned = 0u64;
    let mut directories_scanned = 0u64;
    let mut total_bytes_scanned = 0u64;
    let mut last_progress_emit = Instant::now();
    let mut is_cancelled = cancel_token.load(Ordering::Relaxed);

    if !is_cancelled {
        // Traverse directory structure
        let walker = WalkDir::new(&root_path_buf)
            .follow_links(false)
            .same_file_system(true)
            .into_iter();

        for entry_res in walker {
            if cancel_token.load(Ordering::Relaxed) {
                log::info!("[Storage Analyzer] Scan '{}' halted via cancellation token", scan_id);
                is_cancelled = true;
                break;
            }

        let entry = match entry_res {
            Ok(e) => e,
            Err(err) => {
                log::debug!("[Storage Analyzer] Skipping inaccessible path: {}", err);
                continue;
            }
        };

        let entry_path = entry.path().to_path_buf();
        if entry_path == root_path_buf {
            continue;
        }

        let file_type = entry.file_type();
        let parent_path = entry_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| root_path_buf.clone());

        if file_type.is_dir() {
            directories_scanned += 1;
            let dir_name = entry.file_name().to_string_lossy().to_string();
            let mod_time = get_modified_timestamp(&entry_path);

            dirs_map.insert(
                entry_path.clone(),
                RawDirNode {
                    path: entry_path.clone(),
                    name: dir_name,
                    modified_timestamp: mod_time,
                    direct_files: Vec::new(),
                    sub_dirs: Vec::new(),
                },
            );

            dirs_map
                .entry(parent_path)
                .or_insert_with(|| RawDirNode {
                    path: entry_path.parent().unwrap().to_path_buf(),
                    name: "Unknown".to_string(),
                    modified_timestamp: 0,
                    direct_files: Vec::new(),
                    sub_dirs: Vec::new(),
                })
                .sub_dirs
                .push(entry_path.clone());
        } else if file_type.is_file() {
            files_scanned += 1;
            let file_size = match entry.metadata() {
                Ok(m) => m.len(),
                Err(_) => 0,
            };
            total_bytes_scanned += file_size;

            let file_name = entry.file_name().to_string_lossy().to_string();
            let extension = entry_path
                .extension()
                .map(|e| e.to_string_lossy().to_string());
            let mod_time = get_modified_timestamp(&entry_path);

            let file_entry = RawFileEntry {
                path: entry_path.clone(),
                name: file_name,
                size_bytes: file_size,
                extension,
                modified_timestamp: mod_time,
            };

            dirs_map
                .entry(parent_path)
                .or_insert_with(|| RawDirNode {
                    path: entry_path.parent().unwrap().to_path_buf(),
                    name: "Unknown".to_string(),
                    modified_timestamp: 0,
                    direct_files: Vec::new(),
                    sub_dirs: Vec::new(),
                })
                .direct_files
                .push(file_entry.clone());

            all_files.push(file_entry);
        }

        // Throttled real-time progress emission (every 100ms)
        if last_progress_emit.elapsed() >= Duration::from_millis(100) {
            if let Some(handle) = app {
                let payload = DiskScanProgressPayload {
                    scan_id: scan_id.clone(),
                    current_path: entry_path.to_string_lossy().to_string(),
                    files_scanned,
                    directories_scanned,
                    total_bytes_scanned,
                    elapsed_ms: start_instant.elapsed().as_millis() as u64,
                };
                let _ = handle.emit("disk-scan-progress", &payload);
            }
            last_progress_emit = Instant::now();
        }
    }
    }

    let mut all_folders_flat = Vec::new();
    let tree = aggregate_dir_tree(&root_path_buf, &dirs_map, &mut all_folders_flat);

    let total_scanned_bytes = tree.size_bytes;

    let mut top_folders_candidates: Vec<_> = all_folders_flat
        .into_iter()
        .filter(|(p, _, _, _, _)| p != &root_path_buf)
        .collect();
    top_folders_candidates.sort_by(|a, b| b.2.cmp(&a.2));
    top_folders_candidates.truncate(20);

    let top_folders: Vec<RankedFsItem> = top_folders_candidates
        .into_iter()
        .enumerate()
        .map(|(idx, (p, name, size_bytes, item_count, mod_time))| {
            let pct = if total_scanned_bytes > 0 {
                (size_bytes as f64 / total_scanned_bytes as f64) * 100.0
            } else {
                0.0
            };
            RankedFsItem {
                rank: idx + 1,
                name,
                path: p.to_string_lossy().to_string(),
                size_bytes,
                is_dir: true,
                extension: None,
                modified_timestamp: mod_time,
                item_count,
                percentage_of_total: pct,
            }
        })
        .collect();

    all_files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    all_files.truncate(20);

    let top_files: Vec<RankedFsItem> = all_files
        .into_iter()
        .enumerate()
        .map(|(idx, f)| {
            let pct = if total_scanned_bytes > 0 {
                (f.size_bytes as f64 / total_scanned_bytes as f64) * 100.0
            } else {
                0.0
            };
            RankedFsItem {
                rank: idx + 1,
                name: f.name,
                path: f.path.to_string_lossy().to_string(),
                size_bytes: f.size_bytes,
                is_dir: false,
                extension: f.extension,
                modified_timestamp: f.modified_timestamp,
                item_count: 1,
                percentage_of_total: pct,
            }
        })
        .collect();

    let duration_ms = start_instant.elapsed().as_millis() as u64;

    if let Some(handle) = app {
        let final_payload = DiskScanProgressPayload {
            scan_id: scan_id.clone(),
            current_path: root_path_buf.to_string_lossy().to_string(),
            files_scanned,
            directories_scanned,
            total_bytes_scanned,
            elapsed_ms: duration_ms,
        };
        let _ = handle.emit("disk-scan-progress", &final_payload);
    }

    log::info!(
        "[Storage Analyzer] Scan completed in {}ms: {} files, {} dirs, {} bytes",
        duration_ms,
        files_scanned,
        directories_scanned,
        total_scanned_bytes
    );

    Ok(DiskScanResult {
        scan_id,
        root_path: root_path_buf.to_string_lossy().to_string(),
        total_bytes: total_scanned_bytes,
        total_files: tree.file_count,
        total_dirs: tree.dir_count,
        scan_duration_ms: duration_ms,
        tree,
        top_folders,
        top_files,
        is_cancelled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_scan_directory_tree_hierarchy_and_sizes() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let folder_a = root.join("folder_a");
        let sub_a = folder_a.join("sub_a");
        let folder_b = root.join("folder_b");

        fs::create_dir_all(&sub_a).unwrap();
        fs::create_dir_all(&folder_b).unwrap();

        fs::write(folder_a.join("file_a1.txt"), vec![0x1; 500]).unwrap();
        fs::write(folder_a.join("file_a2.txt"), vec![0x2; 300]).unwrap();
        fs::write(sub_a.join("file_sub.bin"), vec![0x3; 1200]).unwrap();
        fs::write(folder_b.join("file_b1.log"), vec![0x4; 200]).unwrap();
        fs::write(root.join("root_file.dat"), vec![0x5; 100]).unwrap();

        let result = scan_directory_tree(None, root.to_string_lossy().to_string(), None).unwrap();

        assert_eq!(result.total_bytes, 2300);
        assert_eq!(result.total_files, 5);
        assert_eq!(result.total_dirs, 3);
        assert!(!result.is_cancelled);

        assert_eq!(result.tree.size_bytes, 2300);
        assert_eq!(result.tree.file_count, 5);
        assert_eq!(result.tree.dir_count, 3);
        assert!(result.tree.children.is_some());

        let children = result.tree.children.as_ref().unwrap();
        assert_eq!(children[0].name, "folder_a");
        assert_eq!(children[0].size_bytes, 2000);
        assert_eq!(children[0].file_count, 3);
        assert_eq!(children[0].dir_count, 1);

        assert_eq!(children[1].name, "folder_b");
        assert_eq!(children[1].size_bytes, 200);

        assert_eq!(children[2].name, "root_file.dat");
        assert_eq!(children[2].size_bytes, 100);

        assert_eq!(result.top_folders.len(), 3);
        assert_eq!(result.top_folders[0].name, "folder_a");
        assert_eq!(result.top_folders[0].size_bytes, 2000);
        assert_eq!(result.top_folders[0].rank, 1);

        assert_eq!(result.top_folders[1].name, "sub_a");
        assert_eq!(result.top_folders[1].size_bytes, 1200);
        assert_eq!(result.top_folders[1].rank, 2);

        assert_eq!(result.top_folders[2].name, "folder_b");
        assert_eq!(result.top_folders[2].size_bytes, 200);
        assert_eq!(result.top_folders[2].rank, 3);

        assert_eq!(result.top_files.len(), 5);
        assert_eq!(result.top_files[0].name, "file_sub.bin");
        assert_eq!(result.top_files[0].size_bytes, 1200);
        assert_eq!(result.top_files[0].rank, 1);

        assert_eq!(result.top_files[1].name, "file_a1.txt");
        assert_eq!(result.top_files[1].size_bytes, 500);

        assert_eq!(result.top_files[2].name, "file_a2.txt");
        assert_eq!(result.top_files[2].size_bytes, 300);
    }

    #[test]
    fn test_scan_directory_cancellation() {
        let dir = tempdir().unwrap();
        let scan_id = "test-cancel-id".to_string();

        let token = register_cancellation_token(&scan_id);
        token.store(true, Ordering::SeqCst);

        let result = scan_directory_tree(None, dir.path().to_string_lossy().to_string(), Some(scan_id.clone())).unwrap();
        assert!(result.is_cancelled);

        let token2 = register_cancellation_token("test-cancel-2");
        assert!(!token2.load(Ordering::Relaxed));
        assert!(cancel_scan(Some("test-cancel-2")));
        assert!(token2.load(Ordering::Relaxed));
    }
}

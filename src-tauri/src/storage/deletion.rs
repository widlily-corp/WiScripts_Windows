use super::guardrails::{is_system_protected_path, resolve_and_normalize_path};
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeletionItemReport {
    pub path: String,
    pub success: bool,
    pub bytes_freed: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeletionResult {
    pub items_deleted: u64,
    pub bytes_freed: u64,
    pub errors: Vec<String>,
    pub item_reports: Vec<DeletionItemReport>,
    pub permanent: bool,
}

/// Computes the disk size in bytes of a file or directory before deletion.
pub fn calculate_target_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.is_file() || meta.file_type().is_symlink() {
            return meta.len();
        }
    }
    // Directory: traverse and sum
    let mut total = 0u64;
    for entry in WalkDir::new(path).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        if let Ok(meta) = entry.metadata() {
            if meta.is_file() {
                total += meta.len();
            }
        }
    }
    total
}

/// Clears the Windows read-only attribute on a given filesystem item if set.
fn clear_readonly(path: &Path) -> std::io::Result<()> {
    if let Ok(meta) = fs::symlink_metadata(path) {
        let mut permissions = meta.permissions();
        if permissions.readonly() {
            permissions.set_readonly(false);
            fs::set_permissions(path, permissions)?;
        }
    }
    Ok(())
}

/// Permanently and recursively removes a file or directory, clearing readonly attributes.
fn force_remove_permanently(path: &Path) -> Result<(), std::io::Error> {
    if !path.exists() {
        return Ok(());
    }

    let meta = fs::symlink_metadata(path)?;
    if meta.is_file() || meta.file_type().is_symlink() {
        let _ = clear_readonly(path);
        return fs::remove_file(path);
    }

    // Bottom-up traversal to clear permissions and remove files & subdirectories
    for entry in WalkDir::new(path)
        .contents_first(true)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let entry_path = entry.path();
        let _ = clear_readonly(entry_path);

        if entry.file_type().is_dir() {
            if entry_path != path {
                let _ = fs::remove_dir(entry_path);
            }
        } else {
            let _ = fs::remove_file(entry_path);
        }
    }

    let _ = clear_readonly(path);
    fs::remove_dir(path)
}

/// Executes safe filesystem deletion across a list of target paths.
/// Supports moving to Recycle Bin (`permanent == false`) or permanent deletion (`permanent == true`).
pub fn delete_filesystem_items(
    paths: Vec<String>,
    permanent: bool,
) -> Result<DeletionResult, AppError> {
    log::info!(
        "[Storage Deletion] Deletion requested for {} paths (permanent: {})",
        paths.len(),
        permanent
    );

    let mut items_deleted = 0u64;
    let mut bytes_freed = 0u64;
    let mut errors = Vec::new();
    let mut item_reports = Vec::new();

    for path_str in paths {
        let target_path = Path::new(&path_str);
        let resolved = resolve_and_normalize_path(target_path);

        // Guardrail validation
        let raw_check = is_system_protected_path(target_path);
        let (is_protected, reason_opt) = if raw_check.0 {
            raw_check
        } else {
            is_system_protected_path(&resolved)
        };
        if is_protected {
            let reason = reason_opt.unwrap_or("Protected system path");
            let err_msg = format!(
                "Security Violation: Protected system path '{}' cannot be deleted ({})",
                resolved.display(),
                reason
            );
            log::warn!("[Storage Deletion] {}", err_msg);
            errors.push(err_msg.clone());
            item_reports.push(DeletionItemReport {
                path: path_str,
                success: false,
                bytes_freed: 0,
                error: Some(err_msg),
            });
            continue;
        }

        if !resolved.exists() {
            let err_msg = format!("Item not found on disk: {}", resolved.display());
            log::warn!("[Storage Deletion] {}", err_msg);
            errors.push(err_msg.clone());
            item_reports.push(DeletionItemReport {
                path: path_str,
                success: false,
                bytes_freed: 0,
                error: Some(err_msg),
            });
            continue;
        }

        let item_size = calculate_target_size(&resolved);

        let delete_result = if permanent {
            force_remove_permanently(&resolved).map_err(|e| e.to_string())
        } else {
            trash::delete(&resolved).map_err(|e| format!("Failed to move to Recycle Bin: {}", e))
        };

        match delete_result {
            Ok(_) => {
                log::info!(
                    "[Storage Deletion] Successfully deleted {:?} (freed {} bytes)",
                    resolved,
                    item_size
                );
                items_deleted += 1;
                bytes_freed += item_size;
                item_reports.push(DeletionItemReport {
                    path: path_str,
                    success: true,
                    bytes_freed: item_size,
                    error: None,
                });
            }
            Err(e) => {
                log::error!(
                    "[Storage Deletion] Failed to delete {:?}: {}",
                    resolved,
                    e
                );
                let err_msg = format!("Deletion failed for '{}': {}", resolved.display(), e);
                errors.push(err_msg.clone());
                item_reports.push(DeletionItemReport {
                    path: path_str,
                    success: false,
                    bytes_freed: 0,
                    error: Some(err_msg),
                });
            }
        }
    }

    Ok(DeletionResult {
        items_deleted,
        bytes_freed,
        errors,
        item_reports,
        permanent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_deletion_blocked_by_guardrails() {
        let protected = vec![
            r"C:\Windows\System32".to_string(),
            r"C:\".to_string(),
            r"C:\System Volume Information".to_string(),
        ];
        let res = delete_filesystem_items(protected, true).unwrap();
        assert_eq!(res.items_deleted, 0);
        assert_eq!(res.errors.len(), 3);
        for report in res.item_reports {
            assert!(!report.success);
            assert!(report.error.unwrap().contains("Security Violation"));
        }
    }

    #[test]
    fn test_permanent_deletion_single_file_and_readonly() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("readonly_test.txt");
        fs::write(&file_path, b"Test Readonly Content 12345").unwrap();

        // Set file as readonly
        let mut perms = fs::metadata(&file_path).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&file_path, perms).unwrap();

        assert!(fs::metadata(&file_path).unwrap().permissions().readonly());

        let res = delete_filesystem_items(vec![file_path.to_string_lossy().to_string()], true).unwrap();
        assert_eq!(res.items_deleted, 1);
        assert_eq!(res.bytes_freed, 27);
        assert_eq!(res.errors.len(), 0);
        assert!(!file_path.exists());
    }

    #[test]
    fn test_permanent_deletion_recursive_folder() {
        let dir = tempdir().unwrap();
        let sub_folder = dir.path().join("nested_folder");
        let deep_folder = sub_folder.join("deep");
        fs::create_dir_all(&deep_folder).unwrap();

        let file1 = sub_folder.join("f1.bin");
        let file2 = deep_folder.join("f2.bin");
        fs::write(&file1, vec![0x11u8; 100]).unwrap();
        fs::write(&file2, vec![0x22u8; 200]).unwrap();

        let res = delete_filesystem_items(vec![sub_folder.to_string_lossy().to_string()], true).unwrap();
        assert_eq!(res.items_deleted, 1);
        assert_eq!(res.bytes_freed, 300);
        assert_eq!(res.errors.len(), 0);
        assert!(!sub_folder.exists());
    }
}

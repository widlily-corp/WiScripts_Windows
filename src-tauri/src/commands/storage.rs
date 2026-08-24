use crate::storage::{
    self, check_path_protection_status, delete_filesystem_items as fs_delete_items,
    get_all_disk_drives, resolve_and_normalize_path, scan_directory_tree, DeletionResult,
    DiskDriveInfo, DiskScanResult, PathProtectionStatus,
};
use std::path::Path;
use std::process::Command;

#[tauri::command]
pub async fn get_disk_drives() -> Result<Vec<DiskDriveInfo>, String> {
    log::info!("[IPC] get_disk_drives requested");
    tauri::async_runtime::spawn_blocking(move || {
        Ok(get_all_disk_drives())
    })
    .await
    .map_err(|e| format!("Join error in get_disk_drives: {}", e))?
}

#[tauri::command]
pub async fn scan_disk_space(
    app: tauri::AppHandle,
    path: String,
    scan_id: Option<String>,
) -> Result<DiskScanResult, String> {
    log::info!("[IPC] scan_disk_space requested for path '{}', scan_id: {:?}", path, scan_id);
    tauri::async_runtime::spawn_blocking(move || {
        scan_directory_tree(Some(&app), path, scan_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Join error in scan_disk_space: {}", e))?
}

#[tauri::command]
pub fn cancel_disk_scan(scan_id: Option<String>) -> Result<(), String> {
    log::info!("[IPC] cancel_disk_scan requested for scan_id: {:?}", scan_id);
    let _ = storage::cancel_scan(scan_id.as_deref());
    Ok(())
}

#[tauri::command]
pub async fn delete_filesystem_items(
    paths: Vec<String>,
    permanent: bool,
) -> Result<DeletionResult, String> {
    log::info!(
        "[IPC] delete_filesystem_items requested for {} items (permanent: {})",
        paths.len(),
        permanent
    );
    tauri::async_runtime::spawn_blocking(move || {
        fs_delete_items(paths, permanent).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Join error in delete_filesystem_items: {}", e))?
}

#[tauri::command]
pub fn check_path_protection(path: String) -> Result<PathProtectionStatus, String> {
    log::debug!("[IPC] check_path_protection requested for '{}'", path);
    Ok(check_path_protection_status(Path::new(&path)))
}

#[tauri::command]
pub fn open_in_file_explorer(path: String) -> Result<(), String> {
    log::info!("[IPC] open_in_file_explorer requested for path '{}'", path);
    let normalized = resolve_and_normalize_path(Path::new(&path));
    let path_str = normalized.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        if normalized.is_file() {
            Command::new("explorer")
                .arg(format!("/select,{}", path_str))
                .spawn()
                .map_err(|e| format!("Failed to open explorer for file '{}': {}", path_str, e))?;
        } else {
            Command::new("explorer")
                .arg(&path_str)
                .spawn()
                .map_err(|e| format!("Failed to open explorer for directory '{}': {}", path_str, e))?;
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_get_disk_drives_command() {
        tauri::async_runtime::block_on(async {
            let res = get_disk_drives().await;
            assert!(res.is_ok());
            let drives = res.unwrap();
            assert!(!drives.is_empty());
        });
    }

    #[test]
    fn test_check_path_protection_command() {
        let res_sys = check_path_protection(r"C:\Windows\System32".to_string()).unwrap();
        assert!(res_sys.is_protected);
        assert_eq!(res_sys.protection_level, "CriticalSystem");

        let res_safe = check_path_protection(r"C:\Users\Public\Downloads\safe.txt".to_string()).unwrap();
        assert!(!res_safe.is_protected);
        assert_eq!(res_safe.protection_level, "Safe");
    }

    #[test]
    fn test_delete_filesystem_items_command() {
        tauri::async_runtime::block_on(async {
            let dir = tempdir().unwrap();
            let file = dir.path().join("delete_cmd_test.txt");
            std::fs::write(&file, b"test content").unwrap();

            let res = delete_filesystem_items(vec![file.to_string_lossy().to_string()], true).await;
            assert!(res.is_ok());
            let del = res.unwrap();
            assert_eq!(del.items_deleted, 1);
            assert!(!file.exists());
        });
    }

    #[test]
    fn test_cancel_disk_scan_command() {
        let res = cancel_disk_scan(Some("dummy-scan-id".to_string()));
        assert!(res.is_ok());
        let res_all = cancel_disk_scan(None);
        assert!(res_all.is_ok());
    }
}

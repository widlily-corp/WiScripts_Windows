use serde::{Deserialize, Serialize};
use sysinfo::Disks;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskDriveInfo {
    pub mount_point: String,
    pub name: String,
    pub file_system: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub usage_percentage: f64,
    pub is_removable: bool,
    pub is_read_only: bool,
    pub is_system_drive: bool,
}

/// Discovers and enumerates all physical and removable logical drives on the system.
pub fn get_all_disk_drives() -> Vec<DiskDriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let system_root = std::env::var("SystemRoot")
        .or_else(|_| std::env::var("WINDIR"))
        .unwrap_or_else(|_| r"C:\Windows".to_string())
        .to_uppercase();

    let system_drive_prefix = if system_root.len() >= 2 && system_root.chars().nth(1) == Some(':') {
        &system_root[..2]
    } else {
        "C:"
    };

    let mut result = Vec::new();

    for disk in disks.list() {
        let mount_str = disk.mount_point().to_string_lossy().to_string();
        let normalized_mount = if mount_str.ends_with('\\') || mount_str.ends_with('/') {
            mount_str
        } else {
            format!("{}\\", mount_str)
        };

        let raw_name = disk.name().to_string_lossy().trim().to_string();
        let fs_str = disk.file_system().to_string_lossy().to_string();
        let total_bytes = disk.total_space();
        let available_bytes = disk.available_space();
        let used_bytes = total_bytes.saturating_sub(available_bytes);
        let usage_percentage = if total_bytes > 0 {
            ((used_bytes as f64) / (total_bytes as f64) * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };

        let is_removable = disk.is_removable();
        let is_read_only = false;

        let upper_mount = normalized_mount.to_uppercase();
        let is_system_drive = upper_mount.starts_with(system_drive_prefix);

        let drive_letter = if upper_mount.len() >= 2 && upper_mount.chars().nth(1) == Some(':') {
            &upper_mount[..2]
        } else {
            ""
        };

        let display_name = if !raw_name.is_empty() {
            if !drive_letter.is_empty() && !raw_name.contains(drive_letter) {
                format!("{} ({})", raw_name, drive_letter)
            } else {
                raw_name
            }
        } else if is_system_drive {
            format!("Local Disk ({})", drive_letter)
        } else if is_removable {
            format!("Removable Drive ({})", drive_letter)
        } else if !drive_letter.is_empty() {
            format!("Local Disk ({})", drive_letter)
        } else {
            "Storage Volume".to_string()
        };

        result.push(DiskDriveInfo {
            mount_point: normalized_mount,
            name: display_name,
            file_system: if fs_str.is_empty() { "NTFS".to_string() } else { fs_str },
            total_bytes,
            available_bytes,
            used_bytes,
            usage_percentage,
            is_removable,
            is_read_only,
            is_system_drive,
        });
    }

    // Sort: system drive first, then alphabetically by mount point
    result.sort_by(|a, b| {
        if a.is_system_drive != b.is_system_drive {
            b.is_system_drive.cmp(&a.is_system_drive)
        } else {
            a.mount_point.cmp(&b.mount_point)
        }
    });

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_all_disk_drives_returns_valid_drives() {
        let drives = get_all_disk_drives();
        assert!(!drives.is_empty(), "Should discover at least one disk drive");

        let has_system_drive = drives.iter().any(|d| d.is_system_drive);
        assert!(has_system_drive, "Should identify system drive");

        for d in &drives {
            assert!(!d.mount_point.is_empty());
            assert!(!d.name.is_empty());
            assert!(d.total_bytes >= d.available_bytes);
            assert!(d.usage_percentage >= 0.0 && d.usage_percentage <= 100.0);
        }
    }
}

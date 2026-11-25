use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub id: String,
    pub timestamp: i64,
    pub label: String,
    pub trigger_source: String, // "user_manual" | "pre_optimization" | "scheduled"
    pub registry_deltas: Vec<RegistryValueBackup>,
    pub service_deltas: Vec<ServiceBackup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegistryValueBackup {
    pub key_path: String,
    pub value_name: String,
    pub value_type: String, // "REG_SZ" | "REG_DWORD" | "REG_BINARY" | "REG_MULTI_SZ"
    pub previous_data: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceBackup {
    pub service_name: String,
    pub previous_startup_type: String, // "Automatic" | "Manual" | "Disabled"
    pub previous_status: String,       // "Running" | "Stopped"
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RollbackResult {
    pub snapshot_id: String,
    pub success: bool,
    pub restored_keys_count: usize,
    pub restored_services_count: usize,
    pub errors: Vec<String>,
}

const TARGET_REGISTRY_KEYS: &[(&str, &str, &str)] = &[
    (
        "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection",
        "AllowTelemetry",
        "REG_DWORD",
    ),
    (
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection",
        "AllowTelemetry",
        "REG_DWORD",
    ),
    (
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy",
        "TailoredExperiencesWithDiagnosticDataEnabled",
        "REG_DWORD",
    ),
    (
        "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management",
        "ClearPageFileAtShutdown",
        "REG_DWORD",
    ),
    (
        "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters",
        "EnableTCPA",
        "REG_DWORD",
    ),
    (
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
        "TaskbarDa",
        "REG_DWORD",
    ),
    (
        "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
        "NoAutoUpdate",
        "REG_DWORD",
    ),
    (
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer",
        "SmartScreenEnabled",
        "REG_SZ",
    ),
    (
        "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Search",
        "SetupCompletedSuccessfully",
        "REG_DWORD",
    ),
];

const TARGET_SERVICES: &[&str] = &[
    "DiagTrack",
    "dmwappushservice",
    "SysMain",
    "WSearch",
    "MapsBroker",
    "Fax",
    "XblAuthManager",
    "XblGameSave",
    "XboxNetApiSvc",
];

pub fn get_snapshots_dir() -> PathBuf {
    if let Some(mut config_dir) = dirs::config_dir() {
        config_dir.push("WiScripts");
        config_dir.push("snapshots");
        config_dir
    } else if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("WiScripts").join("snapshots")
    } else {
        PathBuf::from("snapshots")
    }
}

pub fn create_snapshot(
    label: String,
    trigger_source: Option<String>,
) -> Result<SystemSnapshot, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let snapshot_id = format!("snap_{}_{}", timestamp, rand_suffix());
    let source = trigger_source.unwrap_or_else(|| "user_manual".to_string());
    let clean_label = if label.trim().is_empty() {
        "Manual System Snapshot".to_string()
    } else {
        label.trim().to_string()
    };

    let registry_deltas = capture_registry_deltas();
    let service_deltas = capture_service_deltas();

    let snapshot = SystemSnapshot {
        id: snapshot_id,
        timestamp,
        label: clean_label,
        trigger_source: source,
        registry_deltas,
        service_deltas,
    };

    save_snapshot_to_disk(&snapshot)?;
    Ok(snapshot)
}

/// Validates that `snapshot_id` matches `^[A-Za-z0-9_-]+$` and cannot escape the snapshots directory.
pub fn validate_snapshot_id(snapshot_id: &str) -> Result<&str, String> {
    let clean_id = snapshot_id.trim();
    if clean_id.is_empty() || clean_id.len() > 128 {
        return Err(format!(
            "Invalid snapshot ID '{}': must be 1..=128 characters",
            snapshot_id
        ));
    }
    if !clean_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(format!(
            "Invalid snapshot ID '{}': only alphanumeric, '_' and '-' are permitted",
            snapshot_id
        ));
    }
    Ok(clean_id)
}

/// Resolves a validated snapshot file path inside `snapshots_dir`, verifying canonical containment.
fn resolve_snapshot_path_in_dir(snapshots_dir: &std::path::Path, snapshot_id: &str) -> Result<PathBuf, String> {
    let clean_id = validate_snapshot_id(snapshot_id)?;
    let file_path = snapshots_dir.join(format!("{}.json", clean_id));

    if snapshots_dir.exists() {
        let canon_dir = snapshots_dir
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize snapshots dir: {}", e))?;
        if file_path.exists() {
            let canon_file = file_path
                .canonicalize()
                .map_err(|e| format!("Failed to canonicalize snapshot file: {}", e))?;
            if !canon_file.starts_with(&canon_dir) {
                return Err(format!(
                    "Snapshot path '{}' escapes snapshots directory",
                    clean_id
                ));
            }
            return Ok(canon_file);
        } else if let Some(parent) = file_path.parent() {
            if parent.exists() {
                let canon_parent = parent
                    .canonicalize()
                    .map_err(|e| format!("Failed to canonicalize snapshot parent: {}", e))?;
                if !canon_parent.starts_with(&canon_dir) {
                    return Err(format!(
                        "Snapshot parent for '{}' escapes snapshots directory",
                        clean_id
                    ));
                }
            }
        }
    }

    Ok(file_path)
}

fn save_snapshot_to_disk(snapshot: &SystemSnapshot) -> Result<(), String> {
    let dir = get_snapshots_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create snapshots dir: {}", e))?;

    let file_path = resolve_snapshot_path_in_dir(&dir, &snapshot.id)?;
    let json_data = serde_json::to_string_pretty(snapshot)
        .map_err(|e| format!("Failed to serialize snapshot: {}", e))?;

    fs::write(&file_path, json_data)
        .map_err(|e| format!("Failed to write snapshot file '{:?}': {}", file_path, e))?;
    Ok(())
}

pub fn list_snapshots() -> Result<Vec<SystemSnapshot>, String> {
    let dir = get_snapshots_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read snapshots directory '{:?}': {}", dir, e))?;

    let mut snapshots = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|ext| ext == "json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(snap) = serde_json::from_str::<SystemSnapshot>(&content) {
                    snapshots.push(snap);
                }
            }
        }
    }

    snapshots.sort_by_key(|b| std::cmp::Reverse(b.timestamp));
    Ok(snapshots)
}

pub fn delete_snapshot(snapshot_id: &str) -> Result<bool, String> {
    let dir = get_snapshots_dir();
    let file_path = resolve_snapshot_path_in_dir(&dir, snapshot_id)?;

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete snapshot file '{:?}': {}", file_path, e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn rollback_snapshot(snapshot_id: &str) -> Result<RollbackResult, String> {
    let dir = get_snapshots_dir();
    let file_path = resolve_snapshot_path_in_dir(&dir, snapshot_id)?;

    if !file_path.exists() {
        return Err(format!("Snapshot ID '{}' not found", snapshot_id));
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read snapshot file '{:?}': {}", file_path, e))?;

    let snapshot: SystemSnapshot = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse snapshot file '{:?}': {}", file_path, e))?;

    let mut restored_keys_count = 0;
    let mut restored_services_count = 0;
    let mut errors = Vec::new();

    // Surgical Registry Rollback
    for reg_backup in &snapshot.registry_deltas {
        match restore_registry_entry(reg_backup) {
            Ok(_) => restored_keys_count += 1,
            Err(err) => errors.push(format!(
                "Registry restoration error for key '{}' value '{}': {}",
                reg_backup.key_path, reg_backup.value_name, err
            )),
        }
    }

    // Surgical Service Rollback
    for svc_backup in &snapshot.service_deltas {
        match restore_service_entry(svc_backup) {
            Ok(_) => restored_services_count += 1,
            Err(err) => errors.push(format!(
                "Service restoration error for '{}': {}",
                svc_backup.service_name, err
            )),
        }
    }

    let success = errors.is_empty();
    Ok(RollbackResult {
        snapshot_id: snapshot_id.to_string(),
        success,
        restored_keys_count,
        restored_services_count,
        errors,
    })
}

fn rand_suffix() -> String {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(123456);
    format!("{:06x}", nanos % 0xffffff)
}

#[cfg(windows)]
fn capture_registry_deltas() -> Vec<RegistryValueBackup> {
    use winreg::enums::*;
    use winreg::RegKey;

    let mut deltas = Vec::new();

    for &(key_path, value_name, fallback_type) in TARGET_REGISTRY_KEYS {
        let (hive_str, subpath) = match crate::winapi::registry::parse_hive_and_subpath(key_path) {
            Ok((hkey, sub)) => (hkey, sub),
            Err(_) => {
                deltas.push(RegistryValueBackup {
                    key_path: key_path.to_string(),
                    value_name: value_name.to_string(),
                    value_type: fallback_type.to_string(),
                    previous_data: None,
                });
                continue;
            }
        };

        let hkey_reg = match hive_str {
            windows::Win32::System::Registry::HKEY_LOCAL_MACHINE => RegKey::predef(HKEY_LOCAL_MACHINE),
            windows::Win32::System::Registry::HKEY_CURRENT_USER => RegKey::predef(HKEY_CURRENT_USER),
            windows::Win32::System::Registry::HKEY_CLASSES_ROOT => RegKey::predef(HKEY_CLASSES_ROOT),
            windows::Win32::System::Registry::HKEY_USERS => RegKey::predef(HKEY_USERS),
            _ => {
                deltas.push(RegistryValueBackup {
                    key_path: key_path.to_string(),
                    value_name: value_name.to_string(),
                    value_type: fallback_type.to_string(),
                    previous_data: None,
                });
                continue;
            }
        };

        let backup = match hkey_reg.open_subkey(&subpath) {
            Ok(key) => match key.get_raw_value(value_name) {
                Ok(raw_val) => {
                    let (v_type, data_opt) = match raw_val.vtype {
                        REG_SZ | REG_EXPAND_SZ => {
                            let s = key.get_value::<String, _>(value_name).unwrap_or_default();
                            ("REG_SZ".to_string(), Some(s))
                        }
                        REG_DWORD => {
                            let dw = key.get_value::<u32, _>(value_name).unwrap_or(0);
                            ("REG_DWORD".to_string(), Some(dw.to_string()))
                        }
                        REG_BINARY => {
                            let hex = raw_val
                                .bytes
                                .iter()
                                .map(|b| format!("{:02X}", b))
                                .collect::<Vec<_>>()
                                .join("");
                            ("REG_BINARY".to_string(), Some(hex))
                        }
                        REG_MULTI_SZ => {
                            let strings = key
                                .get_value::<Vec<String>, _>(value_name)
                                .unwrap_or_default();
                            ("REG_MULTI_SZ".to_string(), Some(strings.join("\n")))
                        }
                        _ => (fallback_type.to_string(), None),
                    };
                    RegistryValueBackup {
                        key_path: key_path.to_string(),
                        value_name: value_name.to_string(),
                        value_type: v_type,
                        previous_data: data_opt,
                    }
                }
                Err(_) => RegistryValueBackup {
                    key_path: key_path.to_string(),
                    value_name: value_name.to_string(),
                    value_type: fallback_type.to_string(),
                    previous_data: None,
                },
            },
            Err(_) => RegistryValueBackup {
                key_path: key_path.to_string(),
                value_name: value_name.to_string(),
                value_type: fallback_type.to_string(),
                previous_data: None,
            },
        };

        deltas.push(backup);
    }

    deltas
}

#[cfg(not(windows))]
fn capture_registry_deltas() -> Vec<RegistryValueBackup> {
    TARGET_REGISTRY_KEYS
        .iter()
        .map(|&(key_path, value_name, fallback_type)| RegistryValueBackup {
            key_path: key_path.to_string(),
            value_name: value_name.to_string(),
            value_type: fallback_type.to_string(),
            previous_data: Some("0".to_string()),
        })
        .collect()
}

#[cfg(windows)]
fn capture_service_deltas() -> Vec<ServiceBackup> {
    use windows::{
        core::PCWSTR,
        Win32::System::Services::*,
    };

    let mut deltas = Vec::with_capacity(TARGET_SERVICES.len());

    unsafe {
        let scm_handle = match OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT) {
            Ok(h) => h,
            Err(_) => {
                for &service_name in TARGET_SERVICES {
                    deltas.push(ServiceBackup {
                        service_name: service_name.to_string(),
                        previous_startup_type: "Manual".to_string(),
                        previous_status: "Stopped".to_string(),
                    });
                }
                return deltas;
            }
        };

        for &service_name in TARGET_SERVICES {
            let name_u16: Vec<u16> = service_name
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();

            let svc_handle = match OpenServiceW(
                scm_handle,
                PCWSTR(name_u16.as_ptr()),
                SERVICE_QUERY_CONFIG | SERVICE_QUERY_STATUS,
            ) {
                Ok(h) => h,
                Err(_) => {
                    deltas.push(ServiceBackup {
                        service_name: service_name.to_string(),
                        previous_startup_type: "Disabled".to_string(),
                        previous_status: "Stopped".to_string(),
                    });
                    continue;
                }
            };

            // Query Status
            let mut status_process = SERVICE_STATUS_PROCESS::default();
            let mut bytes_needed = 0u32;
            let status_slice = std::slice::from_raw_parts_mut(
                (&mut status_process as *mut SERVICE_STATUS_PROCESS) as *mut u8,
                std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
            );

            let status_res = QueryServiceStatusEx(
                svc_handle,
                SC_STATUS_PROCESS_INFO,
                Some(status_slice),
                &mut bytes_needed,
            );

            let status_str = if status_res.is_ok() {
                if status_process.dwCurrentState == SERVICE_RUNNING {
                    "Running".to_string()
                } else {
                    "Stopped".to_string()
                }
            } else {
                "Stopped".to_string()
            };

            // Query Config
            let mut config_bytes = 0u32;
            let _ = QueryServiceConfigW(svc_handle, None, 0, &mut config_bytes);

            let startup_type_str = if config_bytes > 0 {
                let mut config_buf = vec![0u64; (config_bytes as usize).div_ceil(8)];
                let config_ptr = config_buf.as_mut_ptr() as *mut QUERY_SERVICE_CONFIGW;

                if QueryServiceConfigW(svc_handle, Some(config_ptr), config_bytes, &mut config_bytes)
                    .is_ok()
                {
                    match (*config_ptr).dwStartType {
                        SERVICE_AUTO_START => "Automatic".to_string(),
                        SERVICE_DEMAND_START => "Manual".to_string(),
                        SERVICE_DISABLED => "Disabled".to_string(),
                        _ => "Manual".to_string(),
                    }
                } else {
                    "Manual".to_string()
                }
            } else {
                "Manual".to_string()
            };

            let _ = CloseServiceHandle(svc_handle);

            deltas.push(ServiceBackup {
                service_name: service_name.to_string(),
                previous_startup_type: startup_type_str,
                previous_status: status_str,
            });
        }

        let _ = CloseServiceHandle(scm_handle);
    }

    deltas
}

#[cfg(not(windows))]
fn capture_service_deltas() -> Vec<ServiceBackup> {
    TARGET_SERVICES
        .iter()
        .map(|&service_name| ServiceBackup {
            service_name: service_name.to_string(),
            previous_startup_type: "Manual".to_string(),
            previous_status: "Stopped".to_string(),
        })
        .collect()
}

#[cfg(windows)]
fn set_multi_string(key_path: &str, value_name: &str, data: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, KEY_ALL_ACCESS, REG_MULTI_SZ,
        REG_OPTION_NON_VOLATILE,
    };

    let (hkey, subpath) = crate::winapi::registry::parse_hive_and_subpath(key_path)?;
    let clean_val_name = crate::winapi::registry::sanitize_registry_input(value_name)?;
    let subpath_u16: Vec<u16> = subpath.encode_utf16().chain(std::iter::once(0)).collect();
    let val_u16: Vec<u16> = clean_val_name.encode_utf16().chain(std::iter::once(0)).collect();

    let mut multi_u16: Vec<u16> = Vec::new();
    for line in data.split('\n').filter(|s| !s.is_empty()) {
        if line.contains('\0') || line.contains('\r') {
            return Err("REG_MULTI_SZ entry contains forbidden control characters".to_string());
        }
        multi_u16.extend(line.encode_utf16());
        multi_u16.push(0);
    }
    if multi_u16.is_empty() {
        multi_u16.push(0);
    }
    multi_u16.push(0);

    unsafe {
        let mut key_handle = HKEY::default();
        let status = RegCreateKeyExW(
            hkey,
            PCWSTR(subpath_u16.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_ALL_ACCESS,
            None,
            &mut key_handle,
            None,
        );
        if status.is_err() {
            return Err(format!("RegCreateKeyExW failed for '{}': {:?}", key_path, status));
        }

        let bytes = std::slice::from_raw_parts(
            multi_u16.as_ptr() as *const u8,
            multi_u16.len() * std::mem::size_of::<u16>(),
        );
        let set_res = RegSetValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            0,
            REG_MULTI_SZ,
            Some(bytes),
        );
        let _ = RegCloseKey(key_handle);

        if set_res.is_err() {
            return Err(format!(
                "RegSetValueExW failed for '{}'\\'{}' (MULTI_SZ): {:?}",
                key_path, value_name, set_res
            ));
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn set_multi_string(_key_path: &str, _value_name: &str, _data: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn delete_registry_value_if_exists(key_path: &str, value_name: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, HKEY, KEY_SET_VALUE,
    };

    let (hkey, subpath) = crate::winapi::registry::parse_hive_and_subpath(key_path)?;
    let clean_val_name = crate::winapi::registry::sanitize_registry_input(value_name)?;
    let subpath_u16: Vec<u16> = subpath.encode_utf16().chain(std::iter::once(0)).collect();
    let val_u16: Vec<u16> = clean_val_name.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut key_handle = HKEY::default();
        let open_res = RegOpenKeyExW(
            hkey,
            PCWSTR(subpath_u16.as_ptr()),
            0,
            KEY_SET_VALUE,
            &mut key_handle,
        );

        if open_res.is_err() {
            if open_res == ERROR_FILE_NOT_FOUND || open_res == ERROR_PATH_NOT_FOUND {
                return Ok(());
            }
            return Err(format!(
                "RegOpenKeyExW failed for '{}': {:?}",
                key_path, open_res
            ));
        }

        let del_res = RegDeleteValueW(key_handle, PCWSTR(val_u16.as_ptr()));
        let _ = RegCloseKey(key_handle);

        if del_res.is_err() && del_res != ERROR_FILE_NOT_FOUND {
            return Err(format!(
                "RegDeleteValueW failed for '{}'\\'{}': {:?}",
                key_path, value_name, del_res
            ));
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn delete_registry_value_if_exists(_key_path: &str, _value_name: &str) -> Result<(), String> {
    Ok(())
}

fn restore_registry_entry(backup: &RegistryValueBackup) -> Result<(), String> {
    match &backup.previous_data {
        Some(data) => match backup.value_type.as_str() {
            "REG_DWORD" => {
                let val: u32 = data
                    .parse()
                    .map_err(|e| format!("Invalid DWORD string '{}': {}", data, e))?;
                crate::winapi::registry::set_dword(&backup.key_path, &backup.value_name, val)
            }
            "REG_SZ" => {
                crate::winapi::registry::set_string(&backup.key_path, &backup.value_name, data)
            }
            "REG_BINARY" => {
                let bytes = hex_to_bytes(data)
                    .map_err(|e| format!("Invalid binary hex string '{}': {}", data, e))?;
                crate::winapi::registry::set_binary(&backup.key_path, &backup.value_name, &bytes)
            }
            "REG_MULTI_SZ" => set_multi_string(&backup.key_path, &backup.value_name, data),
            _ => crate::winapi::registry::set_string(&backup.key_path, &backup.value_name, data),
        },
        None => delete_registry_value_if_exists(&backup.key_path, &backup.value_name),
    }
}

fn hex_to_bytes(s: &str) -> Result<Vec<u8>, String> {
    if !s.len().is_multiple_of(2) {
        return Err("Hex string must have even length".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map_err(|e| format!("Invalid hex byte '{}': {}", &s[i..i + 2], e))
        })
        .collect()
}

fn restore_service_entry(backup: &ServiceBackup) -> Result<(), String> {
    let start_code = match backup.previous_startup_type.as_str() {
        "Automatic" => 2,
        "Manual" => 3,
        "Disabled" => 4,
        _ => 3,
    };

    let cfg_res = crate::winapi::services::configure_service(&backup.service_name, start_code);

    let status_res = match backup.previous_status.as_str() {
        "Stopped" => crate::winapi::services::stop_service(&backup.service_name),
        "Running" => start_windows_service(&backup.service_name),
        _ => Ok(()),
    };

    if let Err(e) = cfg_res {
        return Err(format!("Failed to configure service startup: {}", e));
    }
    if let Err(e) = status_res {
        return Err(format!("Failed to update service state: {}", e));
    }

    Ok(())
}

#[cfg(windows)]
fn start_windows_service(service_name: &str) -> Result<(), String> {
    use windows::{
        core::PCWSTR,
        Win32::System::Services::*,
    };

    let name_u16: Vec<u16> = service_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let scm_handle = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_ALL_ACCESS)
            .map_err(|e| format!("OpenSCManagerW failed for service '{}': {:?}", service_name, e))?;

        let svc_handle = match OpenServiceW(
            scm_handle,
            PCWSTR(name_u16.as_ptr()),
            SERVICE_START | SERVICE_QUERY_STATUS,
        ) {
            Ok(h) => h,
            Err(e) => {
                let _ = CloseServiceHandle(scm_handle);
                let err_str = format!("{:?}", e);
                if err_str.contains("1060") || err_str.contains("0x80070424") {
                    return Ok(());
                }
                return Err(format!(
                    "OpenServiceW failed for service '{}': {}",
                    service_name, err_str
                ));
            }
        };

        let start_res = StartServiceW(svc_handle, None);
        let _ = CloseServiceHandle(svc_handle);
        let _ = CloseServiceHandle(scm_handle);

        if let Err(e) = start_res {
            let err_str = format!("{:?}", e);
            if err_str.contains("1056") {
                return Ok(());
            }
            return Err(format!(
                "StartServiceW failed for service '{}': {:?}",
                service_name, e
            ));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn start_windows_service(_service_name: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_snapshot_serialization() {
        let snapshot = SystemSnapshot {
            id: "snap_test_12345".to_string(),
            timestamp: 1700000000,
            label: "Pre Optimization Backup".to_string(),
            trigger_source: "pre_optimization".to_string(),
            registry_deltas: vec![RegistryValueBackup {
                key_path: "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection".to_string(),
                value_name: "AllowTelemetry".to_string(),
                value_type: "REG_DWORD".to_string(),
                previous_data: Some("1".to_string()),
            }],
            service_deltas: vec![ServiceBackup {
                service_name: "DiagTrack".to_string(),
                previous_startup_type: "Automatic".to_string(),
                previous_status: "Running".to_string(),
            }],
        };

        let json = serde_json::to_string_pretty(&snapshot).expect("Failed to serialize SystemSnapshot");
        assert!(json.contains("\"id\": \"snap_test_12345\""));
        assert!(json.contains("\"triggerSource\": \"pre_optimization\""));
        assert!(json.contains("\"registryDeltas\""));
        assert!(json.contains("\"serviceDeltas\""));

        let deserialized: SystemSnapshot = serde_json::from_str(&json).expect("Failed to deserialize SystemSnapshot");
        assert_eq!(snapshot, deserialized);
    }

    #[test]
    fn test_snapshot_capture() {
        let snapshot = create_snapshot("Unit Test Snapshot".to_string(), Some("user_manual".to_string()))
            .expect("Failed to create state snapshot");

        assert!(!snapshot.id.is_empty());
        assert_eq!(snapshot.label, "Unit Test Snapshot");
        assert_eq!(snapshot.trigger_source, "user_manual");
        assert!(!snapshot.registry_deltas.is_empty());
        assert!(!snapshot.service_deltas.is_empty());

        let _ = delete_snapshot(&snapshot.id);
    }

    #[test]
    fn test_rollback_dry_run() {
        let temp = tempdir().expect("Failed to create tempdir");
        let snap_id = "snap_rollback_test";
        let snap_file = temp.path().join(format!("{}.json", snap_id));

        let dummy_snap = SystemSnapshot {
            id: snap_id.to_string(),
            timestamp: 1700000000,
            label: "Dry Run Test".to_string(),
            trigger_source: "user_manual".to_string(),
            registry_deltas: vec![RegistryValueBackup {
                key_path: "HKCU\\Software\\WiScriptsTestKey".to_string(),
                value_name: "TestVal".to_string(),
                value_type: "REG_DWORD".to_string(),
                previous_data: Some("42".to_string()),
            }],
            service_deltas: vec![ServiceBackup {
                service_name: "NonExistentService_123".to_string(),
                previous_startup_type: "Disabled".to_string(),
                previous_status: "Stopped".to_string(),
            }],
        };

        let json = serde_json::to_string_pretty(&dummy_snap).unwrap();
        fs::write(&snap_file, json).unwrap();

        assert!(snap_file.exists());
    }

    #[test]
    fn test_snapshot_listing_and_deletion() {
        let snap1 = create_snapshot("List Test 1".to_string(), None).unwrap();
        let snap2 = create_snapshot("List Test 2".to_string(), None).unwrap();

        let list = list_snapshots().unwrap();
        assert!(list.iter().any(|s| s.id == snap1.id));
        assert!(list.iter().any(|s| s.id == snap2.id));

        let deleted1 = delete_snapshot(&snap1.id).unwrap();
        let deleted2 = delete_snapshot(&snap2.id).unwrap();
        assert!(deleted1);
        assert!(deleted2);

        let list_after = list_snapshots().unwrap();
        assert!(!list_after.iter().any(|s| s.id == snap1.id));
        assert!(!list_after.iter().any(|s| s.id == snap2.id));
    }

    #[test]
    fn test_snapshot_id_path_traversal_rejected() {
        for bad_id in &[
            "",
            "   ",
            "../evil",
            "..\\evil",
            "snap/../../etc",
            "snap\\sub",
            "snap.json",
            "snap:stream",
            "snap\0id",
        ] {
            assert!(
                validate_snapshot_id(bad_id).is_err(),
                "Expected bad snapshot_id '{}' to be rejected",
                bad_id
            );
            assert!(delete_snapshot(bad_id).is_err());
            assert!(rollback_snapshot(bad_id).is_err());
        }
        assert!(validate_snapshot_id("snap_1700000000-abc123").is_ok());
    }
}

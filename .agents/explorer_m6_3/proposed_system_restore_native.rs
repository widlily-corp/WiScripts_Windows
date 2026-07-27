// Proposed Native Windows API System Restore Implementation for src-tauri/src/system_restore/mod.rs
//
// Architecture:
// 1. Native WinAPI routine using `SRSetRestorePointW` dynamically loaded from `srclient.dll`.
// 2. PowerShell `Checkpoint-Computer` fallback if native WinAPI is unavailable.
// 3. DryRunRunner integration ensuring 100% safe testing and preview mode.

use crate::odt::escape_powershell_literal;
use crate::runner::{CommandRunner, ExecutedAction};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestorePoint {
    #[serde(alias = "SequenceNumber")]
    pub sequence_number: u32,

    #[serde(alias = "Description")]
    pub description: String,

    #[serde(alias = "RestorePointType")]
    pub restore_point_type: String,

    #[serde(alias = "CreationTime")]
    pub creation_time: String,
}

// ---------------------------------------------------------------------------
// Native WinAPI FFI Definitions (srclient.dll / kernel32.dll)
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
pub mod native_winapi {
    use std::ffi::c_void;

    pub const BEGIN_SYSTEM_CHANGE: u32 = 100;
    pub const END_SYSTEM_CHANGE: u32 = 101;
    pub const BEGIN_NESTED_SYSTEM_CHANGE: u32 = 102;
    pub const END_NESTED_SYSTEM_CHANGE: u32 = 103;

    pub const APPLICATION_INSTALL: u32 = 0;
    pub const APPLICATION_UNINSTALL: u32 = 1;
    pub const DEVICE_DRIVER_INSTALL: u32 = 10;
    pub const MODIFY_SETTINGS: u32 = 12;
    pub const CANCELLED_OPERATION: u32 = 13;

    pub const ERROR_SUCCESS: u32 = 0;
    pub const ERROR_ACCESS_DENIED: u32 = 5;
    pub const ERROR_BAD_ENVIRONMENT: u32 = 10;
    pub const ERROR_INVALID_DATA: u32 = 13;
    pub const ERROR_ALREADY_EXISTS: u32 = 183;
    pub const ERROR_SERVICE_DISABLED: u32 = 1058;
    pub const ERROR_TIMEOUT: u32 = 1460;

    #[repr(C)]
    pub struct RESTOREPOINTINFOW {
        pub dw_event_type: u32,
        pub dw_restore_point_type: u32,
        pub ll_sequence_number: i64,
        pub sz_description: [u16; 256],
    }

    #[repr(C)]
    pub struct STATEMGRSTATUS {
        pub n_status: u32,
        pub ll_sequence_number: i64,
    }

    type FnSRSetRestorePointW = unsafe extern "system" fn(
        pRestorePtSpec: *const RESTOREPOINTINFOW,
        pSMgrStatus: *mut STATEMGRSTATUS,
    ) -> i32;

    extern "system" {
        fn LoadLibraryW(lpLibFileName: *const u16) -> *mut c_void;
        fn GetProcAddress(hModule: *mut c_void, lpProcName: *const u8) -> *mut c_void;
        fn FreeLibrary(hModule: *mut c_void) -> i32;
    }

    /// Invokes SRSetRestorePointW directly from `srclient.dll`.
    pub fn create_restore_point_native(
        description: &str,
        event_type: u32,
        restore_point_type: u32,
        sequence_number: i64,
    ) -> Result<i64, String> {
        use std::os::windows::ffi::OsStrExt;

        let dll_name: Vec<u16> = std::ffi::OsStr::new("srclient.dll")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let h_module = LoadLibraryW(dll_name.as_ptr());
            if h_module.is_null() {
                return Err("Failed to load srclient.dll library from system path".to_string());
            }

            let proc_name = std::ffi::CString::new("SRSetRestorePointW").unwrap();
            let proc_addr = GetProcAddress(h_module, proc_name.as_ptr() as *const u8);

            if proc_addr.is_null() {
                FreeLibrary(h_module);
                return Err("Failed to resolve SRSetRestorePointW symbol in srclient.dll".to_string());
            }

            let sr_set_restore_point: FnSRSetRestorePointW = std::mem::transmute(proc_addr);

            let mut spec = RESTOREPOINTINFOW {
                dw_event_type: event_type,
                dw_restore_point_type: restore_point_type,
                ll_sequence_number: sequence_number,
                sz_description: [0u16; 256],
            };

            let desc_u16: Vec<u16> = std::ffi::OsStr::new(description).encode_wide().collect();
            let copy_len = desc_u16.len().min(255);
            spec.sz_description[..copy_len].copy_from_slice(&desc_u16[..copy_len]);

            let mut status = STATEMGRSTATUS {
                n_status: 0,
                ll_sequence_number: 0,
            };

            let result = sr_set_restore_point(&spec, &mut status);
            FreeLibrary(h_module);

            if result != 0 && status.n_status == ERROR_SUCCESS {
                Ok(status.ll_sequence_number)
            } else {
                let err_msg = match status.n_status {
                    ERROR_ACCESS_DENIED => {
                        "Access Denied: Restore Point creation requires Administrator privileges.".to_string()
                    }
                    ERROR_SERVICE_DISABLED => {
                        "System Restore service (srservice) is disabled on this system.".to_string()
                    }
                    ERROR_ALREADY_EXISTS => {
                        "System Restore frequency limit hit (restore point created within last 24h).".to_string()
                    }
                    ERROR_BAD_ENVIRONMENT => {
                        "System Restore is disabled on the current volume or OS environment.".to_string()
                    }
                    code => format!("SRSetRestorePointW failed with Win32 status code: {}", code),
                };
                Err(err_msg)
            }
        }
    }
}

/// Creates a new Windows System Restore Point.
/// Uses native Windows API (`SRSetRestorePointW` in `srclient.dll`) with graceful fallback to PowerShell.
pub fn create_restore_point(
    runner: &dyn CommandRunner,
    description: &str,
) -> Result<ExecutedAction, String> {
    log::info!(
        "[SystemRestore] Initiating restore point creation: '{}' (dry_run={})",
        description,
        runner.is_dry_run()
    );

    if runner.is_dry_run() {
        let ps_command = format!(
            "WinAPI::SRSetRestorePointW(BEGIN_SYSTEM_CHANGE, MODIFY_SETTINGS, '{}')",
            description
        );
        let output = runner.run_powershell(&format!(
            "Checkpoint-Computer -Description '{}' -RestorePointType \"MODIFY_SETTINGS\" -ErrorAction Stop",
            escape_powershell_literal(description)
        ))?;

        return Ok(ExecutedAction {
            id: "create_restore_point".to_string(),
            name: format!("Create System Restore Point ({})", description),
            command: ps_command,
            output,
            skipped: false,
        });
    }

    #[cfg(target_os = "windows")]
    {
        match native_winapi::create_restore_point_native(
            description,
            native_winapi::BEGIN_SYSTEM_CHANGE,
            native_winapi::MODIFY_SETTINGS,
            0,
        ) {
            Ok(seq) => {
                log::info!("[SystemRestore] Native WinAPI restore point initiated successfully (seq={})", seq);
                return Ok(ExecutedAction {
                    id: "create_restore_point".to_string(),
                    name: format!("Create System Restore Point ({})", description),
                    command: format!("WinAPI::SRSetRestorePointW(MODIFY_SETTINGS, '{}')", description),
                    output: crate::runner::CommandOutput {
                        exit_code: 0,
                        stdout: format!("Restore point sequence #{} initiated via SRSetRestorePointW", seq),
                        stderr: String::new(),
                    },
                    skipped: false,
                });
            }
            Err(e) => {
                log::warn!("[SystemRestore] Native WinAPI restore point failed: {}. Trying PowerShell fallback...", e);
            }
        }
    }

    // PowerShell Fallback Execution
    let escaped_desc = escape_powershell_literal(description);
    let ps_command = format!(
        "Checkpoint-Computer -Description {} -RestorePointType \"MODIFY_SETTINGS\" -ErrorAction Stop",
        escaped_desc
    );

    let output = runner.run_powershell(&ps_command)?;

    if output.exit_code != 0 {
        let err_msg = format!(
            "Failed to create restore point (exit code {}): {}",
            output.exit_code,
            output.stderr.trim()
        );
        log::warn!("[SystemRestore] {}", err_msg);
        return Err(err_msg);
    }

    log::info!("[SystemRestore] Restore point created successfully via PowerShell fallback");

    Ok(ExecutedAction {
        id: "create_restore_point".to_string(),
        name: format!("Create System Restore Point ({})", description),
        command: ps_command,
        output,
        skipped: false,
    })
}

/// Queries all existing System Restore Points on the Windows host.
pub fn get_restore_points(runner: &dyn CommandRunner) -> Result<Vec<RestorePoint>, String> {
    log::info!(
        "[SystemRestore] Fetching system restore points (dry_run={})",
        runner.is_dry_run()
    );

    let ps_command = "Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, RestorePointType, CreationTime | ConvertTo-Json -Compress".to_string();

    let output = runner.run_powershell(&ps_command)?;

    if output.exit_code != 0 {
        let err_msg = format!(
            "Failed to retrieve restore points (exit code {}): {}",
            output.exit_code,
            output.stderr.trim()
        );
        log::warn!("[SystemRestore] {}", err_msg);
        return Err(err_msg);
    }

    let json_str = output.stdout.trim();

    if runner.is_dry_run() || json_str.starts_with("[DRY-RUN]") {
        if let Ok(parsed) = parse_restore_points_json(json_str) {
            if !parsed.is_empty() {
                return Ok(parsed);
            }
        }
        return Ok(vec![
            RestorePoint {
                sequence_number: 101,
                description: "WiScripts System Optimization Checkpoint".to_string(),
                restore_point_type: "MODIFY_SETTINGS".to_string(),
                creation_time: "2026-07-27T10:00:00.000Z".to_string(),
            },
            RestorePoint {
                sequence_number: 100,
                description: "Windows Update Auto Restore Point".to_string(),
                restore_point_type: "DEVICE_DRIVER_INSTALL".to_string(),
                creation_time: "2026-07-26T18:30:00.000Z".to_string(),
            },
        ]);
    }

    if json_str.is_empty() || json_str == "null" {
        return Ok(Vec::new());
    }

    parse_restore_points_json(json_str)
}

/// Helper function to parse JSON string output from ConvertTo-Json into Vec<RestorePoint>.
pub fn parse_restore_points_json(json_str: &str) -> Result<Vec<RestorePoint>, String> {
    if json_str.trim().is_empty() || json_str.trim() == "null" {
        return Ok(Vec::new());
    }

    if let Ok(vec) = serde_json::from_str::<Vec<RestorePoint>>(json_str) {
        Ok(vec)
    } else if let Ok(single) = serde_json::from_str::<RestorePoint>(json_str) {
        Ok(vec![single])
    } else {
        Err(format!("Failed to parse restore points JSON: {}", json_str))
    }
}

/// Restores the system to a specified System Restore Point sequence number.
pub fn restore_system_point(
    runner: &dyn CommandRunner,
    sequence_number: u32,
) -> Result<ExecutedAction, String> {
    log::info!(
        "[SystemRestore] Initiating system restore to sequence number: {} (dry_run={})",
        sequence_number,
        runner.is_dry_run()
    );

    let ps_command = format!("Restore-Computer -SequenceNumber {} -Confirm:$false", sequence_number);

    let output = runner.run_powershell(&ps_command)?;

    if output.exit_code != 0 {
        let err_msg = format!(
            "Failed to restore system to point {} (exit code {}): {}",
            sequence_number,
            output.exit_code,
            output.stderr.trim()
        );
        log::warn!("[SystemRestore] {}", err_msg);
        return Err(err_msg);
    }

    log::info!("[SystemRestore] System restore command issued successfully for sequence number {}", sequence_number);

    Ok(ExecutedAction {
        id: "restore_system_point".to_string(),
        name: format!("Restore System to Point #{}", sequence_number),
        command: ps_command,
        output,
        skipped: false,
    })
}

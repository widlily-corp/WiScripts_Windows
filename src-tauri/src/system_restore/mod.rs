use crate::odt::escape_powershell_literal;
use crate::runner::{CommandRunner, ExecutedAction};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
pub mod native_winapi {
    use std::ffi::c_void;

    pub const BEGIN_SYSTEM_CHANGE: u32 = 100;
    pub const END_SYSTEM_CHANGE: u32 = 102;
    pub const MODIFY_SETTINGS: u32 = 12;
    pub const ERROR_SUCCESS: u32 = 0;
    pub const ERROR_ALREADY_EXISTS: u32 = 183;

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
        p_restore_pt_spec: *const RESTOREPOINTINFOW,
        p_smgr_status: *mut STATEMGRSTATUS,
    ) -> i32;

    extern "system" {
        fn LoadLibraryW(lpLibFileName: *const u16) -> *mut c_void;
        fn GetProcAddress(hModule: *mut c_void, lpProcName: *const u8) -> *mut c_void;
        fn FreeLibrary(hModule: *mut c_void) -> i32;
    }

    pub fn create_restore_point_native(description: &str) -> Result<i64, String> {
        use std::os::windows::ffi::OsStrExt;

        let dll_name: Vec<u16> = std::ffi::OsStr::new("srclient.dll")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let h_module = LoadLibraryW(dll_name.as_ptr());
            if h_module.is_null() {
                return Err("Failed to load srclient.dll".to_string());
            }

            let proc_name = std::ffi::CString::new("SRSetRestorePointW").map_err(|e| e.to_string())?;
            let proc_addr = GetProcAddress(h_module, proc_name.as_ptr() as *const u8);
            if proc_addr.is_null() {
                FreeLibrary(h_module);
                return Err("Failed to find SRSetRestorePointW in srclient.dll".to_string());
            }

            let sr_set_restore_point: FnSRSetRestorePointW = std::mem::transmute(proc_addr);

            // 1. Issue BEGIN_SYSTEM_CHANGE to start sequence
            let mut begin_spec = RESTOREPOINTINFOW {
                dw_event_type: BEGIN_SYSTEM_CHANGE,
                dw_restore_point_type: MODIFY_SETTINGS,
                ll_sequence_number: 0,
                sz_description: [0u16; 256],
            };

            let desc_u16: Vec<u16> = std::ffi::OsStr::new(description).encode_wide().collect();
            let copy_len = desc_u16.len().min(255);
            begin_spec.sz_description[..copy_len].copy_from_slice(&desc_u16[..copy_len]);

            let mut begin_status = STATEMGRSTATUS { n_status: 0, ll_sequence_number: 0 };
            let begin_res = sr_set_restore_point(&begin_spec, &mut begin_status);

            if begin_res == 0 || (begin_status.n_status != ERROR_SUCCESS && begin_status.n_status != ERROR_ALREADY_EXISTS) {
                FreeLibrary(h_module);
                return Err(format!("SRSetRestorePointW (BEGIN_SYSTEM_CHANGE) failed with status code: {}", begin_status.n_status));
            }

            let seq_num = begin_status.ll_sequence_number;

            // 2. Issue END_SYSTEM_CHANGE with matching sequence number to seal the restore point
            let end_spec = RESTOREPOINTINFOW {
                dw_event_type: END_SYSTEM_CHANGE,
                dw_restore_point_type: MODIFY_SETTINGS,
                ll_sequence_number: seq_num,
                sz_description: [0u16; 256],
            };

            let mut end_status = STATEMGRSTATUS { n_status: 0, ll_sequence_number: 0 };
            let end_res = sr_set_restore_point(&end_spec, &mut end_status);
            FreeLibrary(h_module);

            if end_res != 0 && (end_status.n_status == ERROR_SUCCESS || end_status.n_status == ERROR_ALREADY_EXISTS) {
                Ok(seq_num)
            } else {
                Err(format!("SRSetRestorePointW (END_SYSTEM_CHANGE) failed with status code: {}", end_status.n_status))
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestorePoint {
    #[serde(alias = "SequenceNumber")]
    pub sequence_number: u32,

    #[serde(alias = "Description")]
    pub description: String,

    #[serde(alias = "RestorePointType")]
    pub restore_point_type: serde_json::Value,

    #[serde(alias = "CreationTime")]
    pub creation_time: String,
}

/// Helper to generate the PowerShell registry command to bypass the 24-hour restore point frequency limit.
pub fn get_frequency_limit_bypass_command() -> String {
    r#"Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" -Name "SystemRestorePointCreationFrequency" -Value 0 -Type DWord -Force"#.to_string()
}

/// Helper to generate PowerShell command to enable System Restore on C:\ drive.
pub fn get_enable_restore_command() -> String {
    r#"Enable-ComputerRestore -Drive "C:\""#.to_string()
}

/// Refine and parse PowerShell or WinAPI errors into clear, structured error diagnostics.
pub fn parse_restore_point_error(raw_stderr: &str, exit_code: i32) -> String {
    let lower = raw_stderr.to_lowercase();
    if lower.contains("0x80041001") || lower.contains("24 hours") || lower.contains("frequency") {
        "System Restore creation frequency limit reached (0x80041001). A restore point was created within the last 24 hours. Set SystemRestorePointCreationFrequency registry key to 0 to bypass.".to_string()
    } else if lower.contains("0x80070422") || lower.contains("disabled") {
        "System Restore is disabled on the system drive (0x80070422). Enable System Restore on drive C: to create restore points.".to_string()
    } else if lower.contains("0x80070005") || lower.contains("access is denied") || lower.contains("accessdenied") {
        "Access is denied (0x80070005). Administrator privileges are required to create a System Restore point.".to_string()
    } else {
        format!(
            "Failed to create restore point (exit code {}): {}",
            exit_code,
            raw_stderr.trim()
        )
    }
}

/// Creates a new Windows System Restore Point using native SRSetRestorePointW WinAPI with PowerShell fallback.
pub fn create_restore_point(
    runner: &dyn CommandRunner,
    description: &str,
) -> Result<ExecutedAction, String> {
    log::info!(
        "[SystemRestore] Creating restore point with description: '{}' (dry_run={})",
        description,
        runner.is_dry_run()
    );

    if runner.is_dry_run() {
        let escaped_desc = escape_powershell_literal(description);
        let ps_command = format!(
            "Checkpoint-Computer -Description {} -RestorePointType \"MODIFY_SETTINGS\" -Confirm:$false -ErrorAction Stop",
            escaped_desc
        );
        let output = runner.run_powershell(&ps_command)?;
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
        match native_winapi::create_restore_point_native(description) {
            Ok(seq) => {
                log::info!("[SystemRestore] Native SRSetRestorePointW created restore point (seq #{})", seq);
                return Ok(ExecutedAction {
                    id: "create_restore_point".to_string(),
                    name: format!("Create System Restore Point ({})", description),
                    command: format!("WinAPI::SRSetRestorePointW({})", description),
                    output: crate::runner::CommandOutput {
                        exit_code: 0,
                        stdout: format!("Native System Restore Point created (Sequence #{})", seq),
                        stderr: String::new(),
                    },
                    skipped: false,
                });
            }
            Err(e) => {
                log::warn!("[SystemRestore] Native SRSetRestorePointW failed: {}. Falling back to PowerShell Checkpoint-Computer...", e);
            }
        }
    }

    let escaped_desc = escape_powershell_literal(description);
    let ps_command = format!(
        "Checkpoint-Computer -Description {} -RestorePointType \"MODIFY_SETTINGS\" -Confirm:$false -ErrorAction Stop",
        escaped_desc
    );

    let output = runner.run_powershell(&ps_command)?;

    if output.exit_code != 0 {
        let lower_stderr = output.stderr.to_lowercase();

        // Check if frequency limit error (0x80041001): try bypass registry tweak and retry
        if lower_stderr.contains("0x80041001") || lower_stderr.contains("24 hours") || lower_stderr.contains("frequency") {
            log::warn!("[SystemRestore] Frequency limit reached. Attempting registry bypass (SystemRestorePointCreationFrequency = 0)...");
            let bypass_cmd = get_frequency_limit_bypass_command();
            if let Ok(bypass_res) = runner.run_powershell(&bypass_cmd) {
                if bypass_res.exit_code == 0 {
                    log::info!("[SystemRestore] Frequency limit registry bypass applied. Retrying Checkpoint-Computer...");
                    if let Ok(retry_output) = runner.run_powershell(&ps_command) {
                        if retry_output.exit_code == 0 {
                            log::info!("[SystemRestore] Checkpoint-Computer succeeded after frequency limit bypass");
                            return Ok(ExecutedAction {
                                id: "create_restore_point".to_string(),
                                name: format!("Create System Restore Point ({})", description),
                                command: ps_command,
                                output: retry_output,
                                skipped: false,
                            });
                        }
                    }
                }
            }
        }

        // Check if disabled error (0x80070422): try auto-enabling restore on C:\ and retry
        if lower_stderr.contains("0x80070422") || lower_stderr.contains("disabled") {
            log::warn!("[SystemRestore] System Restore is disabled. Attempting auto-enable via Enable-ComputerRestore -Drive \"C:\\\"...");
            let enable_cmd = get_enable_restore_command();
            if let Ok(enable_res) = runner.run_powershell(&enable_cmd) {
                if enable_res.exit_code == 0 {
                    log::info!("[SystemRestore] System Restore enabled successfully. Retrying Checkpoint-Computer...");
                    if let Ok(retry_output) = runner.run_powershell(&ps_command) {
                        if retry_output.exit_code == 0 {
                            log::info!("[SystemRestore] Checkpoint-Computer succeeded after auto-enabling System Restore");
                            return Ok(ExecutedAction {
                                id: "create_restore_point".to_string(),
                                name: format!("Create System Restore Point ({})", description),
                                command: ps_command,
                                output: retry_output,
                                skipped: false,
                            });
                        }
                    }
                }
            }
        }

        let parsed_err = parse_restore_point_error(&output.stderr, output.exit_code);
        log::warn!("[SystemRestore] {}", parsed_err);
        return Err(parsed_err);
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
                restore_point_type: serde_json::Value::String("MODIFY_SETTINGS".to_string()),
                creation_time: "2026-07-27T10:00:00.000Z".to_string(),
            },
            RestorePoint {
                sequence_number: 100,
                description: "Windows Update Auto Restore Point".to_string(),
                restore_point_type: serde_json::Value::String("DEVICE_DRIVER_INSTALL".to_string()),
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
    let trimmed = json_str.trim();
    if trimmed.is_empty() || trimmed == "null" || trimmed == "[]" {
        return Ok(Vec::new());
    }

    if let Ok(vec) = serde_json::from_str::<Vec<RestorePoint>>(trimmed) {
        Ok(vec)
    } else if let Ok(single) = serde_json::from_str::<RestorePoint>(trimmed) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::{CommandOutput, DryRunRunner};

    #[test]
    fn test_winapi_begin_end_restore_point_sequence() {
        #[cfg(target_os = "windows")]
        {
            assert_eq!(native_winapi::BEGIN_SYSTEM_CHANGE, 100);
            assert_eq!(native_winapi::END_SYSTEM_CHANGE, 102);
            assert_eq!(native_winapi::MODIFY_SETTINGS, 12);
            assert_eq!(native_winapi::ERROR_SUCCESS, 0);
            assert_eq!(native_winapi::ERROR_ALREADY_EXISTS, 183);

            use std::mem::size_of;
            assert_eq!(size_of::<native_winapi::RESTOREPOINTINFOW>(), 528);
            assert_eq!(size_of::<native_winapi::STATEMGRSTATUS>(), 16);
        }
    }

    #[test]
    fn test_create_restore_point_dry_run() {
        // Arrange
        let runner = DryRunRunner::new();
        let description = "Pre-Optimization Snapshot";

        // Act
        let action = create_restore_point(&runner, description).unwrap();

        // Assert
        assert_eq!(action.id, "create_restore_point");
        assert!(action.name.contains(description));
        assert!(action.command.contains("Checkpoint-Computer"));
        assert!(action.command.contains("-Confirm:$false"));
        assert!(action.command.contains("'Pre-Optimization Snapshot'"));
        assert_eq!(action.output.exit_code, 0);

        let history = runner.get_history();
        assert_eq!(history.len(), 1);
        assert!(history[0].command.contains("Checkpoint-Computer"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_native_restore_point_struct_alignment() {
        use std::mem::size_of;
        assert_eq!(size_of::<native_winapi::RESTOREPOINTINFOW>(), 528);
        assert_eq!(size_of::<native_winapi::STATEMGRSTATUS>(), 16);
    }

    #[test]
    fn test_get_restore_points_dry_run_fallback() {
        // Arrange
        let runner = DryRunRunner::new();

        // Act
        let points = get_restore_points(&runner).unwrap();

        // Assert
        assert!(!points.is_empty());
        assert_eq!(points[0].sequence_number, 101);
        assert_eq!(points[0].description, "WiScripts System Optimization Checkpoint");
    }

    #[test]
    fn test_parse_restore_points_json_single_and_array() {
        // Arrange
        let single_json = r#"{"SequenceNumber":42,"Description":"Manual Checkpoint","RestorePointType":"MODIFY_SETTINGS","CreationTime":"2026-07-27T10:00:00Z"}"#;
        let array_json = r#"[{"SequenceNumber":1,"Description":"First","RestorePointType":"APPLICATION_INSTALL","CreationTime":"2026-07-25T10:00:00Z"},{"SequenceNumber":2,"Description":"Second","RestorePointType":"MODIFY_SETTINGS","CreationTime":"2026-07-26T10:00:00Z"}]"#;

        // Act
        let single_parsed = parse_restore_points_json(single_json).unwrap();
        let array_parsed = parse_restore_points_json(array_json).unwrap();

        // Assert
        assert_eq!(single_parsed.len(), 1);
        assert_eq!(single_parsed[0].sequence_number, 42);
        assert_eq!(single_parsed[0].description, "Manual Checkpoint");

        assert_eq!(array_parsed.len(), 2);
        assert_eq!(array_parsed[0].sequence_number, 1);
        assert_eq!(array_parsed[1].sequence_number, 2);
    }

    #[test]
    fn test_parse_restore_points_empty_and_null() {
        // Act & Assert
        assert_eq!(parse_restore_points_json("").unwrap(), vec![]);
        assert_eq!(parse_restore_points_json("   ").unwrap(), vec![]);
        assert_eq!(parse_restore_points_json("null").unwrap(), vec![]);
        assert_eq!(parse_restore_points_json("[]").unwrap(), vec![]);
        assert_eq!(parse_restore_points_json("\n\t").unwrap(), vec![]);
    }

    #[test]
    fn test_frequency_limit_registry_command_generation() {
        // Act
        let bypass_cmd = get_frequency_limit_bypass_command();
        let enable_cmd = get_enable_restore_command();

        // Assert
        assert!(bypass_cmd.contains(r#"HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore"#));
        assert!(bypass_cmd.contains("SystemRestorePointCreationFrequency"));
        assert!(bypass_cmd.contains("-Value 0"));

        assert!(enable_cmd.contains("Enable-ComputerRestore"));
        assert!(enable_cmd.contains(r#"-Drive "C:\""#));
    }

    #[test]
    fn test_create_restore_point_system_disabled_error() {
        // Arrange
        let runner = CustomOutputRunner {
            exit_code: 1,
            stdout: String::new(),
            stderr: "Cannot create a system restore point because System Restore is disabled. (Exception from HRESULT: 0x80070422)".to_string(),
        };

        // Act
        let result = create_restore_point(&runner, "Test Point");

        // Assert
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("0x80070422") || err.contains("disabled"));
        assert!(err.contains("System Restore is disabled"));
    }

    #[test]
    fn test_create_restore_point_access_denied_error() {
        // Arrange
        let runner = CustomOutputRunner {
            exit_code: 1,
            stdout: String::new(),
            stderr: "Access is denied. (Exception from HRESULT: 0x80070005 (E_ACCESSDENIED))".to_string(),
        };

        // Act
        let result = create_restore_point(&runner, "Test Point");

        // Assert
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("0x80070005") || err.contains("Access is denied"));
        assert!(err.contains("Administrator privileges are required"));
    }

    #[test]
    fn test_restore_system_point_dry_run() {
        // Arrange
        let runner = DryRunRunner::new();
        let seq = 42;

        // Act
        let action = restore_system_point(&runner, seq).unwrap();

        // Assert
        assert_eq!(action.id, "restore_system_point");
        assert!(action.command.contains("Restore-Computer -SequenceNumber 42 -Confirm:$false"));
        assert_eq!(action.output.exit_code, 0);

        let history = runner.get_history();
        assert_eq!(history.len(), 1);
        assert!(history[0].command.contains("Restore-Computer -SequenceNumber 42"));
    }

    struct CustomOutputRunner {
        exit_code: i32,
        stdout: String,
        stderr: String,
    }

    impl CommandRunner for CustomOutputRunner {
        fn run_powershell(&self, _script: &str) -> Result<CommandOutput, String> {
            Ok(CommandOutput {
                exit_code: self.exit_code,
                stdout: self.stdout.clone(),
                stderr: self.stderr.clone(),
            })
        }

        fn run_cmd(&self, _command: &str) -> Result<CommandOutput, String> {
            Ok(CommandOutput {
                exit_code: self.exit_code,
                stdout: self.stdout.clone(),
                stderr: self.stderr.clone(),
            })
        }

        fn is_dry_run(&self) -> bool {
            false
        }
    }

    #[test]
    fn test_create_restore_point_frequency_limit_error() {
        // Arrange
        let runner = CustomOutputRunner {
            exit_code: 1,
            stdout: String::new(),
            stderr: "A new restore point cannot be created because one has already been created within the last 24 hours. (Exception from HRESULT: 0x80041001)".to_string(),
        };

        // Act
        let result = create_restore_point(&runner, "Test Point");

        // Assert
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("0x80041001") || err.contains("24 hours"));
        assert!(err.contains("frequency limit reached"));
    }
}


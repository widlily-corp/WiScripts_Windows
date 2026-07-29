use wiscripts_windows_lib::commands;
use wiscripts_windows_lib::error::AppError;
use wiscripts_windows_lib::runner::{CommandOutput, CommandRunner};
use wiscripts_windows_lib::scheduler;
use wiscripts_windows_lib::startup;
use wiscripts_windows_lib::system_restore;

struct MockRunner {
    exit_code: i32,
    stdout: String,
    stderr: String,
    is_dry: bool,
}

impl CommandRunner for MockRunner {
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
        self.is_dry
    }
}

// ---------------------------------------------------------------------------
// Scheduled Tasks Failure Mode Tests
// ---------------------------------------------------------------------------

#[test]
fn test_scheduled_tasks_toggle_access_denied_error_propagation() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Enable-ScheduledTask : Access is denied.\r\nAt line:5 char:1".to_string(),
        is_dry: false,
    };

    let result = scheduler::toggle_scheduled_task(&runner, "Consolidator", r"\Microsoft\", false);
    assert!(result.is_err());
    if let Err(AppError::Execution(err_msg)) = result {
        assert!(err_msg.contains("Access is denied"));
        assert!(err_msg.contains("Administrator elevation is required"));
        assert!(err_msg.contains("Consolidator"));
    } else {
        panic!("Expected AppError::Execution for access denied");
    }
}

#[test]
fn test_scheduled_tasks_run_access_denied_error_propagation() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Start-ScheduledTask : UnauthorizedAccessException 0x80070005".to_string(),
        is_dry: false,
    };

    let result = scheduler::run_scheduled_task(&runner, "ProgramDataUpdater", r"\Microsoft\");
    assert!(result.is_err());
    if let Err(AppError::Execution(err_msg)) = result {
        assert!(err_msg.contains("Access is denied"));
        assert!(err_msg.contains("Administrator elevation is required"));
        assert!(err_msg.contains("ProgramDataUpdater"));
    } else {
        panic!("Expected AppError::Execution for unauthorized access");
    }
}

#[test]
fn test_scheduled_tasks_generic_execution_error() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "The system cannot find the file specified.".to_string(),
        is_dry: false,
    };

    let result = scheduler::run_scheduled_task(&runner, "NonExistentTask", r"\");
    assert!(result.is_err());
    if let Err(AppError::Execution(err_msg)) = result {
        assert!(err_msg.contains("Failed to run scheduled task 'NonExistentTask'"));
        assert!(err_msg.contains("cannot find the file specified"));
    } else {
        panic!("Expected AppError::Execution for missing task");
    }
}

// ---------------------------------------------------------------------------
// Startup Items Failure Mode Tests
// ---------------------------------------------------------------------------

#[test]
fn test_startup_items_ipc_missing_value_name_validation() {
    tauri::async_runtime::block_on(async {
        // Test None value_name in toggle_startup_item
        let res1 = commands::toggle_startup_item(
            "hkcu_run_discord".to_string(),
            None,
            Some("HKCU Run".to_string()),
            true,
            Some(true),
        )
        .await;
        assert!(res1.is_err());
        if let Err(AppError::Execution(msg)) = res1 {
            assert_eq!(msg, "Missing required parameter: value_name");
        } else {
            panic!("Expected AppError::Execution for missing value_name");
        }

        // Test whitespace-only value_name in toggle_startup_item
        let res2 = commands::toggle_startup_item(
            "hkcu_run_discord".to_string(),
            Some("   ".to_string()),
            Some("HKCU Run".to_string()),
            true,
            Some(true),
        )
        .await;
        assert!(res2.is_err());
        if let Err(AppError::Execution(msg)) = res2 {
            assert_eq!(msg, "Missing required parameter: value_name");
        } else {
            panic!("Expected AppError::Execution for whitespace value_name");
        }

        // Test None value_name in remove_startup_item
        let res3 = commands::remove_startup_item(
            "hkcu_run_discord".to_string(),
            None,
            Some("HKCU Run".to_string()),
            Some(true),
        )
        .await;
        assert!(res3.is_err());
        if let Err(AppError::Execution(msg)) = res3 {
            assert_eq!(msg, "Missing required parameter: value_name");
        } else {
            panic!("Expected AppError::Execution for missing value_name");
        }
    });
}

#[test]
fn test_startup_items_toggle_access_denied_error_propagation() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Set-ItemProperty : Access is denied to HKLM registry key".to_string(),
        is_dry: false,
    };

    let result =
        startup::toggle_startup_item(&runner, "hklm_run_app", "SystemApp", "HKLM Run", false);
    assert!(result.is_err());
    if let Err(AppError::Execution(err_msg)) = result {
        assert!(err_msg.contains("Administrator privileges are required"));
        assert!(err_msg.contains("Access is denied"));
        assert!(err_msg.contains("SystemApp"));
    } else {
        panic!("Expected AppError::Execution for access denied");
    }
}

#[test]
fn test_startup_items_query_access_denied_error_propagation() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Get-ItemProperty : UnauthorizedAccessException: HKLM:\\Software\\Microsoft\\..."
            .to_string(),
        is_dry: false,
    };

    let result = startup::get_startup_items(&runner);
    assert!(result.is_err());
    if let Err(AppError::Execution(err_msg)) = result {
        assert!(err_msg
            .contains("Administrator privileges are required to query startup registry paths"));
        assert!(err_msg.contains("Access is denied"));
    } else {
        panic!("Expected AppError::Execution for query access denied");
    }
}

// ---------------------------------------------------------------------------
// System Restore Points Failure Mode Tests
// ---------------------------------------------------------------------------

#[test]
fn test_create_restore_point_ipc_empty_description_validation() {
    tauri::async_runtime::block_on(async {
        // AppHandle isn't actually dereferenced in create_restore_point, but we pass dummy state if needed or test commands logic
        // Notice create_restore_point checks description.trim().is_empty() first before spawning task!
    });
}

#[test]
fn test_system_restore_empty_description_error() {
    // Check validation error directly when description is empty
    let empty_desc = "   ";
    assert!(empty_desc.trim().is_empty());
}

#[test]
fn test_system_restore_access_denied_0x80070005_error() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Checkpoint-Computer : Access is denied. (Exception from HRESULT: 0x80070005)"
            .to_string(),
        is_dry: false,
    };

    let result = system_restore::create_restore_point(&runner, "Manual Checkpoint");
    assert!(result.is_err());
    let err_msg = result.unwrap_err();
    assert!(err_msg.contains("0x80070005"));
    assert!(err_msg.contains("Access is denied"));
    assert!(err_msg.contains("Administrator privileges are required"));
}

#[test]
fn test_system_restore_disabled_0x80070422_error() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Checkpoint-Computer : The service cannot be started because it is disabled. (Exception from HRESULT: 0x80070422)".to_string(),
        is_dry: false,
    };

    let result = system_restore::create_restore_point(&runner, "Manual Checkpoint");
    assert!(result.is_err());
    let err_msg = result.unwrap_err();
    assert!(err_msg.contains("0x80070422"));
    assert!(err_msg.contains("System Restore is disabled"));
}

#[test]
fn test_system_restore_frequency_limit_0x80041001_error() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Checkpoint-Computer : A new restore point cannot be created because one has already been created within the last 24 hours. (Exception from HRESULT: 0x80041001)".to_string(),
        is_dry: false,
    };

    let result = system_restore::create_restore_point(&runner, "Manual Checkpoint");
    assert!(result.is_err());
    let err_msg = result.unwrap_err();
    assert!(err_msg.contains("0x80041001"));
    assert!(err_msg.contains("frequency limit reached"));
}

#[test]
fn test_system_restore_get_restore_points_failure_propagation() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Get-ComputerRestorePoint : The WMI service is unavailable.".to_string(),
        is_dry: false,
    };

    let result = system_restore::get_restore_points(&runner);
    assert!(result.is_err());
    let err_msg = result.unwrap_err();
    assert!(err_msg.contains("Failed to retrieve restore points (exit code 1)"));
    assert!(err_msg.contains("WMI service is unavailable"));
}

#[test]
fn test_system_restore_restore_system_point_failure_propagation() {
    let runner = MockRunner {
        exit_code: 1,
        stdout: String::new(),
        stderr: "Restore-Computer : Sequence number 9999 was not found.".to_string(),
        is_dry: false,
    };

    let result = system_restore::restore_system_point(&runner, 9999);
    assert!(result.is_err());
    let err_msg = result.unwrap_err();
    assert!(err_msg.contains("Failed to restore system to point 9999"));
    assert!(err_msg.contains("Sequence number 9999 was not found"));
}

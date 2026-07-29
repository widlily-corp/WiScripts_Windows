use wiscripts_windows_lib::error::AppError;
use wiscripts_windows_lib::packages;
use wiscripts_windows_lib::profiles;
use wiscripts_windows_lib::runner::DryRunRunner;
use wiscripts_windows_lib::scheduler;
use wiscripts_windows_lib::startup;
use wiscripts_windows_lib::system_restore;

/// Edge Case 1: Null Date Parsing
#[test]
fn test_stress_null_date_parsing() {
    // 1. Scheduled tasks JSON with null lastRunTime and nextRunTime
    let json_null_dates = r#"[
        {
            "taskName": "NullDateTask1",
            "taskPath": "\\Microsoft\\Windows\\",
            "state": "Ready",
            "enabled": true,
            "triggerType": "Daily",
            "author": "System",
            "lastRunTime": null,
            "nextRunTime": null,
            "actionSummary": "C:\\Windows\\System32\\cmd.exe"
        },
        {
            "taskName": "NullDateTask2",
            "taskPath": "\\",
            "state": "Disabled",
            "enabled": false,
            "triggerType": "Manual",
            "author": "Admin",
            "lastRunTime": "2026-07-27 12:00:00",
            "nextRunTime": null,
            "actionSummary": "notepad.exe"
        }
    ]"#;
    let tasks = scheduler::parse_scheduled_tasks_json(json_null_dates)
        .expect("Scheduled tasks JSON with null dates must parse successfully");
    assert_eq!(tasks.len(), 2);
    assert_eq!(tasks[0].last_run_time, None);
    assert_eq!(tasks[0].next_run_time, None);
    assert_eq!(
        tasks[1].last_run_time,
        Some("2026-07-27 12:00:00".to_string())
    );
    assert_eq!(tasks[1].next_run_time, None);

    // 2. System Restore Points JSON with empty/null/valid dates
    let restore_points_null = "null";
    let rp_parsed = system_restore::parse_restore_points_json(restore_points_null)
        .expect("Null restore points JSON must return empty vector");
    assert!(rp_parsed.is_empty());
}

/// Edge Case 2: Task Path Backslash Normalization
#[test]
fn test_stress_task_path_backslash_normalization() {
    assert_eq!(scheduler::normalize_task_path(""), "\\");
    assert_eq!(scheduler::normalize_task_path("\\"), "\\");
    assert_eq!(scheduler::normalize_task_path("   "), "\\");
    assert_eq!(
        scheduler::normalize_task_path("Microsoft\\Windows"),
        "\\Microsoft\\Windows\\"
    );
    assert_eq!(
        scheduler::normalize_task_path("\\Microsoft\\Windows"),
        "\\Microsoft\\Windows\\"
    );
    assert_eq!(
        scheduler::normalize_task_path("Microsoft\\Windows\\"),
        "\\Microsoft\\Windows\\"
    );
    assert_eq!(
        scheduler::normalize_task_path("\\Microsoft\\Windows\\"),
        "\\Microsoft\\Windows\\"
    );
    assert_eq!(
        scheduler::normalize_task_path("  \\Microsoft\\Windows  "),
        "\\Microsoft\\Windows\\"
    );
    assert_eq!(scheduler::normalize_task_path("MyTask"), "\\MyTask\\");
}

/// Edge Case 3: Whitespace JSON Deserialization
#[test]
fn test_stress_whitespace_json_deserialization() {
    // 1. Startup items with leading/trailing whitespace -> SUCCEEDS
    let startup_json_ws = r#"   [
        {
            "id": "test_app",
            "name": "Test App",
            "valueName": "TestApp",
            "command": "C:\\test.exe",
            "location": "HKCU Run",
            "enabled": true,
            "itemType": "Registry",
            "publisher": "Test Pub"
        }
    ]   "#;
    let startup_items = startup::parse_startup_items_json(startup_json_ws)
        .expect("Startup items JSON with leading whitespace must parse");
    assert_eq!(startup_items.len(), 1);
    assert_eq!(startup_items[0].name, "Test App");

    // 2. Restore points JSON with whitespace -> SUCCEEDS
    let rp_ws_json = "   \n\t  [ {\"sequenceNumber\": 1, \"description\": \"Test\", \"restorePointType\": \"MODIFY_SETTINGS\", \"creationTime\": \"2026-07-27\"} ] \n ";
    let restore_points = system_restore::parse_restore_points_json(rp_ws_json)
        .expect("Restore points JSON with leading whitespace must parse");
    assert_eq!(restore_points.len(), 1);

    // 3. Scheduled tasks JSON with leading whitespace -> SUCCEEDS after fix
    let task_ws_json = "   \n  [ {\"taskName\": \"WSTask\", \"taskPath\": \"\\\\\", \"state\": \"Ready\", \"enabled\": true, \"triggerType\": \"Manual\", \"author\": \"Auth\", \"lastRunTime\": null, \"nextRunTime\": null, \"actionSummary\": \"cmd.exe\"} ]  ";
    let tasks = scheduler::parse_scheduled_tasks_json(task_ws_json)
        .expect("Scheduled tasks JSON with leading whitespace must parse successfully");
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].task_name, "WSTask");
}

/// Edge Case 4: Missing IPC Parameters
#[test]
fn test_stress_missing_ipc_parameters() {
    let runner = DryRunRunner::new();

    // 1. Startup item with empty value_name -> Error
    let res = startup::toggle_startup_item(&runner, "test_id", "", "HKCU Run", true);
    assert!(res.is_err());
    if let Err(AppError::Execution(msg)) = res {
        assert!(msg.contains("value_name cannot be empty"));
    }

    // 2. Winget install with empty package ID -> Error
    let res = packages::winget_install(None, &runner, "", true);
    assert!(res.is_err());
    if let Err(AppError::Execution(msg)) = res {
        assert!(msg.contains("Package ID cannot be empty"));
    }

    // 3. Winget search with empty query -> Graceful Ok(vec![])
    let search_res =
        packages::winget_search(&runner, "").expect("Empty search query returns Ok(Vec::new())");
    assert_eq!(search_res.len(), 0);

    // 4. Remove UWP app with empty name -> Error
    let res = packages::remove_uwp_app(None, &runner, "", true);
    assert!(res.is_err());
    if let Err(AppError::Execution(msg)) = res {
        assert!(msg.contains("Package name cannot be empty"));
    }

    // 5. Apply optimization profile with non-existent ID -> Error
    let res = profiles::apply_optimization_profile(None, &runner, "non_existent_profile", true);
    assert!(res.is_err());
    if let Err(AppError::InvalidConfig(msg)) = res {
        assert!(msg.contains("not found"));
    }
}

/// Edge Case 5: WinAPI Transaction Pairs
#[test]
fn test_stress_winapi_transaction_pairs() {
    #[cfg(target_os = "windows")]
    {
        use system_restore::native_winapi;

        assert_eq!(native_winapi::BEGIN_SYSTEM_CHANGE, 100);
        assert_eq!(native_winapi::END_SYSTEM_CHANGE, 102);
        assert_eq!(native_winapi::MODIFY_SETTINGS, 12);
        assert_eq!(native_winapi::ERROR_SUCCESS, 0);

        // Verify RESTOREPOINTINFOW size and field alignment
        let rp_size = std::mem::size_of::<native_winapi::RESTOREPOINTINFOW>();
        assert_eq!(rp_size, 528); // 4 + 4 + 8 + (256 * 2) = 528 bytes

        let sm_size = std::mem::size_of::<native_winapi::STATEMGRSTATUS>();
        assert_eq!(sm_size, 16); // 4 + padding(4) + 8 = 16 bytes
    }
}

/// Edge Case 6: Frequency Limit Commands
#[test]
fn test_stress_frequency_limit_commands() {
    let cmd = system_restore::get_frequency_limit_bypass_command();
    assert!(cmd.contains(r#"HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore"#));
    assert!(cmd.contains("SystemRestorePointCreationFrequency"));
    assert!(cmd.contains("-Value 0"));

    let err_frequency = system_restore::parse_restore_point_error(
        "Error 0x80041001: 24 hours frequency limit reached",
        1,
    );
    assert!(err_frequency.contains("frequency limit reached"));
    assert!(err_frequency.contains("Set SystemRestorePointCreationFrequency registry key to 0"));
}

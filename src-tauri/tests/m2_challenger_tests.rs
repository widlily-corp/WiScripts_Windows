use wiscripts_windows_lib::commands::SystemInfo;
use wiscripts_windows_lib::diagnostics;
use wiscripts_windows_lib::dns_context;
use wiscripts_windows_lib::driver_backup;
use wiscripts_windows_lib::error::AppError;
use wiscripts_windows_lib::optimization::TaskProgressPayload;
use wiscripts_windows_lib::packages::{self, UwpAppInfo, WingetPackage};
use wiscripts_windows_lib::profiles::{self, OptimizationProfile};
use wiscripts_windows_lib::runner::{
    CommandOutput, DryRunRunner, ExecutedAction, ExecutionSummary,
};

// ===========================================================================
// CATEGORY 1: DRY-RUN BEHAVIOR & COMMAND RECORDINGS (R1-R5 FEATURES)
// ===========================================================================

#[test]
fn test_r1_diagnostics_dry_run_command_recordings() {
    // 1. sfc_scannow
    let runner = DryRunRunner::new();
    let summary = diagnostics::run_diagnostics(None, &runner, "sfc_scannow", true).unwrap();
    assert!(
        summary.is_dry_run,
        "R1 sfc summary must flag is_dry_run=true"
    );
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 1);
    assert_eq!(summary.executed_actions[0].command, "sfc /scannow");

    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].runner_type, "powershell");
    assert_eq!(history[0].command, "sfc /scannow");

    // 2. dism_restorehealth
    runner.clear_history();
    let summary = diagnostics::run_diagnostics(None, &runner, "dism_restorehealth", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(
        summary.executed_actions[0].command,
        "DISM.exe /Online /Cleanup-Image /RestoreHealth"
    );

    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert_eq!(
        history[0].command,
        "DISM.exe /Online /Cleanup-Image /RestoreHealth"
    );

    // 3. reset_tcpip
    runner.clear_history();
    let summary = diagnostics::run_diagnostics(None, &runner, "reset_tcpip", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(
        summary.executed_actions[0].command,
        "netsh int ip reset; netsh winsock reset"
    );

    // 4. all
    runner.clear_history();
    let summary = diagnostics::run_diagnostics(None, &runner, "all", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 3);
    let history = runner.get_history();
    assert_eq!(history.len(), 3);
    assert_eq!(history[0].command, "sfc /scannow");
    assert_eq!(
        history[1].command,
        "DISM.exe /Online /Cleanup-Image /RestoreHealth"
    );
    assert_eq!(
        history[2].command,
        "netsh int ip reset; netsh winsock reset"
    );
}

#[test]
fn test_r2_packages_dry_run_command_recordings() {
    // 1. winget_search
    let runner = DryRunRunner::new();
    let packages = packages::winget_search(&runner, "git").unwrap();
    assert!(
        !packages.is_empty(),
        "Winget search in dry-run should return mock packages"
    );
    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert_eq!(
        history[0].command,
        "winget search --query \"git\" --accept-source-agreements"
    );

    // 2. winget_install
    runner.clear_history();
    let summary = packages::winget_install(None, &runner, "Git.Git", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 1);
    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert_eq!(
        history[0].command,
        "winget install --id \"Git.Git\" --exact --silent --accept-source-agreements --accept-package-agreements"
    );

    // 3. winget_update
    runner.clear_history();
    let summary = packages::winget_update(None, &runner, "7zip.7zip", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert_eq!(
        history[0].command,
        "winget upgrade --id \"7zip.7zip\" --exact --silent --accept-source-agreements --accept-package-agreements"
    );

    // 4. get_uwp_apps
    runner.clear_history();
    let apps = packages::get_uwp_apps(&runner).unwrap();
    assert!(!apps.is_empty());
    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert!(history[0].command.contains("Get-AppxPackage -AllUsers"));

    // 5. remove_uwp_app
    runner.clear_history();
    let pkg_name = "Microsoft.YourPhone_1.23082.128.0_x64__8wekyb3d8bbwe";
    let summary = packages::remove_uwp_app(None, &runner, pkg_name, true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert_eq!(
        history[0].command,
        format!(
            "Get-AppxPackage -AllUsers | Where-Object {{ $_.PackageFullName -eq '{}' }} | Remove-AppxPackage -AllUsers -ErrorAction Stop",
            pkg_name
        )
    );
}

#[test]
fn test_r3_profiles_dry_run_command_recordings() {
    let runner = DryRunRunner::new();

    // 1. gaming profile
    let summary = profiles::apply_optimization_profile(None, &runner, "gaming", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 6);
    let history = runner.get_history();
    assert_eq!(history.len(), 6);

    // 2. privacy profile
    runner.clear_history();
    let summary = profiles::apply_optimization_profile(None, &runner, "privacy", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 7);

    // 3. work profile
    runner.clear_history();
    let summary = profiles::apply_optimization_profile(None, &runner, "work", true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 6);
}

#[test]
fn test_r4_dns_context_dry_run_command_recordings() {
    let runner = DryRunRunner::new();

    // 1. set_dns_server - adguard (global)
    let summary = dns_context::set_dns_server(None, &runner, "adguard", None, true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert!(history[0].command.contains("94.140.14.14"));
    assert!(history[0].command.contains("94.140.15.15"));
    assert!(history[0].command.contains("Get-NetAdapter"));

    // 2. set_dns_server - cloudflare with explicit interface alias
    runner.clear_history();
    let summary =
        dns_context::set_dns_server(None, &runner, "cloudflare", Some("Ethernet 1"), true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert!(history[0].command.contains("1.1.1.1"));
    assert!(history[0].command.contains("1.0.0.1"));
    assert!(
        history[0].command.contains("-InterfaceAlias \"Ethernet 1\"")
            || history[0].command.contains("-InterfaceAlias 'Ethernet 1'")
    );

    // 3. set_dns_server - google
    runner.clear_history();
    let summary = dns_context::set_dns_server(None, &runner, "google", None, true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert!(history[0].command.contains("8.8.8.8"));
    assert!(history[0].command.contains("8.8.4.4"));

    // 4. set_dns_server - dhcp / reset
    runner.clear_history();
    let summary = dns_context::set_dns_server(None, &runner, "dhcp", None, true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert!(history[0].command.contains("-ResetServerAddresses"));

    // 5. toggle_classic_context_menu - enable
    runner.clear_history();
    let summary = dns_context::toggle_classic_context_menu(None, &runner, true, true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert_eq!(
        history[0].command,
        "New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32' -Value '' -Force"
    );

    // 6. toggle_classic_context_menu - disable
    runner.clear_history();
    let summary = dns_context::toggle_classic_context_menu(None, &runner, false, true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    let history = runner.get_history();
    assert_eq!(
        history[0].command,
        "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse -Force -ErrorAction SilentlyContinue"
    );
}

#[test]
fn test_r5_driver_backup_dry_run_command_recordings() {
    let runner = DryRunRunner::new();
    let output_dir = "C:\\Windows_Drivers_Backup";

    let summary = driver_backup::backup_drivers(None, &runner, output_dir, true).unwrap();
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 1);

    let history = runner.get_history();
    assert_eq!(history.len(), 1);
    assert_eq!(
        history[0].command,
        format!(
            "if (-not (Test-Path \"{}\")) {{ New-Item -ItemType Directory -Path \"{}\" -Force }}; Export-WindowsDriver -Online -Destination \"{}\"",
            output_dir, output_dir, output_dir
        )
    );
}

// ===========================================================================
// CATEGORY 2: STRESS-TESTING EDGE CASES
// ===========================================================================

#[test]
fn test_stress_empty_and_whitespace_inputs() {
    let runner = DryRunRunner::new();

    // R1: Diagnostics empty string
    assert!(diagnostics::run_diagnostics(None, &runner, "", true).is_err());
    assert!(diagnostics::run_diagnostics(None, &runner, "   ", true).is_err());

    // R2: Winget search empty string -> returns empty vec
    let res = packages::winget_search(&runner, "   ").unwrap();
    assert!(res.is_empty());

    // R2: Winget install / update empty string -> returns InvalidConfig error
    assert!(packages::winget_install(None, &runner, "", true).is_err());
    assert!(packages::winget_install(None, &runner, "   ", true).is_err());
    assert!(packages::winget_update(None, &runner, "", true).is_err());
    assert!(packages::winget_update(None, &runner, "   ", true).is_err());

    // R2: Remove UWP app empty string
    assert!(packages::remove_uwp_app(None, &runner, "", true).is_err());
    assert!(packages::remove_uwp_app(None, &runner, "   ", true).is_err());

    // R3: Apply profile empty string
    assert!(profiles::apply_optimization_profile(None, &runner, "", true).is_err());
    assert!(profiles::apply_optimization_profile(None, &runner, "   ", true).is_err());

    // R4: Set DNS server empty string
    assert!(dns_context::set_dns_server(None, &runner, "", None, true).is_err());

    // R5: Driver backup empty string
    assert!(driver_backup::backup_drivers(None, &runner, "", true).is_err());
    assert!(driver_backup::backup_drivers(None, &runner, "   ", true).is_err());
}

#[test]
fn test_stress_invalid_action_and_provider_strings() {
    let runner = DryRunRunner::new();

    // R1: Unsupported diagnostics action
    let err = diagnostics::run_diagnostics(None, &runner, "format_c_drive", true).unwrap_err();
    if let AppError::InvalidConfig(msg) = err {
        assert!(msg.contains("Unsupported diagnostics action: format_c_drive"));
    } else {
        panic!("Expected AppError::InvalidConfig");
    }

    // R3: Unsupported profile ID
    let err = profiles::apply_optimization_profile(None, &runner, "non_existent_preset", true)
        .unwrap_err();
    if let AppError::InvalidConfig(msg) = err {
        assert!(msg.contains("Optimization profile 'non_existent_preset' not found"));
    } else {
        panic!("Expected AppError::InvalidConfig");
    }

    // R4: Unsupported DNS provider
    let err =
        dns_context::set_dns_server(None, &runner, "unsupported_dns", None, true).unwrap_err();
    if let AppError::InvalidConfig(msg) = err {
        assert!(msg.contains("Unsupported DNS provider: unsupported_dns"));
    } else {
        panic!("Expected AppError::InvalidConfig");
    }
}

#[test]
fn test_stress_driver_backup_paths_special_characters() {
    let runner = DryRunRunner::new();

    // 1. Path with spaces
    let path_with_spaces = "C:\\Users\\Test User\\Documents\\Driver Backups 2026";
    let summary = driver_backup::backup_drivers(None, &runner, path_with_spaces, true).unwrap();
    assert!(summary.success);
    assert!(summary.executed_actions[0]
        .command
        .contains(&format!("\"{}\"", path_with_spaces)));

    // 2. Path with Unicode / Cyrillic characters
    let cyrillic_path = "D:\\РезервныеКопии\\Драйверы_Системы";
    let summary = driver_backup::backup_drivers(None, &runner, cyrillic_path, true).unwrap();
    assert!(summary.success);
    assert!(summary.executed_actions[0].command.contains(cyrillic_path));

    // 3. Path with parentheses and hyphens
    let complex_path = "E:\\Backup (v2.1) - [Production]\\Drivers";
    let summary = driver_backup::backup_drivers(None, &runner, complex_path, true).unwrap();
    assert!(summary.success);
    assert!(summary.executed_actions[0].command.contains(complex_path));
}

#[test]
fn test_stress_package_ids_and_full_names() {
    let runner = DryRunRunner::new();

    // Winget package ID with dots and hyphens
    let summary = packages::winget_install(None, &runner, "Mozilla.Firefox.ESR", true).unwrap();
    assert!(summary.success);
    assert!(summary.executed_actions[0]
        .command
        .contains("Mozilla.Firefox.ESR"));

    // Case-insensitivity in R1 action & R3 profile ID
    let summary = diagnostics::run_diagnostics(None, &runner, "SFC_SCANNOW", true).unwrap();
    assert!(summary.success);

    let summary = profiles::apply_optimization_profile(None, &runner, "GAMING", true).unwrap();
    assert!(summary.success);
}

// ===========================================================================
// CATEGORY 3: IPC STRUCT JSON CAMELCASE SERIALIZATION VERIFICATION
// ===========================================================================

#[test]
fn test_ipc_struct_winget_package_serialization() {
    let pkg = WingetPackage {
        id: "Git.Git".to_string(),
        name: "Git".to_string(),
        version: "2.43.0".to_string(),
        source: "winget".to_string(),
    };

    let json = serde_json::to_value(&pkg).unwrap();
    assert!(json.get("id").is_some());
    assert!(json.get("name").is_some());
    assert!(json.get("version").is_some());
    assert!(json.get("source").is_some());

    let roundtrip: WingetPackage = serde_json::from_value(json).unwrap();
    assert_eq!(pkg, roundtrip);
}

#[test]
fn test_ipc_struct_uwp_app_info_serialization() {
    let app = UwpAppInfo {
        name: "Microsoft.YourPhone".to_string(),
        package_full_name: "Microsoft.YourPhone_1.23082.128.0_x64__8wekyb3d8bbwe".to_string(),
        publisher_id: "8wekyb3d8bbwe".to_string(),
        is_framework: false,
    };

    let json = serde_json::to_value(&app).unwrap();
    assert!(json.get("name").is_some());
    assert!(
        json.get("packageFullName").is_some(),
        "Key 'packageFullName' missing in JSON!"
    );
    assert!(
        json.get("publisherId").is_some(),
        "Key 'publisherId' missing in JSON!"
    );
    assert!(
        json.get("isFramework").is_some(),
        "Key 'isFramework' missing in JSON!"
    );

    // Verify snake_case keys do NOT exist
    assert!(json.get("package_full_name").is_none());
    assert!(json.get("publisher_id").is_none());
    assert!(json.get("is_framework").is_none());

    let roundtrip: UwpAppInfo = serde_json::from_value(json).unwrap();
    assert_eq!(app, roundtrip);
}

#[test]
fn test_ipc_struct_optimization_profile_serialization() {
    let profile = OptimizationProfile {
        id: "gaming".to_string(),
        name: "Gaming Profile".to_string(),
        description: "Optimizes background services".to_string(),
        icon_name: "Gamepad2".to_string(),
        rule_ids: vec!["services_sysmain".to_string()],
    };

    let json = serde_json::to_value(&profile).unwrap();
    assert!(json.get("id").is_some());
    assert!(json.get("name").is_some());
    assert!(json.get("description").is_some());
    assert!(
        json.get("iconName").is_some(),
        "Key 'iconName' missing in JSON!"
    );
    assert!(
        json.get("ruleIds").is_some(),
        "Key 'ruleIds' missing in JSON!"
    );

    assert!(json.get("icon_name").is_none());
    assert!(json.get("rule_ids").is_none());

    let roundtrip: OptimizationProfile = serde_json::from_value(json).unwrap();
    assert_eq!(profile, roundtrip);
}

#[test]
fn test_ipc_struct_execution_summary_serialization() {
    let summary = ExecutionSummary {
        success: true,
        executed_actions: vec![ExecutedAction {
            id: "act_1".to_string(),
            name: "Action 1".to_string(),
            command: "echo test".to_string(),
            output: CommandOutput {
                exit_code: 0,
                stdout: "ok".to_string(),
                stderr: "".to_string(),
            },
            skipped: false,
        }],
        total_duration_ms: 120,
        is_dry_run: true,
    };

    let json = serde_json::to_value(&summary).unwrap();
    assert!(json.get("success").is_some());
    assert!(
        json.get("executedActions").is_some(),
        "Key 'executedActions' missing in JSON!"
    );
    assert!(
        json.get("totalDurationMs").is_some(),
        "Key 'totalDurationMs' missing in JSON!"
    );
    assert!(
        json.get("isDryRun").is_some(),
        "Key 'isDryRun' missing in JSON!"
    );

    assert!(json.get("executed_actions").is_none());
    assert!(json.get("total_duration_ms").is_none());
    assert!(json.get("is_dry_run").is_none());

    let action_json = &json["executedActions"][0];
    assert!(
        action_json["output"].get("exitCode").is_some(),
        "Key 'exitCode' missing in CommandOutput JSON!"
    );

    let roundtrip: ExecutionSummary = serde_json::from_value(json).unwrap();
    assert_eq!(summary, roundtrip);
}

#[test]
fn test_ipc_struct_task_progress_payload_serialization() {
    let payload = TaskProgressPayload {
        current_step: 2,
        total_steps: 5,
        message: "Executing step 2/5".to_string(),
        is_error: false,
    };

    let json = serde_json::to_value(&payload).unwrap();
    assert!(
        json.get("currentStep").is_some(),
        "Key 'currentStep' missing in JSON!"
    );
    assert!(
        json.get("totalSteps").is_some(),
        "Key 'totalSteps' missing in JSON!"
    );
    assert!(json.get("message").is_some());
    assert!(
        json.get("isError").is_some(),
        "Key 'isError' missing in JSON!"
    );

    assert!(json.get("current_step").is_none());
    assert!(json.get("total_steps").is_none());
    assert!(json.get("is_error").is_none());

    let roundtrip: TaskProgressPayload = serde_json::from_value(json).unwrap();
    assert_eq!(payload, roundtrip);
}

#[test]
fn test_ipc_struct_system_info_serialization() {
    let sys_info = SystemInfo {
        os_name: "Windows".to_string(),
        os_version: "11".to_string(),
        os_build: "22631".to_string(),
        is_elevated: true,
        cpu_usage_percent: 12,
        memory_used_mb: 8192,
        memory_total_mb: 16384,
        telemetry_status: "Active".to_string(),
    };

    let json = serde_json::to_value(&sys_info).unwrap();
    assert!(json.get("osName").is_some());
    assert!(json.get("osVersion").is_some());
    assert!(json.get("osBuild").is_some());
    assert!(json.get("isElevated").is_some());
    assert!(json.get("cpuUsagePercent").is_some());
    assert!(json.get("memoryUsedMb").is_some());
    assert!(json.get("memoryTotalMb").is_some());
    assert!(json.get("telemetryStatus").is_some());

    let roundtrip: SystemInfo = serde_json::from_value(json).unwrap();
    assert_eq!(sys_info, roundtrip);
}

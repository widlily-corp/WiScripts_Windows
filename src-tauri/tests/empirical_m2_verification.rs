use wiscripts_windows_lib::diagnostics;
use wiscripts_windows_lib::dns_context;
use wiscripts_windows_lib::driver_backup;
use wiscripts_windows_lib::error::AppError;
use wiscripts_windows_lib::packages;
use wiscripts_windows_lib::profiles;
use wiscripts_windows_lib::runner::{CommandOutput, CommandRunner, DryRunRunner};

/// Custom mock runner that simulates failing subprocesses (exit code != 0).
struct FailingSubprocessRunner {
    exit_code: i32,
    stderr: String,
}

impl CommandRunner for FailingSubprocessRunner {
    fn run_powershell(&self, _script: &str) -> Result<CommandOutput, String> {
        Ok(CommandOutput {
            exit_code: self.exit_code,
            stdout: String::new(),
            stderr: self.stderr.clone(),
        })
    }

    fn run_cmd(&self, _command: &str) -> Result<CommandOutput, String> {
        Ok(CommandOutput {
            exit_code: self.exit_code,
            stdout: String::new(),
            stderr: self.stderr.clone(),
        })
    }

    fn is_dry_run(&self) -> bool {
        false
    }
}

/// Custom mock runner that simulates process spawn failure / OS error.
struct SpawnErrorRunner {
    error_msg: String,
}

impl CommandRunner for SpawnErrorRunner {
    fn run_powershell(&self, _script: &str) -> Result<CommandOutput, String> {
        Err(self.error_msg.clone())
    }

    fn run_cmd(&self, _command: &str) -> Result<CommandOutput, String> {
        Err(self.error_msg.clone())
    }

    fn is_dry_run(&self) -> bool {
        false
    }
}

// ===========================================================================
// Verification Test 1: Diagnostics Module Subprocess Failure & Sequential Steps
// ===========================================================================

#[test]
fn verify_diagnostics_all_step_indexes_and_failing_subprocess() {
    // 1. Verify multi-step dry run for action "all"
    let dry_runner = DryRunRunner::new();
    let summary = diagnostics::run_diagnostics(None, &dry_runner, "all", true).expect("Diagnostics all failed");
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 3);
    assert_eq!(summary.executed_actions[0].id, "sfc_scannow");
    assert_eq!(summary.executed_actions[1].id, "dism_restorehealth");
    assert_eq!(summary.executed_actions[2].id, "reset_tcpip");

    // 2. Verify failing subprocess (exit_code != 0) sets success = false in ExecutionSummary
    let failing_runner = FailingSubprocessRunner {
        exit_code: 1,
        stderr: "SFC detected corrupt files that could not be repaired".to_string(),
    };
    let failing_summary = diagnostics::run_diagnostics(None, &failing_runner, "all", false)
        .expect("Diagnostics run returned error instead of ExecutionSummary");
    assert!(!failing_summary.success, "Summary success must be false when subprocess fails");
    assert_eq!(failing_summary.executed_actions.len(), 3);
    for action in failing_summary.executed_actions {
        assert_eq!(action.output.exit_code, 1);
    }

    // 3. Verify runner spawn error returns AppError::Execution
    let spawn_err_runner = SpawnErrorRunner {
        error_msg: "Failed to spawn powershell.exe".to_string(),
    };
    let err_res = diagnostics::run_diagnostics(None, &spawn_err_runner, "all", false);
    assert!(err_res.is_err(), "Spawn error must return Err(AppError)");
    if let Err(AppError::Execution(msg)) = err_res {
        assert!(msg.contains("Failed to spawn powershell.exe"));
    } else {
        panic!("Expected AppError::Execution on spawn failure");
    }

    // 4. Verify invalid action returns AppError::InvalidConfig
    let invalid_res = diagnostics::run_diagnostics(None, &dry_runner, "invalid_action", true);
    assert!(invalid_res.is_err());
    if let Err(AppError::InvalidConfig(msg)) = invalid_res {
        assert!(msg.contains("Unsupported diagnostics action"));
    } else {
        panic!("Expected AppError::InvalidConfig for invalid action");
    }
}

// ===========================================================================
// Verification Test 2: Packages Module Subprocess Failure & Empty Inputs
// ===========================================================================

#[test]
fn verify_packages_failing_subprocesses_and_validation() {
    let dry_runner = DryRunRunner::new();

    // 1. winget_install dry run vs failure vs spawn error
    let summary = packages::winget_install(None, &dry_runner, "Git.Git", true).unwrap();
    assert!(summary.success);

    let failing_runner = FailingSubprocessRunner {
        exit_code: 1603,
        stderr: "Fatal error during installation".to_string(),
    };
    let failing_summary = packages::winget_install(None, &failing_runner, "Git.Git", false).unwrap();
    assert!(!failing_summary.success);
    assert_eq!(failing_summary.executed_actions[0].output.exit_code, 1603);

    let spawn_err_runner = SpawnErrorRunner {
        error_msg: "winget executable not found".to_string(),
    };
    let err_res = packages::winget_install(None, &spawn_err_runner, "Git.Git", false);
    assert!(err_res.is_err());
    if let Err(AppError::Execution(msg)) = err_res {
        assert!(msg.contains("winget executable not found"));
    }

    let empty_res = packages::winget_install(None, &dry_runner, "   ", true);
    assert!(empty_res.is_err());
    if let Err(AppError::InvalidConfig(msg)) = empty_res {
        assert!(msg.contains("Package ID cannot be empty"));
    }

    // 2. winget_update validation & failure
    let failing_summary_upd = packages::winget_update(None, &failing_runner, "7zip.7zip", false).unwrap();
    assert!(!failing_summary_upd.success);

    let empty_upd_res = packages::winget_update(None, &dry_runner, "", true);
    assert!(empty_upd_res.is_err());

    // 3. remove_uwp_app validation & failure
    let failing_uwp_summary = packages::remove_uwp_app(None, &failing_runner, "Microsoft.YourPhone_1.0_x64__8wekyb3d8bbwe", false).unwrap();
    assert!(!failing_uwp_summary.success);

    let empty_uwp_res = packages::remove_uwp_app(None, &dry_runner, "   ", true);
    assert!(empty_uwp_res.is_err());
}

// ===========================================================================
// Verification Test 3: Profiles Module Preset Application & Step Increments
// ===========================================================================

#[test]
fn verify_profiles_step_indexes_and_failing_subprocess() {
    let dry_runner = DryRunRunner::new();

    // 1. Gaming profile: 6 steps
    let gaming_summary = profiles::apply_optimization_profile(None, &dry_runner, "gaming", true).unwrap();
    assert!(gaming_summary.success);
    assert_eq!(gaming_summary.executed_actions.len(), 6);

    // 2. Privacy profile: 7 steps
    let privacy_summary = profiles::apply_optimization_profile(None, &dry_runner, "privacy", true).unwrap();
    assert!(privacy_summary.success);
    assert_eq!(privacy_summary.executed_actions.len(), 7);

    // 3. Work profile: 6 steps
    let work_summary = profiles::apply_optimization_profile(None, &dry_runner, "work", true).unwrap();
    assert!(work_summary.success);
    assert_eq!(work_summary.executed_actions.len(), 6);

    // 4. Failing subprocess in profile execution
    let failing_runner = FailingSubprocessRunner {
        exit_code: 5,
        stderr: "Access denied writing registry key".to_string(),
    };
    let failing_summary = profiles::apply_optimization_profile(None, &failing_runner, "gaming", false).unwrap();
    assert!(!failing_summary.success);
    assert_eq!(failing_summary.executed_actions.len(), 6);
    for action in failing_summary.executed_actions {
        assert_ne!(action.output.exit_code, 0);
    }

    // 5. Invalid profile ID returns AppError::InvalidConfig
    let invalid_res = profiles::apply_optimization_profile(None, &dry_runner, "invalid_profile", true);
    assert!(invalid_res.is_err());
    if let Err(AppError::InvalidConfig(msg)) = invalid_res {
        assert!(msg.contains("Optimization profile 'invalid_profile' not found"));
    }
}

// ===========================================================================
// Verification Test 4: DNS & Context Menu Module Errors & Failures
// ===========================================================================

#[test]
fn verify_dns_context_failing_subprocesses_and_invalid_providers() {
    let dry_runner = DryRunRunner::new();

    // 1. set_dns_server valid vs invalid provider
    let adguard_summary = dns_context::set_dns_server(None, &dry_runner, "adguard", None, true).unwrap();
    assert!(adguard_summary.success);

    let invalid_dns_res = dns_context::set_dns_server(None, &dry_runner, "unknown_dns", None, true);
    assert!(invalid_dns_res.is_err());
    if let Err(AppError::InvalidConfig(msg)) = invalid_dns_res {
        assert!(msg.contains("Unsupported DNS provider"));
    }

    // 2. set_dns_server failing subprocess
    let failing_runner = FailingSubprocessRunner {
        exit_code: 1,
        stderr: "Network interface not found".to_string(),
    };
    let failing_dns_summary = dns_context::set_dns_server(None, &failing_runner, "cloudflare", Some("Ethernet"), false).unwrap();
    assert!(!failing_dns_summary.success);

    // 3. toggle_classic_context_menu failing subprocess
    let failing_toggle_summary = dns_context::toggle_classic_context_menu(None, &failing_runner, true, false).unwrap();
    assert!(!failing_toggle_summary.success);
}

// ===========================================================================
// Verification Test 5: Driver Backup Module Errors & Validation
// ===========================================================================

#[test]
fn verify_driver_backup_failing_subprocesses_and_validation() {
    let dry_runner = DryRunRunner::new();

    // 1. backup_drivers valid dry run
    let summary = driver_backup::backup_drivers(None, &dry_runner, "C:\\DriverBackupTest", true).unwrap();
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 1);

    // 2. backup_drivers empty directory validation
    let empty_res = driver_backup::backup_drivers(None, &dry_runner, "   ", true);
    assert!(empty_res.is_err());
    if let Err(AppError::InvalidConfig(msg)) = empty_res {
        assert!(msg.contains("Output directory path cannot be empty"));
    }

    // 3. backup_drivers failing subprocess
    let failing_runner = FailingSubprocessRunner {
        exit_code: 2,
        stderr: "Export-WindowsDriver: Parameter -Destination path invalid".to_string(),
    };
    let failing_summary = driver_backup::backup_drivers(None, &failing_runner, "Z:\\NonExistent", false).unwrap();
    assert!(!failing_summary.success);
    assert_eq!(failing_summary.executed_actions[0].output.exit_code, 2);

    // 4. backup_drivers spawn error
    let spawn_err_runner = SpawnErrorRunner {
        error_msg: "Failed to spawn powershell process".to_string(),
    };
    let err_res = driver_backup::backup_drivers(None, &spawn_err_runner, "C:\\Backup", false);
    assert!(err_res.is_err());
    if let Err(AppError::Execution(msg)) = err_res {
        assert!(msg.contains("Failed to spawn powershell process"));
    }
}

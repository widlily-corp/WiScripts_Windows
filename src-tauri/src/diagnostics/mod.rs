use crate::error::AppError;
use crate::optimization::TaskProgressPayload;
use crate::runner::{CommandRunner, ExecutedAction, ExecutionSummary};
use tauri::Emitter;

struct DiagnosticStep {
    id: String,
    title: String,
    command: String,
}

/// Executes Windows system diagnostics and repair tools (SFC, DISM, TCP/IP Reset).
pub fn run_diagnostics(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    action: &str,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    log::info!(
        "[DiagnosticsEngine] Starting diagnostics run: action='{}', dry_run={}",
        action,
        dry_run || runner.is_dry_run()
    );

    let steps: Vec<DiagnosticStep> = match action.to_lowercase().as_str() {
        "sfc_scannow" | "sfc" => vec![DiagnosticStep {
            id: "sfc_scannow".to_string(),
            title: "System File Checker (sfc /scannow)".to_string(),
            command: "sfc /scannow".to_string(),
        }],
        "dism_restorehealth" | "dism_restore_health" | "dism" => vec![DiagnosticStep {
            id: "dism_restorehealth".to_string(),
            title: "DISM Image Cleanup & RestoreHealth".to_string(),
            command: "DISM.exe /Online /Cleanup-Image /RestoreHealth".to_string(),
        }],
        "reset_tcpip" | "network_reset" | "network" | "tcpip" => vec![DiagnosticStep {
            id: "reset_tcpip".to_string(),
            title: "Reset TCP/IP Network Stack".to_string(),
            command: "netsh int ip reset; netsh winsock reset".to_string(),
        }],
        "all" => vec![
            DiagnosticStep {
                id: "sfc_scannow".to_string(),
                title: "System File Checker (sfc /scannow)".to_string(),
                command: "sfc /scannow".to_string(),
            },
            DiagnosticStep {
                id: "dism_restorehealth".to_string(),
                title: "DISM Image Cleanup & RestoreHealth".to_string(),
                command: "DISM.exe /Online /Cleanup-Image /RestoreHealth".to_string(),
            },
            DiagnosticStep {
                id: "reset_tcpip".to_string(),
                title: "Reset TCP/IP Network Stack".to_string(),
                command: "netsh int ip reset; netsh winsock reset".to_string(),
            },
        ],
        unsupported => {
            let err_msg = format!("Unsupported diagnostics action: {}", unsupported);
            log::error!("[DiagnosticsEngine] {}", err_msg);
            return Err(AppError::InvalidConfig(err_msg));
        }
    };

    let total_steps = steps.len();
    let mut executed_actions = Vec::new();
    let mut overall_success = true;

    for (idx, step) in steps.into_iter().enumerate() {
        let current_step = idx + 1;
        log::info!(
            "[DiagnosticsEngine] Executing step {}/{}: {}",
            current_step,
            total_steps,
            step.title
        );

        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step,
                total_steps,
                message: format!(
                    "Executing step {}/{}: {}",
                    current_step, total_steps, step.title
                ),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }

        let output = match runner.run_powershell(&step.command) {
            Ok(out) => out,
            Err(e) => {
                log::error!(
                    "[DiagnosticsEngine] Step {}/'{}' failed to run: {}",
                    current_step,
                    step.id,
                    e
                );
                if let Some(app_handle) = app {
                    let payload = TaskProgressPayload {
                        current_step,
                        total_steps,
                        message: format!(
                            "Failed step {}/{}: {}: {}",
                            current_step, total_steps, step.title, e
                        ),
                        is_error: true,
                    };
                    let _ = app_handle.emit("task-progress", &payload);
                }
                return Err(AppError::Execution(e));
            }
        };

        let is_step_success = output.exit_code == 0;
        if is_step_success {
            log::info!(
                "[DiagnosticsEngine] Step {}/'{}' completed successfully",
                current_step,
                step.id
            );
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step,
                    total_steps,
                    message: format!(
                        "Completed step {}/{}: {}",
                        current_step, total_steps, step.title
                    ),
                    is_error: false,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
        } else {
            overall_success = false;
            log::warn!(
                "[DiagnosticsEngine] Step {}/'{}' returned non-zero exit code: {}",
                current_step,
                step.id,
                output.exit_code
            );
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step,
                    total_steps,
                    message: format!(
                        "Error in step {}/{}: {} (exit code {})",
                        current_step, total_steps, step.title, output.exit_code
                    ),
                    is_error: true,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
        }

        executed_actions.push(ExecutedAction {
            id: step.id,
            name: step.title,
            command: step.command,
            output,
            skipped: false,
        });
    }

    let elapsed_ms = start_time.elapsed().as_millis() as u64;
    log::info!(
        "[DiagnosticsEngine] Diagnostics execution finished: success={}, total_duration={}ms",
        overall_success,
        elapsed_ms
    );

    Ok(ExecutionSummary {
        success: overall_success,
        executed_actions,
        total_duration_ms: elapsed_ms,
        is_dry_run: runner.is_dry_run() || dry_run,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_run_diagnostics_sfc_dry_run() {
        let runner = DryRunRunner::new();
        let summary = run_diagnostics(None, &runner, "sfc_scannow", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert_eq!(summary.executed_actions[0].id, "sfc_scannow");
        assert_eq!(summary.executed_actions[0].command, "sfc /scannow");
    }

    #[test]
    fn test_run_diagnostics_dism_dry_run() {
        let runner = DryRunRunner::new();
        let summary = run_diagnostics(None, &runner, "dism_restorehealth", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert_eq!(summary.executed_actions[0].id, "dism_restorehealth");
        assert!(summary.executed_actions[0]
            .command
            .contains("RestoreHealth"));
    }

    #[test]
    fn test_run_diagnostics_reset_tcpip_dry_run() {
        let runner = DryRunRunner::new();
        let summary = run_diagnostics(None, &runner, "reset_tcpip", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert_eq!(summary.executed_actions[0].id, "reset_tcpip");
        assert!(summary.executed_actions[0]
            .command
            .contains("netsh int ip reset"));
    }

    #[test]
    fn test_run_diagnostics_all_dry_run() {
        let runner = DryRunRunner::new();
        let summary = run_diagnostics(None, &runner, "all", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 3);
    }

    #[test]
    fn test_run_diagnostics_invalid_action() {
        let runner = DryRunRunner::new();
        let res = run_diagnostics(None, &runner, "unknown_action", true);

        assert!(res.is_err());
        if let Err(AppError::InvalidConfig(msg)) = res {
            assert!(msg.contains("Unsupported diagnostics action"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }

    #[test]
    fn test_run_diagnostics_action_aliases() {
        let runner = DryRunRunner::new();

        for dism_alias in &["dism_restorehealth", "dism_restore_health", "dism"] {
            let summary = run_diagnostics(None, &runner, dism_alias, true).unwrap();
            assert_eq!(summary.executed_actions[0].id, "dism_restorehealth");
        }

        for net_alias in &["reset_tcpip", "network_reset", "network", "tcpip"] {
            let summary = run_diagnostics(None, &runner, net_alias, true).unwrap();
            assert_eq!(summary.executed_actions[0].id, "reset_tcpip");
        }
    }
}

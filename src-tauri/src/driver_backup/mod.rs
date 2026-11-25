use crate::error::AppError;
use crate::odt::escape_powershell_literal;
use crate::optimization::TaskProgressPayload;
use crate::runner::{CommandRunner, ExecutedAction, ExecutionSummary};
use std::path::{Component, Path};
use tauri::Emitter;

/// Validates and normalizes the target directory for driver backups, rejecting injection and traversal attempts.
pub fn validate_driver_backup_dir(output_dir: &str) -> Result<String, AppError> {
    let clean_dir = output_dir.trim();
    if clean_dir.is_empty() {
        return Err(AppError::InvalidConfig(
            "Output directory path cannot be empty".to_string(),
        ));
    }

    if clean_dir.chars().any(|c| {
        c.is_control()
            || matches!(
                c,
                ';' | '|' | '&' | '$' | '`' | '"' | '\'' | '<' | '>' | '^'
            )
    }) {
        return Err(AppError::InvalidConfig(
            "Output directory path contains forbidden control or shell metacharacters".to_string(),
        ));
    }

    let path = Path::new(clean_dir);
    if clean_dir.contains("..")
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(AppError::InvalidConfig(
            "Output directory path cannot contain parent traversal ('..')".to_string(),
        ));
    }

    // Verify existing root/ancestor path can be resolved cleanly when present on disk.
    let mut ancestor = Some(path);
    while let Some(curr) = ancestor {
        if curr.exists() {
            curr.canonicalize().map_err(|e| {
                AppError::InvalidConfig(format!(
                    "Failed to canonicalize output directory ancestor '{}': {}",
                    curr.display(),
                    e
                ))
            })?;
            break;
        }
        ancestor = curr.parent();
    }

    Ok(clean_dir.to_string())
}

/// Backs up active third-party Windows device drivers to a target destination folder using Export-WindowsDriver.
pub fn backup_drivers(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    output_dir: &str,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    let clean_dir = match validate_driver_backup_dir(output_dir) {
        Ok(dir) => dir,
        Err(err) => {
            log::error!("[DriverBackupEngine] {}", err);
            return Err(err);
        }
    };

    log::info!(
        "[DriverBackupEngine] Exporting Windows drivers to destination: '{}' (dry_run={})",
        clean_dir,
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: format!("Exporting Windows drivers to: {}", clean_dir),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let escaped_dir = escape_powershell_literal(&clean_dir);
    let command = format!(
        "if (-not (Test-Path -LiteralPath {dir})) {{ New-Item -ItemType Directory -Path {dir} -Force | Out-Null }}; Export-WindowsDriver -Online -Destination {dir}",
        dir = escaped_dir
    );

    let output = runner
        .run_powershell(&command)
        .map_err(AppError::Execution)?;
    let is_success = output.exit_code == 0;

    if is_success {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Successfully exported drivers to: {}", clean_dir),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!(
                    "Failed to export drivers to: {} (exit code {})",
                    clean_dir, output.exit_code
                ),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: "export_windows_driver".to_string(),
        name: format!("Export Windows Drivers to {}", clean_dir),
        command,
        output,
        skipped: false,
    };

    Ok(ExecutionSummary {
        success: is_success,
        executed_actions: vec![action],
        total_duration_ms: start_time.elapsed().as_millis() as u64,
        is_dry_run: runner.is_dry_run() || dry_run,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_backup_drivers_dry_run() {
        let runner = DryRunRunner::new();
        let summary = backup_drivers(None, &runner, "C:\\DriverBackup", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0]
            .command
            .contains("Export-WindowsDriver"));
        assert!(summary.executed_actions[0]
            .command
            .contains("C:\\DriverBackup"));
    }

    #[test]
    fn test_backup_drivers_empty_dir() {
        let runner = DryRunRunner::new();
        let res = backup_drivers(None, &runner, "   ", true);

        assert!(res.is_err());
        if let Err(AppError::InvalidConfig(msg)) = res {
            assert!(msg.contains("Output directory path cannot be empty"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }

    #[test]
    fn test_backup_drivers_rejects_injection_and_traversal() {
        let runner = DryRunRunner::new();
        assert!(backup_drivers(None, &runner, "C:\\Backup\"; calc.exe #", true).is_err());
        assert!(backup_drivers(None, &runner, "C:\\Backup; calc.exe", true).is_err());
        assert!(backup_drivers(None, &runner, "C:\\Backup\ncalc.exe", true).is_err());
        assert!(backup_drivers(None, &runner, "C:\\Backup\\..\\Windows", true).is_err());
        assert!(backup_drivers(None, &runner, "C:\\$(calc.exe)", true).is_err());
    }
}

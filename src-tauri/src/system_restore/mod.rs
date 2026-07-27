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

/// Creates a new Windows System Restore Point using PowerShell Checkpoint-Computer.
pub fn create_restore_point(
    runner: &dyn CommandRunner,
    description: &str,
) -> Result<ExecutedAction, String> {
    log::info!(
        "[SystemRestore] Creating restore point with description: '{}' (dry_run={})",
        description,
        runner.is_dry_run()
    );

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

    log::info!("[SystemRestore] Restore point created successfully");

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::{CommandOutput, DryRunRunner};

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
        assert!(action.command.contains("'Pre-Optimization Snapshot'"));
        assert_eq!(action.output.exit_code, 0);

        let history = runner.get_history();
        assert_eq!(history.len(), 1);
        assert!(history[0].command.contains("Checkpoint-Computer"));
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
            stderr: "A new restore point cannot be created because one has already been created within the last 24 hours.".to_string(),
        };

        // Act
        let result = create_restore_point(&runner, "Test Point");

        // Assert
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Failed to create restore point"));
        assert!(err.contains("24 hours"));
    }
}

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Arc, Mutex};

/// Represents raw output of a executed process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Details of an individual action executed during optimization or script run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutedAction {
    pub id: String,
    pub name: String,
    pub command: String,
    pub output: CommandOutput,
    pub skipped: bool,
}

/// Summary returned to caller after executing a batch of actions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionSummary {
    pub success: bool,
    pub executed_actions: Vec<ExecutedAction>,
    pub total_duration_ms: u64,
    pub is_dry_run: bool,
}

/// Abstract command execution trait enabling host safety and test isolation (R4 compliance).
pub trait CommandRunner: Send + Sync {
    /// Execute a PowerShell script block.
    fn run_powershell(&self, script: &str) -> Result<CommandOutput, String>;

    /// Execute a raw CMD command string.
    fn run_cmd(&self, command: &str) -> Result<CommandOutput, String>;

    /// Returns whether this runner operates in safe dry-run mode.
    fn is_dry_run(&self) -> bool;
}

/// Production runner using std::process::Command to execute real PowerShell / CMD operations.
#[derive(Debug, Default, Clone)]
pub struct RealRunner;

impl RealRunner {
    pub fn new() -> Self {
        Self
    }
}

impl CommandRunner for RealRunner {
    fn run_powershell(&self, script: &str) -> Result<CommandOutput, String> {
        log::info!("[RealRunner] Executing PowerShell command: {}", script);

        let mut cmd = Command::new("powershell.exe");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let output = cmd
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ])
            .output()
            .map_err(|e| {
                let err_msg = format!("Failed to spawn powershell process: {}", e);
                log::error!("[RealRunner] {}", err_msg);
                err_msg
            })?;

        let exit_code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            log::info!(
                "[RealRunner] PowerShell command completed successfully (exit code: {}). stdout: {}",
                exit_code,
                stdout.trim()
            );
        } else {
            log::warn!(
                "[RealRunner] PowerShell command failed (exit code: {}). stderr: {}, stdout: {}",
                exit_code,
                stderr.trim(),
                stdout.trim()
            );
        }

        Ok(CommandOutput {
            exit_code,
            stdout,
            stderr,
        })
    }

    fn run_cmd(&self, command: &str) -> Result<CommandOutput, String> {
        log::info!("[RealRunner] Executing CMD command: {}", command);

        let mut cmd = Command::new("cmd.exe");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let output = cmd
            .args(["/C", command])
            .output()
            .map_err(|e| {
                let err_msg = format!("Failed to spawn cmd process: {}", e);
                log::error!("[RealRunner] {}", err_msg);
                err_msg
            })?;

        let exit_code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            log::info!(
                "[RealRunner] CMD command completed successfully (exit code: {}). stdout: {}",
                exit_code,
                stdout.trim()
            );
        } else {
            log::warn!(
                "[RealRunner] CMD command failed (exit code: {}). stderr: {}, stdout: {}",
                exit_code,
                stderr.trim(),
                stdout.trim()
            );
        }

        Ok(CommandOutput {
            exit_code,
            stdout,
            stderr,
        })
    }

    fn is_dry_run(&self) -> bool {
        false
    }
}

/// Single recorded command entry in DryRunRunner history.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecordedCommand {
    pub runner_type: String, // "powershell" or "cmd"
    pub command: String,
}

/// Dry-run mock runner recording all executed commands in-memory for zero host modification during testing/preview.
#[derive(Debug, Clone, Default)]
pub struct DryRunRunner {
    history: Arc<Mutex<Vec<RecordedCommand>>>,
}

impl DryRunRunner {
    pub fn new() -> Self {
        Self {
            history: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn get_history(&self) -> Vec<RecordedCommand> {
        self.history.lock().unwrap().clone()
    }

    pub fn clear_history(&self) {
        self.history.lock().unwrap().clear();
    }
}

impl CommandRunner for DryRunRunner {
    fn run_powershell(&self, script: &str) -> Result<CommandOutput, String> {
        log::info!("[DryRunRunner] [DRY-RUN] Simulated PowerShell command: {}", script);

        self.history.lock().unwrap().push(RecordedCommand {
            runner_type: "powershell".to_string(),
            command: script.to_string(),
        });
        let stdout = format!("[DRY-RUN] Simulated PowerShell execution: {}", script);
        log::debug!("[DryRunRunner] [DRY-RUN] stdout: {}", stdout);

        Ok(CommandOutput {
            exit_code: 0,
            stdout,
            stderr: String::new(),
        })
    }

    fn run_cmd(&self, command: &str) -> Result<CommandOutput, String> {
        log::info!("[DryRunRunner] [DRY-RUN] Simulated CMD command: {}", command);

        self.history.lock().unwrap().push(RecordedCommand {
            runner_type: "cmd".to_string(),
            command: command.to_string(),
        });
        let stdout = format!("[DRY-RUN] Simulated CMD execution: {}", command);
        log::debug!("[DryRunRunner] [DRY-RUN] stdout: {}", stdout);

        Ok(CommandOutput {
            exit_code: 0,
            stdout,
            stderr: String::new(),
        })
    }

    fn is_dry_run(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dry_run_runner_records_powershell_and_cmd() {
        // Arrange
        let runner = DryRunRunner::new();

        // Act
        let ps_res = runner.run_powershell("Stop-Service -Name DiagTrack").unwrap();
        let cmd_res = runner.run_cmd("echo Hello").unwrap();

        // Assert
        assert!(runner.is_dry_run());
        assert_eq!(ps_res.exit_code, 0);
        assert!(ps_res.stdout.contains("Simulated PowerShell execution"));
        assert_eq!(cmd_res.exit_code, 0);
        assert!(cmd_res.stdout.contains("Simulated CMD execution"));

        let history = runner.get_history();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].runner_type, "powershell");
        assert_eq!(history[0].command, "Stop-Service -Name DiagTrack");
        assert_eq!(history[1].runner_type, "cmd");
        assert_eq!(history[1].command, "echo Hello");
    }

    #[test]
    fn test_execution_summary_camel_case_serialization() {
        // Arrange
        let summary = ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: "test_action".to_string(),
                name: "Test Action".to_string(),
                command: "Get-Process".to_string(),
                output: CommandOutput {
                    exit_code: 0,
                    stdout: "Output".to_string(),
                    stderr: "".to_string(),
                },
                skipped: false,
            }],
            total_duration_ms: 150,
            is_dry_run: true,
        };

        // Act
        let json_value = serde_json::to_value(&summary).expect("Serialization failed");

        // Assert
        assert!(json_value.get("executedActions").is_some(), "Key 'executedActions' missing in JSON");
        assert!(json_value.get("totalDurationMs").is_some(), "Key 'totalDurationMs' missing in JSON");
        assert!(json_value.get("isDryRun").is_some(), "Key 'isDryRun' missing in JSON");
        assert!(json_value.get("success").is_some(), "Key 'success' missing in JSON");

        let action_obj = &json_value["executedActions"][0];
        assert!(action_obj.get("id").is_some());
        assert!(action_obj.get("name").is_some());
        assert!(action_obj.get("command").is_some());
        assert!(action_obj.get("skipped").is_some());

        let output_obj = &action_obj["output"];
        assert!(output_obj.get("exitCode").is_some(), "Key 'exitCode' missing in JSON");
        assert!(output_obj.get("stdout").is_some());
        assert!(output_obj.get("stderr").is_some());

        // Also test round-trip deserialization
        let deserialized: ExecutionSummary = serde_json::from_value(json_value).expect("Deserialization failed");
        assert_eq!(summary, deserialized);
    }
}

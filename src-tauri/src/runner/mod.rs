use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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

fn run_command_with_timeout(mut cmd: Command, timeout_secs: u64) -> Result<CommandOutput, String> {
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture child stdout".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture child stderr".to_string())?;

    let stdout_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::copy(&mut stdout_pipe, &mut buf);
        buf
    });

    let stderr_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::copy(&mut stderr_pipe, &mut buf);
        buf
    });

    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let exit_code = status.code().unwrap_or(-1);
                let stdout_bytes = stdout_handle.join().unwrap_or_default();
                let stderr_bytes = stderr_handle.join().unwrap_or_default();
                let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
                let stderr = String::from_utf8_lossy(&stderr_bytes).to_string();

                return Ok(CommandOutput {
                    exit_code,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_handle.join();
                    let _ = stderr_handle.join();
                    return Err(format!("Process execution timed out after {} seconds", timeout_secs));
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err(format!("Error checking process status: {}", e));
            }
        }
    }
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

        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ]);

        let res = run_command_with_timeout(cmd, 300); // 5 minutes timeout
        match &res {
            Ok(out) => {
                if out.exit_code == 0 {
                    log::info!(
                        "[RealRunner] PowerShell command completed successfully (exit code: 0). stdout: {}",
                        out.stdout.trim()
                    );
                } else {
                    log::warn!(
                        "[RealRunner] PowerShell command failed (exit code: {}). stderr: {}, stdout: {}",
                        out.exit_code,
                        out.stderr.trim(),
                        out.stdout.trim()
                    );
                }
            }
            Err(err) => {
                log::error!("[RealRunner] {}", err);
            }
        }

        res
    }

    fn run_cmd(&self, command: &str) -> Result<CommandOutput, String> {
        log::info!("[RealRunner] Executing CMD command: {}", command);

        let mut cmd = Command::new("cmd.exe");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        cmd.args(["/C", command]);

        let res = run_command_with_timeout(cmd, 300); // 5 minutes timeout
        match &res {
            Ok(out) => {
                if out.exit_code == 0 {
                    log::info!(
                        "[RealRunner] CMD command completed successfully (exit code: 0). stdout: {}",
                        out.stdout.trim()
                    );
                } else {
                    log::warn!(
                        "[RealRunner] CMD command failed (exit code: {}). stderr: {}, stdout: {}",
                        out.exit_code,
                        out.stderr.trim(),
                        out.stdout.trim()
                    );
                }
            }
            Err(err) => {
                log::error!("[RealRunner] {}", err);
            }
        }

        res
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

    #[test]
    #[cfg(target_os = "windows")]
    fn test_run_command_with_large_output_no_deadlock() {
        let runner = RealRunner::new();
        // Generate > 64 KB of output in PowerShell (2000 lines of ~50 chars = ~100 KB)
        let script = "1..2000 | ForEach-Object { 'Line ' + $_ + ' with padding data to exceed 64KB pipe buffer' }";
        let res = runner.run_powershell(script).expect("PowerShell large output execution failed");
        assert_eq!(res.exit_code, 0);
        assert!(res.stdout.len() > 65536, "Expected stdout length > 64KB, got {}", res.stdout.len());
        assert!(res.stdout.contains("Line 2000"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_run_command_simultaneous_large_stdout_and_stderr() {
        let runner = RealRunner::new();
        // Generate ~150KB on stdout AND ~150KB on stderr simultaneously in PowerShell
        let script = r#"
            1..3000 | ForEach-Object {
                [Console]::Out.WriteLine("STDOUT line " + $_ + " with buffer fill text 0123456789ABCDEF")
                [Console]::Error.WriteLine("STDERR line " + $_ + " with buffer fill text 0123456789ABCDEF")
            }
        "#;
        let res = runner.run_powershell(script).expect("Simultaneous large stdout/stderr execution failed");
        assert_eq!(res.exit_code, 0);
        assert!(res.stdout.len() > 100000, "Expected stdout > 100KB, got {}", res.stdout.len());
        assert!(res.stderr.len() > 100000, "Expected stderr > 100KB, got {}", res.stderr.len());
        assert!(res.stdout.contains("STDOUT line 3000"));
        assert!(res.stderr.contains("STDERR line 3000"));
    }
}


use crate::error::AppError;
use crate::optimization::TaskProgressPayload;
use crate::runner::{CommandRunner, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ActivationMethod {
    #[serde(alias = "HWID", alias = "hwid", alias = "Hwid")]
    Hwid,
    #[serde(alias = "Ohook", alias = "ohook", alias = "OHOOK")]
    Ohook,
    #[serde(alias = "KMS38", alias = "kms38", alias = "Kms38")]
    Kms38,
    #[serde(
        alias = "TSforge",
        alias = "tsForge",
        alias = "tsforge",
        alias = "TsForge"
    )]
    TsForge,
}

impl std::fmt::Display for ActivationMethod {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActivationMethod::Hwid => write!(f, "HWID"),
            ActivationMethod::Ohook => write!(f, "Ohook"),
            ActivationMethod::Kms38 => write!(f, "KMS38"),
            ActivationMethod::TsForge => write!(f, "TSforge"),
        }
    }
}

pub const MAS_SCRIPT_URL: &str = "https://get.activated.win";
const ALLOWED_MAS_HOSTS: &[&str] = &["get.activated.win"];

/// Validates that a remote MAS endpoint URL uses strict HTTPS and matches an allowed host.
pub fn validate_mas_endpoint(url: &str) -> Result<(), AppError> {
    let trimmed = url.trim();
    let rest = trimmed.strip_prefix("https://").ok_or_else(|| {
        AppError::InvalidConfig(format!(
            "MAS endpoint '{}' must use HTTPS",
            url
        ))
    })?;
    let host_part = rest.split('/').next().unwrap_or("");
    if host_part.contains('@') || host_part.contains(':') || host_part.is_empty() {
        return Err(AppError::InvalidConfig(format!(
            "MAS endpoint '{}' contains invalid authority/userinfo/port",
            url
        )));
    }
    if !ALLOWED_MAS_HOSTS
        .iter()
        .any(|allowed| host_part.eq_ignore_ascii_case(allowed))
    {
        return Err(AppError::InvalidConfig(format!(
            "MAS endpoint host '{}' is not in the allowed host list",
            host_part
        )));
    }
    Ok(())
}

pub fn get_activation_script_command(method: &ActivationMethod) -> String {
    let arg = match method {
        ActivationMethod::Hwid => "/HWID",
        ActivationMethod::Ohook => "/Ohook",
        ActivationMethod::Kms38 => "/KMS38",
        ActivationMethod::TsForge => "/TSforge",
    };
    format!(
        "$ProgressPreference = 'SilentlyContinue'; $ErrorActionPreference = 'Stop'; \
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; \
        $uri = [Uri]'{url}'; \
        if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'get.activated.win') {{ throw \"Blocked untrusted MAS host: $($uri.OriginalString)\" }}; \
        try {{ \
            $cmd = Invoke-RestMethod -Uri $uri.AbsoluteUri -TimeoutSec 20 -ErrorAction Stop; \
            if ([string]::IsNullOrWhiteSpace($cmd)) {{ throw 'Empty activation script returned by remote endpoint' }}; \
            & ([scriptblock]::Create($cmd)) {arg} -Confirm:$false; \
            if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {{ exit $LASTEXITCODE }}; \
        }} catch {{ \
            Write-Error \"MAS activation failed: $($_.Exception.Message)\"; \
            exit 1; \
        }}",
        url = MAS_SCRIPT_URL,
        arg = arg
    )
}

/// Executes Microsoft Activation Scripts (MAS) activation for the requested method.
pub fn execute_activation(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    method: ActivationMethod,
    dry_run: bool,
) -> Result<ExecutionSummary, String> {
    let start_time = std::time::Instant::now();
    log::info!(
        "[MASEngine] Starting MAS activation execution (method={}, dry_run={})",
        method,
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: format!("Executing step 1/1: Microsoft Activation ({})", method),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let command = get_activation_script_command(&method);

    let output = match runner.run_powershell(&command) {
        Ok(out) => out,
        Err(e) => {
            let err_msg = format!("Activation execution failed: {}", e);
            log::error!("[MASEngine] {}", err_msg);
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step: 1,
                    total_steps: 1,
                    message: format!(
                        "Error in step 1/1: Microsoft Activation ({}): {}",
                        method, e
                    ),
                    is_error: true,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
            return Err(err_msg);
        }
    };

    let is_success = output.exit_code == 0;
    if is_success {
        log::info!("[MASEngine] MAS activation completed successfully (exit_code=0)");
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Completed step 1/1: Microsoft Activation ({})", method),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        log::warn!(
            "[MASEngine] MAS activation returned exit code {}",
            output.exit_code
        );
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!(
                    "Error in step 1/1: Microsoft Activation ({}) (exit code {})",
                    method, output.exit_code
                ),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: format!("activation_{}", method.to_string().to_lowercase()),
        name: format!("Microsoft Activation ({})", method),
        command,
        output: output.clone(),
        skipped: false,
    };

    Ok(ExecutionSummary {
        success: is_success,
        executed_actions: vec![action],
        total_duration_ms: start_time.elapsed().as_millis() as u64,
        is_dry_run: runner.is_dry_run() || dry_run,
    })
}

/// Legacy / convenience helper matching previous signature.
pub fn execute(
    runner: &dyn CommandRunner,
    method: ActivationMethod,
) -> Result<ExecutionSummary, AppError> {
    execute_activation(None, runner, method, runner.is_dry_run()).map_err(AppError::Execution)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_activation_script_commands() {
        // Arrange & Act
        let hwid_cmd = get_activation_script_command(&ActivationMethod::Hwid);
        let ohook_cmd = get_activation_script_command(&ActivationMethod::Ohook);
        let kms38_cmd = get_activation_script_command(&ActivationMethod::Kms38);
        let tsforge_cmd = get_activation_script_command(&ActivationMethod::TsForge);

        // Assert
        assert!(hwid_cmd.contains("/HWID"));
        assert!(ohook_cmd.contains("/Ohook"));
        assert!(kms38_cmd.contains("/KMS38"));
        assert!(tsforge_cmd.contains("/TSforge"));

        // Verify non-interactive and auto-confirm flags (R2 compliance)
        assert!(hwid_cmd.contains("$ProgressPreference = 'SilentlyContinue'"));
        assert!(hwid_cmd.contains("$ErrorActionPreference = 'Stop'"));
        assert!(hwid_cmd.contains("-Confirm:$false"));
    }

    #[test]
    fn test_execute_activation_dry_run_hwid() {
        let runner = DryRunRunner::new();
        let summary = execute_activation(None, &runner, ActivationMethod::Hwid, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        let history = runner.get_history();
        assert_eq!(history.len(), 1);
        assert!(history[0].command.contains("/HWID"));
    }

    #[test]
    fn test_execute_activation_dry_run_ohook() {
        let runner = DryRunRunner::new();
        let summary = execute_activation(None, &runner, ActivationMethod::Ohook, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        let history = runner.get_history();
        assert!(history[0].command.contains("/Ohook"));
    }

    #[test]
    fn test_execute_activation_dry_run_kms38() {
        let runner = DryRunRunner::new();
        let summary = execute_activation(None, &runner, ActivationMethod::Kms38, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        let history = runner.get_history();
        assert!(history[0].command.contains("/KMS38"));
    }

    struct FailingRunner {
        exit_code: i32,
    }

    impl CommandRunner for FailingRunner {
        fn run_powershell(&self, _script: &str) -> Result<crate::runner::CommandOutput, String> {
            Ok(crate::runner::CommandOutput {
                exit_code: self.exit_code,
                stdout: String::new(),
                stderr: format!("Error code {}", self.exit_code),
            })
        }

        fn run_cmd(&self, _command: &str) -> Result<crate::runner::CommandOutput, String> {
            Ok(crate::runner::CommandOutput {
                exit_code: self.exit_code,
                stdout: String::new(),
                stderr: format!("Error code {}", self.exit_code),
            })
        }

        fn is_dry_run(&self) -> bool {
            false
        }
    }

    struct ErrRunner;

    impl CommandRunner for ErrRunner {
        fn run_powershell(&self, _script: &str) -> Result<crate::runner::CommandOutput, String> {
            Err("MAS script fetch failed".to_string())
        }

        fn run_cmd(&self, _command: &str) -> Result<crate::runner::CommandOutput, String> {
            Err("MAS script fetch failed".to_string())
        }

        fn is_dry_run(&self) -> bool {
            false
        }
    }

    #[test]
    fn test_execute_activation_non_zero_exit_code() {
        let runner = FailingRunner { exit_code: 1 };
        let summary = execute_activation(None, &runner, ActivationMethod::Hwid, false).unwrap();

        assert!(
            !summary.success,
            "Activation execution summary success must be false on non-zero exit code"
        );
        assert_eq!(summary.executed_actions.len(), 1);
        assert_eq!(summary.executed_actions[0].output.exit_code, 1);
        assert!(!summary.is_dry_run);
    }

    #[test]
    fn test_execute_activation_runner_error() {
        let runner = ErrRunner;
        let res = execute_activation(None, &runner, ActivationMethod::Hwid, false);

        assert!(res.is_err(), "Runner error should propagate as Err(String)");
        assert!(res
            .unwrap_err()
            .contains("Activation execution failed: MAS script fetch failed"));
    }

    #[test]
    fn test_validate_mas_endpoint() {
        assert!(validate_mas_endpoint(MAS_SCRIPT_URL).is_ok());
        assert!(validate_mas_endpoint("http://get.activated.win").is_err());
        assert!(validate_mas_endpoint("https://evil.example.com").is_err());
        assert!(validate_mas_endpoint("https://user@get.activated.win").is_err());
    }
}

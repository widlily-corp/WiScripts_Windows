use crate::error::AppError;
use crate::optimization::TaskProgressPayload;
use crate::runner::{CommandRunner, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

fn default_display_level() -> String {
    "None".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OdtConfig {
    #[serde(alias = "Architecture")]
    pub architecture: String,

    #[serde(alias = "Channel")]
    pub channel: String,

    #[serde(alias = "Products")]
    pub products: Vec<String>,

    #[serde(
        alias = "ExcludedAppVec",
        alias = "excludedAppVec",
        alias = "excluded_app_vec"
    )]
    pub excluded_apps: Vec<String>,

    #[serde(alias = "Language")]
    pub language: String,

    #[serde(
        default = "default_display_level",
        alias = "DisplayLevel",
        alias = "displayLevel"
    )]
    pub display_level: String,

    #[serde(
        default = "default_true",
        alias = "RemoveExistingOffice",
        alias = "removeExistingOffice"
    )]
    pub remove_existing_office: bool,

    #[serde(default = "default_true", alias = "AcceptEula", alias = "acceptEula")]
    pub accept_eula: bool,
}

impl Default for OdtConfig {
    fn default() -> Self {
        Self {
            architecture: "64".to_string(),
            channel: "Current".to_string(),
            products: vec!["O365ProPlusRetail".to_string()],
            excluded_apps: Vec::new(),
            language: "en-us".to_string(),
            display_level: "None".to_string(),
            remove_existing_office: true,
            accept_eula: true,
        }
    }
}

/// Generates valid ODT XML content from configuration.
pub fn generate_odt_xml(config: &OdtConfig) -> String {
    log::debug!(
        "[ODTEngine] Generating ODT XML for arch='{}', channel='{}', products={:?}",
        config.architecture,
        config.channel,
        config.products
    );
    let mut xml = String::new();
    xml.push_str("<Configuration>\n");

    let arch = match config.architecture.as_str() {
        "64" | "x64" => "64",
        "32" | "x86" => "32",
        other => other,
    };

    xml.push_str(&format!(
        "  <Add OfficeClientEdition=\"{}\" Channel=\"{}\">\n",
        arch, config.channel
    ));

    let default_products = vec!["O365ProPlusRetail".to_string()];
    let products = if config.products.is_empty() {
        &default_products
    } else {
        &config.products
    };

    for prod in products {
        xml.push_str(&format!("    <Product ID=\"{}\">\n", prod));
        xml.push_str(&format!("      <Language ID=\"{}\" />\n", config.language));

        for app in &config.excluded_apps {
            xml.push_str(&format!("      <ExcludeApp ID=\"{}\" />\n", app));
        }

        xml.push_str("    </Product>\n");
    }

    xml.push_str("  </Add>\n");

    if config.remove_existing_office {
        xml.push_str("  <RemoveMSI />\n");
    }

    let accept_eula_str = if config.accept_eula { "TRUE" } else { "FALSE" };
    xml.push_str(&format!(
        "  <Display Level=\"{}\" AcceptEULA=\"{}\" />\n",
        config.display_level, accept_eula_str
    ));

    xml.push_str("</Configuration>");
    xml
}

/// Legacy / convenience helper returning Result<String, AppError>
pub fn generate_xml(config: &OdtConfig) -> Result<String, AppError> {
    Ok(generate_odt_xml(config))
}

/// Safely escapes a string literal for inclusion in a PowerShell single-quoted string `'...'`.
/// Single-quoted strings in PowerShell treat all characters literally except `'`,
/// which is escaped by doubling it `''`.
pub fn escape_powershell_literal(input: &str) -> String {
    format!("'{}'", input.replace('\'', "''"))
}

/// Executes ODT installation with setup.exe /configure logic using CommandRunner.
pub fn execute_odt_install(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    config: &OdtConfig,
    setup_path: Option<String>,
    dry_run: bool,
) -> Result<ExecutionSummary, String> {
    let start_time = std::time::Instant::now();
    log::info!(
        "[ODTEngine] Starting ODT install (setup_path={:?}, dry_run={})",
        setup_path,
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: "Executing step 1/1: Office ODT Installation".to_string(),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let xml_content = generate_odt_xml(config);

    let setup_exe_expr = match setup_path {
        Some(ref p) if !p.trim().is_empty() && p != "$env:TEMP\\setup.exe" => {
            escape_powershell_literal(p)
        }
        _ => "Join-Path $env:TEMP 'setup.exe'".to_string(),
    };

    let escaped_xml = escape_powershell_literal(&xml_content);

    let ps_command = format!(
        "# Executing setup.exe /configure $env:TEMP\\configuration.xml\n\
        $configPath = Join-Path $env:TEMP 'configuration.xml'; \
        $setupPath = {}; \
        if (-not (Test-Path -LiteralPath $setupPath)) {{ \
            Invoke-WebRequest -Uri 'https://config.office.com/api/odt/download' -OutFile $setupPath -UseBasicParsing \
        }}; \
        Set-Content -Path $configPath -Value {} -Encoding UTF8; \
        Start-Process -FilePath $setupPath -ArgumentList \"/configure `\"$configPath`\"\" -Wait",
        setup_exe_expr, escaped_xml
    );

    let output = match runner.run_powershell(&ps_command) {
        Ok(out) => out,
        Err(e) => {
            let err_msg = format!("ODT execution failed: {}", e);
            log::error!("[ODTEngine] {}", err_msg);
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step: 1,
                    total_steps: 1,
                    message: format!("Error in step 1/1: Office ODT Installation: {}", e),
                    is_error: true,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
            return Err(err_msg);
        }
    };

    let is_success = output.exit_code == 0;
    if is_success {
        log::info!("[ODTEngine] ODT install completed successfully (exit_code=0)");
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: "Completed step 1/1: Office ODT Installation".to_string(),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        log::warn!("[ODTEngine] ODT install returned exit code {}", output.exit_code);
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Error in step 1/1: Office ODT Installation (exit code {})", output.exit_code),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: "odt_install".to_string(),
        name: "Office ODT Installation".to_string(),
        command: ps_command,
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
pub fn execute_install(
    runner: &dyn CommandRunner,
    config: &OdtConfig,
) -> Result<ExecutionSummary, AppError> {
    execute_odt_install(None, runner, config, None, runner.is_dry_run()).map_err(AppError::Execution)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_generate_odt_xml_various_channels_and_arch() {
        let channels = vec![
            "Current",
            "MonthlyEnterprise",
            "SemiAnnual",
            "PerpetualVL2021",
        ];
        for ch in channels {
            let config = OdtConfig {
                architecture: "64".to_string(),
                channel: ch.to_string(),
                products: vec!["O365ProPlusRetail".to_string()],
                excluded_apps: Vec::new(),
                language: "en-us".to_string(),
                display_level: "None".to_string(),
                remove_existing_office: true,
                accept_eula: true,
            };
            let xml = generate_odt_xml(&config);
            assert!(xml.contains(&format!("Channel=\"{}\"", ch)));
            assert!(xml.contains("OfficeClientEdition=\"64\""));
        }

        let config_32 = OdtConfig {
            architecture: "32".to_string(),
            channel: "Current".to_string(),
            ..OdtConfig::default()
        };
        let xml_32 = generate_odt_xml(&config_32);
        assert!(xml_32.contains("OfficeClientEdition=\"32\""));
    }

    #[test]
    fn test_generate_odt_xml_multiple_products_and_excluded_apps() {
        let config = OdtConfig {
            architecture: "64".to_string(),
            channel: "MonthlyEnterprise".to_string(),
            products: vec![
                "O365ProPlusRetail".to_string(),
                "VisioProRetail".to_string(),
                "ProjectProRetail".to_string(),
            ],
            excluded_apps: vec!["Access".to_string(), "Publisher".to_string()],
            language: "en-us".to_string(),
            display_level: "Full".to_string(),
            remove_existing_office: true,
            accept_eula: true,
        };

        let xml = generate_odt_xml(&config);
        assert!(xml.contains("<Product ID=\"O365ProPlusRetail\">"));
        assert!(xml.contains("<Product ID=\"VisioProRetail\">"));
        assert!(xml.contains("<Product ID=\"ProjectProRetail\">"));
        assert!(xml.contains("<ExcludeApp ID=\"Access\" />"));
        assert!(xml.contains("<ExcludeApp ID=\"Publisher\" />"));
        assert!(xml.contains("Level=\"Full\""));
    }

    #[test]
    fn test_execute_odt_install_dry_run_contains_setup_configure() {
        let runner = DryRunRunner::new();
        let config = OdtConfig::default();

        let summary = execute_odt_install(None, &runner, &config, None, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);

        let history = runner.get_history();
        assert_eq!(history.len(), 1);
        assert!(
            history[0].command.contains("setup.exe /configure"),
            "Command history should record setup.exe /configure"
        );
    }

    #[test]
    fn test_execute_odt_install_dry_run_custom_path() {
        let runner = DryRunRunner::new();
        let config = OdtConfig::default();
        let custom_path = Some("C:\\CustomPath\\setup.exe".to_string());

        let summary = execute_odt_install(None, &runner, &config, custom_path, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);

        let history = runner.get_history();
        assert!(history[0].command.contains("C:\\CustomPath\\setup.exe"));
        assert!(history[0].command.contains("setup.exe /configure"));
    }

    #[test]
    fn test_escape_powershell_literal() {
        assert_eq!(escape_powershell_literal("C:\\Path"), "'C:\\Path'");
        assert_eq!(escape_powershell_literal("O'Connor"), "'O''Connor'");
        assert_eq!(
            escape_powershell_literal("C:\\Test\"; calc.exe #"),
            "'C:\\Test\"; calc.exe #'"
        );
        assert_eq!(
            escape_powershell_literal("$(calc.exe)"),
            "'$(calc.exe)'"
        );
    }

    #[test]
    fn test_execute_odt_install_path_escaping_with_special_characters() {
        let runner = DryRunRunner::new();
        let config = OdtConfig::default();
        let tricky_path =
            Some("C:\\Program Files (x86)\\O'Reilly & Co\\setup.exe; $(calc.exe)".to_string());

        let summary = execute_odt_install(None, &runner, &config, tricky_path, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);

        let history = runner.get_history();
        let cmd = &history[0].command;
        assert!(cmd.contains("'C:\\Program Files (x86)\\O''Reilly & Co\\setup.exe; $(calc.exe)'"));
        assert!(cmd.contains("Test-Path -LiteralPath"));
    }

    #[test]
    fn test_generate_odt_xml_empty_products_fallback() {
        let config = OdtConfig {
            products: Vec::new(),
            ..OdtConfig::default()
        };

        let xml = generate_odt_xml(&config);
        assert!(xml.contains("<Product ID=\"O365ProPlusRetail\">"));
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
            Err("ODT spawn failed".to_string())
        }

        fn run_cmd(&self, _command: &str) -> Result<crate::runner::CommandOutput, String> {
            Err("ODT spawn failed".to_string())
        }

        fn is_dry_run(&self) -> bool {
            false
        }
    }

    #[test]
    fn test_execute_odt_install_non_zero_exit_code() {
        let runner = FailingRunner { exit_code: 1603 };
        let config = OdtConfig::default();
        let summary = execute_odt_install(None, &runner, &config, None, false).unwrap();

        assert!(!summary.success, "ODT execution summary success must be false on non-zero exit code");
        assert_eq!(summary.executed_actions.len(), 1);
        assert_eq!(summary.executed_actions[0].output.exit_code, 1603);
        assert!(!summary.is_dry_run);
    }

    #[test]
    fn test_execute_odt_install_runner_error() {
        let runner = ErrRunner;
        let config = OdtConfig::default();
        let res = execute_odt_install(None, &runner, &config, None, false);

        assert!(res.is_err(), "Runner error should propagate as Err(String)");
        assert!(res.unwrap_err().contains("ODT execution failed: ODT spawn failed"));
    }
}

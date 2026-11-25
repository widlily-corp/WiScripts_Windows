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

/// Escapes special XML attribute characters (`&`, `"`, `'`, `<`, `>`) and strips control characters.
pub fn escape_xml_attr(input: &str) -> String {
    let mut escaped = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_control() {
            continue;
        }
        match ch {
            '&' => escaped.push_str("&amp;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            other => escaped.push(other),
        }
    }
    escaped
}

fn is_valid_odt_token(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/// Validates all ODT configuration fields against strict allowlists and safe identifier rules.
pub fn validate_odt_config(config: &OdtConfig) -> Result<(), AppError> {
    match config.architecture.trim() {
        "64" | "x64" | "32" | "x86" => {}
        other => {
            return Err(AppError::InvalidConfig(format!(
                "Unsupported ODT architecture '{}'. Must be 64/x64 or 32/x86.",
                other
            )));
        }
    }

    let channel = config.channel.trim();
    const ALLOWED_CHANNELS: &[&str] = &[
        "Current",
        "CurrentPreview",
        "MonthlyEnterprise",
        "SemiAnnual",
        "SemiAnnualPreview",
        "BetaChannel",
        "PerpetualVL2019",
        "PerpetualVL2021",
        "PerpetualVL2024",
    ];
    if !ALLOWED_CHANNELS
        .iter()
        .any(|c| c.eq_ignore_ascii_case(channel))
    {
        return Err(AppError::InvalidConfig(format!(
            "Unsupported ODT update channel '{}'.",
            config.channel
        )));
    }

    let display_level = config.display_level.trim();
    if !display_level.eq_ignore_ascii_case("None") && !display_level.eq_ignore_ascii_case("Full") {
        return Err(AppError::InvalidConfig(format!(
            "Unsupported ODT display level '{}'. Must be 'None' or 'Full'.",
            config.display_level
        )));
    }

    if !is_valid_odt_token(config.language.trim()) {
        return Err(AppError::InvalidConfig(format!(
            "Invalid ODT language identifier '{}'.",
            config.language
        )));
    }

    for prod in &config.products {
        if !is_valid_odt_token(prod.trim()) {
            return Err(AppError::InvalidConfig(format!(
                "Invalid ODT product ID '{}'.",
                prod
            )));
        }
    }

    for app in &config.excluded_apps {
        if !is_valid_odt_token(app.trim()) {
            return Err(AppError::InvalidConfig(format!(
                "Invalid ODT excluded app ID '{}'.",
                app
            )));
        }
    }

    Ok(())
}

/// Generates valid ODT XML content from configuration, XML-escaping all attribute values.
pub fn generate_odt_xml(config: &OdtConfig) -> String {
    log::debug!(
        "[ODTEngine] Generating ODT XML for arch='{}', channel='{}', products={:?}",
        config.architecture,
        config.channel,
        config.products
    );
    let mut xml = String::new();
    xml.push_str("<Configuration>\n");

    let arch = match config.architecture.trim() {
        "64" | "x64" => "64",
        "32" | "x86" => "32",
        other => other,
    };

    xml.push_str(&format!(
        "  <Add OfficeClientEdition=\"{}\" Channel=\"{}\">\n",
        escape_xml_attr(arch),
        escape_xml_attr(config.channel.trim())
    ));

    let default_products = vec!["O365ProPlusRetail".to_string()];
    let products = if config.products.is_empty() {
        &default_products
    } else {
        &config.products
    };

    let lang_attr = escape_xml_attr(config.language.trim());
    for prod in products {
        xml.push_str(&format!(
            "    <Product ID=\"{}\">\n",
            escape_xml_attr(prod.trim())
        ));
        xml.push_str(&format!("      <Language ID=\"{}\" />\n", lang_attr));

        for app in &config.excluded_apps {
            xml.push_str(&format!(
                "      <ExcludeApp ID=\"{}\" />\n",
                escape_xml_attr(app.trim())
            ));
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
        escape_xml_attr(config.display_level.trim()),
        accept_eula_str
    ));

    xml.push_str("</Configuration>");
    xml
}

/// Legacy / convenience helper returning Result<String, AppError>
pub fn generate_xml(config: &OdtConfig) -> Result<String, AppError> {
    validate_odt_config(config)?;
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
    validate_odt_config(config).map_err(|e| e.to_string())?;
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
            $odtDir = Join-Path $env:TEMP 'wiscripts_odt'; \
            New-Item -ItemType Directory -Force -Path $odtDir | Out-Null; \
            $extractedSetup = Join-Path $odtDir 'setup.exe'; \
            if (-not (Test-Path -LiteralPath $extractedSetup)) {{ \
                $odtExe = Join-Path $odtDir 'officedeploymenttool.exe'; \
                $fallbackUrl = 'https://download.microsoft.com/download/6c1eeb25-cf8b-41d9-8d0d-cc1dbc032140/officedeploymenttool_20326-20112.exe'; \
                $downloadUrl = $fallbackUrl; \
                try {{ \
                    $page = Invoke-WebRequest -Uri 'https://www.microsoft.com/en-us/download/details.aspx?id=49117' -UseBasicParsing -TimeoutSec 7 -ErrorAction Stop; \
                    $link = ($page.Links | Where-Object {{ $_.href -match '^https://download\\.microsoft\\.com/.*officedeploymenttool.*\\.exe$' }} | Select-Object -First 1).href; \
                    if ($link) {{ $downloadUrl = $link; }} \
                }} catch {{ \
                    $downloadUrl = $fallbackUrl; \
                }} \
                Invoke-WebRequest -Uri $downloadUrl -OutFile $odtExe -UseBasicParsing -ErrorAction Stop; \
                $sig = Get-AuthenticodeSignature -LiteralPath $odtExe; \
                if ($null -eq $sig -or $sig.Status -ne 'Valid' -or -not ($sig.SignerCertificate -and $sig.SignerCertificate.Subject -match 'Microsoft')) {{ \
                    Remove-Item -LiteralPath $odtExe -Force -ErrorAction SilentlyContinue; \
                    Write-Error \"Downloaded ODT installer failed Microsoft Authenticode verification (Status: $($sig.Status))\"; \
                    exit 1; \
                }}; \
                $extractProc = Start-Process -FilePath $odtExe -ArgumentList @(\"/extract:$odtDir\", \"/quiet\") -Wait -PassThru; \
                if ($extractProc.ExitCode -ne 0) {{ \
                    Write-Error \"Failed to extract Office Deployment Tool. Exit code: $($extractProc.ExitCode)\"; \
                    exit $extractProc.ExitCode; \
                }} \
            }} \
            if (Test-Path -LiteralPath $extractedSetup) {{ \
                $setupSig = Get-AuthenticodeSignature -LiteralPath $extractedSetup; \
                if ($null -eq $setupSig -or $setupSig.Status -ne 'Valid' -or -not ($setupSig.SignerCertificate -and $setupSig.SignerCertificate.Subject -match 'Microsoft')) {{ \
                    Write-Error \"Extracted ODT setup.exe failed Microsoft Authenticode verification (Status: $($setupSig.Status))\"; \
                    exit 1; \
                }}; \
                $setupPath = $extractedSetup; \
            }} \
        }}; \
        Set-Content -Path $configPath -Value {} -Encoding UTF8; \
        $proc = Start-Process -FilePath $setupPath -ArgumentList \"/configure `\"$configPath`\"\" -Wait -PassThru; \
        exit $proc.ExitCode",
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
        log::warn!(
            "[ODTEngine] ODT install returned exit code {}",
            output.exit_code
        );
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!(
                    "Error in step 1/1: Office ODT Installation (exit code {})",
                    output.exit_code
                ),
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
    execute_odt_install(None, runner, config, None, runner.is_dry_run())
        .map_err(AppError::Execution)
}

/// Bypasses ODT regional block by setting Microsoft Office update policy registry keys and experiment configs.
pub fn execute_odt_regional_bypass(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    dry_run: bool,
) -> Result<ExecutionSummary, String> {
    let start_time = std::time::Instant::now();
    log::info!(
        "[ODTEngine] Starting ODT regional block bypass (dry_run={})",
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: "Executing step 1/1: Bypass ODT Regional Lock".to_string(),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let ps_command = "if (-not (Test-Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\common\\officeupdate')) { New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\common\\officeupdate' -Force } ; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\common\\officeupdate' -Name 'PreventRegionalBlock' -Value 1 -Type DWord ; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\common\\officeupdate' -Name 'EnableAutomaticUpdates' -Value 1 -Type DWord ; if (-not (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Office\\16.0\\Common\\ExperimentConfigs\\Ecs')) { New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Office\\16.0\\Common\\ExperimentConfigs\\Ecs' -Force } ; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Office\\16.0\\Common\\ExperimentConfigs\\Ecs' -Name 'CountryCode' -Value 'US' -Type String".to_string();

    let output = match runner.run_powershell(&ps_command) {
        Ok(out) => out,
        Err(e) => {
            let err_msg = format!("ODT regional bypass failed: {}", e);
            log::error!("[ODTEngine] {}", err_msg);
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step: 1,
                    total_steps: 1,
                    message: format!("Error in step 1/1: Bypass ODT Regional Lock: {}", e),
                    is_error: true,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
            return Err(err_msg);
        }
    };

    let is_success = output.exit_code == 0;
    if is_success {
        log::info!("[ODTEngine] ODT regional bypass completed successfully");
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: "Completed step 1/1: Bypass ODT Regional Lock".to_string(),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        log::warn!(
            "[ODTEngine] ODT regional bypass returned exit code {}",
            output.exit_code
        );
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!(
                    "Error in step 1/1: Bypass ODT Regional Lock (exit code {})",
                    output.exit_code
                ),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: "odt_regional_bypass".to_string(),
        name: "Bypass ODT Regional Lock".to_string(),
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
        assert_eq!(escape_powershell_literal("$(calc.exe)"), "'$(calc.exe)'");
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

        assert!(
            !summary.success,
            "ODT execution summary success must be false on non-zero exit code"
        );
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
        assert!(res
            .unwrap_err()
            .contains("ODT execution failed: ODT spawn failed"));
    }

    #[test]
    fn test_execute_odt_regional_bypass_dry_run() {
        let runner = DryRunRunner::new();
        let summary = execute_odt_regional_bypass(None, &runner, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert_eq!(summary.executed_actions[0].id, "odt_regional_bypass");
        assert!(summary.executed_actions[0]
            .command
            .contains("PreventRegionalBlock"));
        assert!(summary.executed_actions[0].command.contains("CountryCode"));

        let history = runner.get_history();
        assert_eq!(history.len(), 1);
        assert!(history[0].command.contains("PreventRegionalBlock"));
    }

    #[test]
    fn test_odt_xml_escaping_and_validation() {
        assert_eq!(
            escape_xml_attr("a\"b'c<d>e&f"),
            "a&quot;b&apos;c&lt;d&gt;e&amp;f"
        );
        let malicious = OdtConfig {
            architecture: "64".to_string(),
            channel: "Current\"><EvilTag />".to_string(),
            products: vec!["Prod\"&<1>".to_string()],
            excluded_apps: vec!["App'<>".to_string()],
            language: "en-us\" />".to_string(),
            display_level: "None".to_string(),
            remove_existing_office: false,
            accept_eula: true,
        };
        let xml = generate_odt_xml(&malicious);
        assert!(!xml.contains("<EvilTag"));
        assert!(xml.contains("&quot;&gt;&lt;EvilTag /&gt;"));
        assert!(validate_odt_config(&malicious).is_err());
        assert!(generate_xml(&malicious).is_err());
        assert!(validate_odt_config(&OdtConfig::default()).is_ok());
    }
}

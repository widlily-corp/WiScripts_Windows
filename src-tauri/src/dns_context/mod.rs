use crate::error::AppError;
use crate::optimization::TaskProgressPayload;
use crate::runner::{CommandRunner, ExecutedAction, ExecutionSummary};
use tauri::Emitter;

/// Configures system DNS servers (AdGuard, Cloudflare, Google, DHCP).
pub fn set_dns_server(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    provider: &str,
    interface_alias: Option<&str>,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    let clean_provider = provider.trim().to_lowercase();

    log::info!(
        "[DnsContextEngine] Configuring DNS server: provider='{}', interface={:?}, dry_run={}",
        clean_provider,
        interface_alias,
        dry_run || runner.is_dry_run()
    );

    let (name, command) = match clean_provider.as_str() {
        "adguard" => {
            let primary = "94.140.14.14";
            let secondary = "94.140.15.15";
            let title = "Set DNS: AdGuard (Family/AdBlock)";
            let cmd = match interface_alias {
                Some(alias) if !alias.trim().is_empty() => format!(
                    "Set-DnsClientServerAddress -InterfaceAlias \"{}\" -ServerAddresses ('{}', '{}')",
                    alias.trim(), primary, secondary
                ),
                _ => format!(
                    "Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {{ Set-DnsClientServerAddress -InterfaceAlias $_.Name -ServerAddresses ('{}', '{}') }}",
                    primary, secondary
                ),
            };
            (title.to_string(), cmd)
        }
        "cloudflare" => {
            let primary = "1.1.1.1";
            let secondary = "1.0.0.1";
            let title = "Set DNS: Cloudflare (1.1.1.1)";
            let cmd = match interface_alias {
                Some(alias) if !alias.trim().is_empty() => format!(
                    "Set-DnsClientServerAddress -InterfaceAlias \"{}\" -ServerAddresses ('{}', '{}')",
                    alias.trim(), primary, secondary
                ),
                _ => format!(
                    "Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {{ Set-DnsClientServerAddress -InterfaceAlias $_.Name -ServerAddresses ('{}', '{}') }}",
                    primary, secondary
                ),
            };
            (title.to_string(), cmd)
        }
        "google" => {
            let primary = "8.8.8.8";
            let secondary = "8.8.4.4";
            let title = "Set DNS: Google Public DNS";
            let cmd = match interface_alias {
                Some(alias) if !alias.trim().is_empty() => format!(
                    "Set-DnsClientServerAddress -InterfaceAlias \"{}\" -ServerAddresses ('{}', '{}')",
                    alias.trim(), primary, secondary
                ),
                _ => format!(
                    "Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {{ Set-DnsClientServerAddress -InterfaceAlias $_.Name -ServerAddresses ('{}', '{}') }}",
                    primary, secondary
                ),
            };
            (title.to_string(), cmd)
        }
        "dhcp" | "reset" => {
            let title = "Reset DNS to Automatic (DHCP)";
            let cmd = match interface_alias {
                Some(alias) if !alias.trim().is_empty() => format!(
                    "Set-DnsClientServerAddress -InterfaceAlias \"{}\" -ResetServerAddresses",
                    alias.trim()
                ),
                _ => "Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceAlias $_.Name -ResetServerAddresses }".to_string(),
            };
            (title.to_string(), cmd)
        }
        unsupported => {
            let err_msg = format!("Unsupported DNS provider: {}", unsupported);
            log::error!("[DnsContextEngine] {}", err_msg);
            return Err(AppError::InvalidConfig(err_msg));
        }
    };

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: format!("Executing step 1/1: {}", name),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let output = runner.run_powershell(&command).map_err(AppError::Execution)?;
    let is_success = output.exit_code == 0;

    if is_success {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Completed step 1/1: {}", name),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Error in step 1/1: {} (exit code {})", name, output.exit_code),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: format!("dns_{}", clean_provider),
        name,
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

/// Checks whether classic Windows 10 context menu registry key is enabled on Windows 11.
pub fn get_classic_context_menu_status(
    runner: &dyn CommandRunner,
) -> Result<bool, AppError> {
    log::info!("[DnsContextEngine] Checking Classic Context Menu registry status");
    let script = "Test-Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32'";
    let output = runner.run_powershell(script).map_err(AppError::Execution)?;

    let status = output.stdout.trim().eq_ignore_ascii_case("true");
    log::info!("[DnsContextEngine] Classic Context Menu active = {}", status);
    Ok(status)
}

/// Toggles classic Windows 10 context menu on Windows 11 via HKCU registry.
pub fn toggle_classic_context_menu(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    enable: bool,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    let action_title = if enable {
        "Enable Classic Windows 10 Context Menu"
    } else {
        "Restore Windows 11 Modern Context Menu"
    };

    log::info!(
        "[DnsContextEngine] Toggling classic context menu: enable={}, dry_run={}",
        enable,
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: format!("Executing step 1/1: {}", action_title),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let command = if enable {
        "New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32' -Value '' -Force".to_string()
    } else {
        "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse -Force -ErrorAction SilentlyContinue".to_string()
    };

    let output = runner.run_powershell(&command).map_err(AppError::Execution)?;
    let is_success = output.exit_code == 0;

    if is_success {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Completed step 1/1: {}", action_title),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Error in step 1/1: {} (exit code {})", action_title, output.exit_code),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: "classic_context_menu_toggle".to_string(),
        name: action_title.to_string(),
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
    fn test_set_dns_server_adguard_dry_run() {
        let runner = DryRunRunner::new();
        let summary = set_dns_server(None, &runner, "adguard", None, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert!(summary.executed_actions[0].command.contains("94.140.14.14"));
    }

    #[test]
    fn test_set_dns_server_cloudflare_dry_run() {
        let runner = DryRunRunner::new();
        let summary = set_dns_server(None, &runner, "cloudflare", Some("Ethernet"), true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert!(summary.executed_actions[0].command.contains("1.1.1.1"));
        assert!(summary.executed_actions[0].command.contains("Ethernet"));
    }

    #[test]
    fn test_set_dns_server_google_dry_run() {
        let runner = DryRunRunner::new();
        let summary = set_dns_server(None, &runner, "google", None, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert!(summary.executed_actions[0].command.contains("8.8.8.8"));
    }

    #[test]
    fn test_set_dns_server_dhcp_dry_run() {
        let runner = DryRunRunner::new();
        let summary = set_dns_server(None, &runner, "dhcp", None, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert!(summary.executed_actions[0].command.contains("ResetServerAddresses"));
    }

    #[test]
    fn test_set_dns_server_invalid_provider() {
        let runner = DryRunRunner::new();
        let res = set_dns_server(None, &runner, "invalid_dns", None, true);

        assert!(res.is_err());
        if let Err(AppError::InvalidConfig(msg)) = res {
            assert!(msg.contains("Unsupported DNS provider"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }

    #[test]
    fn test_get_classic_context_menu_status() {
        let runner = DryRunRunner::new();
        let status = get_classic_context_menu_status(&runner).unwrap();
        // DryRunRunner stdout contains "[DRY-RUN]..." so false
        assert!(!status);
    }

    #[test]
    fn test_toggle_classic_context_menu_enable_dry_run() {
        let runner = DryRunRunner::new();
        let summary = toggle_classic_context_menu(None, &runner, true, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert!(summary.executed_actions[0].command.contains("New-Item"));
    }

    #[test]
    fn test_toggle_classic_context_menu_disable_dry_run() {
        let runner = DryRunRunner::new();
        let summary = toggle_classic_context_menu(None, &runner, false, true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert!(summary.executed_actions[0].command.contains("Remove-Item"));
    }
}

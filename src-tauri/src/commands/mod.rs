use crate::diagnostics;
use crate::dns_context;
use crate::driver_backup;
use crate::error::AppError;
use crate::mas::{self, ActivationMethod};
use crate::odt::{self, OdtConfig};
use crate::optimization::{self, OptimizationItem};
use crate::packages::{self, UwpAppInfo, WingetPackage};
use crate::profiles::{self, OptimizationProfile};
use crate::runner::{DryRunRunner, ExecutionSummary, RealRunner};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub os_build: String,
    pub is_elevated: bool,
    pub cpu_usage_percent: u32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub telemetry_status: String,
}

fn check_is_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("net");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.arg("session")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn probe_telemetry_status() -> String {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell.exe");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-Service -Name DiagTrack -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status",
            ])
            .output();
        match output {
            Ok(out) => {
                let status_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if status_str.eq_ignore_ascii_case("Running") {
                    "Active".to_string()
                } else if status_str.eq_ignore_ascii_case("Stopped") || status_str.is_empty() {
                    "Disabled".to_string()
                } else {
                    "Minimized".to_string()
                }
            }
            Err(_) => "Unknown".to_string(),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        "Unknown".to_string()
    }
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, AppError> {
    log::info!("[IPC] get_system_info request received");
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    })
    .await;
    sys.refresh_cpu();

    let os_name = sysinfo::System::name().unwrap_or_else(|| "Windows".to_string());
    let os_version = sysinfo::System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let os_build = sysinfo::System::kernel_version().unwrap_or_else(|| "Unknown".to_string());

    let is_elevated = check_is_elevated();
    let cpu_usage_percent = sys.global_cpu_info().cpu_usage().round() as u32;
    let memory_used_mb = sys.used_memory() / (1024 * 1024);
    let memory_total_mb = sys.total_memory() / (1024 * 1024);
    let telemetry_status = probe_telemetry_status();

    log::info!(
        "[IPC] get_system_info completed: OS='{} {}', CPU={}%, RAM={}/{}MB, Telemetry='{}', Elevated={}",
        os_name,
        os_version,
        cpu_usage_percent,
        memory_used_mb,
        memory_total_mb,
        telemetry_status,
        is_elevated
    );

    Ok(SystemInfo {
        os_name,
        os_version,
        os_build,
        is_elevated,
        cpu_usage_percent,
        memory_used_mb,
        memory_total_mb,
        telemetry_status,
    })
}

#[tauri::command]
pub async fn get_rule_catalog() -> Result<Vec<OptimizationItem>, AppError> {
    log::debug!("[IPC] get_rule_catalog request received");
    Ok(optimization::get_rule_catalog())
}

#[tauri::command]
pub async fn get_rules_by_category(category: String) -> Result<Vec<OptimizationItem>, AppError> {
    log::debug!("[IPC] get_rules_by_category request received for category '{}'", category);
    Ok(optimization::get_rules_by_category(&category))
}

#[tauri::command]
pub async fn preview_optimizations(
    selected_keys: Vec<String>,
) -> Result<Vec<OptimizationItem>, AppError> {
    log::info!("[IPC] preview_optimizations request received for {} keys", selected_keys.len());
    optimization::preview(&selected_keys)
}

#[tauri::command]
pub async fn execute_optimizations(
    app: tauri::AppHandle,
    selected_keys: Vec<String>,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] execute_optimizations request received: {} keys selected, dry_run={}",
        selected_keys.len(),
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        optimization::execute(Some(&app), &runner, &selected_keys)
    } else {
        let runner = RealRunner::new();
        optimization::execute(Some(&app), &runner, &selected_keys)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] execute_optimizations completed: success={}, actions={}, duration={}ms",
            summary.success,
            summary.executed_actions.len(),
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] execute_optimizations failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn generate_odt_xml(config: OdtConfig) -> Result<String, AppError> {
    log::info!(
        "[IPC] generate_odt_xml request received: arch={}, channel={}, products={:?}",
        config.architecture,
        config.channel,
        config.products
    );
    odt::generate_xml(&config)
}

#[tauri::command]
pub async fn execute_odt_install(
    app: tauri::AppHandle,
    config: OdtConfig,
    setup_path: Option<String>,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] execute_odt_install request received: setup_path={:?}, dry_run={}",
        setup_path,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        odt::execute_odt_install(Some(&app), &runner, &config, setup_path, true).map_err(AppError::Execution)
    } else {
        let runner = RealRunner::new();
        odt::execute_odt_install(Some(&app), &runner, &config, setup_path, false).map_err(AppError::Execution)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] execute_odt_install completed: success={}, total_duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] execute_odt_install failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn execute_activation(
    app: tauri::AppHandle,
    method: ActivationMethod,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] execute_activation request received: method={}, dry_run={}",
        method,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        mas::execute_activation(Some(&app), &runner, method, true).map_err(AppError::Execution)
    } else {
        let runner = RealRunner::new();
        mas::execute_activation(Some(&app), &runner, method, false).map_err(AppError::Execution)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] execute_activation completed: success={}, total_duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] execute_activation failed: {:?}", err),
    }

    res
}

// ---------------------------------------------------------------------------
// Features R1 - R5 IPC Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn run_diagnostics(
    app: tauri::AppHandle,
    action: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] run_diagnostics request received: action={}, dry_run={}",
        action,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        diagnostics::run_diagnostics(Some(&app), &runner, &action, true)
    } else {
        let runner = RealRunner::new();
        diagnostics::run_diagnostics(Some(&app), &runner, &action, false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] run_diagnostics completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] run_diagnostics failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn winget_search(query: String) -> Result<Vec<WingetPackage>, AppError> {
    log::info!("[IPC] winget_search request received for query '{}'", query);
    let runner = RealRunner::new();
    packages::winget_search(&runner, &query)
}

#[tauri::command]
pub async fn winget_install(
    app: tauri::AppHandle,
    package_id: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] winget_install request received: package_id={}, dry_run={}",
        package_id,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        packages::winget_install(Some(&app), &runner, &package_id, true)
    } else {
        let runner = RealRunner::new();
        packages::winget_install(Some(&app), &runner, &package_id, false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] winget_install completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] winget_install failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn winget_update(
    app: tauri::AppHandle,
    package_id: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] winget_update request received: package_id={}, dry_run={}",
        package_id,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        packages::winget_update(Some(&app), &runner, &package_id, true)
    } else {
        let runner = RealRunner::new();
        packages::winget_update(Some(&app), &runner, &package_id, false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] winget_update completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] winget_update failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn get_uwp_apps() -> Result<Vec<UwpAppInfo>, AppError> {
    log::info!("[IPC] get_uwp_apps request received");
    let runner = RealRunner::new();
    packages::get_uwp_apps(&runner)
}

#[tauri::command]
pub async fn remove_uwp_app(
    app: tauri::AppHandle,
    package_full_name: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] remove_uwp_app request received: package_full_name={}, dry_run={}",
        package_full_name,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        packages::remove_uwp_app(Some(&app), &runner, &package_full_name, true)
    } else {
        let runner = RealRunner::new();
        packages::remove_uwp_app(Some(&app), &runner, &package_full_name, false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] remove_uwp_app completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] remove_uwp_app failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn get_optimization_profiles() -> Result<Vec<OptimizationProfile>, AppError> {
    log::info!("[IPC] get_optimization_profiles request received");
    Ok(profiles::get_optimization_profiles())
}

#[tauri::command]
pub async fn apply_optimization_profile(
    app: tauri::AppHandle,
    profile_id: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] apply_optimization_profile request received: profile_id={}, dry_run={}",
        profile_id,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        profiles::apply_optimization_profile(Some(&app), &runner, &profile_id, true)
    } else {
        let runner = RealRunner::new();
        profiles::apply_optimization_profile(Some(&app), &runner, &profile_id, false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] apply_optimization_profile completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] apply_optimization_profile failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn set_dns_server(
    app: tauri::AppHandle,
    provider: String,
    interface_alias: Option<String>,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] set_dns_server request received: provider={}, interface={:?}, dry_run={}",
        provider,
        interface_alias,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        dns_context::set_dns_server(Some(&app), &runner, &provider, interface_alias.as_deref(), true)
    } else {
        let runner = RealRunner::new();
        dns_context::set_dns_server(Some(&app), &runner, &provider, interface_alias.as_deref(), false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] set_dns_server completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] set_dns_server failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn get_classic_context_menu_status() -> Result<bool, AppError> {
    log::info!("[IPC] get_classic_context_menu_status request received");
    let runner = RealRunner::new();
    dns_context::get_classic_context_menu_status(&runner)
}

#[tauri::command]
pub async fn toggle_classic_context_menu(
    app: tauri::AppHandle,
    enable: bool,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] toggle_classic_context_menu request received: enable={}, dry_run={}",
        enable,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        dns_context::toggle_classic_context_menu(Some(&app), &runner, enable, true)
    } else {
        let runner = RealRunner::new();
        dns_context::toggle_classic_context_menu(Some(&app), &runner, enable, false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] toggle_classic_context_menu completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] toggle_classic_context_menu failed: {:?}", err),
    }

    res
}

#[tauri::command]
pub async fn backup_drivers(
    app: tauri::AppHandle,
    output_dir: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] backup_drivers request received: output_dir={}, dry_run={}",
        output_dir,
        dry_run
    );
    let res = if dry_run {
        let runner = DryRunRunner::new();
        driver_backup::backup_drivers(Some(&app), &runner, &output_dir, true)
    } else {
        let runner = RealRunner::new();
        driver_backup::backup_drivers(Some(&app), &runner, &output_dir, false)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] backup_drivers completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] backup_drivers failed: {:?}", err),
    }

    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_system_info_ipc() {
        tauri::async_runtime::block_on(async {
            let info = get_system_info().await.unwrap();
            assert!(!info.os_name.is_empty());
            assert!(info.memory_total_mb > 0);
            assert!(info.cpu_usage_percent <= 100);
        });
    }

    #[test]
    fn test_execute_optimizations_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let selected = vec!["telemetry_diagtrack".to_string()];
            let runner = DryRunRunner::new();
            let summary = optimization::execute(None, &runner, &selected).unwrap();
            assert!(summary.is_dry_run);
            assert!(summary.success);
            assert_eq!(summary.executed_actions.len(), 1);
        });
    }

    #[test]
    fn test_execute_odt_install_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let config = OdtConfig::default();
            let runner = DryRunRunner::new();
            let summary = odt::execute_odt_install(None, &runner, &config, None, true).unwrap();
            assert!(summary.is_dry_run);
            assert!(summary.success);
        });
    }

    #[test]
    fn test_execute_activation_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let runner = DryRunRunner::new();
            let summary = mas::execute_activation(None, &runner, ActivationMethod::Hwid, true)
                .unwrap();
            assert!(summary.is_dry_run);
            assert!(summary.success);
            assert!(summary.executed_actions[0].command.contains("/HWID"));
        });
    }

    #[test]
    fn test_run_diagnostics_ipc_dry_run() {
        let runner = DryRunRunner::new();
        let summary = diagnostics::run_diagnostics(None, &runner, "sfc_scannow", true).unwrap();
        assert!(summary.is_dry_run);
        assert!(summary.success);
    }

    #[test]
    fn test_get_optimization_profiles_ipc() {
        tauri::async_runtime::block_on(async {
            let profiles = get_optimization_profiles().await.unwrap();
            assert_eq!(profiles.len(), 3);
        });
    }

    #[test]
    fn test_set_dns_server_ipc_dry_run() {
        let runner = DryRunRunner::new();
        let summary = dns_context::set_dns_server(None, &runner, "cloudflare", None, true).unwrap();
        assert!(summary.is_dry_run);
        assert!(summary.success);
    }

    #[test]
    fn test_backup_drivers_ipc_dry_run() {
        let runner = DryRunRunner::new();
        let summary = driver_backup::backup_drivers(None, &runner, "C:\\Backup", true).unwrap();
        assert!(summary.is_dry_run);
        assert!(summary.success);
    }
}

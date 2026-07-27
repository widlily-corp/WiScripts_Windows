use crate::cleaner;
use crate::diagnostics;
use crate::dns_context;
use crate::driver_backup;
use crate::error::AppError;
use crate::mas::{self, ActivationMethod};
use crate::metrics;
use crate::odt::{self, OdtConfig};
use crate::optimization::{self, OptimizationItem};
use crate::packages::{self, UwpAppInfo, WingetPackage};
use crate::profiles::{self, OptimizationProfile};
use crate::runner::{decode_bytes, CommandRunner, DryRunRunner, ExecutionSummary, RealRunner};
use crate::scheduler;
use crate::startup;
use crate::storage;
use crate::system_restore::{self, RestorePoint};
use crate::uninstaller;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::{Arc, Mutex};

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
        cmd.stdin(Stdio::null())
            .arg("session")
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
            .stdin(Stdio::null())
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-Service -Name DiagTrack -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status",
            ])
            .output();
        match output {
            Ok(out) => {
                let status_str = decode_bytes(&out.stdout).trim().to_string();
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
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, AppError> {
    log::info!("[IPC] get_system_info request received");
    tauri::async_runtime::spawn_blocking(move || {
        let mut sys = sysinfo::System::new_all();
        sys.refresh_all();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
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
    })
    .await
    .map_err(|e| AppError::System(format!("Join error in get_system_info: {}", e)))?
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
    create_restore_point: Option<bool>,
) -> Result<ExecutionSummary, AppError> {
    let should_create = create_restore_point.unwrap_or(true);
    log::info!(
        "[IPC] execute_optimizations request received: {} keys selected, dry_run={}, create_restore_point={}",
        selected_keys.len(),
        dry_run,
        should_create
    );
    tauri::async_runtime::spawn_blocking(move || {
        let res = if dry_run {
            let runner = DryRunRunner::new();
            optimization::execute(Some(&app), &runner, &selected_keys, should_create)
        } else {
            let runner = RealRunner::new();
            optimization::execute(Some(&app), &runner, &selected_keys, should_create)
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in execute_optimizations: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in execute_odt_install: {}", e)))?
}

#[tauri::command]
pub async fn execute_odt_regional_bypass(
    app: tauri::AppHandle,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] execute_odt_regional_bypass request received: dry_run={}",
        dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let res = if dry_run {
            let runner = DryRunRunner::new();
            odt::execute_odt_regional_bypass(Some(&app), &runner, true).map_err(AppError::Execution)
        } else {
            let runner = RealRunner::new();
            odt::execute_odt_regional_bypass(Some(&app), &runner, false).map_err(AppError::Execution)
        };

        match &res {
            Ok(summary) => log::info!(
                "[IPC] execute_odt_regional_bypass completed: success={}, total_duration={}ms",
                summary.success,
                summary.total_duration_ms
            ),
            Err(err) => log::error!("[IPC] execute_odt_regional_bypass failed: {:?}", err),
        }

        res
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in execute_odt_regional_bypass: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in execute_activation: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in run_diagnostics: {}", e)))?
}

#[tauri::command]
pub async fn winget_search(query: String) -> Result<Vec<WingetPackage>, AppError> {
    log::info!("[IPC] winget_search request received for query '{}'", query);
    tauri::async_runtime::spawn_blocking(move || {
        let runner = RealRunner::new();
        packages::winget_search(&runner, &query)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in winget_search: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in winget_install: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in winget_update: {}", e)))?
}

#[tauri::command]
pub async fn get_uwp_apps() -> Result<Vec<UwpAppInfo>, AppError> {
    log::info!("[IPC] get_uwp_apps request received");
    tauri::async_runtime::spawn_blocking(move || {
        let runner = RealRunner::new();
        packages::get_uwp_apps(&runner)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in get_uwp_apps: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in remove_uwp_app: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in apply_optimization_profile: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in set_dns_server: {}", e)))?
}

#[tauri::command]
pub async fn get_classic_context_menu_status() -> Result<bool, AppError> {
    log::info!("[IPC] get_classic_context_menu_status request received");
    tauri::async_runtime::spawn_blocking(move || {
        let runner = RealRunner::new();
        dns_context::get_classic_context_menu_status(&runner)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in get_classic_context_menu_status: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in toggle_classic_context_menu: {}", e)))?
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
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in backup_drivers: {}", e)))?
}

#[tauri::command]
pub async fn create_restore_point(
    _app: tauri::AppHandle,
    description: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] create_restore_point request received: description='{}', dry_run={}",
        description,
        dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let start_time = std::time::Instant::now();
        let res = if dry_run {
            let runner = DryRunRunner::new();
            system_restore::create_restore_point(&runner, &description).map_err(AppError::Execution)
        } else {
            let runner = RealRunner::new();
            system_restore::create_restore_point(&runner, &description).map_err(AppError::Execution)
        };

        match res {
            Ok(action) => Ok(ExecutionSummary {
                success: true,
                executed_actions: vec![action],
                total_duration_ms: start_time.elapsed().as_millis() as u64,
                is_dry_run: dry_run,
            }),
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in create_restore_point: {}", e)))?
}

#[tauri::command]
pub async fn get_restore_points() -> Result<Vec<RestorePoint>, AppError> {
    log::info!("[IPC] get_restore_points request received");
    tauri::async_runtime::spawn_blocking(move || {
        let runner = RealRunner::new();
        system_restore::get_restore_points(&runner).map_err(AppError::Execution)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in get_restore_points: {}", e)))?
}

#[tauri::command]
pub async fn restore_system_point(
    _app: tauri::AppHandle,
    sequence_number: u32,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] restore_system_point request received: sequence_number={}, dry_run={}",
        sequence_number,
        dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let start_time = std::time::Instant::now();
        let res = if dry_run {
            let runner = DryRunRunner::new();
            system_restore::restore_system_point(&runner, sequence_number).map_err(AppError::Execution)
        } else {
            let runner = RealRunner::new();
            system_restore::restore_system_point(&runner, sequence_number).map_err(AppError::Execution)
        };

        match res {
            Ok(action) => Ok(ExecutionSummary {
                success: true,
                executed_actions: vec![action],
                total_duration_ms: start_time.elapsed().as_millis() as u64,
                is_dry_run: dry_run,
            }),
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in restore_system_point: {}", e)))?
}

#[tauri::command]
pub async fn get_system_metrics(
    state: tauri::State<'_, Arc<Mutex<metrics::MetricsCollector>>>,
) -> Result<metrics::SystemMetricsPayload, AppError> {
    log::debug!("[IPC] get_system_metrics request received");
    let state_clone = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let mut collector = state_clone
            .lock()
            .map_err(|e| AppError::System(format!("Failed to lock metrics collector: {}", e)))?;
        collector.collect()
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in get_system_metrics: {}", e)))?
}

#[tauri::command]
pub async fn get_system_temperatures() -> Result<metrics::SystemTemperaturesPayload, AppError> {
    log::debug!("[IPC] get_system_temperatures request received");
    tauri::async_runtime::spawn_blocking(metrics::collect_temperatures)
        .await
        .map_err(|e| AppError::System(format!("Join error in get_system_temperatures: {}", e)))?
}

#[tauri::command]
pub async fn get_startup_items(
    dry_run: Option<bool>,
) -> Result<Vec<startup::StartupItem>, AppError> {
    log::debug!("[IPC] get_startup_items request received, dry_run={:?}", dry_run);
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        startup::get_startup_items(runner.as_ref())
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in get_startup_items: {}", e)))?
}

#[tauri::command]
pub async fn toggle_startup_item(
    id: String,
    value_name: Option<String>,
    location: Option<String>,
    enable: bool,
    dry_run: Option<bool>,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] toggle_startup_item id={}, value_name={:?}, location={:?}, enable={}, dry_run={:?}",
        id, value_name, location, enable, dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        let v_name = value_name.as_deref().unwrap_or(&id);
        let loc = location.as_deref().unwrap_or("");
        startup::toggle_startup_item(runner.as_ref(), &id, v_name, loc, enable)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in toggle_startup_item: {}", e)))?
}

#[tauri::command]
pub async fn remove_startup_item(
    id: String,
    value_name: Option<String>,
    location: Option<String>,
    dry_run: Option<bool>,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] remove_startup_item id={}, value_name={:?}, location={:?}, dry_run={:?}",
        id, value_name, location, dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        let v_name = value_name.as_deref().unwrap_or(&id);
        let loc = location.as_deref().unwrap_or("");
        startup::remove_startup_item(runner.as_ref(), &id, v_name, loc)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in remove_startup_item: {}", e)))?
}

#[tauri::command]
pub async fn get_scheduled_tasks(
    dry_run: Option<bool>,
) -> Result<Vec<scheduler::ScheduledTaskItem>, AppError> {
    log::debug!("[IPC] get_scheduled_tasks request received, dry_run={:?}", dry_run);
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        scheduler::get_scheduled_tasks(runner.as_ref())
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in get_scheduled_tasks: {}", e)))?
}

#[tauri::command]
pub async fn toggle_scheduled_task(
    task_name: String,
    task_path: String,
    enable: bool,
    dry_run: Option<bool>,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] toggle_scheduled_task name={}, path={}, enable={}, dry_run={:?}",
        task_name, task_path, enable, dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        scheduler::toggle_scheduled_task(runner.as_ref(), &task_name, &task_path, enable)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in toggle_scheduled_task: {}", e)))?
}

#[tauri::command]
pub async fn run_scheduled_task(
    task_name: String,
    task_path: String,
    dry_run: Option<bool>,
) -> Result<ExecutionSummary, AppError> {
    log::info!(
        "[IPC] run_scheduled_task name={}, path={}, dry_run={:?}",
        task_name, task_path, dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        scheduler::run_scheduled_task(runner.as_ref(), &task_name, &task_path)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in run_scheduled_task: {}", e)))?
}

#[tauri::command]
pub async fn get_installed_apps() -> Result<Vec<uninstaller::InstalledApp>, AppError> {
    log::info!("[IPC] get_installed_apps request received");
    tauri::async_runtime::spawn_blocking(move || uninstaller::get_installed_apps())
        .await
        .map_err(|e| AppError::Execution(format!("Join error in get_installed_apps: {}", e)))?
}

#[tauri::command]
pub async fn uninstall_app(
    app: uninstaller::InstalledApp,
    dry_run: Option<bool>,
) -> Result<ExecutionSummary, AppError> {
    let is_dry_run = dry_run.unwrap_or(false);
    log::info!(
        "[IPC] uninstall_app request received: app_id={}, name={}, dry_run={}",
        app.id,
        app.name,
        is_dry_run
    );
    tauri::async_runtime::spawn_blocking(move || uninstaller::uninstall_app(&app, is_dry_run))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in uninstall_app: {}", e)))?
}

#[tauri::command]
pub async fn scan_system_cleaner() -> Result<cleaner::CleanerScanResult, AppError> {
    log::info!("[IPC] scan_system_cleaner request received");
    tauri::async_runtime::spawn_blocking(cleaner::scan_system)
        .await
        .map_err(|e| AppError::Execution(format!("Join error in scan_system_cleaner: {}", e)))?
}

#[tauri::command]
pub async fn clean_system_items(
    category_ids: Vec<String>,
) -> Result<cleaner::CleanerCleanResult, AppError> {
    log::info!("[IPC] clean_system_items request received for {} categories", category_ids.len());
    tauri::async_runtime::spawn_blocking(move || cleaner::clean_items(category_ids))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in clean_system_items: {}", e)))?
}

#[tauri::command]
pub async fn scan_duplicate_files(
    target_dir: Option<String>,
) -> Result<Vec<storage::DuplicateGroup>, AppError> {
    log::info!("[IPC] scan_duplicate_files request received: target_dir={:?}", target_dir);
    tauri::async_runtime::spawn_blocking(move || storage::scan_duplicate_files(target_dir))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in scan_duplicate_files: {}", e)))?
}

#[tauri::command]
pub async fn scan_large_files(
    target_dir: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<storage::LargeFileItem>, AppError> {
    log::info!("[IPC] scan_large_files request received: target_dir={:?}, limit={:?}", target_dir, limit);
    tauri::async_runtime::spawn_blocking(move || storage::scan_large_files(target_dir, limit))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in scan_large_files: {}", e)))?
}

#[tauri::command]
pub async fn delete_files(paths: Vec<String>) -> Result<storage::DeleteResult, AppError> {
    log::info!("[IPC] delete_files request received for {} paths", paths.len());
    tauri::async_runtime::spawn_blocking(move || storage::delete_target_files(paths))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in delete_files: {}", e)))?
}

#[cfg(test)]

mod tests {
    use super::*;

    #[test]
    fn test_cargo_pkg_version_matches() {
        let ver = env!("CARGO_PKG_VERSION");
        assert_eq!(ver, "0.5.0");
    }

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
            let summary = optimization::execute(None, &runner, &selected, false).unwrap();
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

    #[test]
    fn test_get_system_metrics_ipc() {
        let collector = Arc::new(Mutex::new(metrics::MetricsCollector::new()));
        let mut guard = collector.lock().unwrap();
        let payload = guard.collect().unwrap();
        assert!(payload.memory_total_mb > 0);
        assert!(payload.timestamp_ms > 0);
    }

    #[test]
    fn test_get_system_temperatures_ipc() {
        tauri::async_runtime::block_on(async {
            let temps = get_system_temperatures().await.unwrap();
            assert!(!temps.sensor_source.is_empty());
        });
    }

    #[test]
    fn test_get_startup_items_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let items = get_startup_items(Some(true)).await.unwrap();
            assert_eq!(items.len(), 5);
            assert_eq!(items[0].value_name, "Discord");
        });
    }

    #[test]
    fn test_toggle_startup_item_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let summary = toggle_startup_item(
                "hkcu_run_discord".to_string(),
                Some("Discord".to_string()),
                Some("HKCU Run".to_string()),
                false,
                Some(true),
            )
            .await
            .unwrap();
            assert!(summary.is_dry_run);
            assert!(summary.success);
            assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
        });
    }

    #[test]
    fn test_remove_startup_item_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let summary = remove_startup_item(
                "hkcu_run_discord".to_string(),
                Some("Discord".to_string()),
                Some("HKCU Run".to_string()),
                Some(true),
            )
            .await
            .unwrap();
            assert!(summary.is_dry_run);
            assert!(summary.success);
            assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
        });
    }

    #[test]
    fn test_get_scheduled_tasks_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let tasks = get_scheduled_tasks(Some(true)).await.unwrap();
            assert_eq!(tasks.len(), 4);
            assert_eq!(tasks[0].task_name, "Consolidator");
        });
    }

    #[test]
    fn test_toggle_scheduled_task_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let summary = toggle_scheduled_task(
                "Consolidator".to_string(),
                r"\Microsoft\".to_string(),
                false,
                Some(true),
            )
            .await
            .unwrap();
            assert!(summary.is_dry_run);
            assert!(summary.success);
            assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
        });
    }

    #[test]
    fn test_run_scheduled_task_ipc_dry_run() {
        tauri::async_runtime::block_on(async {
            let summary = run_scheduled_task(
                "Consolidator".to_string(),
                r"\Microsoft\".to_string(),
                Some(true),
            )
            .await
            .unwrap();
            assert!(summary.is_dry_run);
            assert!(summary.success);
            assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
        });
    }
}

use crate::audio;
use crate::autoruns::{self, AutorunEntry, QuarantineResult};
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
use crate::runner::{CommandRunner, DryRunRunner, ExecutionSummary, RealRunner};
use crate::scheduler;
use crate::startup;
use crate::state_engine::{self, RollbackResult, SystemSnapshot};
use crate::storage;
use crate::system_restore::{self, RestorePoint};
use crate::uninstaller;
pub use crate::script_runner::{
    cancel_running_script, execute_custom_script, get_cached_scripts_library, read_library_script,
    sync_scripts_library,
};
use serde::{Deserialize, Serialize};
use std::io::Write;
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
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::Security::{
            GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
        };
        use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        unsafe {
            let mut token = HANDLE::default();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_ok() {
                let mut elevation = TOKEN_ELEVATION::default();
                let mut size = std::mem::size_of::<TOKEN_ELEVATION>() as u32;
                let res = GetTokenInformation(
                    token,
                    TokenElevation,
                    Some((&mut elevation as *mut TOKEN_ELEVATION) as *mut _),
                    size,
                    &mut size,
                );
                let _ = windows::Win32::Foundation::CloseHandle(token);
                if res.is_ok() {
                    return elevation.TokenIsElevated != 0;
                }
            }
            false
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn probe_telemetry_status() -> String {
    #[cfg(target_os = "windows")]
    {
        use windows::{
            core::PCWSTR,
            Win32::System::Services::{
                CloseServiceHandle, OpenSCManagerW, OpenServiceW, QueryServiceStatusEx,
                SC_MANAGER_CONNECT, SC_STATUS_PROCESS_INFO, SERVICE_QUERY_STATUS,
                SERVICE_RUNNING, SERVICE_STOPPED, SERVICE_STATUS_PROCESS,
            },
        };

        let service_name_u16: Vec<u16> = "DiagTrack\0".encode_utf16().collect();

        unsafe {
            let scm_handle = match OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT) {
                Ok(h) => h,
                Err(_) => return "Unknown".to_string(),
            };

            let svc_handle = match OpenServiceW(
                scm_handle,
                PCWSTR(service_name_u16.as_ptr()),
                SERVICE_QUERY_STATUS,
            ) {
                Ok(h) => h,
                Err(_) => {
                    let _ = CloseServiceHandle(scm_handle);
                    return "Disabled".to_string();
                }
            };

            let mut status_process = SERVICE_STATUS_PROCESS::default();
            let mut bytes_needed = 0u32;
            let status_slice = std::slice::from_raw_parts_mut(
                (&mut status_process as *mut SERVICE_STATUS_PROCESS) as *mut u8,
                std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
            );

            let query_res = QueryServiceStatusEx(
                svc_handle,
                SC_STATUS_PROCESS_INFO,
                Some(status_slice),
                &mut bytes_needed,
            );

            let _ = CloseServiceHandle(svc_handle);
            let _ = CloseServiceHandle(scm_handle);

            if query_res.is_ok() {
                if status_process.dwCurrentState == SERVICE_RUNNING {
                    "Active".to_string()
                } else if status_process.dwCurrentState == SERVICE_STOPPED {
                    "Disabled".to_string()
                } else {
                    "Minimized".to_string()
                }
            } else {
                "Disabled".to_string()
            }
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
pub async fn log_frontend_event(level: String, message: String) -> Result<(), AppError> {
    match level.as_str() {
        "info" => log::info!("[Frontend] {}", message),
        "warn" => log::warn!("[Frontend] {}", message),
        "error" => log::error!("[Frontend] {}", message),
        "cmd" => log::debug!("[Frontend] [CMD] {}", message),
        _ => log::debug!("[Frontend] {}", message),
    }
    Ok(())
}

#[tauri::command]
pub async fn get_rule_catalog() -> Result<Vec<OptimizationItem>, AppError> {
    log::debug!("[IPC] get_rule_catalog request received");
    Ok(optimization::get_rule_catalog())
}

#[tauri::command]
pub async fn get_rules_by_category(category: String) -> Result<Vec<OptimizationItem>, AppError> {
    log::debug!(
        "[IPC] get_rules_by_category request received for category '{}'",
        category
    );
    Ok(optimization::get_rules_by_category(&category))
}

#[tauri::command]
pub async fn preview_optimizations(
    selected_keys: Vec<String>,
) -> Result<Vec<OptimizationItem>, AppError> {
    log::info!(
        "[IPC] preview_optimizations request received for {} keys",
        selected_keys.len()
    );
    optimization::preview(&selected_keys)
}

#[tauri::command]
pub async fn get_optimizations_status() -> Result<std::collections::HashMap<String, bool>, AppError>
{
    log::info!("[IPC] get_optimizations_status request received");
    tauri::async_runtime::spawn_blocking(move || {
        let runner = RealRunner::new();
        optimization::check_status(&runner)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in get_optimizations_status: {}", e)))?
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
            odt::execute_odt_install(Some(&app), &runner, &config, setup_path, true)
                .map_err(AppError::Execution)
        } else {
            let runner = RealRunner::new();
            odt::execute_odt_install(Some(&app), &runner, &config, setup_path, false)
                .map_err(AppError::Execution)
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
            odt::execute_odt_regional_bypass(Some(&app), &runner, false)
                .map_err(AppError::Execution)
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
// AutoRuns & Security Inspector IPC Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn scan_autorun_entries() -> Result<Vec<AutorunEntry>, String> {
    log::info!("[IPC] scan_autorun_entries request received");
    tauri::async_runtime::spawn_blocking(move || {
        autoruns::scan_autorun_entries()
    })
    .await
    .map_err(|e| format!("Join error in scan_autorun_entries: {}", e))?
}

#[tauri::command]
pub async fn verify_file_authenticode(file_path: String) -> Result<String, String> {
    log::info!("[IPC] verify_file_authenticode request received for path '{}'", file_path);
    tauri::async_runtime::spawn_blocking(move || {
        autoruns::verify_file_authenticode(file_path)
    })
    .await
    .map_err(|e| format!("Join error in verify_file_authenticode: {}", e))?
}

#[tauri::command]
pub async fn toggle_autorun_entry(entry_id: String, enable: bool) -> Result<bool, String> {
    log::info!("[IPC] toggle_autorun_entry request received for entry_id '{}', enable={}", entry_id, enable);
    tauri::async_runtime::spawn_blocking(move || {
        autoruns::toggle_autorun_entry(entry_id, enable)
    })
    .await
    .map_err(|e| format!("Join error in toggle_autorun_entry: {}", e))?
}

#[tauri::command]
pub async fn quarantine_autorun_entry(entry_id: String) -> Result<QuarantineResult, String> {
    log::info!("[IPC] quarantine_autorun_entry request received for entry_id '{}'", entry_id);
    tauri::async_runtime::spawn_blocking(move || {
        autoruns::quarantine_autorun_entry(entry_id)
    })
    .await
    .map_err(|e| format!("Join error in quarantine_autorun_entry: {}", e))?
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
            dns_context::set_dns_server(
                Some(&app),
                &runner,
                &provider,
                interface_alias.as_deref(),
                true,
            )
        } else {
            let runner = RealRunner::new();
            dns_context::set_dns_server(
                Some(&app),
                &runner,
                &provider,
                interface_alias.as_deref(),
                false,
            )
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
    .map_err(|e| {
        AppError::Execution(format!(
            "Join error in get_classic_context_menu_status: {}",
            e
        ))
    })?
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

    if description.trim().is_empty() {
        log::warn!("[IPC] create_restore_point rejected: description is empty");
        return Err(AppError::InvalidConfig(
            "Restore point description cannot be empty".to_string(),
        ));
    }

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
            Ok(action) => {
                log::info!("[IPC] create_restore_point completed successfully");
                Ok(ExecutionSummary {
                    success: true,
                    executed_actions: vec![action],
                    total_duration_ms: start_time.elapsed().as_millis() as u64,
                    is_dry_run: dry_run,
                })
            }
            Err(e) => {
                log::error!("[IPC] create_restore_point failed: {:?}", e);
                Err(e)
            }
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
        match system_restore::get_restore_points(&runner) {
            Ok(points) => {
                log::info!(
                    "[IPC] get_restore_points succeeded: returned {} points",
                    points.len()
                );
                Ok(points)
            }
            Err(err) => {
                log::error!("[IPC] get_restore_points failed: {}", err);
                Err(AppError::Execution(err))
            }
        }
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
            system_restore::restore_system_point(&runner, sequence_number)
                .map_err(AppError::Execution)
        } else {
            let runner = RealRunner::new();
            system_restore::restore_system_point(&runner, sequence_number)
                .map_err(AppError::Execution)
        };

        match res {
            Ok(action) => {
                log::info!(
                    "[IPC] restore_system_point completed successfully for seq #{}",
                    sequence_number
                );
                Ok(ExecutionSummary {
                    success: true,
                    executed_actions: vec![action],
                    total_duration_ms: start_time.elapsed().as_millis() as u64,
                    is_dry_run: dry_run,
                })
            }
            Err(e) => {
                log::error!(
                    "[IPC] restore_system_point failed for seq #{}: {:?}",
                    sequence_number,
                    e
                );
                Err(e)
            }
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
pub async fn get_temperatures() -> Result<metrics::SystemTemperaturesPayload, AppError> {
    log::debug!("[IPC] get_temperatures request received");
    get_system_temperatures().await
}

#[tauri::command]
pub async fn get_startup_items(
    dry_run: Option<bool>,
) -> Result<Vec<startup::StartupItem>, AppError> {
    log::debug!(
        "[IPC] get_startup_items request received, dry_run={:?}",
        dry_run
    );
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
        id,
        value_name,
        location,
        enable,
        dry_run
    );
    let v_name = value_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| AppError::Execution("Missing required parameter: value_name".to_string()))?;
    let loc = location.as_deref().unwrap_or("");
    let v_name_owned = v_name.to_string();
    let loc_owned = loc.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        startup::toggle_startup_item(runner.as_ref(), &id, &v_name_owned, &loc_owned, enable)
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
        id,
        value_name,
        location,
        dry_run
    );
    let v_name = value_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| AppError::Execution("Missing required parameter: value_name".to_string()))?;
    let loc = location.as_deref().unwrap_or("");
    let v_name_owned = v_name.to_string();
    let loc_owned = loc.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        startup::remove_startup_item(runner.as_ref(), &id, &v_name_owned, &loc_owned)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in remove_startup_item: {}", e)))?
}

#[tauri::command]
pub async fn get_scheduled_tasks(
    dry_run: Option<bool>,
) -> Result<Vec<scheduler::ScheduledTaskItem>, AppError> {
    log::debug!(
        "[IPC] get_scheduled_tasks request received, dry_run={:?}",
        dry_run
    );
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
        task_name,
        task_path,
        enable,
        dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        let res = scheduler::toggle_scheduled_task(runner.as_ref(), &task_name, &task_path, enable);
        match &res {
            Ok(summary) => log::info!(
                "[IPC] toggle_scheduled_task completed: success={}, duration={}ms",
                summary.success,
                summary.total_duration_ms
            ),
            Err(err) => log::error!("[IPC] toggle_scheduled_task failed: {:?}", err),
        }
        res
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
        task_name,
        task_path,
        dry_run
    );
    tauri::async_runtime::spawn_blocking(move || {
        let runner: Box<dyn CommandRunner> = if dry_run.unwrap_or(false) {
            Box::new(DryRunRunner::new())
        } else {
            Box::new(RealRunner::new())
        };
        let res = scheduler::run_scheduled_task(runner.as_ref(), &task_name, &task_path);
        match &res {
            Ok(summary) => log::info!(
                "[IPC] run_scheduled_task completed: success={}, duration={}ms",
                summary.success,
                summary.total_duration_ms
            ),
            Err(err) => log::error!("[IPC] run_scheduled_task failed: {:?}", err),
        }
        res
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in run_scheduled_task: {}", e)))?
}

#[tauri::command]
pub async fn get_installed_apps() -> Result<Vec<uninstaller::InstalledApp>, AppError> {
    log::info!("[IPC] get_installed_apps request received");
    tauri::async_runtime::spawn_blocking(uninstaller::get_installed_apps)
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
    log::info!(
        "[IPC] clean_system_items request received for {} categories",
        category_ids.len()
    );
    tauri::async_runtime::spawn_blocking(move || cleaner::clean_items(category_ids))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in clean_system_items: {}", e)))?
}

#[tauri::command]
pub async fn scan_duplicate_files(
    target_dir: Option<String>,
) -> Result<Vec<storage::DuplicateGroup>, AppError> {
    log::info!(
        "[IPC] scan_duplicate_files request received: target_dir={:?}",
        target_dir
    );
    tauri::async_runtime::spawn_blocking(move || storage::scan_duplicate_files(target_dir))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in scan_duplicate_files: {}", e)))?
}

#[tauri::command]
pub async fn scan_large_files(
    target_dir: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<storage::LargeFileItem>, AppError> {
    log::info!(
        "[IPC] scan_large_files request received: target_dir={:?}, limit={:?}",
        target_dir,
        limit
    );
    tauri::async_runtime::spawn_blocking(move || storage::scan_large_files(target_dir, limit))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in scan_large_files: {}", e)))?
}

#[tauri::command]
pub async fn delete_files(paths: Vec<String>) -> Result<storage::DeleteResult, AppError> {
    log::info!(
        "[IPC] delete_files request received for {} paths",
        paths.len()
    );
    tauri::async_runtime::spawn_blocking(move || storage::delete_target_files(paths))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in delete_files: {}", e)))?
}

#[tauri::command]
pub async fn export_diagnostic_dump() -> Result<String, AppError> {
    log::info!("[IPC] export_diagnostic_dump request received");

    let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
    });

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let filename = format!("WiScripts_Diagnostic_Dump_{}.zip", timestamp);
    let raw_zip_path = desktop_dir.join(&filename);
    let zip_path = diagnostics::validate_dump_path(&raw_zip_path, &desktop_dir)?;

    let sys_info = get_system_info().await?;
    let sys_info_json = serde_json::to_string_pretty(&sys_info)
        .map_err(|e| AppError::System(format!("Failed to serialize system info: {}", e)))?;

    let log_path = crate::logger::get_log_path();
    let log_bytes = std::fs::read(&log_path).unwrap_or_default();

    let zip_file = std::fs::File::create(&zip_path).map_err(|e| {
        AppError::Io(format!(
            "Failed to create diagnostic dump file at {:?}: {}",
            zip_path, e
        ))
    })?;

    let mut zip = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("debug.log", options)
        .map_err(|e| AppError::Io(format!("Failed to add debug.log to ZIP archive: {}", e)))?;
    zip.write_all(&log_bytes).map_err(|e| {
        AppError::Io(format!(
            "Failed to write debug.log bytes to ZIP archive: {}",
            e
        ))
    })?;

    zip.start_file("system_info.json", options).map_err(|e| {
        AppError::Io(format!(
            "Failed to add system_info.json to ZIP archive: {}",
            e
        ))
    })?;
    zip.write_all(sys_info_json.as_bytes()).map_err(|e| {
        AppError::Io(format!(
            "Failed to write system_info.json bytes to ZIP archive: {}",
            e
        ))
    })?;

    zip.finish().map_err(|e| {
        AppError::Io(format!(
            "Failed to finalize diagnostic dump ZIP archive: {}",
            e
        ))
    })?;

    let abs_path = zip_path
        .to_str()
        .ok_or_else(|| AppError::Io("Invalid ZIP path string encoding".to_string()))?
        .to_string();

    log::info!(
        "[IPC] export_diagnostic_dump successfully created archive at {}",
        abs_path
    );
    Ok(abs_path)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssuePayload {
    pub title: String,
    pub category: String,
    pub description: String,
    pub include_logs: bool,
    pub include_system_info: bool,
    pub github_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueResult {
    pub success: bool,
    pub issue_url: Option<String>,
    pub method: String,
    pub error: Option<String>,
}

pub fn urlencode(s: &str) -> String {
    let mut encoded = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            b' ' => encoded.push_str("%20"),
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

pub fn sanitize_log_text(text: &str) -> String {
    let mut sanitized = text.to_string();
    if let Ok(re_user) = regex::Regex::new(r"(?i)[a-z]:\\users\\[^\s\\]+") {
        sanitized = re_user
            .replace_all(&sanitized, r"C:\Users\[REDACTED]")
            .to_string();
    }
    if let Ok(re_token) = regex::Regex::new(r"(ghp_[A-Za-z0-9_]{36}|github_pat_[A-Za-z0-9_]{82})") {
        sanitized = re_token
            .replace_all(&sanitized, "[REDACTED_TOKEN]")
            .to_string();
    }
    sanitized
}

pub fn build_github_issue_body(
    payload: &GitHubIssuePayload,
    sys_info: Option<&SystemInfo>,
    app_version: &str,
    log_lines: Option<&str>,
) -> String {
    let mut body = String::new();

    body.push_str("### Description\n");
    body.push_str(payload.description.trim());
    body.push_str("\n\n");

    body.push_str("### Category\n");
    let category_display = match payload.category.as_str() {
        "bug" => "Bug Report 🐛",
        "enhancement" => "Feature Request ✨",
        "question" => "Question / Support ❓",
        other => other,
    };
    body.push_str(category_display);
    body.push_str("\n\n");

    body.push_str("### Environment Details\n");
    body.push_str(&format!("- **App Version**: v{}\n", app_version));

    if payload.include_system_info {
        if let Some(sys) = sys_info {
            body.push_str(&format!("- **OS Name**: {}\n", sys.os_name));
            body.push_str(&format!(
                "- **OS Version**: {} (Build {})\n",
                sys.os_version, sys.os_build
            ));
            body.push_str(&format!(
                "- **Elevation Status**: {}\n",
                if sys.is_elevated {
                    "Elevated (Administrator)"
                } else {
                    "Non-elevated"
                }
            ));
            body.push_str(&format!(
                "- **Telemetry Service Status**: {}\n",
                sys.telemetry_status
            ));
        } else {
            body.push_str("- **System Info**: Not available\n");
        }
    } else {
        body.push_str("- **System Info**: Excluded by user\n");
    }
    body.push('\n');

    if payload.include_logs {
        body.push_str("### Debug Logs (Last 50 lines)\n");
        if let Some(logs) = log_lines {
            let sanitized = sanitize_log_text(logs);
            body.push_str("```text\n");
            body.push_str(&sanitized);
            if !sanitized.ends_with('\n') {
                body.push('\n');
            }
            body.push_str("```\n");
        } else {
            body.push_str("_No debug log entries found._\n");
        }
    }

    body
}

#[tauri::command]
pub async fn create_github_issue(
    payload: GitHubIssuePayload,
) -> Result<GitHubIssueResult, AppError> {
    log::info!(
        "[IPC] create_github_issue request received: title='{}', category='{}', include_logs={}, include_sys_info={}",
        payload.title,
        payload.category,
        payload.include_logs,
        payload.include_system_info
    );

    let app_version = env!("CARGO_PKG_VERSION");
    let sys_info = if payload.include_system_info {
        get_system_info().await.ok()
    } else {
        None
    };

    let log_lines = if payload.include_logs {
        let log_path = crate::logger::get_log_path();
        if let Ok(raw_logs) = std::fs::read_to_string(&log_path) {
            let lines: Vec<&str> = raw_logs.lines().collect();
            let last_50 = if lines.len() > 50 {
                &lines[lines.len() - 50..]
            } else {
                &lines[..]
            };
            Some(last_50.join("\n"))
        } else {
            None
        }
    } else {
        None
    };

    let body_markdown = build_github_issue_body(
        &payload,
        sys_info.as_ref(),
        app_version,
        log_lines.as_deref(),
    );

    let issue_title = format!("[{}] {}", payload.category.to_uppercase(), payload.title);

    if let Some(ref token) = payload.github_token {
        let trimmed_token = token.trim();
        if !trimmed_token.is_empty() {
            log::info!("[IPC] Attempting GitHub API issue submission with provided token");
            let client = reqwest::Client::new();
            let res = client
                .post("https://api.github.com/repos/widlily-corp/WiScripts_Windows/issues")
                .header("User-Agent", "WiScripts-App")
                .header("Accept", "application/vnd.github+json")
                .header("Authorization", format!("Bearer {}", trimmed_token))
                .json(&serde_json::json!({
                    "title": issue_title,
                    "body": body_markdown,
                    "labels": vec![payload.category.clone()]
                }))
                .send()
                .await;

            match res {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        let html_url = json
                            .get("html_url")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        log::info!(
                            "[IPC] GitHub issue successfully created via API: {:?}",
                            html_url
                        );
                        return Ok(GitHubIssueResult {
                            success: true,
                            issue_url: html_url,
                            method: "api".to_string(),
                            error: None,
                        });
                    }
                }
                Ok(resp) => {
                    log::warn!(
                        "[IPC] GitHub API request failed with status: {}. Falling back to browser URL.",
                        resp.status()
                    );
                }
                Err(err) => {
                    log::warn!(
                        "[IPC] GitHub API request error: {}. Falling back to browser URL.",
                        err
                    );
                }
            }
        }
    }

    let enc_title = urlencode(&issue_title);
    let enc_body = urlencode(&body_markdown);
    let browser_url = format!(
        "https://github.com/widlily-corp/WiScripts_Windows/issues/new?title={}&body={}",
        enc_title, enc_body
    );

    log::info!(
        "[IPC] Opening pre-filled issue URL in browser: {}",
        browser_url
    );
    match tauri_plugin_opener::open_url(&browser_url, None::<&str>) {
        Ok(_) => Ok(GitHubIssueResult {
            success: true,
            issue_url: Some(browser_url),
            method: "browser".to_string(),
            error: None,
        }),
        Err(e) => Ok(GitHubIssueResult {
            success: false,
            issue_url: Some(browser_url),
            method: "browser".to_string(),
            error: Some(format!("Failed to open browser URL: {}", e)),
        }),
    }
}

// ---------------------------------------------------------------------------
// Audio Device Management & Session Control IPC Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_audio_devices() -> Result<audio::types::AudioDevicesPayload, AppError> {
    log::info!("[IPC] get_audio_devices request received");
    tauri::async_runtime::spawn_blocking(audio::get_audio_devices)
        .await
        .map_err(|e| AppError::Execution(format!("Join error in get_audio_devices: {}", e)))?
}

#[tauri::command]
pub async fn set_global_audio_device(
    device_id: String,
    flow: audio::types::AudioFlow,
) -> Result<(), AppError> {
    log::info!(
        "[IPC] set_global_audio_device request received: device_id='{}', flow={}",
        device_id,
        flow
    );
    tauri::async_runtime::spawn_blocking(move || audio::set_global_audio_device(&device_id, flow))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in set_global_audio_device: {}", e)))?
}

#[tauri::command]
pub async fn get_app_audio_sessions() -> Result<Vec<audio::types::AppAudioSession>, AppError> {
    log::info!("[IPC] get_app_audio_sessions request received");
    tauri::async_runtime::spawn_blocking(audio::get_app_audio_sessions)
        .await
        .map_err(|e| AppError::Execution(format!("Join error in get_app_audio_sessions: {}", e)))?
}

#[tauri::command]
pub async fn set_app_audio_device(
    pid: u32,
    device_id: String,
    flow: audio::types::AudioFlow,
) -> Result<(), AppError> {
    log::info!(
        "[IPC] set_app_audio_device request received: pid={}, device_id='{}', flow={}",
        pid,
        device_id,
        flow
    );
    tauri::async_runtime::spawn_blocking(move || audio::set_app_audio_device(pid, &device_id, flow))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in set_app_audio_device: {}", e)))?
}

#[tauri::command]
pub async fn set_app_volume(
    pid: u32,
    volume: f32,
    muted: bool,
) -> Result<(), AppError> {
    log::info!(
        "[IPC] set_app_volume request received: pid={}, volume={}, muted={}",
        pid,
        volume,
        muted
    );
    tauri::async_runtime::spawn_blocking(move || audio::set_app_volume(pid, volume, muted))
        .await
        .map_err(|e| AppError::Execution(format!("Join error in set_app_volume: {}", e)))?
}

#[tauri::command]
pub async fn create_state_snapshot(
    label: String,
    trigger_source: Option<String>,
) -> Result<SystemSnapshot, AppError> {
    log::info!(
        "[IPC] create_state_snapshot request received: label='{}', trigger_source={:?}",
        label,
        trigger_source
    );
    tauri::async_runtime::spawn_blocking(move || {
        state_engine::create_snapshot(label, trigger_source).map_err(AppError::Execution)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in create_state_snapshot: {}", e)))?
}

#[tauri::command]
pub async fn rollback_state_snapshot(snapshot_id: String) -> Result<RollbackResult, AppError> {
    log::info!(
        "[IPC] rollback_state_snapshot request received: snapshot_id='{}'",
        snapshot_id
    );
    tauri::async_runtime::spawn_blocking(move || {
        state_engine::rollback_snapshot(&snapshot_id).map_err(AppError::Execution)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in rollback_state_snapshot: {}", e)))?
}

#[tauri::command]
pub async fn list_state_snapshots() -> Result<Vec<SystemSnapshot>, AppError> {
    log::info!("[IPC] list_state_snapshots request received");
    tauri::async_runtime::spawn_blocking(move || {
        state_engine::list_snapshots().map_err(AppError::Execution)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in list_state_snapshots: {}", e)))?
}

#[tauri::command]
pub async fn delete_state_snapshot(snapshot_id: String) -> Result<bool, AppError> {
    log::info!(
        "[IPC] delete_state_snapshot request received: snapshot_id='{}'",
        snapshot_id
    );
    tauri::async_runtime::spawn_blocking(move || {
        state_engine::delete_snapshot(&snapshot_id).map_err(AppError::Execution)
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in delete_state_snapshot: {}", e)))?
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreflightSnapshotResult {
    pub snapshot_id: String,
    pub sequence_number: u64,
    pub timestamp: String,
    pub state_engine_success: bool,
    pub restore_point_success: bool,
    pub restore_point_warning: Option<String>,
    pub rules_captured: usize,
}

#[tauri::command]
pub async fn create_preflight_snapshot(
    description: Option<String>,
    rule_ids: Option<Vec<String>>,
) -> Result<PreflightSnapshotResult, AppError> {
    let desc = description.unwrap_or_else(|| "Pre-flight safety snapshot before batch optimization".to_string());
    let rules = rule_ids.unwrap_or_default();
    let rules_count = rules.len();

    log::info!(
        "[IPC] create_preflight_snapshot request received: desc='{}', rules_count={}",
        desc,
        rules_count
    );

    let state_snapshot = tauri::async_runtime::spawn_blocking({
        let desc_clone = desc.clone();
        move || state_engine::create_snapshot(desc_clone, Some("pre_optimization".to_string()))
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in state snapshot: {}", e)))?
    .map_err(AppError::Execution)?;

    let (rp_success, rp_warning, seq_num) = tauri::async_runtime::spawn_blocking({
        let desc_clone = format!("WiScripts: {}", desc);
        move || {
            let runner = crate::runner::RealRunner::new();
            match crate::system_restore::create_restore_point(&runner, &desc_clone) {
                Ok(action) => {
                    log::info!("[PreflightSnapshot] VSS restore point created: {}", action.name);
                    (true, None, 100u64)
                }
                Err(e) => {
                    log::warn!("[PreflightSnapshot] VSS restore point creation warning: {}", e);
                    let warning_msg = if e.contains("frequency") || e.contains("24 hours") || e.contains("0x80041001") {
                        "VSS 24h frequency limit reached. StateEngine JSON snapshot was saved successfully.".to_string()
                    } else if e.contains("disabled") || e.contains("0x80070422") {
                        "System Restore is disabled on the system drive. StateEngine JSON snapshot was saved successfully.".to_string()
                    } else {
                        format!("System Restore Point creation failed ({}). StateEngine JSON snapshot was saved successfully.", e)
                    };
                    (false, Some(warning_msg), 0u64)
                }
            }
        }
    })
    .await
    .map_err(|e| AppError::Execution(format!("Join error in restore point creation: {}", e)))?;

    let timestamp = {
        let dur = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap_or_default();
        format!("{}", dur.as_secs())
    };

    Ok(PreflightSnapshotResult {
        snapshot_id: state_snapshot.id,
        sequence_number: seq_num,
        timestamp,
        state_engine_success: true,
        restore_point_success: rp_success,
        restore_point_warning: rp_warning,
        rules_captured: rules_count,
    })
}

// ---------------------------------------------------------------------------
// Resource Governor IPC Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn apply_process_governor_rule(
    rule: crate::governor::ResourceGovernorRule,
) -> Result<bool, String> {
    log::info!(
        "[IPC] apply_process_governor_rule request received for process '{}'",
        rule.process_name
    );
    tauri::async_runtime::spawn_blocking(move || crate::governor::apply_process_governor_rule(rule))
        .await
        .map_err(|e| format!("Join error in apply_process_governor_rule: {}", e))?
}

#[tauri::command]
pub async fn trim_process_working_set(pid: u32) -> Result<u64, String> {
    log::info!("[IPC] trim_process_working_set request received for PID {}", pid);
    tauri::async_runtime::spawn_blocking(move || crate::governor::trim_process_working_set(pid))
        .await
        .map_err(|e| format!("Join error in trim_process_working_set: {}", e))?
}

#[tauri::command]
pub async fn get_governor_status() -> Result<crate::governor::GovernorStatus, String> {
    log::debug!("[IPC] get_governor_status request received");
    tauri::async_runtime::spawn_blocking(crate::governor::get_governor_status)
        .await
        .map_err(|e| format!("Join error in get_governor_status: {}", e))?
}

#[tauri::command]
pub async fn list_active_rules() -> Result<Vec<crate::governor::ResourceGovernorRule>, String> {
    log::debug!("[IPC] list_active_rules request received");
    tauri::async_runtime::spawn_blocking(crate::governor::list_active_rules)
        .await
        .map_err(|e| format!("Join error in list_active_rules: {}", e))?
}

#[tauri::command]
pub async fn delete_governor_rule(process_name: String) -> Result<bool, String> {
    log::info!(
        "[IPC] delete_governor_rule request received for process '{}'",
        process_name
    );
    tauri::async_runtime::spawn_blocking(move || crate::governor::delete_governor_rule(process_name))
        .await
        .map_err(|e| format!("Join error in delete_governor_rule: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cargo_pkg_version_matches() {
        // Arrange & Act
        let ver = env!("CARGO_PKG_VERSION");

        // Assert
        assert_eq!(ver, env!("CARGO_PKG_VERSION"));
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
            let summary =
                mas::execute_activation(None, &runner, ActivationMethod::Hwid, true).unwrap();
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
            assert!(summary.executed_actions[0]
                .output
                .stdout
                .contains("[DRY-RUN]"));
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
            assert!(summary.executed_actions[0]
                .output
                .stdout
                .contains("[DRY-RUN]"));
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
            assert!(summary.executed_actions[0]
                .output
                .stdout
                .contains("[DRY-RUN]"));
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
            assert!(summary.executed_actions[0]
                .output
                .stdout
                .contains("[DRY-RUN]"));
        });
    }

    #[test]
    fn test_export_diagnostic_dump() {
        // Arrange
        let _ = crate::logger::init_logger();

        // Act
        let zip_path_str =
            tauri::async_runtime::block_on(async { export_diagnostic_dump().await.unwrap() });

        // Assert
        let zip_path = std::path::PathBuf::from(&zip_path_str);
        assert!(
            zip_path.exists(),
            "Exported ZIP archive must exist at {}",
            zip_path_str
        );
        assert!(zip_path.is_file(), "Exported ZIP path must be a file");

        let zip_file = std::fs::File::open(&zip_path).expect("Failed to open exported ZIP file");
        let mut archive =
            zip::ZipArchive::new(zip_file).expect("Failed to read ZIP archive format");

        let mut entry_names = Vec::new();
        for i in 0..archive.len() {
            let file = archive
                .by_index(i)
                .expect("Failed to read ZIP archive entry");
            entry_names.push(file.name().to_string());
        }

        assert!(
            entry_names.contains(&"debug.log".to_string()),
            "ZIP archive must contain debug.log entry"
        );
        assert!(
            entry_names.contains(&"system_info.json".to_string()),
            "ZIP archive must contain system_info.json entry"
        );

        // Teardown / Cleanup
        let _ = std::fs::remove_file(zip_path);
    }

    #[test]
    fn test_create_github_issue_body_builder() {
        // Arrange
        let payload = GitHubIssuePayload {
            title: "App crash when running optimization".to_string(),
            category: "bug".to_string(),
            description: "App crashed with error code 0x80070005 when disabling DiagTrack."
                .to_string(),
            include_logs: true,
            include_system_info: true,
            github_token: None,
        };
        let sys_info = SystemInfo {
            os_name: "Windows 11 Pro".to_string(),
            os_version: "23H2".to_string(),
            os_build: "22631.3880".to_string(),
            is_elevated: true,
            cpu_usage_percent: 15,
            memory_used_mb: 4096,
            memory_total_mb: 16384,
            telemetry_status: "Active".to_string(),
        };
        let raw_logs = "2026-07-29T10:00:00Z [INFO] Initializing app\n2026-07-29T10:00:01Z [ERROR] Failed to access C:\\Users\\JohnDoe\\AppData\\Local\\Temp with token ghp_123456789012345678901234567890123456";

        // Act
        let body = build_github_issue_body(&payload, Some(&sys_info), "0.9.0", Some(raw_logs));

        // Assert
        assert!(
            body.contains("### Description"),
            "Body must contain Description header"
        );
        assert!(
            body.contains("App crashed with error code 0x80070005"),
            "Body must contain user description"
        );
        assert!(
            body.contains("### Category"),
            "Body must contain Category header"
        );
        assert!(
            body.contains("Bug Report 🐛"),
            "Body must display Bug Report category label"
        );
        assert!(
            body.contains("### Environment Details"),
            "Body must contain Environment Details header"
        );
        assert!(body.contains("Windows 11 Pro"), "Body must contain OS name");
        assert!(body.contains("v0.9.0"), "Body must contain app version");
        assert!(
            body.contains("Elevated (Administrator)"),
            "Body must contain elevation status"
        );
        assert!(
            body.contains("Active"),
            "Body must contain telemetry status"
        );
        assert!(
            body.contains("### Debug Logs (Last 50 lines)"),
            "Body must contain Debug Logs header"
        );
        assert!(
            !body.contains("JohnDoe"),
            "User home directory path must be sanitized"
        );
        assert!(
            body.contains(r"C:\Users\[REDACTED]"),
            "User home directory path should be replaced with redacted marker"
        );
        assert!(
            !body.contains("ghp_123456789012345678901234567890123456"),
            "GitHub PAT token must be sanitized"
        );
        assert!(
            body.contains("[REDACTED_TOKEN]"),
            "Token should be replaced with redacted marker"
        );
    }

    #[test]
    fn test_preflight_snapshot_result_serialization() {
        let result = PreflightSnapshotResult {
            snapshot_id: "snap_12345_abc".to_string(),
            sequence_number: 101,
            timestamp: "1723960000".to_string(),
            state_engine_success: true,
            restore_point_success: true,
            restore_point_warning: None,
            rules_captured: 3,
        };

        let json = serde_json::to_string(&result).expect("Failed to serialize PreflightSnapshotResult");
        assert!(json.contains("\"snapshotId\":\"snap_12345_abc\""));
        assert!(json.contains("\"sequenceNumber\":101"));
        assert!(json.contains("\"stateEngineSuccess\":true"));
        assert!(json.contains("\"restorePointSuccess\":true"));
        assert!(json.contains("\"rulesCaptured\":3"));

        let deserialized: PreflightSnapshotResult = serde_json::from_str(&json).expect("Failed to deserialize");
        assert_eq!(deserialized, result);
    }
}

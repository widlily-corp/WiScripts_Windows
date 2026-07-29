pub mod cleaner;
pub mod commands;
pub mod diagnostics;
pub mod dns_context;
pub mod driver_backup;
pub mod error;
pub mod logger;
pub mod mas;
pub mod metrics;
pub mod odt;
pub mod optimization;
pub mod packages;
pub mod profiles;
pub mod runner;
pub mod scheduler;
pub mod startup;
pub mod storage;
pub mod system_restore;
pub mod uninstaller;
pub mod winapi;

use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(err) = logger::init_logger() {
        eprintln!("Failed to initialize logger: {}", err);
    }

    let metrics_collector = Arc::new(Mutex::new(metrics::MetricsCollector::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(metrics_collector)
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::log_frontend_event,
            commands::get_system_info,
            commands::get_system_metrics,
            commands::get_system_temperatures,
            commands::get_startup_items,
            commands::toggle_startup_item,
            commands::remove_startup_item,
            commands::get_scheduled_tasks,
            commands::toggle_scheduled_task,
            commands::run_scheduled_task,
            commands::get_rule_catalog,
            commands::get_rules_by_category,
            commands::preview_optimizations,
            commands::execute_optimizations,
            commands::generate_odt_xml,
            commands::execute_odt_install,
            commands::execute_odt_regional_bypass,
            commands::execute_activation,
            commands::run_diagnostics,
            commands::winget_search,
            commands::winget_install,
            commands::winget_update,
            commands::get_uwp_apps,
            commands::remove_uwp_app,
            commands::get_optimization_profiles,
            commands::apply_optimization_profile,
            commands::set_dns_server,
            commands::get_classic_context_menu_status,
            commands::toggle_classic_context_menu,
            commands::backup_drivers,
            commands::create_restore_point,
            commands::get_restore_points,
            commands::restore_system_point,
            commands::get_installed_apps,
            commands::uninstall_app,
            commands::scan_system_cleaner,
            commands::clean_system_items,
            commands::scan_duplicate_files,
            commands::scan_large_files,
            commands::delete_files,
            commands::export_diagnostic_dump,
            commands::create_github_issue,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}




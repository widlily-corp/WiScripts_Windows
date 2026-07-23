pub mod activation;
pub mod commands;
pub mod diagnostics;
pub mod dns_context;
pub mod driver_backup;
pub mod error;
pub mod logger;
pub mod mas;
pub mod odt;
pub mod optimization;
pub mod packages;
pub mod profiles;
pub mod runner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(err) = logger::init_logger() {
        eprintln!("Failed to initialize logger: {}", err);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
            commands::get_rule_catalog,
            commands::get_rules_by_category,
            commands::preview_optimizations,
            commands::execute_optimizations,
            commands::generate_odt_xml,
            commands::execute_odt_install,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

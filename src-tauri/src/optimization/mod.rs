use crate::error::AppError;
use crate::runner::{CommandRunner, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgressPayload {
    pub current_step: usize,
    pub total_steps: usize,
    pub message: String,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationItem {
    pub id: String,
    pub category: String,
    pub title: String,
    pub description: String,
    pub risk_level: String,
    pub is_reversible: bool,
    pub powershell_command: String,
    pub undo_command: String,
    pub is_recommended: bool,
}

pub fn get_rule_catalog() -> Vec<OptimizationItem> {
    vec![
        // Category 1: telemetry
        OptimizationItem {
            id: "telemetry_diagtrack".to_string(),
            category: "telemetry".to_string(),
            title: "Disable DiagTrack & Telemetry Services".to_string(),
            description: "Stops and disables Connected User Experiences and Telemetry service (DiagTrack).".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Stop-Service -Name DiagTrack; Set-Service -Name DiagTrack -StartupType Disabled".to_string(),
            undo_command: "Set-Service -Name DiagTrack -StartupType Automatic; Start-Service -Name DiagTrack".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "telemetry_dmwappush".to_string(),
            category: "telemetry".to_string(),
            title: "Disable dmwappushservice".to_string(),
            description: "Disables WAP Push Message Routing Service used for telemetry diagnostics collection.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Stop-Service -Name dmwappushservice; Set-Service -Name dmwappushservice -StartupType Disabled".to_string(),
            undo_command: "Set-Service -Name dmwappushservice -StartupType Demand".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "telemetry_ceip_tasks".to_string(),
            category: "telemetry".to_string(),
            title: "Disable CEIP Scheduled Telemetry Tasks".to_string(),
            description: "Disables Customer Experience Improvement Program scheduled tasks in Task Scheduler.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Disable-ScheduledTask -TaskPath '\\Microsoft\\Windows\\Customer Experience Improvement Program\\' -TaskName 'Consolidator', 'UsbCeip'".to_string(),
            undo_command: "Enable-ScheduledTask -TaskPath '\\Microsoft\\Windows\\Customer Experience Improvement Program\\' -TaskName 'Consolidator', 'UsbCeip'".to_string(),
            is_recommended: true,
        },
        // Category 2: bloatware
        OptimizationItem {
            id: "bloatware_cortana".to_string(),
            category: "bloatware".to_string(),
            title: "Disable Cortana App & Background Execution".to_string(),
            description: "Disables Cortana autostart and background task execution via group policy registry key.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search' -Name 'AllowCortana' -Value 0 -Type DWord -Force".to_string(),
            undo_command: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search' -Name 'AllowCortana' -Value 1 -Type DWord -Force".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "bloatware_onedrive".to_string(),
            category: "bloatware".to_string(),
            title: "Uninstall OneDrive Integration".to_string(),
            description: "Removes standalone OneDrive client and unbinds Explorer cloud integration.".to_string(),
            risk_level: "medium".to_string(),
            is_reversible: false,
            powershell_command: "Stop-Process -Name OneDrive -ErrorAction SilentlyContinue; $setup = Join-Path $env:SystemRoot 'SysWOW64\\OneDriveSetup.exe'; if (-not (Test-Path $setup)) { $setup = Join-Path $env:SystemRoot 'System32\\OneDriveSetup.exe' }; if (Test-Path $setup) { Start-Process $setup -ArgumentList '/uninstall' -Wait }".to_string(),
            undo_command: "# Manual reinstallation required via OneDrive setup binary".to_string(),
            is_recommended: false,
        },
        OptimizationItem {
            id: "bloatware_xbox_apps".to_string(),
            category: "bloatware".to_string(),
            title: "Remove Xbox Companion & Game Overlay Apps".to_string(),
            description: "Uninstalls Xbox Companion and Game Bar AppX packages for non-gaming Windows installations.".to_string(),
            risk_level: "medium".to_string(),
            is_reversible: true,
            powershell_command: "Get-AppxPackage -AllUsers *XboxApp* | Remove-AppxPackage -ErrorAction SilentlyContinue".to_string(),
            undo_command: "Get-AppxPackage -AllUsers *XboxApp* | Foreach {Add-AppxPackage -DisableDevelopmentMode -Register \"$($_.InstallLocation)\\AppXManifest.xml\"}".to_string(),
            is_recommended: false,
        },
        OptimizationItem {
            id: "bloatware_3d_viewer".to_string(),
            category: "bloatware".to_string(),
            title: "Remove 3D Viewer & Mixed Reality Apps".to_string(),
            description: "Removes 3D Viewer and Mixed Reality Portal provisioned packages.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Get-AppxPackage *Microsoft3DViewer* | Remove-AppxPackage -ErrorAction SilentlyContinue".to_string(),
            undo_command: "# Reinstall via Microsoft Store".to_string(),
            is_recommended: true,
        },
        // Category 3: privacy
        OptimizationItem {
            id: "privacy_advertising_id".to_string(),
            category: "privacy".to_string(),
            title: "Disable Advertising ID for Apps".to_string(),
            description: "Prevents apps from using advertising ID for tailored ads across application sessions.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Name 'Enabled' -Value 0 -Type DWord -Force".to_string(),
            undo_command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Name 'Enabled' -Value 1 -Type DWord -Force".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "privacy_location_tracking".to_string(),
            category: "privacy".to_string(),
            title: "Disable System Location Tracking Services".to_string(),
            description: "Turns off global OS location service access and location history logging.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' -Name 'Value' -Value 'Deny' -Type String -Force".to_string(),
            undo_command: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' -Name 'Value' -Value 'Allow' -Type String -Force".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "privacy_activity_history".to_string(),
            category: "privacy".to_string(),
            title: "Disable Activity History & Cloud Sync".to_string(),
            description: "Stops collecting user activity history and prevents cloud timeline synchronization.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'PublishUserActivities' -Value 0 -Type DWord -Force".to_string(),
            undo_command: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'PublishUserActivities' -Value 1 -Type DWord -Force".to_string(),
            is_recommended: true,
        },
        // Category 4: services
        OptimizationItem {
            id: "services_sysmain".to_string(),
            category: "services".to_string(),
            title: "Disable SysMain (Superfetch) Service".to_string(),
            description: "Stops SysMain service to reduce excessive disk read/write cycles on NVMe/SSD drives.".to_string(),
            risk_level: "medium".to_string(),
            is_reversible: true,
            powershell_command: "Stop-Service -Name SysMain; Set-Service -Name SysMain -StartupType Disabled".to_string(),
            undo_command: "Set-Service -Name SysMain -StartupType Automatic; Start-Service -Name SysMain".to_string(),
            is_recommended: false,
        },
        OptimizationItem {
            id: "services_search_indexing".to_string(),
            category: "services".to_string(),
            title: "Set Windows Search Indexing to Manual".to_string(),
            description: "Configures Windows Search (WSearch) service startup type to Manual to avoid background CPU spikes.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Set-Service -Name WSearch -StartupType Manual".to_string(),
            undo_command: "Set-Service -Name WSearch -StartupType Automatic; Start-Service -Name WSearch".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "services_fax_spooler".to_string(),
            category: "services".to_string(),
            title: "Disable Fax & Legacy Print Services".to_string(),
            description: "Disables Fax service and disables automatic legacy print spooler background scanning.".to_string(),
            risk_level: "medium".to_string(),
            is_reversible: true,
            powershell_command: "Stop-Service -Name Fax -ErrorAction SilentlyContinue; Set-Service -Name Fax -StartupType Disabled".to_string(),
            undo_command: "Set-Service -Name Fax -StartupType Manual".to_string(),
            is_recommended: false,
        },
        // Category 5: ui_tweaks
        OptimizationItem {
            id: "ui_show_file_extensions".to_string(),
            category: "ui_tweaks".to_string(),
            title: "Show File Extensions in Explorer".to_string(),
            description: "Forces Windows File Explorer to display file extension suffixes for all known file types.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'HideFileExt' -Value 0 -Type DWord -Force".to_string(),
            undo_command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'HideFileExt' -Value 1 -Type DWord -Force".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "ui_show_hidden_files".to_string(),
            category: "ui_tweaks".to_string(),
            title: "Show Hidden Files & Folders".to_string(),
            description: "Configures File Explorer to reveal hidden files, system directories, and hidden items.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'Hidden' -Value 1 -Type DWord -Force".to_string(),
            undo_command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'Hidden' -Value 2 -Type DWord -Force".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "ui_classic_context_menu".to_string(),
            category: "ui_tweaks".to_string(),
            title: "Restore Classic Windows 10 Right-Click Context Menu".to_string(),
            description: "Restores classic context menu in Windows 11 Explorer without requiring Shift+F10.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: true,
            powershell_command: "New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32' -Value '' -Force".to_string(),
            undo_command: "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse -Force -ErrorAction SilentlyContinue".to_string(),
            is_recommended: true,
        },
        // Category 6: disk_cleanup
        OptimizationItem {
            id: "disk_clean_temp".to_string(),
            category: "disk_cleanup".to_string(),
            title: "Purge System & User Temp Directories".to_string(),
            description: "Safely removes temporary files and cache artifacts from Windows Temp and User Temp folders.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: false,
            powershell_command: "Remove-Item -Path \"$env:TEMP\\*\" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path \"$env:SystemRoot\\Temp\\*\" -Recurse -Force -ErrorAction SilentlyContinue".to_string(),
            undo_command: "# Temp file deletion is permanent and cannot be undone".to_string(),
            is_recommended: true,
        },
        OptimizationItem {
            id: "disk_clean_delivery_optimization".to_string(),
            category: "disk_cleanup".to_string(),
            title: "Flush Delivery Optimization Cache".to_string(),
            description: "Clears residual Windows Update Delivery Optimization cache files to free storage space.".to_string(),
            risk_level: "low".to_string(),
            is_reversible: false,
            powershell_command: "Delete-DeliveryOptimizationCache -ErrorAction SilentlyContinue".to_string(),
            undo_command: "# Cache flush cannot be undone".to_string(),
            is_recommended: true,
        },
    ]
}

pub fn get_rules_by_category(category: &str) -> Vec<OptimizationItem> {
    get_rule_catalog()
        .into_iter()
        .filter(|rule| rule.category.eq_ignore_ascii_case(category))
        .collect()
}

pub fn preview(selected_keys: &[String]) -> Result<Vec<OptimizationItem>, AppError> {
    let catalog = get_rule_catalog();
    let filtered = catalog
        .into_iter()
        .filter(|rule| selected_keys.contains(&rule.id))
        .collect();
    Ok(filtered)
}

pub fn execute_native_rule(rule_id: &str) -> Option<Result<String, String>> {
    match rule_id {
        "telemetry_diagtrack" => {
            let stop_res = crate::winapi::services::stop_service("DiagTrack");
            let cfg_res = crate::winapi::services::configure_service("DiagTrack", 4);
            if let Err(e) = stop_res {
                Some(Err(format!("Failed to stop DiagTrack: {}", e)))
            } else if let Err(e) = cfg_res {
                Some(Err(format!("Failed to configure DiagTrack: {}", e)))
            } else {
                Some(Ok("Native WinAPI: Stopped & disabled DiagTrack service with read-back verification".to_string()))
            }
        }
        "telemetry_dmwappush" => {
            let stop_res = crate::winapi::services::stop_service("dmwappushservice");
            let cfg_res = crate::winapi::services::configure_service("dmwappushservice", 4);
            if let Err(e) = stop_res {
                Some(Err(format!("Failed to stop dmwappushservice: {}", e)))
            } else if let Err(e) = cfg_res {
                Some(Err(format!("Failed to configure dmwappushservice: {}", e)))
            } else {
                Some(Ok("Native WinAPI: Stopped & disabled dmwappushservice with read-back verification".to_string()))
            }
        }
        "bloatware_cortana" => {
            match crate::winapi::registry::set_dword(
                "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search",
                "AllowCortana",
                0,
            ) {
                Ok(()) => Some(Ok("Native WinAPI: Disabled Cortana via registry with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        "privacy_advertising_id" => {
            match crate::winapi::registry::set_dword(
                "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo",
                "Enabled",
                0,
            ) {
                Ok(()) => Some(Ok("Native WinAPI: Disabled Advertising Info via registry with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        "privacy_location_tracking" => {
            match crate::winapi::registry::set_string(
                "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location",
                "Value",
                "Deny",
            ) {
                Ok(()) => Some(Ok("Native WinAPI: Disabled Location Tracking via registry with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        "privacy_activity_history" => {
            match crate::winapi::registry::set_dword(
                "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
                "PublishUserActivities",
                0,
            ) {
                Ok(()) => Some(Ok("Native WinAPI: Disabled Activity History via registry with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        "services_sysmain" => {
            let stop_res = crate::winapi::services::stop_service("SysMain");
            let cfg_res = crate::winapi::services::configure_service("SysMain", 4);
            if let Err(e) = stop_res {
                Some(Err(format!("Failed to stop SysMain: {}", e)))
            } else if let Err(e) = cfg_res {
                Some(Err(format!("Failed to configure SysMain: {}", e)))
            } else {
                Some(Ok("Native WinAPI: Stopped & disabled SysMain service with read-back verification".to_string()))
            }
        }
        "services_search_indexing" => {
            match crate::winapi::services::configure_service("WSearch", 3) {
                Ok(()) => Some(Ok("Native WinAPI: Set WSearch service to Manual with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        "services_fax_spooler" => {
            let stop_res = crate::winapi::services::stop_service("Fax");
            let cfg_res = crate::winapi::services::configure_service("Fax", 4);
            if let Err(e) = stop_res {
                Some(Err(format!("Failed to stop Fax: {}", e)))
            } else if let Err(e) = cfg_res {
                Some(Err(format!("Failed to configure Fax: {}", e)))
            } else {
                Some(Ok("Native WinAPI: Stopped & disabled Fax service with read-back verification".to_string()))
            }
        }
        "ui_show_file_extensions" => {
            match crate::winapi::registry::set_dword(
                "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
                "HideFileExt",
                0,
            ) {
                Ok(()) => Some(Ok("Native WinAPI: Set HideFileExt=0 with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        "ui_show_hidden_files" => {
            match crate::winapi::registry::set_dword(
                "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
                "Hidden",
                1,
            ) {
                Ok(()) => Some(Ok("Native WinAPI: Set Hidden=1 with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        "ui_classic_context_menu" => {
            match crate::winapi::registry::set_string(
                "HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32",
                "",
                "",
            ) {
                Ok(()) => Some(Ok("Native WinAPI: Created classic context menu CLSID key with read-back verification".to_string())),
                Err(e) => Some(Err(e)),
            }
        }
        _ => None,
    }
}

pub fn execute(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    selected_keys: &[String],
    create_restore_point: bool,
) -> Result<ExecutionSummary, AppError> {
    use tauri::Emitter;

    let start_time = std::time::Instant::now();
    log::info!(
        "[OptimizationEngine] Starting batch optimization execution for {} selected keys (is_dry_run={}, create_restore_point={})",
        selected_keys.len(),
        runner.is_dry_run(),
        create_restore_point
    );
    let rules = preview(selected_keys)?;
    let total_steps = rules.len();
    let mut executed_actions = Vec::new();
    let mut overall_success = true;

    if create_restore_point {
        log::info!("[OptimizationEngine] Auto-creating pre-optimization System Restore Point");
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 0,
                total_steps,
                message: "Creating System Restore Point...".to_string(),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }

        match crate::system_restore::create_restore_point(runner, "WiScripts Pre-Optimization Restore Point") {
            Ok(action) => {
                log::info!("[OptimizationEngine] Pre-optimization restore point created successfully");
                executed_actions.push(action);
            }
            Err(e) => {
                log::warn!("[OptimizationEngine] Failed to create restore point (non-fatal): {}", e);
                if let Some(app_handle) = app {
                    let payload = TaskProgressPayload {
                        current_step: 0,
                        total_steps,
                        message: format!("Warning: Could not create Restore Point ({}) - proceeding with optimizations.", e),
                        is_error: false,
                    };
                    let _ = app_handle.emit("task-progress", &payload);
                }
            }
        }
    }

    for (idx, rule) in rules.into_iter().enumerate() {
        let current_step = idx + 1;
        log::info!(
            "[OptimizationEngine] Executing step {}/{}: rule ID: '{}', Title: '{}'",
            current_step,
            total_steps,
            rule.id,
            rule.title
        );

        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step,
                total_steps,
                message: format!("Executing step {}/{}: {}", current_step, total_steps, rule.title),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }

        let output = if runner.is_dry_run() {
            match runner.run_powershell(&rule.powershell_command) {
                Ok(out) => out,
                Err(e) => {
                    log::error!("[OptimizationEngine] Rule '{}' failed to run in dry run: {}", rule.id, e);
                    if let Some(app_handle) = app {
                        let payload = TaskProgressPayload {
                            current_step,
                            total_steps,
                            message: format!("Failed step {}/{}: {}: {}", current_step, total_steps, rule.title, e),
                            is_error: true,
                        };
                        let _ = app_handle.emit("task-progress", &payload);
                    }
                    return Err(AppError::Execution(e));
                }
            }
        } else if let Some(native_res) = execute_native_rule(&rule.id) {
            match native_res {
                Ok(stdout_msg) => crate::runner::CommandOutput {
                    exit_code: 0,
                    stdout: stdout_msg,
                    stderr: String::new(),
                },
                Err(err_msg) => crate::runner::CommandOutput {
                    exit_code: 1,
                    stdout: String::new(),
                    stderr: err_msg,
                },
            }
        } else {
            match runner.run_powershell(&rule.powershell_command) {
                Ok(out) => out,
                Err(e) => {
                    log::error!("[OptimizationEngine] Rule '{}' failed to run: {}", rule.id, e);
                    if let Some(app_handle) = app {
                        let payload = TaskProgressPayload {
                            current_step,
                            total_steps,
                            message: format!("Failed step {}/{}: {}: {}", current_step, total_steps, rule.title, e),
                            is_error: true,
                        };
                        let _ = app_handle.emit("task-progress", &payload);
                    }
                    return Err(AppError::Execution(e));
                }
            }
        };

        let action_success = output.exit_code == 0;
        if action_success {
            log::info!(
                "[OptimizationEngine] Rule '{}' executed successfully (exit_code=0)",
                rule.id
            );
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step,
                    total_steps,
                    message: format!("Completed step {}/{}: {}", current_step, total_steps, rule.title),
                    is_error: false,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
        } else {
            overall_success = false;
            log::warn!(
                "[OptimizationEngine] Rule '{}' execution returned non-zero exit code: {}",
                rule.id,
                output.exit_code
            );
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step,
                    total_steps,
                    message: format!(
                        "Error in step {}/{}: {} (exit code {})",
                        current_step, total_steps, rule.title, output.exit_code
                    ),
                    is_error: true,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
        }

        executed_actions.push(ExecutedAction {
            id: rule.id,
            name: rule.title,
            command: rule.powershell_command,
            output,
            skipped: false,
        });
    }

    let elapsed_ms = start_time.elapsed().as_millis() as u64;
    log::info!(
        "[OptimizationEngine] Optimization batch complete: success={}, executed_actions={}, elapsed={}ms",
        overall_success,
        executed_actions.len(),
        elapsed_ms
    );

    Ok(ExecutionSummary {
        success: overall_success,
        executed_actions,
        total_duration_ms: elapsed_ms,
        is_dry_run: runner.is_dry_run(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_task_progress_payload_serialization() {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 5,
            message: "Executing step 1/5: Disable Telemetry".to_string(),
            is_error: false,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"currentStep\":1"));
        assert!(json.contains("\"totalSteps\":5"));
        assert!(json.contains("\"message\":\"Executing step 1/5: Disable Telemetry\""));
        assert!(json.contains("\"isError\":false"));
    }

    #[test]
    fn test_rule_catalog_contains_at_least_15_rules() {
        let catalog = get_rule_catalog();
        assert!(
            catalog.len() >= 15,
            "Catalog should contain at least 15 rules, found {}",
            catalog.len()
        );
    }

    #[test]
    fn test_rule_catalog_covers_all_6_categories() {
        let categories = vec![
            "telemetry",
            "bloatware",
            "privacy",
            "services",
            "ui_tweaks",
            "disk_cleanup",
        ];
        for cat in categories {
            let rules = get_rules_by_category(cat);
            assert!(
                !rules.is_empty(),
                "Category '{}' should contain at least one rule",
                cat
            );
        }
    }

    #[test]
    fn test_preview_optimizations() {
        let selected = vec![
            "telemetry_diagtrack".to_string(),
            "ui_classic_context_menu".to_string(),
        ];
        let preview_items = preview(&selected).unwrap();
        assert_eq!(preview_items.len(), 2);
        assert_eq!(preview_items[0].id, "telemetry_diagtrack");
        assert_eq!(preview_items[1].id, "ui_classic_context_menu");
    }

    #[test]
    fn test_execute_optimizations_dry_run_exact_commands() {
        // Arrange
        let runner = DryRunRunner::new();
        let selected = vec![
            "telemetry_diagtrack".to_string(),
            "privacy_advertising_id".to_string(),
            "disk_clean_temp".to_string(),
        ];

        // Act
        let summary = execute(None, &runner, &selected, false).unwrap();

        // Assert: dry run mode verified
        assert!(summary.is_dry_run, "Execution should be flagged as dry-run");
        assert!(summary.success, "Dry run execution should succeed");
        assert_eq!(summary.executed_actions.len(), 3);

        // Verify exact PowerShell strings captured in dry run runner history
        let history = runner.get_history();
        assert_eq!(history.len(), 3);
        assert_eq!(
            history[0].command,
            "Stop-Service -Name DiagTrack; Set-Service -Name DiagTrack -StartupType Disabled"
        );
        assert_eq!(
            history[1].command,
            "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Name 'Enabled' -Value 0 -Type DWord -Force"
        );
        assert_eq!(
            history[2].command,
            "Remove-Item -Path \"$env:TEMP\\*\" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path \"$env:SystemRoot\\Temp\\*\" -Recurse -Force -ErrorAction SilentlyContinue"
        );
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
            Err("Spawn process failed".to_string())
        }

        fn run_cmd(&self, _command: &str) -> Result<crate::runner::CommandOutput, String> {
            Err("Spawn process failed".to_string())
        }

        fn is_dry_run(&self) -> bool {
            false
        }
    }

    #[test]
    fn test_execute_optimizations_non_zero_exit_code() {
        let runner = FailingRunner { exit_code: 1 };
        let selected = vec!["telemetry_diagtrack".to_string()];
        let summary = execute(None, &runner, &selected, false).unwrap();

        assert!(!summary.success, "Overall success must be false on non-zero exit code");
        assert_eq!(summary.executed_actions.len(), 1);
        assert_eq!(summary.executed_actions[0].output.exit_code, 1);
        assert!(!summary.is_dry_run);
    }

    #[test]
    fn test_execute_optimizations_runner_error() {
        let runner = ErrRunner;
        let selected = vec!["disk_clean_temp".to_string()];
        let res = execute(None, &runner, &selected, false);

        assert!(res.is_err(), "Runner error should propagate as AppError::Execution");
        if let Err(AppError::Execution(msg)) = res {
            assert!(msg.contains("Spawn process failed"));
        } else {
            panic!("Expected AppError::Execution");
        }
    }

    #[test]
    fn test_execute_native_rule_mapping() {
        assert!(execute_native_rule("disk_clean_temp").is_none());
        assert!(execute_native_rule("non_existent_rule").is_none());
        assert!(execute_native_rule("ui_show_file_extensions").is_some());
        assert!(execute_native_rule("privacy_advertising_id").is_some());
    }

    #[test]
    fn test_execute_optimizations_with_create_restore_point() {
        let runner = DryRunRunner::new();
        let selected = vec!["telemetry_diagtrack".to_string()];
        let summary = execute(None, &runner, &selected, true).unwrap();

        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 2);
        assert_eq!(summary.executed_actions[0].id, "create_restore_point");
        assert_eq!(summary.executed_actions[1].id, "telemetry_diagtrack");
    }
}


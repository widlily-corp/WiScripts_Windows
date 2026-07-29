use crate::error::AppError;
use crate::runner::{CommandOutput, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub publisher: Option<String>,
    pub uninstall_string: Option<String>,
    pub display_icon: Option<String>,
    pub estimated_size_kb: Option<u64>,
    pub install_date: Option<String>,
    pub registry_path: String,
    pub is_system_component: bool,
    pub quiet_uninstall_string: Option<String>,
    pub install_location: Option<String>,
}

/// Parses an uninstaller command line string into an executable program path and argument list.
pub fn parse_uninstall_string(raw_cmd: &str) -> (String, Vec<String>) {
    let trimmed = raw_cmd.trim();
    if trimmed.is_empty() {
        return (String::new(), Vec::new());
    }

    // 1. MSI Installer Guid or msiexec check
    if trimmed.to_lowercase().contains("msiexec")
        || (trimmed.starts_with('{') && trimmed.contains('}'))
    {
        if let Some(start) = trimmed.find('{') {
            if let Some(end) = trimmed[start..].find('}') {
                let guid = &trimmed[start..start + end + 1];
                let mut args = vec!["/x".to_string(), guid.to_string()];
                if trimmed.to_lowercase().contains("/qn")
                    || trimmed.to_lowercase().contains("/quiet")
                {
                    args.push("/qn".to_string());
                }
                return ("msiexec.exe".to_string(), args);
            }
        }
    }

    // 2. Quoted Executable Path
    if trimmed.starts_with('"') {
        if let Some(close_quote) = trimmed[1..].find('"') {
            let exe_path = &trimmed[1..close_quote + 1];
            let remainder = trimmed[close_quote + 2..].trim();
            let args = split_arguments(remainder);
            return (exe_path.to_string(), args);
        }
    }

    // 3. Unquoted Executable Path ending with .exe
    if let Some(exe_idx) = trimmed.to_lowercase().find(".exe") {
        let exe_end = exe_idx + 4;
        let exe_path = &trimmed[..exe_end];
        let remainder = trimmed[exe_end..].trim();
        let args = split_arguments(remainder);
        return (exe_path.to_string(), args);
    }

    // 4. Fallback splitting by spaces
    let parts = split_arguments(trimmed);
    if parts.is_empty() {
        (trimmed.to_string(), Vec::new())
    } else {
        (parts[0].clone(), parts[1..].to_vec())
    }
}

fn split_arguments(args_str: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in args_str.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

/// Scans the Windows Registry across HKLM (64-bit), HKLM (32-bit/WOW64), and HKCU for installed applications.
pub fn get_installed_apps() -> Result<Vec<InstalledApp>, AppError> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut apps = Vec::new();

        let hives = [
            (
                HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_READ | KEY_WOW64_64KEY,
                r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
            (
                HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_READ | KEY_WOW64_32KEY,
                r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
            (
                HKEY_CURRENT_USER,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_READ,
                r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
        ];

        for (hkey, subpath, flags, display_base_path) in hives {
            let root = RegKey::predef(hkey);
            let uninstall_key = match root.open_subkey_with_flags(subpath, flags) {
                Ok(k) => k,
                Err(e) => {
                    log::warn!(
                        "[Uninstaller] Failed to open registry subkey '{}': {}",
                        display_base_path,
                        e
                    );
                    continue;
                }
            };

            for key_name in uninstall_key.enum_keys().flatten() {
                let app_key = match uninstall_key.open_subkey_with_flags(&key_name, KEY_READ) {
                    Ok(k) => k,
                    Err(_) => continue,
                };

                let display_name: String = match app_key.get_value("DisplayName") {
                    Ok(name) => name,
                    Err(_) => continue,
                };

                let clean_name = display_name.trim();
                if clean_name.is_empty() {
                    continue;
                }

                // Filter system components if SystemComponent == 1
                let system_comp_dword: u32 = app_key.get_value("SystemComponent").unwrap_or(0);
                let is_system_component = system_comp_dword == 1;

                // Filter updates if ParentKeyName is present
                let parent_key: Option<String> = app_key.get_value("ParentKeyName").ok();
                if parent_key.is_some() && !parent_key.as_ref().unwrap().trim().is_empty() {
                    continue;
                }

                let display_version: Option<String> = app_key.get_value("DisplayVersion").ok();
                let publisher: Option<String> = app_key.get_value("Publisher").ok();
                let uninstall_string: Option<String> = app_key.get_value("UninstallString").ok();
                let quiet_uninstall_string: Option<String> =
                    app_key.get_value("QuietUninstallString").ok();
                let display_icon: Option<String> = app_key.get_value("DisplayIcon").ok();
                let install_date: Option<String> = app_key.get_value("InstallDate").ok();
                let install_location: Option<String> = app_key.get_value("InstallLocation").ok();

                let estimated_size_kb: Option<u64> = app_key
                    .get_value::<u32, _>("EstimatedSize")
                    .ok()
                    .map(|kb| kb as u64);

                let id = format!("{}_{}", key_name, clean_name.replace(' ', "_"));

                apps.push(InstalledApp {
                    id,
                    name: clean_name.to_string(),
                    version: display_version,
                    publisher,
                    uninstall_string,
                    quiet_uninstall_string,
                    display_icon,
                    estimated_size_kb,
                    install_date,
                    install_location,
                    registry_path: format!(r"{}\{}", display_base_path, key_name),
                    is_system_component,
                });
            }
        }

        // Deduplicate by (name, version)
        let mut seen = HashSet::new();
        let mut deduplicated = Vec::new();

        for app in apps {
            let key = (
                app.name.to_lowercase(),
                app.version.clone().unwrap_or_default(),
            );
            if !seen.contains(&key) {
                seen.insert(key);
                deduplicated.push(app);
            }
        }

        log::info!(
            "[Uninstaller] Registry scan complete. Found {} unique apps.",
            deduplicated.len()
        );
        Ok(deduplicated)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

/// Triggers uninstallation for an installed application.
pub fn uninstall_app(app: &InstalledApp, dry_run: bool) -> Result<ExecutionSummary, AppError> {
    let start_time = Instant::now();
    let raw_cmd = app
        .uninstall_string
        .as_deref()
        .or(app.quiet_uninstall_string.as_deref())
        .ok_or_else(|| {
            AppError::Execution("No uninstall string found for application".to_string())
        })?;

    let (program, args) = parse_uninstall_string(raw_cmd);
    let full_command = if args.is_empty() {
        program.clone()
    } else {
        format!("{} {}", program, args.join(" "))
    };

    if dry_run {
        log::info!(
            "[Uninstaller] [DRY-RUN] Simulating uninstallation for '{}' via command: {}",
            app.name,
            full_command
        );
        return Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: format!("uninstall_{}", app.id),
                name: format!("Uninstall {}", app.name),
                command: full_command,
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!("[DRY-RUN] Simulated uninstallation of {}", app.name),
                    stderr: String::new(),
                },
                skipped: false,
            }],
            total_duration_ms: start_time.elapsed().as_millis() as u64,
            is_dry_run: true,
        });
    }

    log::info!(
        "[Uninstaller] Executing uninstallation for '{}' via command: {}",
        app.name,
        full_command
    );

    let spawn_res = std::process::Command::new(&program)
        .stdin(std::process::Stdio::null())
        .args(&args)
        .spawn();

    match spawn_res {
        Ok(_child) => Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: format!("uninstall_{}", app.id),
                name: format!("Uninstall {}", app.name),
                command: full_command,
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!("Successfully spawned uninstaller process for {}", app.name),
                    stderr: String::new(),
                },
                skipped: false,
            }],
            total_duration_ms: start_time.elapsed().as_millis() as u64,
            is_dry_run: false,
        }),
        Err(err) => {
            let is_elevation_err = err.raw_os_error() == Some(740)
                || err.kind() == std::io::ErrorKind::PermissionDenied;

            if is_elevation_err {
                #[cfg(target_os = "windows")]
                {
                    use std::ffi::OsStr;
                    use std::os::windows::ffi::OsStrExt;
                    use windows::core::PCWSTR;
                    use windows::Win32::UI::Shell::ShellExecuteW;
                    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

                    log::warn!(
                        "[Uninstaller] Standard spawn failed with elevation error (740/PermissionDenied). Falling back to ShellExecuteW runas verb for '{}'",
                        app.name
                    );

                    let verb_u16: Vec<u16> = OsStr::new("runas")
                        .encode_wide()
                        .chain(std::iter::once(0))
                        .collect();
                    let file_u16: Vec<u16> = OsStr::new(&program)
                        .encode_wide()
                        .chain(std::iter::once(0))
                        .collect();
                    let args_joined = args.join(" ");
                    let args_u16: Vec<u16> = OsStr::new(&args_joined)
                        .encode_wide()
                        .chain(std::iter::once(0))
                        .collect();

                    let res = unsafe {
                        ShellExecuteW(
                            None,
                            PCWSTR(verb_u16.as_ptr()),
                            PCWSTR(file_u16.as_ptr()),
                            PCWSTR(args_u16.as_ptr()),
                            PCWSTR::null(),
                            SW_SHOWNORMAL,
                        )
                    };

                    if (res.0 as usize) > 32 {
                        return Ok(ExecutionSummary {
                            success: true,
                            executed_actions: vec![ExecutedAction {
                                id: format!("uninstall_{}", app.id),
                                name: format!("Uninstall {}", app.name),
                                command: full_command,
                                output: CommandOutput {
                                    exit_code: 0,
                                    stdout: format!(
                                        "Launched elevated uninstaller via ShellExecuteW runas for {}",
                                        app.name
                                    ),
                                    stderr: String::new(),
                                },
                                skipped: false,
                            }],
                            total_duration_ms: start_time.elapsed().as_millis() as u64,
                            is_dry_run: false,
                        });
                    } else {
                        return Err(AppError::Execution(format!(
                            "Elevated launch via ShellExecuteW failed with OS error code {}",
                            res.0 as usize
                        )));
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    return Err(AppError::Execution(format!(
                        "Failed to execute uninstaller process: {}",
                        err
                    )));
                }
            } else {
                Err(AppError::Execution(format!(
                    "Failed to execute uninstaller process '{}': {}",
                    program, err
                )))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "windows")]
    fn test_get_installed_apps_returns_at_least_5_apps() {
        let apps = get_installed_apps().expect("Failed to scan Windows registry for apps");
        let apps_with_uninstall_string: Vec<_> = apps
            .iter()
            .filter(|app| {
                app.uninstall_string
                    .as_ref()
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false)
            })
            .collect();

        println!(
            "Scanned {} total apps, {} have valid uninstall strings.",
            apps.len(),
            apps_with_uninstall_string.len()
        );

        for app in apps_with_uninstall_string.iter().take(5) {
            println!(
                "App: '{}', Version: '{:?}', Uninstall: '{:?}'",
                app.name, app.version, app.uninstall_string
            );
        }

        assert!(
            apps_with_uninstall_string.len() >= 5,
            "Expected at least 5 installed apps with non-empty uninstall_string, found {}",
            apps_with_uninstall_string.len()
        );
    }

    #[test]
    fn test_parse_uninstall_string_msi() {
        let raw = "msiexec.exe /I{12345678-1234-1234-1234-1234567890AB}";
        let (prog, args) = parse_uninstall_string(raw);
        assert_eq!(prog, "msiexec.exe");
        assert_eq!(args, vec!["/x", "{12345678-1234-1234-1234-1234567890AB}"]);
    }

    #[test]
    fn test_parse_uninstall_string_quoted() {
        let raw = "\"C:\\Program Files\\TestApp\\uninstall.exe\" /S /all";
        let (prog, args) = parse_uninstall_string(raw);
        assert_eq!(prog, "C:\\Program Files\\TestApp\\uninstall.exe");
        assert_eq!(args, vec!["/S", "/all"]);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_registry_scanner_system_component_and_filtering() {
        let apps = get_installed_apps().expect("Failed to scan registry");
        let system_components: Vec<_> = apps.iter().filter(|a| a.is_system_component).collect();
        let user_apps: Vec<_> = apps.iter().filter(|a| !a.is_system_component).collect();

        println!(
            "Registry scan result: {} total apps (User apps: {}, System components: {})",
            apps.len(),
            user_apps.len(),
            system_components.len()
        );

        // Ensure user apps exist
        assert!(
            !user_apps.is_empty(),
            "Expected at least one non-system user app"
        );

        // Verify deduplication: no two apps have identical (name.to_lowercase(), version)
        let mut seen = std::collections::HashSet::new();
        for app in &apps {
            let key = (
                app.name.to_lowercase(),
                app.version.clone().unwrap_or_default(),
            );
            assert!(
                seen.insert(key.clone()),
                "Duplicate app found after scan: {:?}",
                key
            );
        }
    }
}

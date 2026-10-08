use crate::error::AppError;
use crate::runner::{CommandOutput, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};
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
    #[serde(default)]
    pub is_ghost: bool,
}

/// Escapes an argument string according to Windows CommandLineToArgvW rules.
pub fn escape_cmd_arg(arg: &str) -> String {
    if arg.is_empty() {
        return "\"\"".to_string();
    }
    if !arg.contains(&[' ', '\t', '\n', '\x0b', '"'][..]) {
        return arg.to_string();
    }
    let mut escaped = String::from("\"");
    let mut backslashes = 0;
    for ch in arg.chars() {
        if ch == '\\' {
            backslashes += 1;
        } else if ch == '"' {
            escaped.push_str(&"\\".repeat(backslashes * 2 + 1));
            escaped.push('"');
            backslashes = 0;
        } else {
            escaped.push_str(&"\\".repeat(backslashes));
            escaped.push(ch);
            backslashes = 0;
        }
    }
    escaped.push_str(&"\\".repeat(backslashes * 2));
    escaped.push('"');
    escaped
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
    if let Some(stripped) = trimmed.strip_prefix('"') {
        if let Some(close_quote) = stripped.find('"') {
            let exe_path = &stripped[..close_quote];
            let remainder = stripped[close_quote + 1..].trim();
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

/// Expands Windows environment variables like `%ProgramFiles%` in a path string.
pub fn expand_env_vars(input: &str) -> String {
    let mut result = String::new();
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut var_name = String::new();
            let mut closed = false;
            while let Some(&next_c) = chars.peek() {
                chars.next();
                if next_c == '%' {
                    closed = true;
                    break;
                }
                var_name.push(next_c);
            }
            if closed && !var_name.is_empty() {
                if let Ok(val) = std::env::var(&var_name) {
                    result.push_str(&val);
                } else {
                    result.push('%');
                    result.push_str(&var_name);
                    result.push('%');
                }
            } else {
                result.push('%');
                result.push_str(&var_name);
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// Checks whether an installed application is a ghost entry (orphaned registry item
/// whose uninstaller executable or installation directory no longer exists on disk).
pub fn check_is_ghost(
    uninstall_string: Option<&str>,
    quiet_uninstall_string: Option<&str>,
    install_location: Option<&str>,
) -> bool {
    // 1. Check install_location if present and non-empty
    if let Some(loc) = install_location {
        let trimmed_loc = expand_env_vars(loc.trim().trim_matches('"'));
        if !trimmed_loc.is_empty() {
            let p = std::path::Path::new(&trimmed_loc);
            if p.is_absolute() && !p.exists() {
                return true;
            }
        }
    }

    // 2. Check uninstaller executable
    let raw_cmd = uninstall_string.or(quiet_uninstall_string);
    if let Some(cmd) = raw_cmd {
        let (prog, _) = parse_uninstall_string(cmd);
        let prog_lower = prog.to_lowercase();
        // Skip system helpers and msiexec
        if !prog_lower.is_empty()
            && !prog_lower.contains("msiexec")
            && !prog_lower.contains("rundll32")
            && !prog_lower.ends_with("cmd.exe")
            && !prog_lower.ends_with("powershell.exe")
        {
            let expanded_prog = expand_env_vars(prog.trim().trim_matches('"'));
            let path = std::path::Path::new(&expanded_prog);
            if path.is_absolute() {
                if !path.exists() && !path.with_extension("exe").exists() {
                    return true;
                }
            } else if expanded_prog.contains('\\') || expanded_prog.contains('/') {
                if !path.exists() && !path.with_extension("exe").exists() {
                    return true;
                }
            }
        }
    }

    false
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

                let is_ghost = check_is_ghost(
                    uninstall_string.as_deref(),
                    quiet_uninstall_string.as_deref(),
                    install_location.as_deref(),
                );

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
                    is_ghost,
                });
            }
        }

        // Deduplicate by (name, version), preferring non-ghost entries
        let mut deduplicated: Vec<InstalledApp> = Vec::new();
        let mut seen_indices: std::collections::HashMap<(String, String), usize> =
            std::collections::HashMap::new();

        for app in apps {
            let key = (
                app.name.to_lowercase(),
                app.version.clone().unwrap_or_default(),
            );
            if let Some(&existing_idx) = seen_indices.get(&key) {
                if deduplicated[existing_idx].is_ghost && !app.is_ghost {
                    deduplicated[existing_idx] = app;
                }
            } else {
                seen_indices.insert(key, deduplicated.len());
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

/// Safely removes an orphaned application subkey from the Windows registry (HKLM or HKCU Uninstall keys).
pub fn remove_installed_app_entry(registry_path: &str) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let trimmed = registry_path.trim();
        let trimmed_lower = trimmed.to_lowercase();

        let (root_hive, subpath, flags, key_name) = if trimmed_lower
            .starts_with(r"hklm\software\wow6432node\microsoft\windows\currentversion\uninstall\")
        {
            (
                HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_ALL_ACCESS | KEY_WOW64_32KEY,
                &trimmed[r"hklm\software\wow6432node\microsoft\windows\currentversion\uninstall\".len()..],
            )
        } else if trimmed_lower
            .starts_with(r"hklm\software\microsoft\windows\currentversion\uninstall\")
        {
            (
                HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_ALL_ACCESS | KEY_WOW64_64KEY,
                &trimmed[r"hklm\software\microsoft\windows\currentversion\uninstall\".len()..],
            )
        } else if trimmed_lower
            .starts_with(r"hkcu\software\microsoft\windows\currentversion\uninstall\")
        {
            (
                HKEY_CURRENT_USER,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                KEY_ALL_ACCESS,
                &trimmed[r"hkcu\software\microsoft\windows\currentversion\uninstall\".len()..],
            )
        } else {
            return Err(AppError::InvalidConfig(format!(
                "Refusing to remove unauthorized registry path: '{}'. Only Uninstall hive entries can be removed.",
                registry_path
            )));
        };

        let key_name = key_name.trim();
        if key_name.is_empty()
            || key_name.contains('\\')
            || key_name.contains('/')
            || key_name == "."
            || key_name == ".."
        {
            return Err(AppError::InvalidConfig(format!(
                "Invalid subkey name for uninstaller entry: '{}'",
                key_name
            )));
        }

        let root = RegKey::predef(root_hive);
        let parent_key = root
            .open_subkey_with_flags(subpath, flags)
            .map_err(|e| {
                AppError::Execution(format!(
                    "Failed to open parent uninstall registry key with write permissions: {}",
                    e
                ))
            })?;

        match parent_key.delete_subkey_all(key_name) {
            Ok(_) => {
                log::info!(
                    "[Uninstaller] Successfully removed orphan registry entry: '{}'",
                    registry_path
                );
                Ok(())
            }
            Err(e) if e.raw_os_error() == Some(2) => {
                log::warn!(
                    "[Uninstaller] Registry entry was already deleted or not found: '{}'",
                    registry_path
                );
                Ok(())
            }
            Err(e) => {
                log::error!(
                    "[Uninstaller] Failed to delete registry subkey '{}': {}",
                    key_name,
                    e
                );
                Err(AppError::Execution(format!(
                    "Failed to remove uninstaller registry entry '{}': {}",
                    key_name, e
                )))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = registry_path;
        Ok(())
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
                    let args_joined = args
                        .iter()
                        .map(|arg| escape_cmd_arg(arg))
                        .collect::<Vec<_>>()
                        .join(" ");
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
                        Ok(ExecutionSummary {
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
                        })
                    } else if (res.0 as usize) == 2 {
                        Err(AppError::Execution(format!(
                            "Uninstaller executable not found (FileNotFound): '{}'. The application files may have been deleted manually.",
                            program
                        )))
                    } else {
                        Err(AppError::Execution(format!(
                            "Elevated launch via ShellExecuteW failed with OS error code {}",
                            res.0 as usize
                        )))
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    return Err(AppError::Execution(format!(
                        "Failed to execute uninstaller process: {}",
                        err
                    )));
                }
            } else if err.kind() == std::io::ErrorKind::NotFound || err.raw_os_error() == Some(2) {
                Err(AppError::Execution(format!(
                    "Uninstaller executable not found (FileNotFound): '{}'. The application files may have been deleted manually.",
                    program
                )))
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

    #[test]
    fn test_format_shellexecute_args() {
        let args = [
            "/S".to_string(),
            "/dir=C:\\Program Files\\App".to_string(),
            "/name=\"My App\"".to_string(),
        ];
        let args_joined = args
            .iter()
            .map(|arg| escape_cmd_arg(arg))
            .collect::<Vec<_>>()
            .join(" ");
        assert_eq!(
            args_joined,
            "/S \"/dir=C:\\Program Files\\App\" \"/name=\\\"My App\\\"\""
        );
    }

    #[test]
    fn test_escape_cmd_arg_cases() {
        assert_eq!(escape_cmd_arg("C:\\Program Files\\"), "\"C:\\Program Files\\\\\"");
        assert_eq!(escape_cmd_arg("arg with \"quotes\""), "\"arg with \\\"quotes\\\"\"");
        assert_eq!(escape_cmd_arg("simple"), "simple");
        assert_eq!(escape_cmd_arg(""), "\"\"");
    }

    #[test]
    fn test_check_is_ghost_nonexistent_executable() {
        let is_ghost = check_is_ghost(
            Some(r#""C:\NonExistentDirectory_WiScripts_9999\uninstall.exe" /S"#),
            None,
            None,
        );
        assert!(is_ghost);
    }

    #[test]
    fn test_check_is_ghost_nonexistent_install_location() {
        let is_ghost = check_is_ghost(
            None,
            None,
            Some(r#"C:\NonExistentDirectory_WiScripts_9999"#),
        );
        assert!(is_ghost);
    }

    #[test]
    fn test_check_is_ghost_msiexec_not_ghost_by_default() {
        let is_ghost = check_is_ghost(
            Some(r#"msiexec.exe /X{12345678-ABCD-1234-ABCD-1234567890AB}"#),
            None,
            None,
        );
        assert!(!is_ghost);
    }

    #[test]
    fn test_remove_installed_app_entry_rejects_unauthorized_key() {
        let res = remove_installed_app_entry(r#"HKLM\SYSTEM\CurrentControlSet\Services\SomeService"#);
        assert!(res.is_err());
    }
}


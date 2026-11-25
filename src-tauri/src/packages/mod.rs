use crate::error::AppError;
use crate::odt::escape_powershell_literal;
use crate::optimization::TaskProgressPayload;
use crate::runner::{decode_bytes, CommandOutput, CommandRunner, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Validates a winget search query against control characters and shell metacharacters.
pub fn validate_winget_query(query: &str) -> Result<&str, AppError> {
    let clean = query.trim();
    if clean.len() > 200 {
        return Err(AppError::InvalidConfig(
            "Search query exceeds maximum length of 200 characters".to_string(),
        ));
    }
    if clean.chars().any(|c| {
        c.is_control()
            || matches!(
                c,
                '"' | '\'' | '`' | '$' | ';' | '|' | '&' | '<' | '>' | '(' | ')' | '{' | '}'
            )
    }) {
        return Err(AppError::InvalidConfig(
            "Search query contains forbidden control or shell characters".to_string(),
        ));
    }
    Ok(clean)
}

/// Validates a winget package ID (e.g. `Publisher.Package-Name`).
pub fn validate_winget_package_id(package_id: &str) -> Result<&str, AppError> {
    let clean = package_id.trim();
    if clean.is_empty() {
        return Err(AppError::InvalidConfig(
            "Package ID cannot be empty".to_string(),
        ));
    }
    if clean.len() > 256 {
        return Err(AppError::InvalidConfig(
            "Package ID exceeds maximum length".to_string(),
        ));
    }
    if !clean
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
    {
        return Err(AppError::InvalidConfig(format!(
            "Package ID '{}' contains invalid characters",
            clean
        )));
    }
    Ok(clean)
}

/// Validates a UWP PackageFullName (e.g. `Microsoft.YourPhone_1.23082.128.0_x64__8wekyb3d8bbwe`).
pub fn validate_uwp_package_full_name(package_full_name: &str) -> Result<&str, AppError> {
    let clean = package_full_name.trim();
    if clean.is_empty() {
        return Err(AppError::InvalidConfig(
            "Package full name cannot be empty".to_string(),
        ));
    }
    if clean.len() > 256 {
        return Err(AppError::InvalidConfig(
            "Package full name exceeds maximum length".to_string(),
        ));
    }
    if !clean
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '~'))
    {
        return Err(AppError::InvalidConfig(format!(
            "UWP package full name '{}' contains invalid characters",
            clean
        )));
    }
    Ok(clean)
}

/// Spawns `winget.exe` directly without an intermediate PowerShell shell.
fn run_winget_direct(args: &[&str], timeout_secs: u64) -> Result<CommandOutput, String> {
    let mut cmd = Command::new("winget.exe");
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn winget.exe: {}", e))?;

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture winget stdout".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture winget stderr".to_string())?;

    let stdout_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::copy(&mut stdout_pipe, &mut buf);
        buf
    });
    let stderr_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::copy(&mut stderr_pipe, &mut buf);
        buf
    });

    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        let child_pid = child.id();
        match child.try_wait() {
            Ok(Some(status)) => {
                let exit_code = status.code().unwrap_or(-1);
                let stdout = decode_bytes(&stdout_handle.join().unwrap_or_default());
                let stderr = decode_bytes(&stderr_handle.join().unwrap_or_default());
                return Ok(CommandOutput {
                    exit_code,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    crate::script_runner::kill_process_tree(child_pid);
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_handle.join();
                    let _ = stderr_handle.join();
                    return Err(format!(
                        "winget.exe execution timed out after {} seconds",
                        timeout_secs
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                crate::script_runner::kill_process_tree(child_pid);
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err(format!("Error waiting for winget.exe: {}", e));
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WingetPackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UwpAppInfo {
    pub name: String,
    pub package_full_name: String,
    pub publisher_id: String,
    pub is_framework: bool,
}

/// Searches for packages using Windows Package Manager (winget).
pub fn winget_search(
    runner: &dyn CommandRunner,
    query: &str,
) -> Result<Vec<WingetPackage>, AppError> {
    let clean_query = validate_winget_query(query)?;
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    log::info!(
        "[PackagesEngine] Searching winget packages for query: '{}'",
        clean_query
    );

    let output = if runner.is_native_enabled() {
        run_winget_direct(
            &["search", "--query", clean_query, "--accept-source-agreements"],
            60,
        )
        .map_err(AppError::Execution)?
    } else {
        let script = format!(
            "winget search --query \"{}\" --accept-source-agreements",
            clean_query
        );
        runner
            .run_powershell(&script)
            .map_err(AppError::Execution)?
    };

    if runner.is_dry_run() || output.stdout.contains("[DRY-RUN]") {
        log::info!("[PackagesEngine] [DRY-RUN] Returning simulated Winget package search results");
        return Ok(vec![
            WingetPackage {
                id: format!("{}.Package", clean_query),
                name: format!("{} Application", clean_query),
                version: "1.0.0".to_string(),
                source: "winget".to_string(),
            },
            WingetPackage {
                id: "7zip.7zip".to_string(),
                name: "7-Zip".to_string(),
                version: "23.01".to_string(),
                source: "winget".to_string(),
            },
            WingetPackage {
                id: "Git.Git".to_string(),
                name: "Git".to_string(),
                version: "2.43.0".to_string(),
                source: "winget".to_string(),
            },
        ]);
    }

    let mut packages = Vec::new();
    let stdout = output.stdout;
    let lines: Vec<&str> = stdout.lines().collect();

    let mut past_header = false;
    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with("---") {
            past_header = true;
            continue;
        }

        if !past_header {
            continue;
        }

        if trimmed.is_empty() {
            continue;
        }

        // Winget table columns are spaced out by whitespace.
        // We split by multiple spaces to get components.
        let parts: Vec<&str> = line.split("  ").filter(|p| !p.trim().is_empty()).collect();
        if parts.len() >= 2 {
            let name = parts[0].trim().to_string();
            let id = parts[1].trim().to_string();
            let version = if parts.len() >= 3 {
                parts[2].trim().to_string()
            } else {
                "Unknown".to_string()
            };
            let source = if parts.len() >= 4 {
                parts[3].trim().to_string()
            } else {
                "winget".to_string()
            };

            packages.push(WingetPackage {
                id,
                name,
                version,
                source,
            });
        }
    }

    log::info!(
        "[PackagesEngine] Found {} packages for query '{}'",
        packages.len(),
        clean_query
    );
    Ok(packages)
}

/// Installs a specified winget package by package ID.
pub fn winget_install(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    package_id: &str,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    let clean_id = validate_winget_package_id(package_id)?;

    log::info!(
        "[PackagesEngine] Installing package: '{}' (dry_run={})",
        clean_id,
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: format!("Installing package: {}", clean_id),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let command = format!(
        "winget install --id \"{}\" --exact --silent --accept-source-agreements --accept-package-agreements",
        clean_id
    );

    let output = if runner.is_native_enabled() && !dry_run {
        run_winget_direct(
            &[
                "install",
                "--id",
                clean_id,
                "--exact",
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ],
            600,
        )
        .map_err(AppError::Execution)?
    } else {
        runner
            .run_powershell(&command)
            .map_err(AppError::Execution)?
    };
    let is_success = output.exit_code == 0;

    if is_success {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Successfully installed package: {}", clean_id),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!(
                    "Failed to install package: {} (exit code {})",
                    clean_id, output.exit_code
                ),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: format!("winget_install_{}", clean_id),
        name: format!("Winget Install Package: {}", clean_id),
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

/// Updates/Upgrades a specified winget package by package ID.
pub fn winget_update(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    package_id: &str,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    let clean_id = validate_winget_package_id(package_id)?;

    log::info!(
        "[PackagesEngine] Updating package: '{}' (dry_run={})",
        clean_id,
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: format!("Updating package: {}", clean_id),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let command = format!(
        "winget upgrade --id \"{}\" --exact --silent --accept-source-agreements --accept-package-agreements",
        clean_id
    );

    let output = if runner.is_native_enabled() && !dry_run {
        run_winget_direct(
            &[
                "upgrade",
                "--id",
                clean_id,
                "--exact",
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ],
            600,
        )
        .map_err(AppError::Execution)?
    } else {
        runner
            .run_powershell(&command)
            .map_err(AppError::Execution)?
    };
    let is_success = output.exit_code == 0;

    if is_success {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Successfully updated package: {}", clean_id),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!(
                    "Failed to update package: {} (exit code {})",
                    clean_id, output.exit_code
                ),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: format!("winget_update_{}", clean_id),
        name: format!("Winget Update Package: {}", clean_id),
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

/// Retrieves list of installed UWP/AppX packages for debloat management.
pub fn get_uwp_apps(runner: &dyn CommandRunner) -> Result<Vec<UwpAppInfo>, AppError> {
    log::info!("[PackagesEngine] Querying installed UWP AppX packages");

    let script = "Get-AppxPackage -AllUsers | Select-Object Name, PackageFullName, PublisherId, IsFramework | ConvertTo-Json -Compress";

    let output = runner.run_powershell(script).map_err(AppError::Execution)?;

    if runner.is_dry_run() || output.stdout.contains("[DRY-RUN]") {
        log::info!("[PackagesEngine] [DRY-RUN] Returning simulated UWP app listing");
        return Ok(vec![
            UwpAppInfo {
                name: "Microsoft.54482D60F4E4D".to_string(),
                package_full_name: "Microsoft.54482D60F4E4D_11.2307.4.0_x64__8wekyb3d8bbwe"
                    .to_string(),
                publisher_id: "8wekyb3d8bbwe".to_string(),
                is_framework: false,
            },
            UwpAppInfo {
                name: "Microsoft.YourPhone".to_string(),
                package_full_name: "Microsoft.YourPhone_1.23082.128.0_x64__8wekyb3d8bbwe"
                    .to_string(),
                publisher_id: "8wekyb3d8bbwe".to_string(),
                is_framework: false,
            },
            UwpAppInfo {
                name: "Microsoft.BingNews".to_string(),
                package_full_name: "Microsoft.BingNews_4.55.31201.0_x64__8wekyb3d8bbwe".to_string(),
                publisher_id: "8wekyb3d8bbwe".to_string(),
                is_framework: false,
            },
            UwpAppInfo {
                name: "Microsoft.XboxApp".to_string(),
                package_full_name: "Microsoft.XboxApp_48.89.25001.0_x64__8wekyb3d8bbwe".to_string(),
                publisher_id: "8wekyb3d8bbwe".to_string(),
                is_framework: false,
            },
        ]);
    }

    let stdout = output.stdout.trim();
    if stdout.is_empty() {
        return Ok(Vec::new());
    }

    #[derive(Deserialize)]
    struct RawUwpApp {
        #[serde(rename = "Name")]
        name: Option<String>,
        #[serde(rename = "PackageFullName")]
        package_full_name: Option<String>,
        #[serde(rename = "PublisherId")]
        publisher_id: Option<String>,
        #[serde(rename = "IsFramework")]
        is_framework: Option<bool>,
    }

    let raw_apps: Vec<RawUwpApp> = if stdout.starts_with('[') {
        serde_json::from_str(stdout).map_err(|e| {
            AppError::Execution(format!("Failed to parse UWP apps JSON array: {}", e))
        })?
    } else if stdout.starts_with('{') {
        let single: RawUwpApp = serde_json::from_str(stdout).map_err(|e| {
            AppError::Execution(format!("Failed to parse UWP app JSON object: {}", e))
        })?;
        vec![single]
    } else {
        Vec::new()
    };

    let apps = raw_apps
        .into_iter()
        .filter_map(|raw| {
            let name = raw.name?;
            let package_full_name = raw.package_full_name?;
            Some(UwpAppInfo {
                name,
                package_full_name,
                publisher_id: raw.publisher_id.unwrap_or_default(),
                is_framework: raw.is_framework.unwrap_or(false),
            })
        })
        .collect();

    Ok(apps)
}

/// Removes a UWP app package by full package name.
pub fn remove_uwp_app(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    package_full_name: &str,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    let clean_full_name = validate_uwp_package_full_name(package_full_name)?;

    log::info!(
        "[PackagesEngine] Removing UWP app: '{}' (dry_run={})",
        clean_full_name,
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: format!("Removing UWP Package: {}", clean_full_name),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let escaped_name = escape_powershell_literal(clean_full_name);
    let command = format!(
        "Get-AppxPackage -AllUsers | Where-Object {{ $_.PackageFullName -eq {} }} | Remove-AppxPackage -AllUsers -ErrorAction Stop",
        escaped_name
    );

    let output = runner
        .run_powershell(&command)
        .map_err(AppError::Execution)?;
    let is_success = output.exit_code == 0;

    if is_success {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Successfully removed UWP Package: {}", clean_full_name),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!(
                    "Failed to remove UWP Package: {} (exit code {})",
                    clean_full_name, output.exit_code
                ),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: format!("remove_uwp_{}", clean_full_name),
        name: format!("Remove UWP Package: {}", clean_full_name),
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
    fn test_winget_search_dry_run() {
        let runner = DryRunRunner::new();
        let packages = winget_search(&runner, "git").unwrap();

        assert!(!packages.is_empty());
        assert!(packages
            .iter()
            .any(|p| p.id == "Git.Git" || p.id.contains("git")));
    }

    #[test]
    fn test_winget_search_empty_query() {
        let runner = DryRunRunner::new();
        let packages = winget_search(&runner, "   ").unwrap();
        assert!(packages.is_empty());
    }

    #[test]
    fn test_winget_install_dry_run() {
        let runner = DryRunRunner::new();
        let summary = winget_install(None, &runner, "Git.Git", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0]
            .command
            .contains("winget install --id \"Git.Git\""));
    }

    #[test]
    fn test_winget_install_empty_id() {
        let runner = DryRunRunner::new();
        let res = winget_install(None, &runner, "", true);
        assert!(res.is_err());
    }

    #[test]
    fn test_winget_update_dry_run() {
        let runner = DryRunRunner::new();
        let summary = winget_update(None, &runner, "7zip.7zip", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0]
            .command
            .contains("winget upgrade --id \"7zip.7zip\""));
    }

    #[test]
    fn test_get_uwp_apps_dry_run() {
        let runner = DryRunRunner::new();
        let apps = get_uwp_apps(&runner).unwrap();

        assert!(!apps.is_empty());
        assert!(apps.iter().any(|a| a.name.contains("YourPhone")
            || a.name.contains("XboxApp")
            || a.name.contains("Microsoft")));
    }

    #[test]
    fn test_remove_uwp_app_dry_run() {
        let runner = DryRunRunner::new();
        let summary = remove_uwp_app(
            None,
            &runner,
            "Microsoft.YourPhone_1.23082.128.0_x64__8wekyb3d8bbwe",
            true,
        )
        .unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0]
            .command
            .contains("Remove-AppxPackage"));
    }

    #[test]
    fn test_remove_uwp_app_empty_name() {
        let runner = DryRunRunner::new();
        let res = remove_uwp_app(None, &runner, "", true);
        assert!(res.is_err());
    }

    #[test]
    fn test_winget_and_uwp_injection_validation() {
        let runner = DryRunRunner::new();
        assert!(winget_search(&runner, "git\"; calc.exe").is_err());
        assert!(winget_search(&runner, "$(whoami)").is_err());
        assert!(winget_install(None, &runner, "Git.Git; calc.exe", true).is_err());
        assert!(winget_install(None, &runner, "Git.Git\" --force", true).is_err());
        assert!(winget_update(None, &runner, "7zip.7zip | whoami", true).is_err());
        assert!(remove_uwp_app(None, &runner, "App'; calc.exe #", true).is_err());
        assert!(validate_winget_package_id("Microsoft.VisualStudioCode").is_ok());
        assert!(validate_uwp_package_full_name("Microsoft.YourPhone_1.23_x64__8wekyb3d8bbwe").is_ok());
    }
}

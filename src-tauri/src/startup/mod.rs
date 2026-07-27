use crate::error::AppError;
use crate::runner::{CommandOutput, CommandRunner, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub value_name: String,
    pub command: String,
    pub location: String,
    pub enabled: bool,
    pub item_type: String,
    pub publisher: Option<String>,
}

fn escape_ps_param(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn get_startup_items(runner: &dyn CommandRunner) -> Result<Vec<StartupItem>, AppError> {
    if runner.is_dry_run() {
        return Ok(get_mock_startup_items());
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
$items = @()
$regPaths = @(
    @{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKCU Run" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKLM Run" },
    @{ Path = "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKLM WOW6432Node Run" }
)

$approvedHKCU = @{}
if (Test-Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run") {
    $apProps = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" -ErrorAction SilentlyContinue
    if ($apProps) {
        $apProps.psobject.properties | Where-Object { $_.Name -notlike "PS*" } | ForEach-Object {
            $val = $_.Value
            if ($val -and $val.Length -gt 0 -and ($val[0] -eq 3 -or $val[0] -eq 1)) {
                $approvedHKCU[$_.Name] = $false
            } else {
                $approvedHKCU[$_.Name] = $true
            }
        }
    }
}

foreach ($r in $regPaths) {
    if (Test-Path $r.Path) {
        $props = Get-ItemProperty -Path $r.Path -ErrorAction SilentlyContinue
        if ($props) {
            $props.psobject.properties | Where-Object { $_.Name -notlike "PS*" } | ForEach-Object {
                $name = $_.Name
                $cmd = $_.Value.ToString()
                $id = ($r.Loc + "_" + $name) -replace "[^a-zA-Z0-9_]", "_"
                $isEnabled = $true
                if ($approvedHKCU.ContainsKey($name)) {
                    $isEnabled = $approvedHKCU[$name]
                }
                $items += [PSCustomObject]@{
                    id = $id.ToLower()
                    name = $name
                    valueName = $name
                    command = $cmd
                    location = $r.Loc
                    enabled = $isEnabled
                    itemType = "Registry"
                    publisher = if ($cmd -match "Microsoft") { "Microsoft Corporation" } else { "Third Party" }
                }
            }
        }
    }
}

$userStartup = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
if (Test-Path $userStartup) {
    Get-ChildItem -Path $userStartup -File -ErrorAction SilentlyContinue | ForEach-Object {
        $id = ("user_folder_" + $_.Name) -replace "[^a-zA-Z0-9_]", "_"
        $items += [PSCustomObject]@{
            id = $id.ToLower()
            name = $_.BaseName
            valueName = $_.Name
            command = $_.FullName
            location = "User Startup Folder"
            enabled = $true
            itemType = "Shortcut"
            publisher = "User Startup"
        }
    }
}

if ($items.Count -eq 0) {
    "[]"
} else {
    $items | ConvertTo-Json -Compress
}
"#;
        let output = runner.run_powershell(script).map_err(AppError::Execution)?;
        if output.exit_code == 0 {
            let stdout = output.stdout.trim();
            if stdout.is_empty() || stdout == "[]" {
                return Ok(Vec::new());
            }
            parse_startup_items_json(stdout)
        } else {
            Err(AppError::Execution(format!(
                "Failed to get startup items via PowerShell (exit code {}): {}",
                output.exit_code, output.stderr
            )))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(AppError::Execution(
            "Startup items query is only supported on Windows".to_string(),
        ))
    }
}

pub fn parse_startup_items_json(json_str: &str) -> Result<Vec<StartupItem>, AppError> {
    if json_str.starts_with('[') {
        serde_json::from_str::<Vec<StartupItem>>(json_str)
            .map_err(|e| AppError::Execution(format!("Failed to parse startup items array: {}", e)))
    } else {
        let single = serde_json::from_str::<StartupItem>(json_str)
            .map_err(|e| AppError::Execution(format!("Failed to parse single startup item: {}", e)))?;
        Ok(vec![single])
    }
}

pub fn toggle_startup_item(
    runner: &dyn CommandRunner,
    id: &str,
    value_name: &str,
    location: &str,
    enable: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = Instant::now();
    let target_value_name = if value_name.is_empty() { id } else { value_name };
    let action_name = format!("Toggle startup item '{}' (enable={})", target_value_name, enable);

    if runner.is_dry_run() {
        return Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: id.to_string(),
                name: action_name,
                command: format!(
                    "toggle_startup_item --id '{}' --value_name '{}' --location '{}' --enable {}",
                    id, target_value_name, location, enable
                ),
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!(
                        "[DRY-RUN] Toggled startup item '{}' to enabled={}",
                        target_value_name, enable
                    ),
                    stderr: String::new(),
                },
                skipped: false,
            }],
            total_duration_ms: start_time.elapsed().as_millis() as u64,
            is_dry_run: true,
        });
    }

    #[cfg(target_os = "windows")]
    {
        let byte_val = if enable {
            "2,0,0,0,0,0,0,0,0,0,0,0"
        } else {
            "3,0,0,0,0,0,0,0,0,0,0,0"
        };
        let safe_value_name = escape_ps_param(target_value_name);
        let safe_location = escape_ps_param(location);

        let script = format!(
            r#"
$loc = '{safe_location}'
$apPath = if ($loc -like "*HKLM*") {{
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
}} else {{
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
}}
if (-not (Test-Path $apPath)) {{
    New-Item -Path $apPath -Force | Out-Null
}}
$valueName = '{safe_value_name}'
$bytes = [byte[]]({byte_val})
Set-ItemProperty -Path $apPath -Name $valueName -Value $bytes -Type Binary
Write-Output "Toggled $valueName to enabled={enable}"
"#,
            safe_location = safe_location,
            safe_value_name = safe_value_name,
            byte_val = byte_val,
            enable = enable
        );
        let output = runner.run_powershell(&script).map_err(AppError::Execution)?;
        if output.exit_code != 0 {
            return Err(AppError::Execution(format!(
                "Failed to toggle startup item '{}': {}",
                target_value_name, output.stderr
            )));
        }
        Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: id.to_string(),
                name: action_name,
                command: script,
                output,
                skipped: false,
            }],
            total_duration_ms: start_time.elapsed().as_millis() as u64,
            is_dry_run: false,
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(AppError::Execution(
            "Toggling startup items is only supported on Windows".to_string(),
        ))
    }
}

pub fn remove_startup_item(
    runner: &dyn CommandRunner,
    id: &str,
    value_name: &str,
    location: &str,
) -> Result<ExecutionSummary, AppError> {
    let start_time = Instant::now();
    let target_value_name = if value_name.is_empty() { id } else { value_name };
    let action_name = format!("Remove startup item '{}'", target_value_name);

    if runner.is_dry_run() {
        return Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: id.to_string(),
                name: action_name,
                command: format!(
                    "remove_startup_item --id '{}' --value_name '{}' --location '{}'",
                    id, target_value_name, location
                ),
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!(
                        "[DRY-RUN] Successfully removed startup item '{}'",
                        target_value_name
                    ),
                    stderr: String::new(),
                },
                skipped: false,
            }],
            total_duration_ms: start_time.elapsed().as_millis() as u64,
            is_dry_run: true,
        });
    }

    #[cfg(target_os = "windows")]
    {
        let safe_value_name = escape_ps_param(target_value_name);
        let safe_location = escape_ps_param(location);

        let script = format!(
            r#"
$valueName = '{safe_value_name}'
$loc = '{safe_location}'

$regPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"
)
if ($loc -eq "User Startup Folder") {{
    $userStartup = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
    $shortcutPath = [System.IO.Path]::Combine($userStartup, $valueName)
    if (Test-Path $shortcutPath) {{
        Remove-Item -Path $shortcutPath -Force
    }}
}} else {{
    foreach ($p in $regPaths) {{
        if (Test-Path $p) {{
            Remove-ItemProperty -Path $p -Name $valueName -ErrorAction SilentlyContinue
        }}
    }}
}}
Write-Output "Removed startup entry $valueName"
"#,
            safe_value_name = safe_value_name,
            safe_location = safe_location
        );
        let output = runner.run_powershell(&script).map_err(AppError::Execution)?;
        if output.exit_code != 0 {
            return Err(AppError::Execution(format!(
                "Failed to remove startup item '{}': {}",
                target_value_name, output.stderr
            )));
        }
        Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: id.to_string(),
                name: action_name,
                command: script,
                output,
                skipped: false,
            }],
            total_duration_ms: start_time.elapsed().as_millis() as u64,
            is_dry_run: false,
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(AppError::Execution(
            "Removing startup items is only supported on Windows".to_string(),
        ))
    }
}

fn get_mock_startup_items() -> Vec<StartupItem> {
    vec![
        StartupItem {
            id: "hkcu_run_discord".to_string(),
            name: "Discord".to_string(),
            value_name: "Discord".to_string(),
            command: r"C:\Users\User\AppData\Local\Discord\Update.exe --processStart Discord.exe".to_string(),
            location: "HKCU Run".to_string(),
            enabled: true,
            item_type: "Registry".to_string(),
            publisher: Some("Discord Inc.".to_string()),
        },
        StartupItem {
            id: "hkcu_run_spotify".to_string(),
            name: "Spotify".to_string(),
            value_name: "Spotify".to_string(),
            command: r"C:\Users\User\AppData\Roaming\Spotify\Spotify.exe --autostart".to_string(),
            location: "HKCU Run".to_string(),
            enabled: false,
            item_type: "Registry".to_string(),
            publisher: Some("Spotify AB".to_string()),
        },
        StartupItem {
            id: "hklm_run_onedrive".to_string(),
            name: "Microsoft OneDrive".to_string(),
            value_name: "Microsoft OneDrive".to_string(),
            command: r"C:\Program Files\Microsoft OneDrive\OneDrive.exe /background".to_string(),
            location: "HKLM Run".to_string(),
            enabled: true,
            item_type: "Registry".to_string(),
            publisher: Some("Microsoft Corporation".to_string()),
        },
        StartupItem {
            id: "hklm_run_edgeupdate".to_string(),
            name: "Microsoft Edge AutoUpdate".to_string(),
            value_name: "Microsoft Edge AutoUpdate".to_string(),
            command: r"C:\Program Files (x86)\Microsoft\EdgeUpdate\MicrosoftEdgeUpdate.exe".to_string(),
            location: "HKLM Run".to_string(),
            enabled: true,
            item_type: "Registry".to_string(),
            publisher: Some("Microsoft Corporation".to_string()),
        },
        StartupItem {
            id: "user_folder_steam".to_string(),
            name: "Steam".to_string(),
            value_name: "Steam.lnk".to_string(),
            command: r"C:\Program Files (x86)\Steam\steam.exe -silent".to_string(),
            location: "User Startup Folder".to_string(),
            enabled: true,
            item_type: "Shortcut".to_string(),
            publisher: Some("Valve Corporation".to_string()),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_get_startup_items_dry_run() {
        let runner = DryRunRunner::new();
        let items = get_startup_items(&runner).expect("Dry run should return mock startup items");
        assert_eq!(items.len(), 5);
        assert_eq!(items[0].name, "Discord");
        assert_eq!(items[0].value_name, "Discord");
        assert_eq!(items[2].publisher.as_deref(), Some("Microsoft Corporation"));
    }

    #[test]
    fn test_toggle_startup_item_dry_run() {
        let runner = DryRunRunner::new();
        let summary = toggle_startup_item(&runner, "hkcu_run_discord", "Discord", "HKCU Run", false)
            .expect("Toggle dry run should succeed");
        assert!(summary.success);
        assert!(summary.is_dry_run);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
    }

    #[test]
    fn test_remove_startup_item_dry_run() {
        let runner = DryRunRunner::new();
        let summary = remove_startup_item(&runner, "hkcu_run_discord", "Discord", "HKCU Run")
            .expect("Remove dry run should succeed");
        assert!(summary.success);
        assert!(summary.is_dry_run);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
    }

    #[test]
    fn test_parse_startup_items_json() {
        let json_array = r#"[
            {
                "id": "item_1",
                "name": "App One",
                "valueName": "App One",
                "command": "C:\\app.exe",
                "location": "HKCU Run",
                "enabled": true,
                "itemType": "Registry",
                "publisher": "Vendor A"
            }
        ]"#;

        let parsed = parse_startup_items_json(json_array).expect("Parsing array should succeed");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "item_1");
        assert_eq!(parsed[0].value_name, "App One");
        assert_eq!(parsed[0].item_type, "Registry");
    }
}

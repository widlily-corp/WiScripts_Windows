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

const VALID_STARTUP_LOCATIONS: &[&str] = &[
    "HKCU Run",
    "HKLM Run",
    "HKCU RunOnce",
    "HKLM RunOnce",
    "User Startup Folder",
    "Common Startup Folder",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run",
    "StartupFolder",
    "CommonStartupFolder",
];

fn is_valid_location(location: &str) -> bool {
    let normalized = location.trim();
    VALID_STARTUP_LOCATIONS
        .iter()
        .any(|valid| normalized.eq_ignore_ascii_case(valid))
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
    @{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce"; Loc = "HKCU RunOnce" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKLM Run" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce"; Loc = "HKLM RunOnce" },
    @{ Path = "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKLM WOW6432Node Run" },
    @{ Path = "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce"; Loc = "HKLM WOW6432Node RunOnce" }
)

$psInternal = @('PSPath', 'PSParentPath', 'PSChildName', 'PSDrive', 'PSProvider', 'PSIsContainer')

$approvedRun = @{}
$apRunPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
)
foreach ($ap in $apRunPaths) {
    if (Test-Path $ap) {
        $apProps = Get-ItemProperty -Path $ap -ErrorAction SilentlyContinue
        if ($apProps) {
            $apProps.psobject.properties | Where-Object { $psInternal -notcontains $_.Name } | ForEach-Object {
                $val = $_.Value
                if ($val -and $val.Length -gt 0 -and ($val[0] -eq 3 -or $val[0] -eq 1)) {
                    $approvedRun[$_.Name] = $false
                } else {
                    if (-not $approvedRun.ContainsKey($_.Name)) {
                        $approvedRun[$_.Name] = $true
                    }
                }
            }
        }
    }
}

$approvedFolder = @{}
$apFolderPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"
)
foreach ($ap in $apFolderPaths) {
    if (Test-Path $ap) {
        $apProps = Get-ItemProperty -Path $ap -ErrorAction SilentlyContinue
        if ($apProps) {
            $apProps.psobject.properties | Where-Object { $psInternal -notcontains $_.Name } | ForEach-Object {
                $val = $_.Value
                if ($val -and $val.Length -gt 0 -and ($val[0] -eq 3 -or $val[0] -eq 1)) {
                    $approvedFolder[$_.Name] = $false
                } else {
                    if (-not $approvedFolder.ContainsKey($_.Name)) {
                        $approvedFolder[$_.Name] = $true
                    }
                }
            }
        }
    }
}

foreach ($r in $regPaths) {
    if (Test-Path $r.Path) {
        $props = Get-ItemProperty -Path $r.Path -ErrorAction SilentlyContinue
        if ($props) {
            $props.psobject.properties | Where-Object { $psInternal -notcontains $_.Name } | ForEach-Object {
                $name = $_.Name
                $cmd = if ($_.Value) { $_.Value.ToString() } else { "" }
                $id = ($r.Loc + "_" + $name) -replace "[^a-zA-Z0-9_]", "_"
                $isEnabled = $true
                if ($approvedRun.ContainsKey($name)) {
                    $isEnabled = $approvedRun[$name]
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
$commonStartup = [System.IO.Path]::Combine($env:ProgramData, "Microsoft\Windows\Start Menu\Programs\Startup")

$folders = @(
    @{ Path = $userStartup; Loc = "User Startup Folder"; Pub = "User Startup" },
    @{ Path = $commonStartup; Loc = "Common Startup Folder"; Pub = "Common Startup" }
)

foreach ($f in $folders) {
    if (Test-Path $f.Path) {
        Get-ChildItem -Path $f.Path -File -ErrorAction SilentlyContinue | ForEach-Object {
            $id = ($f.Loc + "_" + $_.Name) -replace "[^a-zA-Z0-9_]", "_"
            $isEnabled = $true
            if ($approvedFolder.ContainsKey($_.Name)) {
                $isEnabled = $approvedFolder[$_.Name]
            }
            $items += [PSCustomObject]@{
                id = $id.ToLower()
                name = $_.BaseName
                valueName = $_.Name
                command = $_.FullName
                location = $f.Loc
                enabled = $isEnabled
                itemType = "Shortcut"
                publisher = $f.Pub
            }
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
            let stderr = &output.stderr;
            if stderr.contains("Access is denied") || stderr.contains("UnauthorizedAccessException")
            {
                return Err(AppError::Execution(
                    "Administrator privileges are required to query startup registry paths: Access is denied".to_string(),
                ));
            }
            Err(AppError::Execution(format!(
                "Failed to get startup items via PowerShell (exit code {}): {}",
                output.exit_code, stderr
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
    let trimmed = json_str.trim();
    if trimmed.is_empty() || trimmed == "[]" {
        return Ok(Vec::new());
    }
    if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<StartupItem>>(trimmed)
            .map_err(|e| AppError::Execution(format!("Failed to parse startup items array: {}", e)))
    } else {
        let single = serde_json::from_str::<StartupItem>(trimmed).map_err(|e| {
            AppError::Execution(format!("Failed to parse single startup item: {}", e))
        })?;
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
    let target_value_name = value_name.trim();
    if target_value_name.is_empty() {
        return Err(AppError::Execution(
            "Startup item value_name cannot be empty".to_string(),
        ));
    }

    if !is_valid_location(location) {
        return Err(AppError::Execution(format!(
            "Invalid or unwhitelisted startup location: '{}'",
            location
        )));
    }
    let action_name = format!(
        "Toggle startup item '{}' (enable={})",
        target_value_name, enable
    );

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
$valueName = '{safe_value_name}'
$isShortcut = ($loc -like "*Folder*") -or ($valueName -like "*.lnk")
$apKey = if ($isShortcut) {{ "StartupFolder" }} else {{ "Run" }}
$apPath = if ($loc -like "*HKLM*" -or $loc -like "*Common*") {{
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\$apKey"
}} else {{
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\$apKey"
}}
if (-not (Test-Path $apPath)) {{
    New-Item -Path $apPath -Force | Out-Null
}}
$bytes = [byte[]]({byte_val})
Set-ItemProperty -Path $apPath -Name $valueName -Value $bytes -Type Binary
Write-Output "Toggled $valueName to enabled={enable} at $apPath"
"#,
            safe_location = safe_location,
            safe_value_name = safe_value_name,
            byte_val = byte_val,
            enable = enable
        );
        let output = runner
            .run_powershell(&script)
            .map_err(AppError::Execution)?;
        if output.exit_code != 0 {
            let stderr = &output.stderr;
            if stderr.contains("Access is denied")
                || stderr.contains("UnauthorizedAccessException")
                || stderr.contains("registry access is not allowed")
            {
                return Err(AppError::Execution(format!(
                    "Administrator privileges are required to toggle startup item '{}' in HKLM: Access is denied",
                    target_value_name
                )));
            }
            return Err(AppError::Execution(format!(
                "Failed to toggle startup item '{}': {}",
                target_value_name, stderr
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
    let target_value_name = value_name.trim();
    if target_value_name.is_empty() {
        return Err(AppError::Execution(
            "Startup item value_name cannot be empty".to_string(),
        ));
    }

    if !is_valid_location(location) {
        return Err(AppError::Execution(format!(
            "Invalid or unwhitelisted startup location: '{}'",
            location
        )));
    }
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
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce"
)

$approvedPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"
)

if ($loc -like "*Folder*") {{
    $userStartup = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
    $commonStartup = [System.IO.Path]::Combine($env:ProgramData, "Microsoft\Windows\Start Menu\Programs\Startup")
    $shortcutUser = [System.IO.Path]::Combine($userStartup, $valueName)
    $shortcutCommon = [System.IO.Path]::Combine($commonStartup, $valueName)
    if (Test-Path $shortcutUser) {{
        Remove-Item -Path $shortcutUser -Force
    }}
    if (Test-Path $shortcutCommon) {{
        Remove-Item -Path $shortcutCommon -Force
    }}
}} else {{
    foreach ($p in $regPaths) {{
        if (Test-Path $p) {{
            Remove-ItemProperty -Path $p -Name $valueName -ErrorAction SilentlyContinue
        }}
    }}
}}

foreach ($ap in $approvedPaths) {{
    if (Test-Path $ap) {{
        Remove-ItemProperty -Path $ap -Name $valueName -ErrorAction SilentlyContinue
    }}
}}

Write-Output "Removed startup entry $valueName"
"#,
            safe_value_name = safe_value_name,
            safe_location = safe_location
        );
        let output = runner
            .run_powershell(&script)
            .map_err(AppError::Execution)?;
        if output.exit_code != 0 {
            let stderr = &output.stderr;
            if stderr.contains("Access is denied")
                || stderr.contains("UnauthorizedAccessException")
                || stderr.contains("registry access is not allowed")
            {
                return Err(AppError::Execution(format!(
                    "Administrator privileges are required to remove startup item '{}' in HKLM: Access is denied",
                    target_value_name
                )));
            }
            return Err(AppError::Execution(format!(
                "Failed to remove startup item '{}': {}",
                target_value_name, stderr
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
            command: r"C:\Users\User\AppData\Local\Discord\Update.exe --processStart Discord.exe"
                .to_string(),
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
            command: r"C:\Program Files (x86)\Microsoft\EdgeUpdate\MicrosoftEdgeUpdate.exe"
                .to_string(),
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
            publisher: Some("User Startup".to_string()),
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
        let summary =
            toggle_startup_item(&runner, "hkcu_run_discord", "Discord", "HKCU Run", false)
                .expect("Toggle dry run should succeed");
        assert!(summary.success);
        assert!(summary.is_dry_run);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0]
            .output
            .stdout
            .contains("[DRY-RUN]"));
    }

    #[test]
    fn test_remove_startup_item_dry_run() {
        let runner = DryRunRunner::new();
        let summary = remove_startup_item(&runner, "hkcu_run_discord", "Discord", "HKCU Run")
            .expect("Remove dry run should succeed");
        assert!(summary.success);
        assert!(summary.is_dry_run);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0]
            .output
            .stdout
            .contains("[DRY-RUN]"));
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

    #[test]
    fn test_parse_startup_items_json_with_whitespace() {
        let json_with_ws = "\r\n  [\r\n    {\r\n      \"id\": \"item_ws\",\r\n      \"name\": \"App WS\",\r\n      \"valueName\": \"App WS\",\r\n      \"command\": \"C:\\\\app.exe\",\r\n      \"location\": \"HKCU Run\",\r\n      \"enabled\": true,\r\n      \"itemType\": \"Registry\",\r\n      \"publisher\": \"Vendor WS\"\r\n    }\r\n  ]\r\n";
        let parsed =
            parse_startup_items_json(json_with_ws).expect("Whitespace JSON parsing should succeed");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "item_ws");
        assert_eq!(parsed[0].name, "App WS");
    }

    #[test]
    fn test_parse_startup_items_single_object() {
        let single_json = "  {\r\n    \"id\": \"single_app\",\r\n    \"name\": \"Single App\",\r\n    \"valueName\": \"Single App\",\r\n    \"command\": \"C:\\\\single.exe\",\r\n    \"location\": \"HKCU Run\",\r\n    \"enabled\": false,\r\n    \"itemType\": \"Registry\",\r\n    \"publisher\": \"Single Vendor\"\r\n  }\r\n";
        let parsed = parse_startup_items_json(single_json)
            .expect("Single object JSON parsing should succeed");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "single_app");
        assert_eq!(parsed[0].name, "Single App");
        assert!(!parsed[0].enabled);
    }

    #[test]
    fn test_property_filter_preserves_ps_named_apps() {
        let ps_apps = vec!["Photoshop", "Postman", "PSPad", "PStudio", "PSReadline"];
        let ps_internal = vec![
            "PSPath",
            "PSParentPath",
            "PSChildName",
            "PSDrive",
            "PSProvider",
            "PSIsContainer",
        ];

        for app in &ps_apps {
            let is_excluded = ps_internal.contains(app);
            assert!(
                !is_excluded,
                "Application '{}' starting with 'PS' should NOT be excluded by property filter",
                app
            );
        }

        for internal in &ps_internal {
            assert!(
                ps_internal.contains(internal),
                "PowerShell internal property '{}' MUST be excluded",
                internal
            );
        }
    }

    #[test]
    fn test_toggle_startup_item_shortcut_folder() {
        struct CapturingRunner {
            captured_script: std::sync::Mutex<String>,
        }
        impl CommandRunner for CapturingRunner {
            fn run_powershell(&self, script: &str) -> Result<CommandOutput, String> {
                *self.captured_script.lock().unwrap() = script.to_string();
                Ok(CommandOutput {
                    exit_code: 0,
                    stdout: "Toggled".to_string(),
                    stderr: String::new(),
                })
            }
            fn run_cmd(&self, _command: &str) -> Result<CommandOutput, String> {
                Ok(CommandOutput {
                    exit_code: 0,
                    stdout: String::new(),
                    stderr: String::new(),
                })
            }
            fn is_dry_run(&self) -> bool {
                false
            }
        }

        let runner = CapturingRunner {
            captured_script: std::sync::Mutex::new(String::new()),
        };
        let summary = toggle_startup_item(
            &runner,
            "user_folder_steam",
            "Steam.lnk",
            "User Startup Folder",
            false,
        )
        .expect("Toggle shortcut should succeed");
        assert!(summary.success);

        let script = runner.captured_script.lock().unwrap().clone();
        assert!(
            script.contains("StartupFolder"),
            "Shortcut item toggle script must target StartupApproved\\StartupFolder registry path, script was: {}",
            script
        );
    }

    #[test]
    fn test_ipc_missing_value_name_handling() {
        let runner = DryRunRunner::new();
        let result_toggle = toggle_startup_item(&runner, "hkcu_run_discord", "", "HKCU Run", false);
        assert!(
            result_toggle.is_err(),
            "toggle_startup_item with empty value_name should return an error"
        );
        if let Err(AppError::Execution(msg)) = result_toggle {
            assert!(
                msg.contains("cannot be empty"),
                "Error message should mention value_name cannot be empty: {}",
                msg
            );
        } else {
            panic!("Expected AppError::Execution for empty value_name");
        }

        let result_remove = remove_startup_item(&runner, "hkcu_run_discord", "   ", "HKCU Run");
        assert!(
            result_remove.is_err(),
            "remove_startup_item with whitespace value_name should return an error"
        );
        if let Err(AppError::Execution(msg)) = result_remove {
            assert!(
                msg.contains("cannot be empty"),
                "Error message should mention value_name cannot be empty: {}",
                msg
            );
        } else {
            panic!("Expected AppError::Execution for empty value_name");
        }
    }
}

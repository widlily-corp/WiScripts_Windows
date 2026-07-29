use crate::error::AppError;
use crate::runner::{CommandOutput, CommandRunner, ExecutedAction, ExecutionSummary};
use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTaskItem {
    pub task_name: String,
    pub task_path: String,
    pub state: String,
    pub enabled: bool,
    pub trigger_type: String,
    pub author: String,
    pub last_run_time: Option<String>,
    pub next_run_time: Option<String>,
    pub action_summary: String,
}

fn escape_ps_param(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn normalize_task_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "\\" {
        return "\\".to_string();
    }
    let with_lead = if trimmed.starts_with('\\') {
        trimmed.to_string()
    } else {
        format!("\\{}", trimmed)
    };
    if with_lead.ends_with('\\') {
        with_lead
    } else {
        format!("{}\\", with_lead)
    }
}

pub fn get_scheduled_tasks(runner: &dyn CommandRunner) -> Result<Vec<ScheduledTaskItem>, AppError> {
    if runner.is_dry_run() {
        return Ok(get_mock_scheduled_tasks());
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
$tasks = Get-ScheduledTask -ErrorAction SilentlyContinue | Select-Object -First 80 | ForEach-Object {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue
    $execAction = ($_.Actions | ForEach-Object {
        if ($_.Execute) {
            if ($_.Arguments) { "$($_.Execute) $($_.Arguments)" } else { $_.Execute }
        } elseif ($_.ClassId) {
            "COM Handler: $($_.ClassId)"
        }
    } -ErrorAction SilentlyContinue) -join "; "
    if ([string]::IsNullOrWhiteSpace($execAction)) {
        $execAction = "System Task Action"
    }
    $stateStr = $_.State.ToString()
    $trigStr = if ($_.Triggers) {
        (($_.Triggers | ForEach-Object { $_.GetType().Name }) -join ", ") -replace "Trigger", ""
    } else {
        "Manual / Event"
    }

    [PSCustomObject]@{
        taskName = $_.TaskName
        taskPath = $_.TaskPath
        state = $stateStr
        enabled = ($stateStr -ne "Disabled")
        triggerType = if ($trigStr) { $trigStr } else { "Event" }
        author = if ($_.Author) { $_.Author } else { "Microsoft Corporation" }
        lastRunTime = if ($info -and $info.LastRunTime -and $info.LastRunTime.Year -gt 2000) { $info.LastRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        nextRunTime = if ($info -and $info.NextRunTime -and $info.NextRunTime.Year -gt 2000) { $info.NextRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        actionSummary = $execAction
    }
}

if ($null -eq $tasks -or @($tasks).Count -eq 0) {
    "[]"
} else {
    $tasks | ConvertTo-Json -Compress
}
"#;
        let output = runner.run_powershell(script).map_err(AppError::Execution)?;
        if output.exit_code == 0 {
            let stdout = output.stdout.trim();
            if stdout.is_empty() || stdout == "[]" {
                return Ok(Vec::new());
            }
            parse_scheduled_tasks_json(stdout)
        } else {
            Err(AppError::Execution(format!(
                "Failed to get scheduled tasks via PowerShell (exit code {}): {}",
                output.exit_code, output.stderr
            )))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(AppError::Execution(
            "Scheduled tasks query is only supported on Windows".to_string(),
        ))
    }
}

pub fn parse_scheduled_tasks_json(json_str: &str) -> Result<Vec<ScheduledTaskItem>, AppError> {
    let trimmed = json_str.trim();
    if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<ScheduledTaskItem>>(trimmed).map_err(|e| {
            AppError::Execution(format!("Failed to parse scheduled tasks array: {}", e))
        })
    } else {
        let single = serde_json::from_str::<ScheduledTaskItem>(trimmed).map_err(|e| {
            AppError::Execution(format!("Failed to parse single scheduled task: {}", e))
        })?;
        Ok(vec![single])
    }
}

pub fn toggle_scheduled_task(
    runner: &dyn CommandRunner,
    task_name: &str,
    task_path: &str,
    enable: bool,
) -> Result<ExecutionSummary, AppError> {
    let start_time = Instant::now();
    let action_id = format!("toggle_task_{}_{}", task_name, enable);
    let action_name = format!("Toggle scheduled task '{}' (enable={})", task_name, enable);
    let norm_path = normalize_task_path(task_path);

    if runner.is_dry_run() {
        return Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: action_id,
                name: action_name,
                command: format!(
                    "toggle_scheduled_task --name '{}' --path '{}' --enable {}",
                    task_name, norm_path, enable
                ),
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!(
                        "[DRY-RUN] Toggled scheduled task '{}' at '{}' to enabled={}",
                        task_name, norm_path, enable
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
        let safe_name = escape_ps_param(task_name);
        let safe_path = escape_ps_param(&norm_path);
        let verb = if enable {
            "Enable-ScheduledTask"
        } else {
            "Disable-ScheduledTask"
        };
        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
$name = '{safe_name}'
$path = '{safe_path}'
{verb} -TaskName $name -TaskPath $path
Write-Output "SUCCESS: Toggled $name enabled={enable}"
"#,
            safe_name = safe_name,
            safe_path = safe_path,
            verb = verb,
            enable = enable
        );
        let output = runner
            .run_powershell(&script)
            .map_err(AppError::Execution)?;
        let combined_output = format!("{}\n{}", output.stdout, output.stderr);
        let is_permission_denied = combined_output.contains("Access is denied")
            || combined_output.contains("PermissionDenied")
            || combined_output.contains("0x80070005")
            || combined_output.contains("UnauthorizedAccessException");

        if output.exit_code != 0 || is_permission_denied || !output.stderr.trim().is_empty() {
            let err_msg = if is_permission_denied {
                format!(
                    "Failed to toggle scheduled task '{}': Access is denied. Administrator elevation is required.",
                    task_name
                )
            } else {
                let err_detail = if !output.stderr.trim().is_empty() {
                    output.stderr.trim()
                } else {
                    output.stdout.trim()
                };
                format!(
                    "Failed to toggle scheduled task '{}': {}",
                    task_name, err_detail
                )
            };
            return Err(AppError::Execution(err_msg));
        }

        Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: action_id,
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
            "Toggling scheduled tasks is only supported on Windows".to_string(),
        ))
    }
}

pub fn run_scheduled_task(
    runner: &dyn CommandRunner,
    task_name: &str,
    task_path: &str,
) -> Result<ExecutionSummary, AppError> {
    let start_time = Instant::now();
    let action_id = format!("run_task_{}", task_name);
    let action_name = format!("Run scheduled task '{}'", task_name);
    let norm_path = normalize_task_path(task_path);

    if runner.is_dry_run() {
        return Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: action_id,
                name: action_name,
                command: format!(
                    "run_scheduled_task --name '{}' --path '{}'",
                    task_name, norm_path
                ),
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!(
                        "[DRY-RUN] Triggered task '{}' at '{}'",
                        task_name, norm_path
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
        let safe_name = escape_ps_param(task_name);
        let safe_path = escape_ps_param(&norm_path);
        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
$name = '{safe_name}'
$path = '{safe_path}'
Start-ScheduledTask -TaskName $name -TaskPath $path
Write-Output "SUCCESS: Started task $name"
"#,
            safe_name = safe_name,
            safe_path = safe_path
        );
        let output = runner
            .run_powershell(&script)
            .map_err(AppError::Execution)?;
        let combined_output = format!("{}\n{}", output.stdout, output.stderr);
        let is_permission_denied = combined_output.contains("Access is denied")
            || combined_output.contains("PermissionDenied")
            || combined_output.contains("0x80070005")
            || combined_output.contains("UnauthorizedAccessException");

        if output.exit_code != 0 || is_permission_denied || !output.stderr.trim().is_empty() {
            let err_msg = if is_permission_denied {
                format!(
                    "Failed to run scheduled task '{}': Access is denied. Administrator elevation is required.",
                    task_name
                )
            } else {
                let err_detail = if !output.stderr.trim().is_empty() {
                    output.stderr.trim()
                } else {
                    output.stdout.trim()
                };
                format!(
                    "Failed to run scheduled task '{}': {}",
                    task_name, err_detail
                )
            };
            return Err(AppError::Execution(err_msg));
        }

        Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: action_id,
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
            "Running scheduled tasks is only supported on Windows".to_string(),
        ))
    }
}

fn get_mock_scheduled_tasks() -> Vec<ScheduledTaskItem> {
    vec![
        ScheduledTaskItem {
            task_name: "Consolidator".to_string(),
            task_path: r"\Microsoft\Windows\Customer Experience Improvement Program\".to_string(),
            state: "Ready".to_string(),
            enabled: true,
            trigger_type: "Daily at 03:00".to_string(),
            author: "Microsoft Corporation".to_string(),
            last_run_time: Some("2026-07-27 03:00:00".to_string()),
            next_run_time: Some("2026-07-28 03:00:00".to_string()),
            action_summary: r"%SystemRoot%\System32\wsqmcons.exe".to_string(),
        },
        ScheduledTaskItem {
            task_name: "ProgramDataUpdater".to_string(),
            task_path: r"\Microsoft\Windows\Application Experience\".to_string(),
            state: "Disabled".to_string(),
            enabled: false,
            trigger_type: "Logon / Daily".to_string(),
            author: "Microsoft Corporation".to_string(),
            last_run_time: Some("2026-07-25 12:00:00".to_string()),
            next_run_time: None,
            action_summary: r"%SystemRoot%\System32\compattelrunner.exe".to_string(),
        },
        ScheduledTaskItem {
            task_name: "GoogleUpdateTaskMachineCore".to_string(),
            task_path: r"\".to_string(),
            state: "Ready".to_string(),
            enabled: true,
            trigger_type: "At system startup".to_string(),
            author: "Google LLC".to_string(),
            last_run_time: Some("2026-07-27 08:15:00".to_string()),
            next_run_time: Some("2026-07-27 09:15:00".to_string()),
            action_summary: r"C:\Program Files (x86)\Google\Update\GoogleUpdate.exe /c".to_string(),
        },
        ScheduledTaskItem {
            task_name: "Adobe Acrobat Update Task".to_string(),
            task_path: r"\".to_string(),
            state: "Ready".to_string(),
            enabled: true,
            trigger_type: "Daily at 10:00".to_string(),
            author: "Adobe Inc.".to_string(),
            last_run_time: Some("2026-07-27 10:00:00".to_string()),
            next_run_time: Some("2026-07-28 10:00:00".to_string()),
            action_summary: r"C:\Program Files (x86)\Common Files\Adobe\ARM\1.0\AdobeARM.exe"
                .to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_normalize_task_path_variations() {
        assert_eq!(normalize_task_path(""), "\\");
        assert_eq!(normalize_task_path("\\"), "\\");
        assert_eq!(
            normalize_task_path("Microsoft\\Windows"),
            "\\Microsoft\\Windows\\"
        );
        assert_eq!(
            normalize_task_path("\\Microsoft\\Windows\\"),
            "\\Microsoft\\Windows\\"
        );
        assert_eq!(normalize_task_path("  \\Test\\  "), "\\Test\\");
    }

    #[test]
    fn test_get_scheduled_tasks_dry_run() {
        let runner = DryRunRunner::new();
        let tasks = get_scheduled_tasks(&runner).expect("Dry run should return mock tasks");
        assert_eq!(tasks.len(), 4);
        assert_eq!(tasks[0].task_name, "Consolidator");
        assert_eq!(tasks[1].enabled, false);
    }

    #[test]
    fn test_toggle_scheduled_task_dry_run() {
        let runner = DryRunRunner::new();
        let summary = toggle_scheduled_task(&runner, "Consolidator", r"\Microsoft\", false)
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
    fn test_run_scheduled_task_dry_run() {
        let runner = DryRunRunner::new();
        let summary = run_scheduled_task(&runner, "Consolidator", r"\Microsoft\")
            .expect("Run dry run should succeed");
        assert!(summary.success);
        assert!(summary.is_dry_run);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0]
            .output
            .stdout
            .contains("[DRY-RUN]"));
    }

    #[test]
    fn test_parse_scheduled_tasks_json() {
        let json_str = r#"[
            {
                "taskName": "TestTask",
                "taskPath": "\\Test\\",
                "state": "Ready",
                "enabled": true,
                "triggerType": "Daily",
                "author": "Test Author",
                "lastRunTime": "2026-07-27 12:00:00",
                "nextRunTime": null,
                "actionSummary": "C:\\test.exe"
            }
        ]"#;
        let tasks = parse_scheduled_tasks_json(json_str).expect("Parsing should succeed");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].task_name, "TestTask");
    }

    #[test]
    fn test_parse_scheduled_tasks_json_null_dates() {
        let json_str = r#"[
            {
                "taskName": "TestNullDates",
                "taskPath": "\\Microsoft\\Windows\\",
                "state": "Ready",
                "enabled": true,
                "triggerType": "Event",
                "author": "Microsoft Corporation",
                "lastRunTime": null,
                "nextRunTime": null,
                "actionSummary": "System Task Action"
            }
        ]"#;
        let tasks =
            parse_scheduled_tasks_json(json_str).expect("Parsing null dates should succeed");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].task_name, "TestNullDates");
        assert_eq!(tasks[0].last_run_time, None);
        assert_eq!(tasks[0].next_run_time, None);
    }

    #[test]
    fn test_parse_scheduled_tasks_json_empty_and_single() {
        let single_json = r#"{
            "taskName": "SingleTask",
            "taskPath": "\\",
            "state": "Disabled",
            "enabled": false,
            "triggerType": "Manual",
            "author": "User",
            "lastRunTime": "2026-07-27 10:00:00",
            "nextRunTime": null,
            "actionSummary": "C:\\cmd.exe"
        }"#;
        let tasks = parse_scheduled_tasks_json(single_json)
            .expect("Single object JSON parse should succeed");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].task_name, "SingleTask");
        assert!(!tasks[0].enabled);

        let empty_json = "[]";
        let empty_tasks =
            parse_scheduled_tasks_json(empty_json).expect("Empty array parse should succeed");
        assert_eq!(empty_tasks.len(), 0);
    }

    #[test]
    fn test_parse_scheduled_tasks_json_with_leading_whitespace() {
        let json_str = "\r\n  [\r\n    {\r\n      \"taskName\": \"Test\",\r\n      \"taskPath\": \"\\\\\",\r\n      \"state\": \"Ready\",\r\n      \"enabled\": true,\r\n      \"triggerType\": \"Daily\",\r\n      \"author\": \"Test\",\r\n      \"lastRunTime\": null,\r\n      \"nextRunTime\": null,\r\n      \"actionSummary\": \"test.exe\"\r\n    }\r\n  ]\r\n";
        let tasks = parse_scheduled_tasks_json(json_str)
            .expect("Parsing with leading whitespace should succeed");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].task_name, "Test");
    }

    #[test]
    fn test_toggle_scheduled_task_path_normalization() {
        let runner = DryRunRunner::new();
        let summary = toggle_scheduled_task(&runner, "Consolidator", "Microsoft\\Windows", false)
            .expect("Toggle dry run with unnormalized path should succeed");
        assert!(summary.success);
        assert_eq!(
            summary.executed_actions[0].command,
            "toggle_scheduled_task --name 'Consolidator' --path '\\Microsoft\\Windows\\' --enable false"
        );
        assert!(summary.executed_actions[0]
            .output
            .stdout
            .contains(r"'\Microsoft\Windows\'"));
    }
}

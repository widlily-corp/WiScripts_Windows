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

pub fn get_scheduled_tasks(runner: &dyn CommandRunner) -> Result<Vec<ScheduledTaskItem>, AppError> {
    if runner.is_dry_run() {
        return Ok(get_mock_scheduled_tasks());
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
$tasks = Get-ScheduledTask -ErrorAction SilentlyContinue | Select-Object -First 80 | ForEach-Object {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue
    $execAction = ($_.Actions | Select-Object -ExpandProperty Execute -ErrorAction SilentlyContinue) -join "; "
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
        lastRunTime = if ($info -and $info.LastRunTime) { $info.LastRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        nextRunTime = if ($info -and $info.NextRunTime) { $info.NextRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        actionSummary = $execAction
    }
}

if ($tasks.Count -eq 0) {
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
    if json_str.starts_with('[') {
        serde_json::from_str::<Vec<ScheduledTaskItem>>(json_str)
            .map_err(|e| AppError::Execution(format!("Failed to parse scheduled tasks array: {}", e)))
    } else {
        let single = serde_json::from_str::<ScheduledTaskItem>(json_str)
            .map_err(|e| AppError::Execution(format!("Failed to parse single scheduled task: {}", e)))?;
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

    if runner.is_dry_run() {
        return Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: action_id,
                name: action_name,
                command: format!(
                    "toggle_scheduled_task --name '{}' --path '{}' --enable {}",
                    task_name, task_path, enable
                ),
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!(
                        "[DRY-RUN] Toggled scheduled task '{}' at '{}' to enabled={}",
                        task_name, task_path, enable
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
        let safe_path = escape_ps_param(task_path);
        let verb = if enable {
            "Enable-ScheduledTask"
        } else {
            "Disable-ScheduledTask"
        };
        let script = format!(
            r#"
$name = '{safe_name}'
$path = '{safe_path}'
{verb} -TaskName $name -TaskPath $path
Write-Output "Toggled $name enabled={enable}"
"#,
            safe_name = safe_name,
            safe_path = safe_path,
            verb = verb,
            enable = enable
        );
        let output = runner.run_powershell(&script).map_err(AppError::Execution)?;
        if output.exit_code != 0 {
            return Err(AppError::Execution(format!(
                "Failed to toggle scheduled task '{}': {}",
                task_name, output.stderr
            )));
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

    if runner.is_dry_run() {
        return Ok(ExecutionSummary {
            success: true,
            executed_actions: vec![ExecutedAction {
                id: action_id,
                name: action_name,
                command: format!(
                    "run_scheduled_task --name '{}' --path '{}'",
                    task_name, task_path
                ),
                output: CommandOutput {
                    exit_code: 0,
                    stdout: format!("[DRY-RUN] Triggered task '{}' at '{}'", task_name, task_path),
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
        let safe_path = escape_ps_param(task_path);
        let script = format!(
            r#"
$name = '{safe_name}'
$path = '{safe_path}'
Start-ScheduledTask -TaskName $name -TaskPath $path
Write-Output "Started task $name"
"#,
            safe_name = safe_name,
            safe_path = safe_path
        );
        let output = runner.run_powershell(&script).map_err(AppError::Execution)?;
        if output.exit_code != 0 {
            return Err(AppError::Execution(format!(
                "Failed to run scheduled task '{}': {}",
                task_name, output.stderr
            )));
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
            action_summary: r"C:\Program Files (x86)\Common Files\Adobe\ARM\1.0\AdobeARM.exe".to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

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
        assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
    }

    #[test]
    fn test_run_scheduled_task_dry_run() {
        let runner = DryRunRunner::new();
        let summary = run_scheduled_task(&runner, "Consolidator", r"\Microsoft\")
            .expect("Run dry run should succeed");
        assert!(summary.success);
        assert!(summary.is_dry_run);
        assert_eq!(summary.executed_actions.len(), 1);
        assert!(summary.executed_actions[0].output.stdout.contains("[DRY-RUN]"));
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
}

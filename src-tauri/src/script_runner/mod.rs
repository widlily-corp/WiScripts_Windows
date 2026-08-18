pub mod sync;

use crate::error::AppError;
use crate::runner::{decode_bytes, CommandOutput};
pub use sync::{
    get_cached_scripts_library, read_library_script, safe_join_script_path,
    sanitize_script_relative_path, sync_scripts_library, ScriptManifestEntry, ScriptParameter,
    ScriptsLibraryManifest,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

static SCRIPT_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Payload emitted for each output line during custom script execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOutputLinePayload {
    pub line: String,
    pub stream: String, // "stdout" | "stderr"
}

/// Metadata describing an actively executing script.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunningScriptInfo {
    pub execution_id: String,
    pub pid: u32,
    pub script_type: String,
    pub elapsed_ms: u64,
}

/// Internal entry in the script execution registry.
#[derive(Debug, Clone)]
struct RunningScriptEntry {
    pub execution_id: String,
    pub pid: u32,
    pub script_type: String,
    pub start_time: Instant,
    pub cancel_flag: Arc<AtomicBool>,
}

/// Thread-safe global registry tracking running script processes.
#[derive(Debug, Default)]
pub struct ScriptExecutionRegistry {
    entries: Mutex<HashMap<String, RunningScriptEntry>>,
}

impl ScriptExecutionRegistry {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// Access the global singleton instance.
    pub fn global() -> &'static Self {
        static INSTANCE: OnceLock<ScriptExecutionRegistry> = OnceLock::new();
        INSTANCE.get_or_init(Self::new)
    }

    /// Registers a newly spawned script process, returning a cancellation token and RAII guard.
    pub fn register(
        &self,
        execution_id: &str,
        pid: u32,
        script_type: &str,
    ) -> (Arc<AtomicBool>, RunningScriptGuard) {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let entry = RunningScriptEntry {
            execution_id: execution_id.to_string(),
            pid,
            script_type: script_type.to_string(),
            start_time: Instant::now(),
            cancel_flag: cancel_flag.clone(),
        };

        if let Ok(mut map) = self.entries.lock() {
            map.insert(execution_id.to_string(), entry);
            log::info!(
                "[ScriptRegistry] Registered script execution '{}' (PID {})",
                execution_id,
                pid
            );
        }

        let guard = RunningScriptGuard {
            execution_id: execution_id.to_string(),
            cancel_flag: cancel_flag.clone(),
        };

        (cancel_flag, guard)
    }

    /// Unregisters a finished or terminated script execution.
    pub fn unregister(&self, execution_id: &str) -> Option<u32> {
        if let Ok(mut map) = self.entries.lock() {
            if let Some(entry) = map.remove(execution_id) {
                log::info!(
                    "[ScriptRegistry] Unregistered script execution '{}' (PID {})",
                    execution_id,
                    entry.pid
                );
                return Some(entry.pid);
            }
        }
        None
    }

    /// Cancels a running script by execution ID, triggering process tree termination.
    pub fn cancel(&self, execution_id: &str) -> Result<(), AppError> {
        let (pid, cancel_flag) = {
            let map = self.entries.lock().map_err(|e| {
                AppError::System(format!("Failed to lock script registry: {}", e))
            })?;

            let target_id = if (execution_id.trim().is_empty() || execution_id == "active") && map.len() == 1 {
                map.keys().next().cloned().unwrap_or_default()
            } else {
                execution_id.to_string()
            };

            if let Some(entry) = map.get(&target_id) {
                entry.cancel_flag.store(true, Ordering::SeqCst);
                (entry.pid, entry.cancel_flag.clone())
            } else {
                return Err(AppError::Execution(format!(
                    "No active running script found with execution ID '{}'",
                    execution_id
                )));
            }
        };

        cancel_flag.store(true, Ordering::SeqCst);
        kill_process_tree(pid);

        log::warn!(
            "[ScriptRegistry] Cancelled script execution '{}' (PID {} terminated)",
            execution_id,
            pid
        );

        Ok(())
    }

    /// Returns a list of all currently running script executions.
    pub fn list_running(&self) -> Vec<RunningScriptInfo> {
        if let Ok(map) = self.entries.lock() {
            map.values()
                .map(|e| RunningScriptInfo {
                    execution_id: e.execution_id.clone(),
                    pid: e.pid,
                    script_type: e.script_type.clone(),
                    elapsed_ms: e.start_time.elapsed().as_millis() as u64,
                })
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Returns true if the given execution ID has been flagged for cancellation.
    pub fn is_cancelled(&self, execution_id: &str) -> bool {
        if let Ok(map) = self.entries.lock() {
            if let Some(entry) = map.get(execution_id) {
                return entry.cancel_flag.load(Ordering::SeqCst);
            }
        }
        false
    }
}

/// RAII Guard ensuring active execution is unregistered from registry upon drop.
pub struct RunningScriptGuard {
    pub execution_id: String,
    pub cancel_flag: Arc<AtomicBool>,
}

impl RunningScriptGuard {
    pub fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::SeqCst)
    }
}

impl Drop for RunningScriptGuard {
    fn drop(&mut self) {
        ScriptExecutionRegistry::global().unregister(&self.execution_id);
    }
}

/// Terminates an entire Windows process tree for a given root PID using taskkill /F /T.
pub fn kill_process_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    log::info!("[ScriptRunner] Terminating process tree for PID {}", pid);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut kill_cmd = std::process::Command::new("taskkill");
        kill_cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
        kill_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        match kill_cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    log::info!("[ScriptRunner] taskkill terminated process tree for PID {}", pid);
                } else {
                    let err = String::from_utf8_lossy(&output.stderr);
                    log::debug!("[ScriptRunner] taskkill output for PID {}: {}", pid, err.trim());
                }
            }
            Err(e) => {
                log::warn!("[ScriptRunner] taskkill invocation failed for PID {}: {}", pid, e);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

/// RAII Guard ensuring temporary script files are removed when dropped.
pub struct TempScriptGuard {
    pub path: PathBuf,
}

impl TempScriptGuard {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

impl Drop for TempScriptGuard {
    fn drop(&mut self) {
        if self.path.exists() {
            if let Err(err) = std::fs::remove_file(&self.path) {
                log::warn!(
                    "[ScriptRunner] Failed to remove temporary script {:?}: {}",
                    self.path,
                    err
                );
            } else {
                log::info!("[ScriptRunner] Successfully deleted temporary script {:?}", self.path);
            }
        }
    }
}

/// Validates script content and script type.
fn validate_script_input(script_content: &str, script_type: &str) -> Result<String, AppError> {
    if script_content.trim().is_empty() {
        return Err(AppError::InvalidConfig(
            "Script content cannot be empty".to_string(),
        ));
    }

    let norm_type = script_type
        .trim()
        .trim_start_matches('.')
        .trim()
        .to_lowercase();

    match norm_type.as_str() {
        "ps1" | "bat" | "cmd" => Ok(norm_type),
        _ => Err(AppError::InvalidConfig(format!(
            "Unsupported script type '{}'. Must be 'ps1', 'bat', or 'cmd'.",
            script_type
        ))),
    }
}

/// Resolves the secure temporary scripts directory (%LOCALAPPDATA%\WiScripts\TempScripts\).
fn get_temp_scripts_dir() -> Result<PathBuf, AppError> {
    let base_dir = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|_| {
            dirs::data_local_dir().ok_or_else(|| {
                AppError::Io("Could not resolve local app data directory".to_string())
            })
        })
        .map_err(|e| match e {
            AppError::Io(s) => AppError::Io(s),
            _ => AppError::Io("Failed to determine LOCALAPPDATA directory".to_string()),
        })?;

    let temp_dir = base_dir.join("WiScripts").join("TempScripts");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| AppError::Io(format!("Failed to create TempScripts directory: {}", e)))?;

    Ok(temp_dir)
}

/// Cancels an actively running script execution.
#[tauri::command]
pub async fn cancel_running_script(execution_id: String) -> Result<(), AppError> {
    log::info!("[IPC] cancel_running_script invoked for execution_id='{}'", execution_id);
    ScriptExecutionRegistry::global().cancel(&execution_id)
}

/// Executes a custom PowerShell (.ps1) or Command (.bat/.cmd) script with live output streaming,
/// configurable execution timeout (default 300s), and thread-safe cancellation support.
#[tauri::command]
pub async fn execute_custom_script(
    app: tauri::AppHandle,
    script_content: String,
    script_type: String,
    dry_run: Option<bool>,
    execution_id: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<CommandOutput, AppError> {
    let norm_type = validate_script_input(&script_content, &script_type)?;
    let is_dry_run = dry_run.unwrap_or(false);
    let timeout_duration = Duration::from_secs(timeout_seconds.unwrap_or(300));

    log::info!(
        "[ScriptRunner] execute_custom_script invoked: type='{}', dry_run={}, timeout_secs={}, content_len={}",
        norm_type,
        is_dry_run,
        timeout_duration.as_secs(),
        script_content.len()
    );

    if is_dry_run {
        let lines: Vec<&str> = script_content.lines().collect();
        for line in &lines {
            let payload = ScriptOutputLinePayload {
                line: format!("[DRY-RUN] {}", line),
                stream: "stdout".to_string(),
            };
            let _ = app.emit("script-output-line", &payload);
        }

        return Ok(CommandOutput {
            exit_code: 0,
            stdout: format!("[DRY-RUN] Simulated {} script execution", norm_type),
            stderr: String::new(),
        });
    }

    tauri::async_runtime::spawn_blocking(move || {
        let temp_dir = get_temp_scripts_dir()?;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let pid = std::process::id();
        let counter = SCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let file_name = format!("wiscripts_{}_{}_{}.{}", timestamp, pid, counter, norm_type);
        let temp_path = temp_dir.join(file_name);

        let exec_id = execution_id.unwrap_or_else(|| format!("exec_{}_{}_{}", timestamp, pid, counter));

        let prepared_bytes = if norm_type == "ps1" {
            // Prepend UTF-8 BOM so PowerShell 5.1/7 parses encoding correctly without breaking param() AST position
            let mut bytes = vec![0xEF, 0xBB, 0xBF];
            bytes.extend_from_slice(script_content.as_bytes());
            bytes
        } else {
            script_content.into_bytes()
        };

        std::fs::write(&temp_path, &prepared_bytes).map_err(|e| {
            AppError::Io(format!("Failed to write script content to temp file: {}", e))
        })?;

        let _temp_guard = TempScriptGuard::new(temp_path.clone());

        let mut cmd = if norm_type == "ps1" {
            let mut c = std::process::Command::new("powershell.exe");
            c.args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                temp_path.to_str().ok_or_else(|| {
                    AppError::Execution("Invalid UTF-8 in temp script path".to_string())
                })?,
            ]);
            c
        } else {
            let mut c = std::process::Command::new("cmd.exe");
            c.args([
                "/C",
                temp_path.to_str().ok_or_else(|| {
                    AppError::Execution("Invalid UTF-8 in temp script path".to_string())
                })?,
            ]);
            c
        };

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            AppError::Execution(format!("Failed to spawn script execution process: {}", e))
        })?;

        let child_pid = child.id();
        let (_cancel_flag, _run_guard) = ScriptExecutionRegistry::global().register(&exec_id, child_pid, &norm_type);

        let stdout_pipe = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Execution("Failed to capture child stdout pipe".to_string()))?;

        let stderr_pipe = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Execution("Failed to capture child stderr pipe".to_string()))?;

        let app_handle_out = app.clone();
        let stdout_handle = std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout_pipe);
            let mut accumulated = String::new();
            let mut raw_buf = Vec::new();

            loop {
                raw_buf.clear();
                match reader.read_until(b'\n', &mut raw_buf) {
                    Ok(0) => break,
                    Ok(_) => {
                        let line_str = decode_bytes(&raw_buf);
                        let trimmed = line_str
                            .strip_suffix("\r\n")
                            .or_else(|| line_str.strip_suffix('\n'))
                            .unwrap_or(&line_str);

                        let payload = ScriptOutputLinePayload {
                            line: trimmed.to_string(),
                            stream: "stdout".to_string(),
                        };
                        let _ = app_handle_out.emit("script-output-line", &payload);

                        accumulated.push_str(&line_str);
                    }
                    Err(e) => {
                        log::error!("[ScriptRunner] Error reading stdout stream: {}", e);
                        break;
                    }
                }
            }
            accumulated
        });

        let app_handle_err = app.clone();
        let stderr_handle = std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stderr_pipe);
            let mut accumulated = String::new();
            let mut raw_buf = Vec::new();

            loop {
                raw_buf.clear();
                match reader.read_until(b'\n', &mut raw_buf) {
                    Ok(0) => break,
                    Ok(_) => {
                        let line_str = decode_bytes(&raw_buf);
                        let trimmed = line_str
                            .strip_suffix("\r\n")
                            .or_else(|| line_str.strip_suffix('\n'))
                            .unwrap_or(&line_str);

                        let payload = ScriptOutputLinePayload {
                            line: trimmed.to_string(),
                            stream: "stderr".to_string(),
                        };
                        let _ = app_handle_err.emit("script-output-line", &payload);

                        accumulated.push_str(&line_str);
                    }
                    Err(e) => {
                        log::error!("[ScriptRunner] Error reading stderr stream: {}", e);
                        break;
                    }
                }
            }
            accumulated
        });

        let start_time = Instant::now();
        let poll_interval = Duration::from_millis(50);

        let mut exit_status = None;
        let mut timed_out = false;
        let mut user_cancelled = false;

        loop {
            // 1. Check user cancellation
            if _run_guard.is_cancelled() {
                user_cancelled = true;
                break;
            }

            // 2. Check process completion
            match child.try_wait() {
                Ok(Some(status)) => {
                    exit_status = Some(status);
                    break;
                }
                Ok(None) => {
                    // Check timeout limit
                    if start_time.elapsed() >= timeout_duration {
                        timed_out = true;
                        break;
                    }
                    std::thread::sleep(poll_interval);
                }
                Err(e) => {
                    log::error!("[ScriptRunner] Error in child.try_wait(): {}", e);
                    break;
                }
            }
        }

        if user_cancelled {
            log::warn!("[ScriptRunner] Execution '{}' cancelled by user. Terminating process tree...", exec_id);
            let payload = ScriptOutputLinePayload {
                line: "[CANCELLED] Script execution was cancelled by user. Process terminated.".to_string(),
                stream: "stderr".to_string(),
            };
            let _ = app.emit("script-output-line", &payload);

            kill_process_tree(child_pid);
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_handle.join();
            let _ = stderr_handle.join();

            return Err(AppError::Execution(format!(
                "Script execution '{}' was cancelled by user",
                exec_id
            )));
        }

        if timed_out {
            log::error!(
                "[ScriptRunner] Execution '{}' timed out after {} seconds. Terminating process tree...",
                exec_id,
                timeout_duration.as_secs()
            );
            let payload = ScriptOutputLinePayload {
                line: format!(
                    "[TIMEOUT] Script execution timed out after {} seconds. Process terminated.",
                    timeout_duration.as_secs()
                ),
                stream: "stderr".to_string(),
            };
            let _ = app.emit("script-output-line", &payload);

            kill_process_tree(child_pid);
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_handle.join();
            let _ = stderr_handle.join();

            return Err(AppError::Execution(format!(
                "Script execution timed out after {} seconds",
                timeout_duration.as_secs()
            )));
        }

        let status = match exit_status {
            Some(s) => s,
            None => {
                kill_process_tree(child_pid);
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err(AppError::Execution("Failed to obtain script process exit status".to_string()));
            }
        };

        let stdout = stdout_handle.join().unwrap_or_default();
        let stderr = stderr_handle.join().unwrap_or_default();
        let exit_code = status.code().unwrap_or(-1);

        log::info!(
            "[ScriptRunner] Execution '{}' finished with exit code {}. stdout_bytes={}, stderr_bytes={}",
            exec_id,
            exit_code,
            stdout.len(),
            stderr.len()
        );

        Ok(CommandOutput {
            exit_code,
            stdout,
            stderr,
        })
    })
    .await
    .map_err(|e| AppError::System(format!("Async join error in execute_custom_script: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_script_input_valid_types() {
        let res_ps1 = validate_script_input("Write-Host 'Hello'", "ps1");
        let res_dot_ps1 = validate_script_input("Write-Host 'Hello'", ".ps1");
        let res_bat = validate_script_input("@echo off", "BAT");
        let res_cmd = validate_script_input("echo test", ".CMD");

        assert_eq!(res_ps1.unwrap(), "ps1");
        assert_eq!(res_dot_ps1.unwrap(), "ps1");
        assert_eq!(res_bat.unwrap(), "bat");
        assert_eq!(res_cmd.unwrap(), "cmd");
    }

    #[test]
    fn test_validate_script_input_empty_content_returns_invalid_config() {
        let empty_input = "   \n\t  ";
        let result = validate_script_input(empty_input, "ps1");

        assert!(result.is_err());
        if let Err(AppError::InvalidConfig(msg)) = result {
            assert!(msg.contains("Script content cannot be empty"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }

    #[test]
    fn test_validate_script_input_unsupported_type_returns_invalid_config() {
        let valid_script = "echo hello";
        let result = validate_script_input(valid_script, "sh");

        assert!(result.is_err());
        if let Err(AppError::InvalidConfig(msg)) = result {
            assert!(msg.contains("Unsupported script type 'sh'"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }

    #[test]
    fn test_temp_script_guard_removes_file_on_drop() {
        let temp_dir = std::env::temp_dir().join("wiscripts_test_temp_guard");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let test_file = temp_dir.join("test_script.ps1");
        std::fs::write(&test_file, "Write-Host 'Test'").unwrap();

        assert!(test_file.exists());

        {
            let _guard = TempScriptGuard::new(test_file.clone());
            assert!(test_file.exists());
        }

        assert!(!test_file.exists(), "File should be deleted when guard is dropped");
        let _ = std::fs::remove_dir(&temp_dir);
    }

    #[test]
    fn test_get_temp_scripts_dir_creates_directory() {
        let res = get_temp_scripts_dir();

        assert!(res.is_ok());
        let dir_path = res.unwrap();
        assert!(dir_path.exists());
        assert!(dir_path.ends_with(std::path::Path::new("WiScripts").join("TempScripts")));
    }

    #[test]
    fn test_script_output_line_payload_serialization() {
        let payload = ScriptOutputLinePayload {
            line: "Hello world".to_string(),
            stream: "stdout".to_string(),
        };

        let json_str = serde_json::to_string(&payload).unwrap();
        assert!(json_str.contains("\"line\":\"Hello world\""));
        assert!(json_str.contains("\"stream\":\"stdout\""));
    }

    #[test]
    fn test_temp_script_guard_handles_nonexistent_file() {
        let nonexistent_path = std::env::temp_dir().join("wiscripts_nonexistent_file_12345.ps1");
        assert!(!nonexistent_path.exists());

        {
            let _guard = TempScriptGuard::new(nonexistent_path.clone());
        }
        assert!(!nonexistent_path.exists());
    }

    #[test]
    fn test_validate_script_input_adversarial_cases() {
        assert_eq!(validate_script_input("echo test", " ps1 ").unwrap(), "ps1");
        assert_eq!(validate_script_input("echo test", " .BAT ").unwrap(), "bat");
        assert_eq!(validate_script_input("echo test", "CMD").unwrap(), "cmd");
        assert_eq!(validate_script_input("echo test", " . ps1 ").unwrap(), "ps1");

        assert!(validate_script_input("echo test", "exe").is_err());
        assert!(validate_script_input("echo test", "vbs").is_err());
        assert!(validate_script_input("echo test", "ps1; calc.exe").is_err());
        assert!(validate_script_input("echo test", "..\\ps1").is_err());

        let unicode_script = "Write-Host 'Привет, мир! 🚀 123'";
        assert_eq!(validate_script_input(unicode_script, "ps1").unwrap(), "ps1");
    }

    #[test]
    fn test_temp_script_counter_atomic_uniqueness() {
        use std::collections::HashSet;

        let set = Arc::new(Mutex::new(HashSet::new()));
        let mut handles = vec![];

        for _ in 0..10 {
            let set_clone = Arc::clone(&set);
            handles.push(std::thread::spawn(move || {
                for _ in 0..50 {
                    let pid = std::process::id();
                    let counter = SCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed);
                    let name = format!("{}_{}", pid, counter);
                    let mut s = set_clone.lock().unwrap();
                    assert!(!s.contains(&name), "Duplicate counter name generated!");
                    s.insert(name);
                }
            }));
        }

        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn test_script_registry_lifecycle_and_cancellation() {
        let registry = ScriptExecutionRegistry::global();
        let exec_id = "test_exec_001_lifecycle";
        let fake_pid = 999999;

        // Register
        let (cancel_flag, guard) = registry.register(exec_id, fake_pid, "ps1");
        assert!(!cancel_flag.load(Ordering::SeqCst));
        assert!(!guard.is_cancelled());
        assert!(!registry.is_cancelled(exec_id));

        // Verify listing
        let running = registry.list_running();
        assert!(running.iter().any(|r| r.execution_id == exec_id && r.pid == fake_pid && r.script_type == "ps1"));

        // Cancel
        let cancel_res = registry.cancel(exec_id);
        assert!(cancel_res.is_ok());
        assert!(cancel_flag.load(Ordering::SeqCst));
        assert!(guard.is_cancelled());
        assert!(registry.is_cancelled(exec_id));

        // Drop guard unregisters
        drop(guard);
        let running_after = registry.list_running();
        assert!(!running_after.iter().any(|r| r.execution_id == exec_id));
    }

    #[test]
    fn test_script_registry_instance_methods() {
        let registry = ScriptExecutionRegistry::new();
        let exec_id = "test_exec_instance_002";
        let fake_pid = 888888;
        let (_cancel, _guard) = registry.register(exec_id, fake_pid, "cmd");
        assert_eq!(registry.list_running().len(), 1);
        let unreg = registry.unregister(exec_id);
        assert_eq!(unreg, Some(fake_pid));
        assert_eq!(registry.list_running().len(), 0);
    }

    #[test]
    fn test_script_registry_cancel_unknown_execution_id() {
        let registry = ScriptExecutionRegistry::new();
        let res = registry.cancel("non_existent_execution_id");
        assert!(res.is_err());
        if let Err(AppError::Execution(msg)) = res {
            assert!(msg.contains("No active running script found"));
        } else {
            panic!("Expected AppError::Execution for unknown execution_id");
        }
    }

    #[test]
    fn test_running_script_info_serialization() {
        let info = RunningScriptInfo {
            execution_id: "exec_123".to_string(),
            pid: 4567,
            script_type: "ps1".to_string(),
            elapsed_ms: 1500,
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"executionId\":\"exec_123\""));
        assert!(json.contains("\"pid\":4567"));
        assert!(json.contains("\"scriptType\":\"ps1\""));
        assert!(json.contains("\"elapsedMs\":1500"));
    }

    #[test]
    fn test_kill_process_tree_zero_pid_is_safe_noop() {
        // pid 0 must be handled gracefully without running taskkill
        kill_process_tree(0);
    }
}

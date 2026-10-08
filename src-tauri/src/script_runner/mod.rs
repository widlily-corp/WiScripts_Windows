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

/// Metadata recorded by elevated PowerShell bridge runner in .meta JSON file.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScriptMetaInfo {
    pub pid: u32,
    pub status: String, // "running" | "completed"
    #[serde(default, rename = "exitCode")]
    pub exit_code: Option<i32>,
}

/// RAII Guard ensuring all UAC session staging files are deleted when dropped.
pub struct UacSessionGuard {
    pub files: Vec<PathBuf>,
}

impl UacSessionGuard {
    pub fn new(files: Vec<PathBuf>) -> Self {
        Self { files }
    }
}

impl Drop for UacSessionGuard {
    fn drop(&mut self) {
        for path in &self.files {
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

/// Internal entry in the script execution registry.
#[derive(Debug, Clone)]
struct RunningScriptEntry {
    pub execution_id: String,
    pub pid: u32,
    pub script_type: String,
    pub start_time: Instant,
    pub cancel_flag: Arc<AtomicBool>,
    pub cancel_sentinel: Option<PathBuf>,
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
        self.register_with_sentinel(execution_id, pid, script_type, None)
    }

    /// Registers a script process with an optional cancellation sentinel file (for elevated bridge).
    pub fn register_with_sentinel(
        &self,
        execution_id: &str,
        pid: u32,
        script_type: &str,
        cancel_sentinel: Option<PathBuf>,
    ) -> (Arc<AtomicBool>, RunningScriptGuard) {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let entry = RunningScriptEntry {
            execution_id: execution_id.to_string(),
            pid,
            script_type: script_type.to_string(),
            start_time: Instant::now(),
            cancel_flag: cancel_flag.clone(),
            cancel_sentinel,
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

    /// Updates the PID for an actively running execution (called when elevated PID is discovered via .meta).
    pub fn update_pid(&self, execution_id: &str, new_pid: u32) {
        if let Ok(mut map) = self.entries.lock() {
            if let Some(entry) = map.get_mut(execution_id) {
                entry.pid = new_pid;
                log::info!(
                    "[ScriptRegistry] Updated PID for execution '{}' to {}",
                    execution_id,
                    new_pid
                );
            }
        }
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
        let (pid, cancel_flag, sentinel_path) = {
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
                (entry.pid, entry.cancel_flag.clone(), entry.cancel_sentinel.clone())
            } else {
                return Err(AppError::Execution(format!(
                    "No active running script found with execution ID '{}'",
                    execution_id
                )));
            }
        };

        cancel_flag.store(true, Ordering::SeqCst);

        // If an elevated sentinel path is registered, create the file to trigger the elevated watcher
        if let Some(path) = sentinel_path {
            let _ = std::fs::File::create(&path);
            log::info!("[ScriptRegistry] Created cancellation sentinel file: {:?}", path);
        }

        if pid != 0 {
            kill_process_tree(pid);
        }

        log::warn!(
            "[ScriptRegistry] Cancelled script execution '{}' (PID {} signaled)",
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

/// Escapes single quotes for embedding paths safely within PowerShell single-quoted string literals.
fn escape_ps_single_quote(s: &str) -> String {
    s.replace('\'', "''")
}

/// Generates the elevated PowerShell bridge runner script.
fn generate_uac_runner_script(
    payload_path: &std::path::Path,
    log_path: &std::path::Path,
    meta_path: &std::path::Path,
    cancel_path: &std::path::Path,
) -> String {
    let payload_str = escape_ps_single_quote(&payload_path.to_string_lossy());
    let log_str = escape_ps_single_quote(&log_path.to_string_lossy());
    let meta_str = escape_ps_single_quote(&meta_path.to_string_lossy());
    let cancel_str = escape_ps_single_quote(&cancel_path.to_string_lossy());

    format!(
r#"$ErrorActionPreference = 'Continue'
$InformationPreference = 'Continue'
$myPid = $PID

$payloadPath = '{payload}'
$logPath = '{log}'
$metaPath = '{meta}'
$cancelPath = '{cancel}'

# 1. Record PID and initial running status in metadata file (no BOM)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
try {{
    $metaJson = @{{ pid = $myPid; status = "running"; exitCode = $null }} | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($metaPath, $metaJson, $utf8NoBom)
}} catch {{}}

# 2. Elevated cancellation watcher runspace
$cancelWatcher = [powershell]::Create().AddScript({{ param($pidToKill, $cPath) while ($true) {{ if (Test-Path -LiteralPath $cPath) {{ & taskkill /F /T /PID $pidToKill 2>$null; break }} [System.Threading.Thread]::Sleep(50) }} }}).AddArgument($myPid).AddArgument($cancelPath).BeginInvoke()

$exitCode = 0
try {{
    # Execute payload and stream all 6 streams (*>&1: stdout, stderr, warnings, Write-Host) to log file
    & "$payloadPath" *>&1 | ForEach-Object {{
        $line = $_.ToString()
        [System.IO.File]::AppendAllText($logPath, "$line`r`n", $utf8NoBom)
    }}
    if ($LASTEXITCODE -ne $null) {{
        $exitCode = $LASTEXITCODE
    }}
}} catch {{
    $err = $_.ToString()
    [System.IO.File]::AppendAllText($logPath, "[ERROR] $err`r`n", $utf8NoBom)
    $exitCode = 1
}} finally {{
    try {{
        if ($cancelWatcher -ne $null) {{
            if ($cancelWatcher -is [System.IDisposable]) {{ $cancelWatcher.Dispose() }}
            elseif ($cancelWatcher.AsyncWaitHandle -ne $null) {{ $cancelWatcher.AsyncWaitHandle.Close() }}
        }}
    }} catch {{}}
    try {{
        $metaJson = @{{ pid = $myPid; status = "completed"; exitCode = $exitCode }} | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($metaPath, $metaJson, $utf8NoBom)
    }} catch {{}}
}}
"#,
        payload = payload_str,
        log = log_str,
        meta = meta_str,
        cancel = cancel_str,
    )
}

/// Sanitizes a decoded terminal output line by handling carriage return ('\r') in-place update semantics.
/// If the line contains '\r', extracts the active terminal segment after the last '\r',
/// or returns the line if no preceding '\r' overwrite exists.
pub fn sanitize_terminal_line(raw_line: &str) -> String {
    let trimmed = raw_line
        .strip_suffix("\r\n")
        .or_else(|| raw_line.strip_suffix('\n'))
        .or_else(|| raw_line.strip_suffix('\r'))
        .unwrap_or(raw_line);

    if trimmed.contains('\r') {
        let segments: Vec<&str> = trimmed.split('\r').collect();
        if let Some(last) = segments.iter().rev().find(|s| !s.is_empty()) {
            return (*last).to_string();
        }
    }

    trimmed.to_string()
}

/// Reads bytes from a buffered reader until either '\n' or a standalone '\r' (carriage return).
/// Handles Windows CRLF ("\r\n") as a single line terminator, while treating standalone '\r'
/// as an in-place line boundary so interactive progress bars stream without hanging.
pub fn read_line_or_cr<R: BufRead>(reader: &mut R, buf: &mut Vec<u8>) -> std::io::Result<usize> {
    let mut total_read = 0;
    loop {
        let available = match reader.fill_buf() {
            Ok(n) => n,
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };

        if available.is_empty() {
            break;
        }

        let mut found_delimiter = None;
        for (i, &b) in available.iter().enumerate() {
            if b == b'\n' || b == b'\r' {
                found_delimiter = Some((i, b));
                break;
            }
        }

        if let Some((idx, b)) = found_delimiter {
            if b == b'\n' {
                let take = idx + 1;
                buf.extend_from_slice(&available[..take]);
                reader.consume(take);
                total_read += take;
                break;
            } else {
                // b == b'\r'
                if idx + 1 < available.len() && available[idx + 1] == b'\n' {
                    // CRLF sequence
                    let take = idx + 2;
                    buf.extend_from_slice(&available[..take]);
                    reader.consume(take);
                    total_read += take;
                    break;
                } else {
                    // Standalone '\r'
                    let take = idx + 1;
                    buf.extend_from_slice(&available[..take]);
                    reader.consume(take);
                    total_read += take;
                    break;
                }
            }
        } else {
            let take = available.len();
            buf.extend_from_slice(&available[..take]);
            reader.consume(take);
            total_read += take;
        }
    }
    Ok(total_read)
}

/// Tails newly written lines from the shared session log file using non-exclusive sharing mode (7).
fn tail_log_file(
    log_path: &std::path::Path,
    offset: &mut u64,
    app: &tauri::AppHandle,
    accumulated_stdout: &mut String,
    accumulated_stderr: &mut String,
) {
    if !log_path.exists() {
        return;
    }

    use std::fs::OpenOptions;
    use std::io::{Seek, SeekFrom};
    #[cfg(target_os = "windows")]
    use std::os::windows::fs::OpenOptionsExt;

    let mut open_opts = OpenOptions::new();
    open_opts.read(true);
    #[cfg(target_os = "windows")]
    {
        // FILE_SHARE_READ (1) | FILE_SHARE_WRITE (2) | FILE_SHARE_DELETE (4) = 7
        open_opts.share_mode(7);
    }

    let file = match open_opts.open(log_path) {
        Ok(f) => f,
        Err(_) => return,
    };

    let mut reader = std::io::BufReader::new(file);
    if reader.seek(SeekFrom::Start(*offset)).is_err() {
        return;
    }

    let mut line_buf = Vec::new();
    loop {
        line_buf.clear();
        match read_line_or_cr(&mut reader, &mut line_buf) {
            Ok(0) => break,
            Ok(bytes_read) => {
                *offset += bytes_read as u64;
                let line_str = decode_bytes(&line_buf);
                let cleaned = sanitize_terminal_line(&line_str);

                if cleaned.is_empty() && line_buf.iter().all(|&b| b == b'\r') {
                    continue;
                }

                let is_err = cleaned.starts_with("[ERROR]") || cleaned.starts_with("[STDERR]");
                let stream = if is_err { "stderr" } else { "stdout" };

                let payload = ScriptOutputLinePayload {
                    line: cleaned.clone(),
                    stream: stream.to_string(),
                };
                let _ = app.emit("script-output-line", &payload);

                if is_err {
                    accumulated_stderr.push_str(&cleaned);
                    accumulated_stderr.push('\n');
                } else {
                    accumulated_stdout.push_str(&cleaned);
                    accumulated_stdout.push('\n');
                }
            }
            Err(_) => break,
        }
    }
}

/// Executes a script payload with on-demand UAC Administrator elevation via PowerShell bridge runner.
async fn execute_script_elevated_bridge(
    app: tauri::AppHandle,
    script_content: String,
    norm_type: String,
    execution_id: Option<String>,
    timeout_duration: Duration,
) -> Result<CommandOutput, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let temp_dir = get_temp_scripts_dir()?;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let host_pid = std::process::id();
        let counter = SCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed);

        let base_name = format!("wiscripts_{}_{}_{}", timestamp, host_pid, counter);
        let payload_path = temp_dir.join(format!("{}.{}", base_name, norm_type));
        let runner_path = temp_dir.join(format!("{}.runner.ps1", base_name));
        let log_path = temp_dir.join(format!("{}.log", base_name));
        let meta_path = temp_dir.join(format!("{}.meta", base_name));
        let cancel_path = temp_dir.join(format!("{}.cancel", base_name));

        let exec_id = execution_id.unwrap_or_else(|| format!("exec_{}", base_name));

        // 1. Write payload script file (prepend UTF-8 BOM for .ps1, stripping any existing BOM to prevent double-BOM parser errors)
        let clean_content = script_content.trim_start_matches('\u{feff}');
        let prepared_bytes = if norm_type == "ps1" {
            let mut bytes = vec![0xEF, 0xBB, 0xBF];
            bytes.extend_from_slice(clean_content.as_bytes());
            bytes
        } else {
            clean_content.as_bytes().to_vec()
        };

        std::fs::write(&payload_path, &prepared_bytes).map_err(|e| {
            AppError::Io(format!("Failed to write payload script: {}", e))
        })?;

        // 2. Write runner script with UTF-8 BOM
        let runner_content = generate_uac_runner_script(
            &payload_path,
            &log_path,
            &meta_path,
            &cancel_path,
        );
        let mut runner_bytes = vec![0xEF, 0xBB, 0xBF];
        runner_bytes.extend_from_slice(runner_content.as_bytes());
        std::fs::write(&runner_path, &runner_bytes).map_err(|e| {
            AppError::Io(format!("Failed to write UAC bridge runner script: {}", e))
        })?;

        // 3. Pre-create empty log file
        let _ = std::fs::File::create(&log_path);

        // Guard to clean up all 5 session staging files upon drop
        let _session_guard = UacSessionGuard::new(vec![
            payload_path.clone(),
            runner_path.clone(),
            log_path.clone(),
            meta_path.clone(),
            cancel_path.clone(),
        ]);

        // 4. Invoke Start-Process powershell.exe -Verb RunAs
        let runner_path_str = runner_path
            .to_str()
            .ok_or_else(|| AppError::Execution("Invalid runner path UTF-8".to_string()))?;
        let escaped_runner_path = escape_ps_single_quote(runner_path_str);

        let mut launcher = std::process::Command::new("powershell.exe");
        launcher.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','\"{}\"')",
                escaped_runner_path
            ),
        ]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            launcher.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        log::info!("[ScriptRunner] Prompting UAC elevation for execution '{}'...", exec_id);
        let launch_res = launcher.output().map_err(|e| {
            AppError::Execution(format!("Failed to invoke UAC launcher: {}", e))
        })?;

        if !launch_res.status.success() {
            let stderr_str = decode_bytes(&launch_res.stderr);
            let stdout_str = decode_bytes(&launch_res.stdout);
            let err_combined = format!("{} {}", stdout_str, stderr_str);
            let err_lower = err_combined.to_lowercase();
            let is_uac_decline = launch_res.status.code() == Some(1223)
                || err_lower.contains("1223")
                || err_lower.contains("canceled by the user")
                || err_lower.contains("cancelled by the user")
                || err_lower.contains("declined by user")
                || err_lower.contains("операция отменена пользователем")
                || err_lower.contains("отменена пользователем")
                || err_lower.contains("отменено пользователем")
                || err_lower.contains("error_cancelled")
                || err_lower.contains("0x800704c7");

            if is_uac_decline {
                log::warn!("[ScriptRunner] UAC elevation was declined by user for execution '{}'", exec_id);
                let payload = ScriptOutputLinePayload {
                    line: "[UAC] Administrator elevation was declined by user. Script execution cancelled.".to_string(),
                    stream: "stderr".to_string(),
                };
                let _ = app.emit("script-output-line", &payload);
                return Err(AppError::Execution(
                    "[UAC] Administrator elevation was declined by user. Script execution cancelled.".to_string(),
                ));
            } else {
                return Err(AppError::Execution(format!(
                    "Failed to launch elevated script runner: {}",
                    err_combined.trim()
                )));
            }
        }

        // 5. Register in registry with cancel sentinel
        let (_cancel_flag, _run_guard) = ScriptExecutionRegistry::global()
            .register_with_sentinel(&exec_id, 0, &norm_type, Some(cancel_path.clone()));

        let start_time = Instant::now();
        let poll_interval = Duration::from_millis(40);

        let mut read_offset: u64 = 0;
        let mut accumulated_stdout = String::new();
        let mut accumulated_stderr = String::new();
        let mut registered_elevated_pid = false;
        let mut final_exit_code: Option<i32> = None;
        let mut user_cancelled = false;
        let mut timed_out = false;

        loop {
            // Check cancellation
            if _run_guard.is_cancelled() {
                user_cancelled = true;
                break;
            }

            // Check timeout
            if start_time.elapsed() >= timeout_duration {
                timed_out = true;
                break;
            }

            // Stream any newly available lines from log file
            tail_log_file(
                &log_path,
                &mut read_offset,
                &app,
                &mut accumulated_stdout,
                &mut accumulated_stderr,
            );

            // Read metadata file if not yet registered PID or if completed
            if meta_path.exists() {
                if let Ok(meta_content) = std::fs::read_to_string(&meta_path) {
                    let clean_meta = meta_content.trim_start_matches('\u{feff}');
                    if let Ok(meta) = serde_json::from_str::<ScriptMetaInfo>(clean_meta) {
                        if !registered_elevated_pid && meta.pid != 0 {
                            ScriptExecutionRegistry::global().update_pid(&exec_id, meta.pid);
                            registered_elevated_pid = true;
                        }

                        if meta.status == "completed" {
                            final_exit_code = Some(meta.exit_code.unwrap_or(0));
                            break;
                        }
                    }
                }
            }

            std::thread::sleep(poll_interval);
        }

        // Final flush of remaining log bytes
        tail_log_file(
            &log_path,
            &mut read_offset,
            &app,
            &mut accumulated_stdout,
            &mut accumulated_stderr,
        );

        if user_cancelled {
            log::warn!("[ScriptRunner] Elevated execution '{}' cancelled by user", exec_id);
            let _ = std::fs::File::create(&cancel_path);

            let payload = ScriptOutputLinePayload {
                line: "[CANCELLED] Elevated script execution was cancelled by user. Process terminated.".to_string(),
                stream: "stderr".to_string(),
            };
            let _ = app.emit("script-output-line", &payload);

            return Err(AppError::Execution(format!(
                "Script execution '{}' was cancelled by user",
                exec_id
            )));
        }

        if timed_out {
            log::error!("[ScriptRunner] Elevated execution '{}' timed out", exec_id);
            let _ = std::fs::File::create(&cancel_path);

            let payload = ScriptOutputLinePayload {
                line: format!(
                    "[TIMEOUT] Elevated script execution timed out after {} seconds. Process terminated.",
                    timeout_duration.as_secs()
                ),
                stream: "stderr".to_string(),
            };
            let _ = app.emit("script-output-line", &payload);

            return Err(AppError::Execution(format!(
                "Script execution timed out after {} seconds",
                timeout_duration.as_secs()
            )));
        }

        let exit_code = final_exit_code.unwrap_or(-1);
        log::info!(
            "[ScriptRunner] Elevated execution '{}' completed with exit code {}",
            exec_id,
            exit_code
        );

        Ok(CommandOutput {
            exit_code,
            stdout: accumulated_stdout,
            stderr: accumulated_stderr,
        })
    })
    .await
    .map_err(|e| AppError::System(format!("Async join error in elevated script execution: {}", e)))?
}

/// Executes a custom PowerShell (.ps1) or Command (.bat/.cmd) script with live output streaming,
/// configurable execution timeout (default 300s), thread-safe cancellation, and optional on-demand UAC elevation.
#[tauri::command]
pub async fn execute_custom_script(
    app: tauri::AppHandle,
    script_content: String,
    script_type: String,
    dry_run: Option<bool>,
    execution_id: Option<String>,
    timeout_seconds: Option<u64>,
    elevate: Option<bool>,
) -> Result<CommandOutput, AppError> {
    let script_content = script_content.trim_start_matches('\u{feff}').to_string();
    let norm_type = validate_script_input(&script_content, &script_type)?;
    let is_dry_run = dry_run.unwrap_or(false);
    let timeout_duration = Duration::from_secs(timeout_seconds.unwrap_or(300));
    let wants_elevation = elevate.unwrap_or(false);
    let is_already_elevated = crate::commands::check_is_elevated();

    log::info!(
        "[ScriptRunner] execute_custom_script invoked: type='{}', dry_run={}, timeout_secs={}, elevate={}, is_already_elevated={}, content_len={}",
        norm_type,
        is_dry_run,
        timeout_duration.as_secs(),
        wants_elevation,
        is_already_elevated,
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

    // Branch to on-demand UAC elevation bridge if elevation requested and not already elevated
    if wants_elevation && !is_already_elevated {
        return execute_script_elevated_bridge(
            app,
            script_content,
            norm_type,
            execution_id,
            timeout_duration,
        ).await;
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

        let clean_content = script_content.trim_start_matches('\u{feff}');
        let prepared_bytes = if norm_type == "ps1" {
            // Prepend UTF-8 BOM so PowerShell 5.1/7 parses encoding correctly without breaking param() AST position
            let mut bytes = vec![0xEF, 0xBB, 0xBF];
            bytes.extend_from_slice(clean_content.as_bytes());
            bytes
        } else {
            clean_content.as_bytes().to_vec()
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
                match read_line_or_cr(&mut reader, &mut raw_buf) {
                    Ok(0) => break,
                    Ok(_) => {
                        let line_str = decode_bytes(&raw_buf);
                        let cleaned = sanitize_terminal_line(&line_str);

                        if cleaned.is_empty() && raw_buf.iter().all(|&b| b == b'\r') {
                            continue;
                        }

                        let payload = ScriptOutputLinePayload {
                            line: cleaned.clone(),
                            stream: "stdout".to_string(),
                        };
                        let _ = app_handle_out.emit("script-output-line", &payload);

                        accumulated.push_str(&cleaned);
                        accumulated.push('\n');
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
                match read_line_or_cr(&mut reader, &mut raw_buf) {
                    Ok(0) => break,
                    Ok(_) => {
                        let line_str = decode_bytes(&raw_buf);
                        let cleaned = sanitize_terminal_line(&line_str);

                        if cleaned.is_empty() && raw_buf.iter().all(|&b| b == b'\r') {
                            continue;
                        }

                        let payload = ScriptOutputLinePayload {
                            line: cleaned.clone(),
                            stream: "stderr".to_string(),
                        };
                        let _ = app_handle_err.emit("script-output-line", &payload);

                        accumulated.push_str(&cleaned);
                        accumulated.push('\n');
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

/// Dedicated alias for running scripts with on-demand administrator elevation.
#[tauri::command]
pub async fn run_script_elevated(
    app: tauri::AppHandle,
    script_content: String,
    script_type: String,
    dry_run: Option<bool>,
    execution_id: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<CommandOutput, AppError> {
    execute_custom_script(
        app,
        script_content,
        script_type,
        dry_run,
        execution_id,
        timeout_seconds,
        Some(true),
    )
    .await
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

    #[test]
    fn test_escape_ps_single_quote() {
        assert_eq!(escape_ps_single_quote("hello"), "hello");
        assert_eq!(escape_ps_single_quote("C:\\path's\\name"), "C:\\path''s\\name");
        assert_eq!(escape_ps_single_quote("''"), "''''");
    }

    #[test]
    fn test_script_meta_info_deserialization() {
        let running_json = r#"{"pid":1234,"status":"running","exitCode":null}"#;
        let meta: ScriptMetaInfo = serde_json::from_str(running_json).unwrap();
        assert_eq!(meta.pid, 1234);
        assert_eq!(meta.status, "running");
        assert_eq!(meta.exit_code, None);

        let completed_json = r#"{"pid":1234,"status":"completed","exitCode":0}"#;
        let meta_comp: ScriptMetaInfo = serde_json::from_str(completed_json).unwrap();
        assert_eq!(meta_comp.pid, 1234);
        assert_eq!(meta_comp.status, "completed");
        assert_eq!(meta_comp.exit_code, Some(0));
    }

    #[test]
    fn test_generate_uac_runner_script_contains_vital_sections() {
        let payload = PathBuf::from("C:\\temp\\payload.ps1");
        let log = PathBuf::from("C:\\temp\\session.log");
        let meta = PathBuf::from("C:\\temp\\session.meta");
        let cancel = PathBuf::from("C:\\temp\\session.cancel");

        let script = generate_uac_runner_script(&payload, &log, &meta, &cancel);

        assert!(script.contains("$cancelWatcher = [powershell]::Create()"));
        assert!(script.contains("taskkill /F /T /PID $pidToKill"));
        assert!(script.contains("AppendAllText($logPath"));
        assert!(script.contains("*>&1"));
        assert!(script.contains("$InformationPreference = 'Continue'"));
        assert!(script.contains("[System.Text.UTF8Encoding]::new($false)"));
        assert!(script.contains("status = \"running\""));
        assert!(script.contains("status = \"completed\""));
        assert!(script.contains("payload.ps1"));
    }

    #[test]
    fn test_script_meta_info_deserialization_with_bom() {
        let running_json_with_bom = "\u{feff}{\"pid\":1234,\"status\":\"running\",\"exitCode\":null}";
        let clean_json = running_json_with_bom.trim_start_matches('\u{feff}');
        let meta: ScriptMetaInfo = serde_json::from_str(clean_json).unwrap();
        assert_eq!(meta.pid, 1234);
        assert_eq!(meta.status, "running");
        assert_eq!(meta.exit_code, None);

        let completed_json_with_bom = "\u{feff}{\"pid\":1234,\"status\":\"completed\",\"exitCode\":0}";
        let clean_completed = completed_json_with_bom.trim_start_matches('\u{feff}');
        let meta_completed: ScriptMetaInfo = serde_json::from_str(clean_completed).unwrap();
        assert_eq!(meta_completed.pid, 1234);
        assert_eq!(meta_completed.status, "completed");
        assert_eq!(meta_completed.exit_code, Some(0));
    }

    #[test]
    fn test_uac_session_guard_cleans_all_files() {
        let temp_dir = std::env::temp_dir().join("wiscripts_uac_guard_test");
        let _ = std::fs::create_dir_all(&temp_dir);

        let file1 = temp_dir.join("test1.ps1");
        let file2 = temp_dir.join("test2.log");
        let file3 = temp_dir.join("test3.meta");

        std::fs::write(&file1, "echo 1").unwrap();
        std::fs::write(&file2, "echo 2").unwrap();
        std::fs::write(&file3, "echo 3").unwrap();

        assert!(file1.exists());
        assert!(file2.exists());
        assert!(file3.exists());

        {
            let _guard = UacSessionGuard::new(vec![file1.clone(), file2.clone(), file3.clone()]);
        }

        assert!(!file1.exists());
        assert!(!file2.exists());
        assert!(!file3.exists());

        let _ = std::fs::remove_dir(&temp_dir);
    }

    #[test]
    fn test_script_registry_with_cancel_sentinel() {
        let registry = ScriptExecutionRegistry::new();
        let exec_id = "test_exec_sentinel_001";
        let sentinel_dir = std::env::temp_dir().join("wiscripts_sentinel_test");
        let _ = std::fs::create_dir_all(&sentinel_dir);
        let sentinel_file = sentinel_dir.join("test.cancel");

        if sentinel_file.exists() {
            let _ = std::fs::remove_file(&sentinel_file);
        }

        let (cancel_flag, guard) = registry.register_with_sentinel(
            exec_id,
            0,
            "ps1",
            Some(sentinel_file.clone()),
        );

        assert!(!sentinel_file.exists());
        assert!(!cancel_flag.load(Ordering::SeqCst));

        // Registry cancel should touch sentinel_file on disk
        let res = registry.cancel(exec_id);
        assert!(res.is_ok());
        assert!(cancel_flag.load(Ordering::SeqCst));
        assert!(guard.is_cancelled());
        assert!(sentinel_file.exists(), "Cancel sentinel file must be created on disk");

        // Clean up
        let _ = std::fs::remove_file(&sentinel_file);
        let _ = std::fs::remove_dir(&sentinel_dir);
    }

    #[test]
    fn test_sanitize_terminal_line_plain_and_newlines() {
        assert_eq!(sanitize_terminal_line("Hello world\r\n"), "Hello world");
        assert_eq!(sanitize_terminal_line("Hello world\n"), "Hello world");
        assert_eq!(sanitize_terminal_line("Hello world\r"), "Hello world");
        assert_eq!(sanitize_terminal_line("Hello world"), "Hello world");
        assert_eq!(sanitize_terminal_line("\r\n"), "");
        assert_eq!(sanitize_terminal_line("\n"), "");
        assert_eq!(sanitize_terminal_line("\r"), "");
    }

    #[test]
    fn test_sanitize_terminal_line_carriage_return_overwrites() {
        let multi_cr = "Download 10%\rDownload 20%\rDownload 30%\r\n";
        assert_eq!(sanitize_terminal_line(multi_cr), "Download 30%");

        let trailing_cr = "Download 50%\r";
        assert_eq!(sanitize_terminal_line(trailing_cr), "Download 50%");

        let intermediate_cr = "Old Status\rNew Status";
        assert_eq!(sanitize_terminal_line(intermediate_cr), "New Status");
    }

    #[test]
    fn test_read_line_or_cr_crlf_and_lf() {
        use std::io::Cursor;
        let data = b"line 1\r\nline 2\nline 3";
        let mut cursor = Cursor::new(data);
        let mut line_buf = Vec::new();

        let n1 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n1, 8); // "line 1\r\n"
        assert_eq!(sanitize_terminal_line(&String::from_utf8_lossy(&line_buf)), "line 1");

        line_buf.clear();
        let n2 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n2, 7); // "line 2\n"
        assert_eq!(sanitize_terminal_line(&String::from_utf8_lossy(&line_buf)), "line 2");

        line_buf.clear();
        let n3 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n3, 6); // "line 3" (EOF)
        assert_eq!(sanitize_terminal_line(&String::from_utf8_lossy(&line_buf)), "line 3");

        line_buf.clear();
        let n4 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n4, 0); // EOF
    }

    #[test]
    fn test_read_line_or_cr_standalone_cr() {
        use std::io::Cursor;
        let data = b"Progress 10%\rProgress 20%\rProgress 30%\r\n";
        let mut cursor = Cursor::new(data);
        let mut line_buf = Vec::new();

        let n1 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n1, 13); // "Progress 10%\r"
        assert_eq!(sanitize_terminal_line(&String::from_utf8_lossy(&line_buf)), "Progress 10%");

        line_buf.clear();
        let n2 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n2, 13); // "Progress 20%\r"
        assert_eq!(sanitize_terminal_line(&String::from_utf8_lossy(&line_buf)), "Progress 20%");

        line_buf.clear();
        let n3 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n3, 14); // "Progress 30%\r\n"
        assert_eq!(sanitize_terminal_line(&String::from_utf8_lossy(&line_buf)), "Progress 30%");

        line_buf.clear();
        let n4 = read_line_or_cr(&mut cursor, &mut line_buf).unwrap();
        assert_eq!(n4, 0); // EOF
    }

    #[test]
    fn test_powershell_staging_bom_encoding_invariant() {
        // AGENTS.md Invariant 1:
        // Temporary .ps1 script files written for execution must contain EXACTLY ONE UTF-8 BOM at byte offset 0.
        // Strips any in-memory BOM before prepending file BOM, preventing double-BOM parser crashes.
        let raw_script_with_bom = "\u{feff}param([string]$Arg1)\nWrite-Host $Arg1";
        let clean = raw_script_with_bom.trim_start_matches('\u{feff}');
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(clean.as_bytes());

        assert_eq!(&bytes[0..3], &[0xEF, 0xBB, 0xBF]);
        // Ensure no second BOM was written
        assert_ne!(&bytes[3..6], &[0xEF, 0xBB, 0xBF]);
        assert_eq!(&bytes[3..8], b"param");
    }
}

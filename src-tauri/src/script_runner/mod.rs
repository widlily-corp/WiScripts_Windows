pub mod sync;

use crate::error::AppError;
use crate::runner::{decode_bytes, CommandOutput};
pub use sync::{
    get_cached_scripts_library, read_library_script, sync_scripts_library, ScriptManifestEntry,
    ScriptParameter, ScriptsLibraryManifest,
};
use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Emitter;

static SCRIPT_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Payload emitted for each output line during custom script execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOutputLinePayload {
    pub line: String,
    pub stream: String, // "stdout" | "stderr"
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

/// Executes a custom PowerShell (.ps1) or Command (.bat/.cmd) script with live output streaming.
#[tauri::command]
pub async fn execute_custom_script(
    app: tauri::AppHandle,
    script_content: String,
    script_type: String,
    dry_run: Option<bool>,
) -> Result<CommandOutput, AppError> {
    let norm_type = validate_script_input(&script_content, &script_type)?;
    let is_dry_run = dry_run.unwrap_or(false);

    log::info!(
        "[ScriptRunner] execute_custom_script invoked: type='{}', dry_run={}, content_len={}",
        norm_type,
        is_dry_run,
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
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let pid = std::process::id();
        let counter = SCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let file_name = format!("wiscripts_{}_{}_{}.{}", timestamp, pid, counter, norm_type);
        let temp_path = temp_dir.join(file_name);

        let prepared_content = if norm_type == "ps1" {
            format!(
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;\n$OutputEncoding = [System.Text.Encoding]::UTF8;\n{}",
                script_content
            )
        } else {
            script_content
        };

        std::fs::write(&temp_path, &prepared_content).map_err(|e| {
            AppError::Io(format!("Failed to write script content to temp file: {}", e))
        })?;

        let _guard = TempScriptGuard::new(temp_path.clone());

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

        let exit_status = child.wait().map_err(|e| {
            AppError::Execution(format!("Error waiting for script process exit: {}", e))
        })?;

        let stdout = stdout_handle.join().unwrap_or_default();
        let stderr = stderr_handle.join().unwrap_or_default();
        let exit_code = exit_status.code().unwrap_or(-1);

        log::info!(
            "[ScriptRunner] Execution finished with exit code {}. stdout_bytes={}, stderr_bytes={}",
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
        // Arrange & Act
        let res_ps1 = validate_script_input("Write-Host 'Hello'", "ps1");
        let res_dot_ps1 = validate_script_input("Write-Host 'Hello'", ".ps1");
        let res_bat = validate_script_input("@echo off", "BAT");
        let res_cmd = validate_script_input("echo test", ".CMD");

        // Assert
        assert_eq!(res_ps1.unwrap(), "ps1");
        assert_eq!(res_dot_ps1.unwrap(), "ps1");
        assert_eq!(res_bat.unwrap(), "bat");
        assert_eq!(res_cmd.unwrap(), "cmd");
    }

    #[test]
    fn test_validate_script_input_empty_content_returns_invalid_config() {
        // Arrange
        let empty_input = "   \n\t  ";

        // Act
        let result = validate_script_input(empty_input, "ps1");

        // Assert
        assert!(result.is_err());
        if let Err(AppError::InvalidConfig(msg)) = result {
            assert!(msg.contains("Script content cannot be empty"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }

    #[test]
    fn test_validate_script_input_unsupported_type_returns_invalid_config() {
        // Arrange
        let valid_script = "echo hello";

        // Act
        let result = validate_script_input(valid_script, "sh");

        // Assert
        assert!(result.is_err());
        if let Err(AppError::InvalidConfig(msg)) = result {
            assert!(msg.contains("Unsupported script type 'sh'"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }

    #[test]
    fn test_temp_script_guard_removes_file_on_drop() {
        // Arrange
        let temp_dir = std::env::temp_dir().join("wiscripts_test_temp_guard");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let test_file = temp_dir.join("test_script.ps1");
        std::fs::write(&test_file, "Write-Host 'Test'").unwrap();

        assert!(test_file.exists());

        // Act
        {
            let _guard = TempScriptGuard::new(test_file.clone());
            // Guard in scope
            assert!(test_file.exists());
        } // _guard dropped here

        // Assert
        assert!(!test_file.exists(), "File should be deleted when guard is dropped");
        let _ = std::fs::remove_dir(&temp_dir);
    }

    #[test]
    fn test_get_temp_scripts_dir_creates_directory() {
        // Arrange & Act
        let res = get_temp_scripts_dir();

        // Assert
        assert!(res.is_ok());
        let dir_path = res.unwrap();
        assert!(dir_path.exists());
        assert!(dir_path.ends_with(std::path::Path::new("WiScripts").join("TempScripts")));
    }

    #[test]
    fn test_script_output_line_payload_serialization() {
        // Arrange
        let payload = ScriptOutputLinePayload {
            line: "Hello world".to_string(),
            stream: "stdout".to_string(),
        };

        // Act
        let json_str = serde_json::to_string(&payload).unwrap();

        // Assert
        assert!(json_str.contains("\"line\":\"Hello world\""));
        assert!(json_str.contains("\"stream\":\"stdout\""));
    }

    #[test]
    fn test_temp_script_guard_handles_nonexistent_file() {
        // Arrange
        let nonexistent_path = std::env::temp_dir().join("wiscripts_nonexistent_file_12345.ps1");
        assert!(!nonexistent_path.exists());

        // Act & Assert (dropping guard on non-existent file should not panic)
        {
            let _guard = TempScriptGuard::new(nonexistent_path.clone());
        }
        assert!(!nonexistent_path.exists());
    }

    #[test]
    fn test_validate_script_input_adversarial_cases() {
        // Test whitespace padding and dot prefix variations in script type
        assert_eq!(validate_script_input("echo test", " ps1 ").unwrap(), "ps1");
        assert_eq!(validate_script_input("echo test", " .BAT ").unwrap(), "bat");
        assert_eq!(validate_script_input("echo test", "CMD").unwrap(), "cmd");
        assert_eq!(validate_script_input("echo test", " . ps1 ").unwrap(), "ps1");

        // Test malicious / unexpected extensions
        assert!(validate_script_input("echo test", "exe").is_err());
        assert!(validate_script_input("echo test", "vbs").is_err());
        assert!(validate_script_input("echo test", "ps1; calc.exe").is_err());
        assert!(validate_script_input("echo test", "..\\ps1").is_err());

        // Test Unicode / Cyrillic script content validation
        let unicode_script = "Write-Host 'Привет, мир! 🚀 123'";
        assert_eq!(validate_script_input(unicode_script, "ps1").unwrap(), "ps1");
    }

    #[test]
    fn test_temp_script_counter_atomic_uniqueness() {
        use std::collections::HashSet;
        use std::sync::{Arc, Mutex};

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
}



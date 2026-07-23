# Test Strategy & Architecture Analysis: Automated Verification for `debug.log`

**Agent**: Explorer 3 (Milestone 1)  
**Date**: 2026-07-22  
**Target Path**: `c:\Users\Widlily\Documents\projects\WiScripts_Windows`  
**Scope**: Existing Rust Test Suite Audit, `debug.log` Automated Verification Strategy, Log Content/Format Testing, and Concurrency/Thread-Safety Design for `cargo test`.

---

## 1. Audit of Existing Rust Tests (`src-tauri/`)

### 1.1 Test Suite Inventory
An audit of `src-tauri/src/` revealed **16 unit tests** distributed across 5 core Rust modules:

| Module Path | Test Module | Test Name | Purpose / Target |
|---|---|---|---|
| `src/runner/mod.rs` | `tests` | `test_dry_run_runner_records_powershell_and_cmd` | Verifies `DryRunRunner` records executed PowerShell/CMD strings without touching host OS. |
| `src/runner/mod.rs` | `tests` | `test_execution_summary_camel_case_serialization` | Verifies Serde camelCase JSON serialization/deserialization of `ExecutionSummary`. |
| `src/commands/mod.rs` | `tests` | `test_get_system_info_ipc` | Tests async IPC handler for retrieving system specs and telemetry status. |
| `src/commands/mod.rs` | `tests` | `test_execute_optimizations_ipc_dry_run` | Tests end-to-end IPC execution flow for optimizations in dry-run mode. |
| `src/commands/mod.rs` | `tests` | `test_execute_odt_install_ipc_dry_run` | Tests IPC handler for Office Deployment Tool installation execution. |
| `src/commands/mod.rs` | `tests` | `test_execute_activation_ipc_dry_run` | Tests IPC handler for MAS activation execution. |
| `src/optimization/mod.rs` | `tests` | `test_rule_catalog_contains_at_least_15_rules` | Asserts optimization catalog completeness. |
| `src/optimization/mod.rs` | `tests` | `test_rule_catalog_covers_all_6_categories` | Asserts all 6 optimization categories exist. |
| `src/optimization/mod.rs` | `tests` | `test_preview_optimizations` | Tests dry-run preview generation for selected rule IDs. |
| `src/optimization/mod.rs` | `tests` | `test_execute_optimizations_dry_run_exact_commands` | Tests exact PowerShell command generation for rules. |
| `src/odt/mod.rs` | `tests` | `test_generate_odt_xml_various_channels_and_arch` | Validates XML structure generated for Office installations. |
| `src/odt/mod.rs` | `tests` | `test_generate_odt_xml_multiple_products_and_excluded_apps` | Validates app exclusions in generated XML. |
| `src/odt/mod.rs` | `tests` | `test_execute_odt_install_dry_run_contains_setup_configure` | Validates `setup.exe /configure` command formatting. |
| `src/odt/mod.rs` | `tests` | `test_execute_odt_install_dry_run_custom_path` | Validates custom setup path handling. |
| `src/odt/mod.rs` | `tests` | `test_escape_powershell_literal` | Tests PowerShell string escaping utility. |
| `src/odt/mod.rs` | `tests` | `test_execute_odt_install_path_escaping_with_special_characters` | Tests path escaping with single quotes and spaces. |
| `src/odt/mod.rs` | `tests` | `test_generate_odt_xml_empty_products_fallback` | Validates default product fallbacks. |
| `src/mas.rs` | `tests` | `test_activation_script_commands` | Tests script generation for activation methods. |
| `src/mas.rs` | `tests` | `test_execute_activation_dry_run_hwid` | Tests HWID activation dry run execution. |
| `src/mas.rs` | `tests` | `test_execute_activation_dry_run_ohook` | Tests Ohook activation dry run execution. |
| `src/mas.rs` | `tests` | `test_execute_activation_dry_run_kms38` | Tests KMS38 activation dry run execution. |

### 1.2 Key Findings from Existing Tests
1. **100% Host Safety Compliance**: All current tests run against `DryRunRunner`, guaranteeing zero modification of the host machine during `cargo test`.
2. **Missing Persistent Logging Verification**: No current tests verify file creation, formatting, or log capture in `debug.log`. This is the gap that Milestone 1 must address.
3. **Parallel Test Runner Default**: `cargo test` executes test cases concurrently using multiple worker threads within the test binary. Any file-logging test strategy must explicitly handle parallel logger access and file sharing.

---

## 2. Test Strategy Design for `debug.log` Verification

To fulfill requirements **R1 (Persistent File Logging)**, **R2 (Log File Location)**, and **R3 (Verification via cargo test)**, the test suite must systematically test three pillars:

```
+-----------------------------------------------------------------------------------+
|                            cargo test Strategy Architecture                        |
+------------------------------------------+----------------------------------------+
                                           |
    +--------------------------------------+-----------------------------------+
    |                                      |                                   |
    v                                      v                                   v
[1. File Auto-Creation]          [2. Format & Content]               [3. Concurrency & Isolation]
- Default debug.log creation     - Timestamp pattern (RFC3339)       - OnceLock logger init
- Working dir location           - Log levels (INFO/WARN/DEBUG/ERR)  - Arc<Mutex<Writer>> thread-safety
- File handle persistence        - Command string & stdout capture   - Shared file append / locking
```

---

## 3. Detailed Verification Requirements & Blueprint

### 3.1 Verification Goal 1: Automatic Creation of `debug.log`
- **Objective**: Verify that when the application or logger subsystem initializes, `debug.log` is automatically created in the current working directory / binary folder if it does not already exist.
- **Test Implementation**:
  - Test name: `test_debug_log_auto_created_on_init`
  - Location: `src/logger/mod.rs` (or `src/logging.rs`)
  - Logic:
    1. Call `init_logger()` (or invoke an IPC operation that triggers logger initialization).
    2. Check `std::path::Path::new("debug.log").exists()`.
    3. Assert `metadata.is_file()` and ensure file is openable for read.

### 3.2 Verification Goal 2: Timestamps, Log Levels, Command Strings & Output Assertions
- **Objective**: Ensure that logs written during tests match the specification contract:
  - Contract Format: `[YYYY-MM-DDTHH:MM:SSZ] [LOG_LEVEL] [MODULE] Message`
  - Required Log Content:
    - **Initialization Log**: `[INFO] Persistent logging initialized`
    - **Command Execution Log**: `[INFO] [runner] Executing PowerShell: Stop-Service -Name DiagTrack`
    - **Command Output Log**: `[DEBUG] [runner] Result: exit_code=0, stdout="..."`
    - **Dry-run Marker**: `[INFO] [runner] Operating in Dry-Run mode`
    - **Error Log**: `[ERROR] [commands] Execution error: ...`
- **Test Implementation**:
  - Test name: `test_debug_log_contains_timestamps_levels_and_command_output`
  - Logic:
    1. Trigger a command execution via `DryRunRunner` or `execute_optimizations(vec!["telemetry_diagtrack".to_string()], true)`.
    2. Read all lines from `debug.log`.
    3. Assert at least one line matches the ISO-8601 timestamp regex: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}`.
    4. Assert log levels `[INFO]`, `[DEBUG]`, or `[ERROR]` are present.
    5. Assert the exact command string (`Stop-Service -Name DiagTrack`) is contained in the log lines.
    6. Assert stdout (`[DRY-RUN] Simulated PowerShell execution`) is contained in the log lines.

### 3.3 Verification Goal 3: Concurrency & Thread Safety under `cargo test`

#### The Problem:
`cargo test` runs test functions concurrently across multiple OS threads. In Rust:
1. Process-global loggers (`log::set_logger`) panic or return `SetLoggerError` if initialized more than once per process.
2. Concurrent file writes to `debug.log` from multiple test threads can cause:
   - Interleaved / corrupted log lines if buffered writes are not synchronized.
   - File locking errors on Windows if `File::create` truncates or opens without shared append permissions.
   - Race conditions when one test attempts to clear/assert log content while another test writes to `debug.log`.

#### The Architectural Solution:
1. **Thread-Safe Shared Logger (`Arc<Mutex<BufWriter<File>>>` or `log::Log` implementation)**:
   - Use `fs::OpenOptions::new().create(true).append(true).open("debug.log")` wrapped inside a `Mutex`.
   - Implement `flush()` on every write to ensure log entries are immediately flushed to disk before assertion checks.
2. **Idempotent Initialization via `std::sync::Once` or `OnceLock`**:
   - `pub fn init_logger()` must use `std::sync::Once` to guarantee `log::set_logger` is called exactly once across all parallel unit tests.
3. **Mutex-Protected Log Test Scope / Isolated Test Helper**:
   - For unit tests that specifically check log line contents, use a static test mutex `static TEST_LOG_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());` to serialize log-content assertions and prevent interleaving during verification assertions.
   - Provide a helper `get_test_log_contents()` that safely reads the file contents with flush.

---

## 4. Concrete Code Implementation Blueprint for Implementers

### 4.1 Recommended Logger Architecture (`src-tauri/src/logger/mod.rs`)

```rust
use log::{Level, LevelFilter, Metadata, Record, SetLoggerError};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Once};

static INIT: Once = Once::new();

#[derive(Clone)]
pub struct PersistentFileLogger {
    file_writer: Arc<Mutex<File>>,
    log_path: PathBuf,
}

impl PersistentFileLogger {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, std::io::Error> {
        let path_buf = path.as_ref().to_path_buf();
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path_buf)?;

        Ok(Self {
            file_writer: Arc::new(Mutex::new(file)),
            log_path: path_buf,
        })
    }
}

impl log::Log for PersistentFileLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= Level::Debug
    }

    fn log(&self, record: &Record) {
        if self.enabled(record.metadata()) {
            let timestamp = chrono::Utc::now().to_rfc3339();
            let log_entry = format!(
                "[{}] [{}] [{}] {}\n",
                timestamp,
                record.level(),
                record.target(),
                record.args()
            );

            if let Ok(mut writer) = self.file_writer.lock() {
                let _ = writer.write_all(log_entry.as_bytes());
                let _ = writer.flush();
            }
        }
    }

    fn flush(&self) {
        if let Ok(mut writer) = self.file_writer.lock() {
            let _ = writer.flush();
        }
    }
}

/// Idempotent global logger initializer for production & cargo test
pub fn init_logging() {
    INIT.call_once(|| {
        let logger = PersistentFileLogger::new("debug.log")
            .expect("Failed to initialize debug.log file logger");
        log::set_boxed_logger(Box::new(logger))
            .map(|()| log::set_max_level(LevelFilter::Debug))
            .expect("Failed to set global logger");
        log::info!("Persistent debug logger initialized");
    });
}
```

### 4.2 Unit Tests for Logging Verification (`src-tauri/src/logger/mod.rs` tests)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Mutex;

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_debug_log_auto_created_on_init() {
        let _guard = TEST_MUTEX.lock().unwrap();
        init_logging();

        let log_path = Path::new("debug.log");
        assert!(log_path.exists(), "debug.log should automatically exist after init_logging()");
        assert!(log_path.is_file(), "debug.log should be a regular file");
    }

    #[test]
    fn test_debug_log_content_format_and_command_output() {
        let _guard = TEST_MUTEX.lock().unwrap();
        init_logging();

        let test_message = format!("TEST_COMMAND_EXECUTION_MARKER_{}", uuid_v4_short());
        log::info!("Executing PowerShell: {}", test_message);
        log::debug!("Command stdout output: exit_code=0");

        // Flush log
        log::logger().flush();

        let content = fs::read_to_string("debug.log").expect("Failed to read debug.log");
        
        // Assert log entry contains test marker
        assert!(content.contains(&test_message), "debug.log missing test command marker");
        assert!(content.contains("[INFO]"), "debug.log missing [INFO] level tag");
        assert!(content.contains("[DEBUG]"), "debug.log missing [DEBUG] level tag");

        // Assert timestamp pattern (RFC-3339 / ISO-8601 YYYY-MM-DD)
        let has_timestamp = content.lines().any(|line| {
            line.starts_with('[') && line.chars().nth(5) == Some('-')
        });
        assert!(has_timestamp, "debug.log lines must begin with timestamp [YYYY-MM-DD...]");
    }

    #[test]
    fn test_concurrent_logging_thread_safety() {
        let _guard = TEST_MUTEX.lock().unwrap();
        init_logging();

        let handles: Vec<_> = (0..10)
            .map(|i| {
                std::thread::spawn(move || {
                    log::info!("Thread {} logging message", i);
                    log::debug!("Thread {} debug output detail", i);
                })
            })
            .collect();

        for h in handles {
            h.join().unwrap();
        }

        log::logger().flush();
        let content = fs::read_to_string("debug.log").unwrap();
        assert!(content.contains("Thread 9 logging message"));
    }

    fn uuid_v4_short() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let start = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        format!("{:x}", start)
    }
}
```

### 4.3 `CommandRunner` Integration Hooking (`src-tauri/src/runner/mod.rs`)

`CommandRunner` implementations (`RealRunner` and `DryRunRunner`) should emit `log::info!` and `log::debug!` messages automatically during command processing:

```rust
impl CommandRunner for DryRunRunner {
    fn run_powershell(&self, script: &str) -> Result<CommandOutput, String> {
        log::info!("[runner] [PowerShell] Executing script: {}", script);
        
        self.history.lock().unwrap().push(RecordedCommand {
            runner_type: "powershell".to_string(),
            command: script.to_string(),
        });

        let output = CommandOutput {
            exit_code: 0,
            stdout: format!("[DRY-RUN] Simulated PowerShell execution: {}", script),
            stderr: String::new(),
        };

        log::debug!(
            "[runner] [PowerShell] Output: exit_code={}, stdout={}, stderr={}",
            output.exit_code, output.stdout, output.stderr
        );

        Ok(output)
    }
}
```

---

## 5. Verification Command Pipeline

To verify the logging test suite after implementation:

```powershell
# 1. Run all unit tests including debug.log verification tests
cargo test --manifest-path src-tauri/Cargo.toml

# 2. Verify debug.log exists in working directory
Get-ChildItem -Path debug.log

# 3. View contents of debug.log to verify formatted timestamps, levels, and outputs
Get-Content -Path debug.log -Tail 20
```

---

## 6. Summary & Recommendations for Implementer

1. **Create `src-tauri/src/logger/mod.rs`**: Implement `PersistentFileLogger` with `Arc<Mutex<File>>` file writer and `Once` initializer.
2. **Integrate Logging in `CommandRunner`**: Ensure `RealRunner` and `DryRunRunner` emit `log::info!` and `log::debug!` calls on every command invocation.
3. **Initialize Logger in `lib.rs` / `main.rs`**: Call `logger::init_logging()` at the top of `lib::run()` so app startup initializes `debug.log`.
4. **Implement Unit Tests**: Add the tests in `logger/mod.rs` to verify auto-creation, content formatting, timestamping, command capture, and thread safety.

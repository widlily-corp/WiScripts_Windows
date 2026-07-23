# Analysis Report: Persistent Debug Logging System (`debug.log`) Instrumentation Strategy

**Agent**: Explorer 2 (Milestone 1 — Debug Logging Instrumentation Strategy)  
**Target Path**: `c:/Users/Widlily/Documents/projects/WiScripts_Windows/src-tauri`  
**Date**: 2026-07-22  

---

## 1. Executive Summary

This report establishes the complete architecture and instrumentation plan for the **Persistent Debug Logging System (`debug.log`)** in WiScripts Windows (Milestone 1).

The system must log all application operations—including IPC invocations, system telemetry checks, command execution starts, actual vs simulated command outputs (stdout/stderr), dry-run flags, and error states—to a persistent `debug.log` file in the current working directory / application executable path.

The existing codebase in `src-tauri` consists of modular execution handlers (`runner`, `commands`, `optimization`, `odt`, `mas`). Currently, zero persistent file logging is performed. This report maps every execution trait, module, and IPC handler to explicit instrumentation points and outlines the exact logger design and log message standard required to satisfy acceptance criteria **R1**, **R2**, and **R3**.

---

## 2. Codebase Architecture & Module Audit

The backend architecture in `src-tauri/src` comprises 7 primary Rust modules:

```
src-tauri/src/
├── lib.rs            # Application entry point & IPC handler registration
├── main.rs           # Binary entry point invoking lib::run()
├── error.rs          # AppError enum (Execution, InvalidConfig, Io, System)
├── runner/mod.rs     # CommandRunner trait, RealRunner, DryRunRunner, ExecutedAction, ExecutionSummary
├── commands/mod.rs   # Tauri #[tauri::command] IPC handlers (system info, catalog, execution wrappers)
├── optimization/mod.rs # Rule catalog & optimization batch execution runner
├── odt/mod.rs        # Office Deployment Tool XML generator & setup.exe installer runner
└── mas.rs / activation # Microsoft Activation Scripts (HWID, Ohook, KMS38, TSforge) installer runner
```

### 2.1 Execution Traits & Runners (`src/runner/mod.rs`)
- **`CommandRunner` trait**: Interface with `run_powershell(&self, script: &str)` and `run_cmd(&self, command: &str)`, plus `is_dry_run(&self) -> bool`.
- **`RealRunner`**: Spawns real `powershell.exe` or `cmd.exe` processes via `std::process::Command`. Returns `CommandOutput { exit_code, stdout, stderr }`.
- **`DryRunRunner`**: Simulates process execution without touching the host system. Appends execution records to an internal `Arc<Mutex<Vec<RecordedCommand>>>`.

### 2.2 Domain Modules
- **`optimization/mod.rs`**: Iterates over catalog items, calls `runner.run_powershell()`, builds `ExecutionSummary`.
- **`odt/mod.rs`**: Builds ODT XML, constructs PowerShell download & setup command, calls `runner.run_powershell()`.
- **`mas.rs`**: Generates MAS script download & parameter invocation (`/HWID`, `/Ohook`, etc.), calls `runner.run_powershell()`.

### 2.3 IPC Handlers (`src/commands/mod.rs`)
- Exposes `get_system_info`, `get_rule_catalog`, `get_rules_by_category`, `preview_optimizations`, `execute_optimizations`, `generate_odt_xml`, `execute_odt_install`, `execute_activation`.

---

## 3. Exact Instrumentation Points Matrix

To meet requirements R1 and R2, logging must occur at both the high-level IPC boundary and the granular low-level process runner boundary.

| Module | File & Function | Target Lines | Level | Log Entry Content & Event |
|---|---|---|---|---|
| **System** | `src/lib.rs::run()` | Line 10 | `INFO` | `[System] WiScripts backend initializing. Logging system active writing to debug.log` |
| **Runner** | `src/runner/mod.rs::RealRunner::run_powershell` | Line 58 | `INFO` | `[RealRunner] Executing PowerShell script: '<script>'` |
| **Runner** | `src/runner/mod.rs::RealRunner::run_powershell` | Line 75 | `INFO`/`WARN` | `[RealRunner] PowerShell exit code: <code_or_err> \| stdout: "<stdout>" \| stderr: "<stderr>"` |
| **Runner** | `src/runner/mod.rs::RealRunner::run_powershell` | Line 76 | `ERROR` | `[ERROR] [RealRunner] Failed to spawn powershell process: <error>` |
| **Runner** | `src/runner/mod.rs::RealRunner::run_cmd` | Line 85 | `INFO` | `[RealRunner] Executing CMD command: '<command>'` |
| **Runner** | `src/runner/mod.rs::RealRunner::run_cmd` | Line 95 | `INFO`/`WARN` | `[RealRunner] CMD exit code: <code_or_err> \| stdout: "<stdout>" \| stderr: "<stderr>"` |
| **Runner** | `src/runner/mod.rs::RealRunner::run_cmd` | Line 96 | `ERROR` | `[ERROR] [RealRunner] Failed to spawn cmd process: <error>` |
| **Runner** | `src/runner/mod.rs::DryRunRunner::run_powershell` | Line 141 | `INFO` | `[DryRunRunner] [DRY-RUN] Simulated PowerShell command: '<script>'` |
| **Runner** | `src/runner/mod.rs::DryRunRunner::run_cmd` | Line 153 | `INFO` | `[DryRunRunner] [DRY-RUN] Simulated CMD command: '<command>'` |
| **IPC** | `src/commands/mod.rs::get_system_info` | Line 79 | `DEBUG` | `[IPC] Invoked 'get_system_info'` |
| **IPC** | `src/commands/mod.rs::execute_optimizations` | Line 128 | `INFO` | `[IPC] Invoked 'execute_optimizations' with <keys.len()> keys (dry_run=<dry_run>)` |
| **IPC** | `src/commands/mod.rs::execute_odt_install` | Line 147 | `INFO` | `[IPC] Invoked 'execute_odt_install' channel=<channel>, arch=<arch> (dry_run=<dry_run>)` |
| **IPC** | `src/commands/mod.rs::execute_activation` | Line 162 | `INFO` | `[IPC] Invoked 'execute_activation' method='<method>' (dry_run=<dry_run>)` |
| **Domain** | `src/optimization/mod.rs::execute` | Line 244 | `INFO` | `[Optimization] Starting batch execution of <rules.len()> rules (dry_run=<runner.is_dry_run()>)` |
| **Domain** | `src/optimization/mod.rs::execute` | Line 253 | `INFO` | `[Optimization] Running rule '<rule.id>' ("<rule.title>")` |
| **Domain** | `src/optimization/mod.rs::execute` | Line 258 | `WARN`/`INFO` | `[Optimization] Rule '<rule.id>' finished with exit code <exit_code>` |
| **Domain** | `src/odt/mod.rs::execute_odt_install` | Line 131 | `INFO` | `[ODT] Starting ODT install (dry_run=<dry_run>, setup_path=<path:?>)` |
| **Domain** | `src/odt/mod.rs::execute_odt_install` | Line 138 | `DEBUG` | `[ODT] Generated configuration XML:\n<xml_content>` |
| **Domain** | `src/mas.rs::execute_activation` | Line 47 | `INFO` | `[Activation] Executing MAS activation for method '<method>' (dry_run=<dry_run>)` |

---

## 4. Log Format Specification & Standard

To ensure compliance with R1 and R2, log messages must adhere to a strict uniform standard:

### 4.1 Log Line Format
```
[TIMESTAMP] [LOG_LEVEL] [MODULE] Message
```
Where:
- **`TIMESTAMP`**: Local/UTC timestamp formatted as `YYYY-MM-DD HH:MM:SS` (e.g. `2026-07-22 15:45:00`).
- **`LOG_LEVEL`**: Fixed 5-character width level string: `DEBUG`, `INFO `, `WARN `, `ERROR`.
- **`MODULE`**: Module identifier tag (`System`, `IPC`, `RealRunner`, `DryRunRunner`, `Optimization`, `ODT`, `Activation`).
- **`Message`**: Detailed text containing script parameters, exit codes, stdout, stderr, or dry-run indicators.

### 4.2 Representative Log Output Sample
```text
[2026-07-22 15:45:00] [INFO ] [System] Logging system initialized. Output file: debug.log
[2026-07-22 15:45:01] [INFO ] [IPC] Invoked 'execute_optimizations' with 2 keys (dry_run=true)
[2026-07-22 15:45:01] [INFO ] [Optimization] Starting batch execution of 2 rules (dry_run=true)
[2026-07-22 15:45:01] [INFO ] [Optimization] Running rule 'telemetry_diagtrack' ("Disable DiagTrack & Telemetry Services")
[2026-07-22 15:45:01] [INFO ] [DryRunRunner] [DRY-RUN] Simulated PowerShell command: Stop-Service -Name DiagTrack; Set-Service -Name DiagTrack -StartupType Disabled
[2026-07-22 15:45:01] [INFO ] [Optimization] Rule 'telemetry_diagtrack' finished with exit code 0
[2026-07-22 15:45:01] [INFO ] [Optimization] Running rule 'privacy_advertising_id' ("Disable Advertising ID for Apps")
[2026-07-22 15:45:01] [INFO ] [DryRunRunner] [DRY-RUN] Simulated PowerShell command: Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' -Name 'Enabled' -Value 0 -Type DWord -Force
[2026-07-22 15:45:01] [INFO ] [Optimization] Rule 'privacy_advertising_id' finished with exit code 0
[2026-07-22 15:45:01] [INFO ] [IPC] 'execute_optimizations' completed successfully in 2ms.
```

---

## 5. Logger Subsystem Implementation Architecture (`src-tauri/src/logger.rs`)

### 5.1 Standalone Thread-Safe Logger Design
We recommend adding a dedicated lightweight module `src-tauri/src/logger.rs` that exposes thread-safe logging functions backed by `std::sync::Mutex<Option<std::fs::File>>` or standard file append operations.

```rust
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use std::path::PathBuf;

static LOGGER: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn init_logger() -> Result<(), String> {
    let log_path = PathBuf::from("debug.log");
    // Ensure file can be opened/created in append mode
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open debug.log: {}", e))?;

    let timestamp = get_timestamp();
    let init_msg = format!("[{}] [INFO ] [System] Logger initialized successfully.\n", timestamp);
    let _ = file.write_all(init_msg.as_bytes());

    let mut guard = LOGGER.lock().unwrap();
    *guard = Some(log_path);
    Ok(())
}

pub fn log(level: &str, module: &str, message: &str) {
    let timestamp = get_timestamp();
    let formatted = format!("[{}] [{:<5}] [{}] {}\n", timestamp, level, module, message);
    
    // Print to stdout for console visibility
    print!("{}", formatted);

    // Append to debug.log
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open("debug.log") {
        let _ = file.write_all(formatted.as_bytes());
    }
}
```

Convenience macros can be exported from `logger.rs`:
- `log_info!(module, fmt, ...)`
- `log_warn!(module, fmt, ...)`
- `log_error!(module, fmt, ...)`
- `log_debug!(module, fmt, ...)`

---

## 6. Acceptance Criteria Verification Plan (R1, R2, R3)

### 6.1 Unit & Integration Test Plan
To satisfy requirement **R3**, new test cases must be added in `src-tauri/src/logger.rs` and `src-tauri/src/runner/mod.rs` (or `commands/mod.rs`):

1. **`test_debug_log_creation_and_append()`**:
   - Call `logger::init_logger()`.
   - Assert `debug.log` exists in the working directory (`std::path::Path::new("debug.log").exists()`).
   - Call `logger::log("INFO", "Test", "Verification line")`.
   - Read content of `debug.log` and verify it contains `"Verification line"`, `"[INFO ]"`, `"[Test]"`.

2. **`test_dry_run_execution_logs_to_debug_log()`**:
   - Initialize logger.
   - Execute an optimization in dry-run mode via `optimization::execute(&DryRunRunner::new(), &["telemetry_diagtrack".to_string()])`.
   - Read `debug.log` and verify it contains lines matching:
     - `[INFO ] [IPC] Invoked 'execute_optimizations'` or `[INFO ] [Optimization]`
     - `[DRY-RUN] Simulated PowerShell command: Stop-Service -Name DiagTrack`

3. **`test_real_runner_logs_command_output()`**:
   - Execute a safe `RealRunner` command (e.g. `runner.run_cmd("echo LogVerification")`).
   - Read `debug.log` and verify it records `Executing CMD command: 'echo LogVerification'` and `stdout: "LogVerification"`.

### 6.2 Execution & Build Checks
- Run `cargo test --manifest-path src-tauri/Cargo.toml`. All unit and integration tests must pass.
- Verify `debug.log` file creation in `src-tauri/` or project root upon running tests.

---

## 7. Invalidation Conditions & Risk Mitigation

1. **File Path Resolution (R2 Compliance)**:
   `debug.log` must be written relative to current working directory (`"debug.log"`). Ensure `OpenOptions::new().create(true).append(true).open("debug.log")` handles missing files gracefully.
2. **Concurrent File Access**:
   `OpenOptions` append mode on Windows (`FILE_APPEND_DATA`) allows multi-threaded atomic appends for log entries without file locking contention.
3. **Sensitive Data / Escaping**:
   Sanitize multi-line stdout/stderr strings in log entries (e.g. replacing internal newlines with `\n` or formatted blocks) to keep log line structures parseable.

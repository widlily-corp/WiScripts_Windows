# Technical Analysis: Persistent Debug Logging System (`debug.log`)

## Executive Summary
This document provides a comprehensive architectural investigation and technical recommendation for integrating a persistent file logging system (`debug.log`) into the Rust backend (`src-tauri`) of the WiScripts Windows application.

---

## 1. Codebase Architecture Investigation

### 1.1 Existing Layout & Entry Points
- **Crate Root (`src-tauri/Cargo.toml`)**:
  - Name: `wiscripts_windows`
  - Library crate: `wiscripts_windows_lib` (`src/lib.rs`)
  - Dependencies: `tauri (2.0.0)`, `tauri-plugin-opener`, `serde`, `serde_json`, `thiserror`, `sysinfo`.
  - **Missing Dependencies**: No logging crates (`log`, `simplelog`, `fern`, `tracing`, `tauri-plugin-log`) are currently configured.
- **Entry Points**:
  - `src/main.rs`: Invokes `wiscripts_windows_lib::run()`.
  - `src/lib.rs`: Configures Tauri builder, registers IPC command handlers, launches event loop.
- **Core Modules**:
  - `runner/mod.rs`: Defines `CommandRunner` trait, `RealRunner` (spawns `powershell.exe`/`cmd.exe`), `DryRunRunner` (records actions in-memory).
  - `commands/mod.rs`: IPC handlers (`execute_optimizations`, `execute_odt_install`, `execute_activation`, `get_system_info`).
  - `optimization/mod.rs`: Optimization rules catalog and execution engine.
  - `odt/mod.rs`: Office Deployment Tool XML generation and installer launcher.
  - `mas.rs`: Microsoft Activation Scripts execution logic.
  - `error.rs`: `AppError` enum using `thiserror`.

---

## 2. Logging Dependency Evaluation

We evaluated 4 options for Rust backend logging:

| Criterion | Option A: `log` + `simplelog` | Option B: `log` + `fern` + `chrono` | Option C: `tracing` stack | Option D: Custom `log::Log` FileLogger |
|---|---|---|---|---|
| **Complexity** | Very Low | Low | Medium-High | Medium |
| **Footprint** | Minimal | Small | Heavy | Zero third-party backend |
| **File Append / Flush** | Built-in (`WriteLogger`) | Built-in | Built-in | Manual (`Mutex<File>`) |
| **Timestamp Support** | Built-in (RFC3339/ISO8601) | Custom formatting | Built-in | Manual formatting |
| **Recommendation** | **SELECTED (Primary)** | Alternative | Overkill | Alternative |

### Selected Stack: `log` (v0.4) + `simplelog` (v0.12)
- **`log` (0.4)** provides standard Rust macros (`log::info!`, `log::warn!`, `log::error!`, `log::debug!`). Modules can issue log calls without passing log objects down call chains.
- **`simplelog` (0.12)** provides `WriteLogger` and `CombinedLogger` which format ISO-8601/RFC-3339 timestamps, log levels, target modules, and safely handle concurrent thread appends via standard `File` writing.

---

## 3. Persistent Logger Architecture (`debug.log`)

```
+-------------------------------------------------------------------+
|                        Tauri Application                          |
|  main.rs -> lib.rs::run() -> logger::init_logger()                |
+-------------------------------------------------------------------+
                                 |
                                 v
+-------------------------------------------------------------------+
|                       log Facade (log::*)                         |
|   log::info! / log::warn! / log::error! / log::debug!              |
+-------------------------------------------------------------------+
                                 |
        +------------------------+------------------------+
        |                        |                        |
        v                        v                        v
+---------------+        +---------------+        +---------------+
|  IPC Commands |        | RealRunner &  |        | Optimization/ |
| (commands/*)  |        | DryRunRunner  |        |  ODT / MAS    |
+---------------+        +---------------+        +---------------+
        |                        |                        |
        +------------------------+------------------------+
                                 |
                                 v
+-------------------------------------------------------------------+
|                    simplelog :: WriteLogger                       |
|           Thread-Safe File Appender (debug.log)                   |
|  - Location: Current Working Directory / Binary Directory         |
|  - Format: [TIMESTAMP] [LEVEL] [TARGET] Message                   |
|  - Options: OpenOptions::create(true).append(true)                |
+-------------------------------------------------------------------+
```

### 3.1 Log File Path Resolution & Safety
- **Primary Location**: Current Working Directory (`debug.log`) via `std::env::current_dir()?.join("debug.log")` or fallback `PathBuf::from("debug.log")`.
- **Executable Directory Fallback**: If CWD is restricted, check `std::env::current_exe()?.parent()?.join("debug.log")`.
- **Append & Flush Safety**:
  - `std::fs::OpenOptions::new().create(true).append(true).open(&path)` prevents truncation on application restarts.
  - Standard file writes in Rust under `simplelog::WriteLogger` lock file handle access, avoiding line corruption across multi-threaded async tasks.
- **Test Idempotency / Multi-Init Guard**:
  - `CombinedLogger::init` or `log::set_logger` fails if called multiple times in test runners.
  - The initialization function must return `Ok(())` or ignore `SetLoggerError` if logger is already set.

---

## 4. Integration Specifications

### 4.1 `logger.rs` Module Setup (`src-tauri/src/logger.rs`)
```rust
use simplelog::*;
use std::fs::OpenOptions;
use std::path::PathBuf;

pub fn init_logger() -> Result<PathBuf, String> {
    let log_path = get_log_path();
    
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open log file {:?}: {}", log_path, e))?;

    let config = ConfigBuilder::new()
        .set_time_format_rfc3339()
        .set_location_level(LevelFilter::Debug)
        .build();

    // Ignore error if logger was already initialized (e.g. during cargo test execution)
    let _ = WriteLogger::init(LevelFilter::Debug, config, file);

    log::info!("Persistent debug logger initialized at {:?}", log_path);
    Ok(log_path)
}

pub fn get_log_path() -> PathBuf {
    std::env::current_dir()
        .map(|d| d.join("debug.log"))
        .unwrap_or_else(|_| PathBuf::from("debug.log"))
}
```

### 4.2 Instrumentation Points
1. **Application Startup (`lib.rs`)**:
   - Call `crate::logger::init_logger().expect("Failed to initialize debug log");` at the top of `pub fn run()`.
2. **Command Execution (`runner/mod.rs`)**:
   - `RealRunner::run_powershell` & `run_cmd`: Log command string, stdout, stderr, exit code.
   - `DryRunRunner::run_powershell` & `run_cmd`: Log `[DRY-RUN]` execution details.
3. **IPC Command Flow (`commands/mod.rs`)**:
   - Log entry and parameters for `execute_optimizations`, `execute_odt_install`, `execute_activation`.
   - Log returned `ExecutionSummary` or `AppError`.
4. **Subsystem Modules (`optimization/mod.rs`, `odt/mod.rs`, `mas.rs`)**:
   - Log progress steps, XML generation, and MAS method details.

---

## 5. Risk Assessment & Mitigations

1. **Risk: `SetLoggerError` during `cargo test` execution**
   - *Cause*: Multiple test cases running in parallel or sequentially in the same process calling `init_logger()`.
   - *Mitigation*: Gracefully handle logger re-initialization via `let _ = WriteLogger::init(...)` or checking `log::logger()` status.
2. **Risk: File Access Locks on Windows**
   - *Cause*: Windows locks files opened exclusively by other processes.
   - *Mitigation*: Use standard shared append mode (`OpenOptions::append(true)`).
3. **Risk: Large Log File Growth**
   - *Cause*: Long-running application sessions generating excess output.
   - *Mitigation*: Standard level set to `DEBUG` in dev/test, clean logs or append mode maintains manageable sizes for typical session runs.

---

## 6. Action Plan for Implementer
1. Update `src-tauri/Cargo.toml` to include `log = "0.4"` and `simplelog = "0.12"`.
2. Add `src-tauri/src/logger.rs` and export `pub mod logger;` in `src-tauri/src/lib.rs`.
3. Hook `logger::init_logger()` in `lib.rs` and instrument `runner/mod.rs`, `commands/mod.rs`, `optimization/mod.rs`, `odt/mod.rs`, `mas.rs`.
4. Add unit test in `logger.rs` / `runner/mod.rs` asserting `debug.log` is created and log entries are written.

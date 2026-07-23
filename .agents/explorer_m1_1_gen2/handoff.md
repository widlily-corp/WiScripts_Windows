# Handoff Report: Persistent Debug Logging System (`debug.log`)

## 1. Observation

- **Crate Configuration (`src-tauri/Cargo.toml:15-22`)**:
  ```toml
  [dependencies]
  tauri = { version = "2.0.0", features = [] }
  tauri-plugin-opener = "2.0.0"
  serde = { version = "1.0", features = ["derive"] }
  serde_json = "1.0"
  thiserror = "1.0"
  sysinfo = "0.30"
  ```
  No logging dependencies (`log`, `simplelog`, `fern`, `tracing`) currently exist in `Cargo.toml`.

- **Application Startup (`src-tauri/src/lib.rs:9-25`)**:
  ```rust
  #[cfg_attr(mobile, tauri::mobile_entry_point)]
  pub fn run() {
      tauri::Builder::default()
          .plugin(tauri_plugin_opener::init())
          .invoke_handler(tauri::generate_handler![ ... ])
          .run(tauri::generate_context!())
          .expect("error while running tauri application");
  }
  ```
  `run()` initializes Tauri plugins and IPC handlers, but no logger initialization call is performed.

- **Command Runners (`src-tauri/src/runner/mod.rs:36-168`)**:
  - `RealRunner::run_powershell` (lines 58-83) and `run_cmd` (lines 85-103) execute processes via `std::process::Command` without logging commands, stdout, stderr, or exit status.
  - `DryRunRunner::run_powershell` (lines 141-151) and `run_cmd` (lines 153-163) simulate commands and push `RecordedCommand` entries into internal `history: Arc<Mutex<Vec<RecordedCommand>>>`, but do not log to disk/file.

- **IPC Handlers (`src-tauri/src/commands/mod.rs:128-173`)**:
  - Functions `execute_optimizations`, `execute_odt_install`, `execute_activation` handle UI requests for dry-run or real execution, but lack log calls.

---

## 2. Logic Chain

1. **Observation**: `Cargo.toml` lacks logging framework dependencies (`log`, `simplelog`).
   - **Step**: Adding `log = "0.4"` and `simplelog = "0.12"` enables standard logging macros across all Rust backend files and provides a thread-safe, file-backed logger (`WriteLogger`) with RFC-3339 timestamp formatting.
2. **Observation**: Neither `lib.rs` nor `main.rs` initializes a persistent file logger.
   - **Step**: Introducing `src-tauri/src/logger.rs` with `init_logger()` and registering `pub mod logger;` in `lib.rs` ensures that calling `logger::init_logger()` inside `lib.rs::run()` configures log output to `debug.log` upon binary launch.
3. **Observation**: Executed commands in `runner/mod.rs` and IPC calls in `commands/mod.rs` pass silently without writing execution output, errors, or dry-run steps to a file.
   - **Step**: Adding `log::info!`, `log::debug!`, `log::warn!`, and `log::error!` macros into `RealRunner`, `DryRunRunner`, and IPC handlers automatically directs all execution logs, stdout/stderr streams, and dry-run actions into `debug.log`.
4. **Observation**: On Windows, file append modes and test execution require non-truncating open flags and multi-initialization safety.
   - **Step**: Configuring `OpenOptions::new().create(true).append(true)` inside `logger.rs` and guarding against `SetLoggerError` guarantees flush/append safety and idempotent test execution under `cargo test`.

---

## 3. Caveats

- **Test Suite Re-initialization**: Rust `cargo test` executes multiple unit test modules within the same process context. `simplelog::WriteLogger::init` or `log::set_logger` returns an error on subsequent calls. The implementation must ignore or handle `SetLoggerError` gracefully.
- **Log File Location in Tests**: During `cargo test`, `std::env::current_dir()` resolves to the crate root (`src-tauri`), creating `src-tauri/debug.log`. In production binaries, `std::env::current_dir()` resolves to the execution directory.
- **Console Window**: `main.rs` contains `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, which disables stdout console windows in release builds. Outputting to `debug.log` via `WriteLogger` avoids relying on terminal stdout.

---

## 4. Conclusion

The Rust backend currently has no file logging infrastructure. To fulfill Milestone 1 requirements:
1. **Dependencies**: Add `log = "0.4"` and `simplelog = "0.12"` to `src-tauri/Cargo.toml`.
2. **Logger Module**: Create `src-tauri/src/logger.rs` with `init_logger()` targeting `debug.log` in CWD with RFC-3339 timestamps and append mode.
3. **Instrumentation**: Instrument `RealRunner`, `DryRunRunner`, and IPC command handlers in `commands/mod.rs` using `log::*` macros.
4. **Verification**: Implement unit tests asserting `debug.log` exists and contains log entries.

---

## 5. Verification Method

### 5.1 Verification Commands
- Run Rust test suite:
  ```powershell
  cd c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri
  cargo test
  ```
- Check `debug.log` creation and content:
  ```powershell
  Get-Content c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\debug.log
  ```

### 5.2 Invalidation Conditions
- `cargo test` fails due to `SetLoggerError` or missing log file.
- `debug.log` is truncated instead of appended.
- Command execution outputs (stdout/stderr/exit codes) are absent from `debug.log`.

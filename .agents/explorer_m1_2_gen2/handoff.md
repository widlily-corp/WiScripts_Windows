# Handoff Report: Debug Logging System (`debug.log`) Instrumentation Strategy

**Agent**: Explorer 2 (Milestone 1 — Debug Logging Instrumentation Strategy)  
**Target Path**: `c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/explorer_m1_2_gen2`  
**Date**: 2026-07-22  

---

## 1. Observation

### 1.1 Backend Module Map & Target File Locations
- **`src-tauri/Cargo.toml`**: Lines 15–22 include `tauri`, `tauri-plugin-opener`, `serde`, `serde_json`, `thiserror`, `sysinfo`. No external logging crate is currently configured.
- **`src-tauri/src/lib.rs`**: Line 10 `pub fn run()` configures `tauri::Builder` and registers 8 IPC commands. Contains no logger initialization call.
- **`src-tauri/src/runner/mod.rs`**:
  - `CommandRunner` trait declared at line 36 (`run_powershell`, `run_cmd`, `is_dry_run`).
  - `RealRunner::run_powershell` at lines 58–83 (spawns `powershell.exe`).
  - `RealRunner::run_cmd` at lines 85–103 (spawns `cmd.exe`).
  - `DryRunRunner::run_powershell` at lines 141–151.
  - `DryRunRunner::run_cmd` at lines 153–163.
  - None of these functions log process execution or stdout/stderr to disk.
- **`src-tauri/src/commands/mod.rs`**: IPC command entry points (lines 79–173) execute optimizations, ODT installs, and activation scripts without recording invocation parameters or execution summaries to a persistent log file.
- **`src-tauri/src/optimization/mod.rs`**: `execute()` at lines 244–278 iterates through catalog items and invokes `runner.run_powershell()`.
- **`src-tauri/src/odt/mod.rs`**: `execute_odt_install()` at lines 131–179 builds ODT XML and setup command string, calling `runner.run_powershell()`.
- **`src-tauri/src/mas.rs`**: `execute_activation()` at lines 47–73 builds MAS activation command, calling `runner.run_powershell()`.

### 1.2 Host Test Execution
Executed `cargo test` in `src-tauri/`:
```text
running 10 tests
test commands::tests::test_get_system_info_ipc ... ok
test commands::tests::test_execute_activation_ipc_dry_run ... ok
test commands::tests::test_execute_odt_install_ipc_dry_run ... ok
test commands::tests::test_execute_optimizations_ipc_dry_run ... ok
test odt::tests::test_escape_powershell_literal ... ok
test odt::tests::test_execute_odt_install_dry_run_contains_setup_configure ... ok
test odt::tests::test_execute_odt_install_dry_run_custom_path ... ok
test mas::tests::test_activation_script_commands ... ok
test odt::tests::test_execute_odt_install_path_escaping_with_special_characters ... ok
test odt::tests::test_generate_odt_xml_empty_products_fallback ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s
```
Compilation and existing unit tests pass cleanly. Currently no `debug.log` file is generated during test runs or execution.

---

## 2. Logic Chain

1. **Requirement Mapping**:
   - **R1 (Persistent File Logging)** requires all execution steps, command strings, stdout/stderr, dry-run actions, and errors to be written to `debug.log`.
   - **R2 (File Location)** requires `debug.log` in the application working directory / binary folder.
   - **R3 (Verification)** requires `cargo test` passing while verifying `debug.log` creation and formatted output.

2. **Logger Subsystem Design**:
   - Creating a thread-safe logger in `src-tauri/src/logger.rs` using standard Rust `std::fs::OpenOptions` (in append mode) and `std::sync::Mutex` ensures zero dependency overhead, fast compilation, and reliable multi-threaded logging across async IPC handlers and background worker tasks.
   - Exposing macros `log_info!`, `log_warn!`, `log_error!`, `log_debug!` standardizes entry creation.

3. **Instrumentation Strategy**:
   - **Boundary 1 (Runner level in `src/runner/mod.rs`)**: Captures exact process command lines, process spawn failures (`ERROR`), exit codes, stdout, and stderr for both `RealRunner` and `DryRunRunner`.
   - **Boundary 2 (IPC level in `src/commands/mod.rs`)**: Captures user action requests (`execute_optimizations`, `execute_odt_install`, `execute_activation`) with parameters (`dry_run`, `selected_keys`, `method`).
   - **Boundary 3 (Domain module level in `optimization/mod.rs`, `odt/mod.rs`, `mas.rs`)**: Captures batch start/completion metrics, generated ODT XML, and rule execution outcomes.

4. **Formatting Compliance**:
   - Enforcing `[TIMESTAMP] [LOG_LEVEL] [MODULE] message` format guarantees consistent log parsing and clear debugging trails for automated tests and human review.

---

## 3. Caveats

1. **Path Resolution in Tests vs Runtime**:
   When tests run via `cargo test`, the working directory is `src-tauri/`. When built binary runs, it is the executable directory. Using `"debug.log"` (relative path) or `std::env::current_dir().join("debug.log")` writes `debug.log` directly in the current working directory, satisfying both scenarios.
2. **Performance Impact**:
   File appends synchronous write operations are very fast for desktop utility workloads (~microseconds). OpenOptions append mode on Windows guarantees atomic entry appends.
3. **Multi-line Output Formatting**:
   stdout and stderr may contain newlines. Replacing newlines with `\n` or indentation prevents broken log format parsers.

---

## 4. Conclusion

Implement `src-tauri/src/logger.rs` and instrument `runner/mod.rs`, `commands/mod.rs`, `optimization/mod.rs`, `odt/mod.rs`, and `mas.rs` at all specified points.

### Recommended Implementation Steps for Implementer Agent:
1. Create `src-tauri/src/logger.rs` containing `init_logger()`, `log()`, and `log_info!`/`log_warn!`/`log_error!`/`log_debug!` macros.
2. Declare `pub mod logger;` in `src-tauri/src/lib.rs` and call `logger::init_logger()` in `run()`.
3. Add instrumentation calls in `RealRunner` and `DryRunRunner` (`runner/mod.rs`).
4. Add instrumentation calls in `execute_optimizations`, `execute_odt_install`, `execute_activation` (`commands/mod.rs`).
5. Add instrumentation calls in domain modules (`optimization/mod.rs`, `odt/mod.rs`, `mas.rs`).
6. Add unit tests in `logger.rs` and `runner/mod.rs` verifying `debug.log` file creation, formatting, and content assertion.

---

## 5. Verification Method

To verify the completed logger implementation:

### 1. Automated Test Suite
Run the test command in `src-tauri/`:
```powershell
cargo test --manifest-path c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\Cargo.toml
```
Assert that:
1. All unit tests pass.
2. `debug.log` is created in `src-tauri/debug.log` (or workspace root).

### 2. Log Content Assertions
Inspect `debug.log` using `Get-Content`:
```powershell
Get-Content c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\debug.log
```
Check that output contains entries such as:
- `[INFO ] [System] Logger initialized successfully.`
- `[INFO ] [DryRunRunner] [DRY-RUN] Simulated PowerShell command:`
- Timestamps in `[YYYY-MM-DD HH:MM:SS]` format.

### 3. Invalidation Conditions
- `cargo test` fails.
- `debug.log` is missing after executing tests.
- Execution logs miss command outputs, exit codes, or dry-run indicators.

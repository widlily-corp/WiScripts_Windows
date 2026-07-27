# Handoff Report — Worker M3 Remediation

## 1. Observation
- **PowerShell Injection Risk**: In `startup/mod.rs` and `scheduler/mod.rs`, string parameters (`id`, `task_name`, `task_path`, `value_name`, `location`) were interpolated into PowerShell scripts with double quotes or unescaped single quotes, allowing potential subexpression evaluation (`$()`).
- **Registry Property Name Corruption**: In `startup/mod.rs`, `toggle_startup_item` and `remove_startup_item` attempted to reconstruct registry value names by splitting `id` on `_` and lowercasing. For registry entries like `"Microsoft OneDrive"`, `id` became `"hklm_run_microsoft_onedrive"`, which resulted in `$appName` being set to `"microsoft_onedrive"` rather than `"Microsoft OneDrive"`.
- **Clippy Warning**: In `src-tauri/src/metrics/mod.rs:109`, `for (_pid, process) in self.sys.processes()` triggered `clippy::for_kv_map`.
- **Async Executor Thread Blocking**: In `src-tauri/src/commands/mod.rs`, `get_system_temperatures` directly invoked synchronous `metrics::collect_temperatures()`, which spawned blocking subprocesses (`powershell.exe`, `nvidia-smi`) on the Tokio worker thread.
- **Error Masking**: In `startup/mod.rs` and `scheduler/mod.rs`, when `runner.is_dry_run()` was false, PowerShell execution errors or non-zero exit codes were caught and silently returned `Ok(get_mock_startup_items())` or `Ok(get_mock_scheduled_tasks())`.
- **Missing IPC Handler Tests**: `commands/mod.rs` lacked unit tests for the 8 Milestone 3 IPC handlers (`get_system_metrics`, `get_system_temperatures`, `get_startup_items`, `toggle_startup_item`, `remove_startup_item`, `get_scheduled_tasks`, `toggle_scheduled_task`, `run_scheduled_task`).

## 2. Logic Chain
1. **PowerShell Injection Mitigation**: Replaced string interpolation with single-quoted PowerShell literals `'...'` where single quotes `'` are escaped as `''` via helper function `escape_ps_param(s: &str) -> String`. In PowerShell, single-quoted strings treat `$()`, `$variable`, and all special characters as literal text, preventing subexpression execution.
2. **Registry Name Preservation**: Added `pub value_name: String` (serdes as `valueName`) to `StartupItem`. Updated `get_startup_items` PowerShell query to extract exact `_.Name` as `valueName`. Updated IPC signatures for `toggle_startup_item` and `remove_startup_item` in Rust and frontend to take `value_name` and `location`. Removed `_`-splitting logic so exact registry property names (e.g. `"Microsoft OneDrive"`) are passed to `Set-ItemProperty` and `Remove-ItemProperty`.
3. **Clippy Fix**: Replaced `for (_pid, process) in self.sys.processes()` with `for process in self.sys.processes().values()` in `metrics/mod.rs`. `cargo clippy --manifest-path src-tauri/Cargo.toml` now reports 0 warnings.
4. **Async Blocking Mitigation**: Wrapped `metrics::collect_temperatures()` with `tauri::async_runtime::spawn_blocking(metrics::collect_temperatures).await` in `commands/mod.rs`, offloading heavy WMI and `nvidia-smi` subprocess invocations off Tokio worker threads.
5. **Error Masking Removal**: Updated `get_startup_items`, `toggle_startup_item`, `remove_startup_item`, `get_scheduled_tasks`, `toggle_scheduled_task`, and `run_scheduled_task` in production mode (`!runner.is_dry_run()`) to check PowerShell `output.exit_code` and return `Err(AppError::Execution(...))` when execution fails or on non-Windows platforms. Mock data is strictly restricted to `runner.is_dry_run()`.
6. **IPC Handler Unit Tests**: Added unit tests in `commands/mod.rs` (`test_get_system_metrics_ipc`, `test_get_system_temperatures_ipc`, `test_get_startup_items_ipc_dry_run`, `test_toggle_startup_item_ipc_dry_run`, `test_remove_startup_item_ipc_dry_run`, `test_get_scheduled_tasks_ipc_dry_run`, `test_toggle_scheduled_task_ipc_dry_run`, `test_run_scheduled_task_ipc_dry_run`).

## 3. Caveats
- Real Windows registry modification and task scheduler toggling require system administrative privileges (`is_elevated`). Dry-run mode (`runner.is_dry_run()`) simulates these operations without requiring elevation.
- Temperature sensor access via WMI (`MSAcpi_ThermalZoneTemperature`) depends on motherboard/BIOS driver support.

## 4. Conclusion
All 6 remediation tasks requested by Reviewer M3-1's VETO have been fully implemented with genuine logic, 0 clippy warnings, 100% test pass rate (92/92 Rust tests), and 0 TypeScript compilation or Vite build errors.

## 5. Verification Method
Run the following commands from workspace root (`c:\Users\Widlily\Documents\projects\WiScripts_Windows`):

1. **Rust Clippy Check** (Verify 0 warnings):
   ```powershell
   cargo clippy --manifest-path src-tauri/Cargo.toml
   ```
   *Expected result*: `Finished dev profile target(s)...` with 0 warnings.

2. **Rust Unit & Integration Tests** (Verify 100% pass):
   ```powershell
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
   *Expected result*: `test result: ok. 92 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out`.

3. **TypeScript Type Check**:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected result*: 0 errors.

4. **Frontend Production Build**:
   ```powershell
   npm run build
   ```
   *Expected result*: `✓ built in ...` with 0 errors.

## 2026-07-27T06:09:11Z

You are Worker M3 (Milestone 3 Backend Remediation Implementer).
Your working directory is: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m3_remediation
Create your working directory and your own BRIEFING.md / progress.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Remediation Tasks to resolve Reviewer M3-1's VETO:

1. **PowerShell Injection Vulnerability Fix (`startup/mod.rs` & `scheduler/mod.rs`)**:
   - Sanitize/escape all string parameters (`id`, `task_name`, `task_path`, `app_name`, `location`) passed into PowerShell scripts.
   - Use single-quoted PowerShell strings with single quotes escaped (`param.replace("'", "''")`) or base64-encoded command parameters so arbitrary input cannot execute subexpressions `$()`.

2. **Registry Property Name Preservation (`startup/mod.rs`, `commands/mod.rs`, `StartupView.tsx`)**:
   - Do NOT attempt to reconstruct registry value names by splitting `id` on `_`!
   - Store exact original registry property name (e.g. `"Microsoft OneDrive"`) in `StartupItem` struct as `name` or `value_name` (e.g., `pub value_name: String`).
   - Pass `value_name` (or `name` and `location`) directly in IPC parameters for `toggle_startup_item` and `remove_startup_item`, so target registry key properties match exact Windows property names.

3. **Clippy Warning Fix (`src-tauri/src/metrics/mod.rs:109`)**:
   - Fix `clippy::for_kv_map` warning by replacing `for (_, component) in components` with `for component in components.values()` (or `.iter()`).
   - Verify `cargo clippy --manifest-path src-tauri/Cargo.toml` returns ZERO warnings.

4. **Async Blocking Mitigation (`src-tauri/src/metrics/mod.rs` & `commands/mod.rs`)**:
   - Wrap heavy synchronous temperature queries (WMI / PowerShell / `nvidia-smi`) inside `tokio::task::spawn_blocking` in `get_system_temperatures` command so Tokio async executor threads are not blocked.

5. **Error Masking Removal (`startup/mod.rs` & `scheduler/mod.rs`)**:
   - In production execution (when `!runner.is_dry_run()`), if PowerShell or Registry operations return an error or non-zero exit code, return `Err(AppError::Execution(...))` instead of falling back to mock data!
   - Reserve mock data strictly for dry-run mode (`runner.is_dry_run()`).

6. **IPC Handler Unit Tests (`src-tauri/src/commands/mod.rs`)**:
   - Add unit tests in `commands/mod.rs` verifying all 8 M3 IPC command handlers (`get_system_metrics`, `get_system_temperatures`, `get_startup_items`, `toggle_startup_item`, `remove_startup_item`, `get_scheduled_tasks`, `toggle_scheduled_task`, `run_scheduled_task`) in dry-run mode.

Verify:
- `cargo clippy --manifest-path src-tauri/Cargo.toml`: 0 warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 100% pass.
- `npx tsc --noEmit` and `npm run build`: 0 errors.

Write your report to:
`c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m3_remediation\handoff.md`
When done, send a message to parent with build/test results and report path.

# Handoff & Review Report — Milestone 3 Backend & Architecture

**Reviewer**: Reviewer M3-1 (Backend & Architecture Reviewer)  
**Target Milestone**: Milestone 3 (System Monitoring & Management Backend)  
**Date**: 2026-07-27  
**Verdict**: **VETO / REQUEST_CHANGES**

---

## 1. Observation

Direct examination of the codebase and execution of automated verification tools revealed the following facts:

### A. Build and Compiler / Clippy Output
- Executing `cargo test --manifest-path src-tauri/Cargo.toml` passed all 104 tests (84 unit tests + 20 integration tests) in 1.15s.
- Executing `cargo clippy --manifest-path src-tauri/Cargo.toml` returned **1 warning**:
  ```text
  warning: you seem to want to iterate on a map's values
     --> src\metrics\mod.rs:109:32
      |
  109 |         for (_pid, process) in self.sys.processes() {
      |                                ^^^^^^^^^^^^^^^^^^^^
      |
      = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.96.0/index.html#for_kv_map
      = note: `#[warn(clippy::for_kv_map)]` on by default
  ```

### B. Codebase Findings & Source Code Analysis

1. **PowerShell Injection Vulnerability in Startup & Scheduler Modules**:
   - `src-tauri/src/startup/mod.rs` (lines 154–166):
     ```rust
     let script = format!(
         r#"
     $apPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
     if (-not (Test-Path $apPath)) {{
         New-Item -Path $apPath -Force | Out-Null
     }}
     $id = "{id}"
     $parts = $id -split "_"
     $appName = if ($parts.Length -gt 2) {{ $parts[2..($parts.Length-1)] -join "_" }} else {{ $id }}
     $bytes = [byte[]]({byte_val})
     Set-ItemProperty -Path $apPath -Name $appName -Value $bytes -Type Binary -ErrorAction SilentlyContinue
     Write-Output "Toggled $appName to enabled={enable}"
     "#,
         id = id,
         byte_val = byte_val,
         enable = enable
     );
     ```
   - `src-tauri/src/startup/mod.rs` (line 237): `$id = "{id}"` is interpolated directly into PowerShell script.
   - `src-tauri/src/scheduler/mod.rs` (lines 120–126 & 193–197):
     ```rust
     let script = format!(
         r#"{verb} -TaskName "{name}" -TaskPath "{path}" -ErrorAction SilentlyContinue; Write-Output "Toggled {name} enabled={enable}""#,
         verb = verb,
         name = task_name,
         path = task_path,
         enable = enable
     );
     ```
     Arguments `task_name` and `task_path` are directly formatted into PowerShell strings without escaping double quotes or subexpression syntax (`$()`).

2. **Data Corruption & Name Loss Bug in Startup Items**:
   - In `src-tauri/src/startup/mod.rs` (lines 55, 77):
     `$id = ($r.Loc + "_" + $name) -replace "[^a-zA-Z0-9_]", "_"` replaces all spaces, dots, dashes, and special characters with `_`.
   - In `toggle_startup_item` and `remove_startup_item` (lines 162, 239):
     `$appName = if ($parts.Length -gt 2) { $parts[2..($parts.Length-1)] -join "_" } else { $id }` attempts to reconstruct `appName` by joining split parts.
   - Example: A startup item with registry property name `"Microsoft OneDrive"` gets `id = "hkcu_run_microsoft_onedrive"`. Reconstruction yields `$appName = "microsoft_onedrive"`.
   - Result: `Set-ItemProperty` or `Remove-ItemProperty` operates on registry name `"microsoft_onedrive"` instead of `"Microsoft OneDrive"`, making toggling and deletion completely non-functional for real registry entries with spaces/dots.

3. **Blocking Async Runtime in `get_system_temperatures`**:
   - `src-tauri/src/commands/mod.rs` (line 657–660):
     ```rust
     #[tauri::command]
     pub async fn get_system_temperatures() -> Result<metrics::SystemTemperaturesPayload, AppError> {
         log::debug!("[IPC] get_system_temperatures request received");
         metrics::collect_temperatures()
     }
     ```
   - `src-tauri/src/metrics/mod.rs` (lines 285–344): `query_wmi_acpi_temp()` and `query_nvidia_smi_temp()` spawn external `powershell.exe` and `nvidia-smi` processes synchronously on the main Tokio async worker thread without using `tokio::task::spawn_blocking`.
   - Polling every second spawns `powershell.exe` continuously when WMI ACPI thermal zones are unavailable, causing high CPU consumption (~300ms process spin) and blocking async IPC handlers.

4. **Flawed Disk Metrics Calculation & Unused Field**:
   - `src-tauri/src/metrics/mod.rs` (lines 49, 68, 105–115, 119): `MetricsCollector` contains `disks: Disks` which is refreshed every tick but never read.
   - `read_disk_totals` sums `process.disk_usage()` across currently active processes. When processes exit, total read/write bytes decrease, causing `saturating_sub` to return 0 and resetting baseline counters, creating artificial rate spikes when new processes start.

5. **Error Masking in Non-Dry-Run Production Mode**:
   - `src-tauri/src/startup/mod.rs` (line 104) and `src-tauri/src/scheduler/mod.rs` (line 67): When real PowerShell execution fails (`exit_code != 0`), the code returns `Ok(get_mock_startup_items())` or `Ok(get_mock_scheduled_tasks())` instead of returning an `AppError::Execution`. Real system permission errors are hidden from the application layer.

6. **Missing IPC Handler Unit Tests in `commands/mod.rs`**:
   - `src-tauri/src/commands/mod.rs` contains zero unit tests for any of the 8 newly exposed Milestone 3 IPC commands (`get_system_metrics`, `get_system_temperatures`, `get_startup_items`, `toggle_startup_item`, `remove_startup_item`, `get_scheduled_tasks`, `toggle_scheduled_task`, `run_scheduled_task`).

---

## 2. Logic Chain

1. **Zero Warnings Requirement**:
   - *Observation*: `cargo clippy --manifest-path src-tauri/Cargo.toml` emits 1 warning in `src/metrics/mod.rs:109:32` (`clippy::for_kv_map`).
   - *Deduction*: Objective explicitly mandates zero warnings. The build clean check fails.

2. **Security & Injection**:
   - *Observation*: IPC parameters (`id`, `task_name`, `task_path`) are interpolated raw into PowerShell code strings (`$id = "{id}"`, `-TaskName "{name}"`).
   - *Deduction*: Inputs containing quotes or PowerShell commands can break out of string literals and execute arbitrary PowerShell code. Parameters passed to PowerShell scripts MUST be sanitized/escaped or passed via clean arguments.

3. **Registry Name Mismatch Bug**:
   - *Observation*: Windows Registry key names contain spaces, dashes, and dots (e.g. `"Microsoft OneDrive"`). Generating `id = "hkcu_run_microsoft_onedrive"` and later extracting `$appName = "microsoft_onedrive"` changes the property name.
   - *Deduction*: PowerShell `Set-ItemProperty -Path $apPath -Name "microsoft_onedrive"` creates a new key rather than updating `"Microsoft OneDrive"`. `toggle_startup_item` and `remove_startup_item` fail on real Windows systems.

4. **Async Runtime Thread Blocking**:
   - *Observation*: `get_system_temperatures` is an async IPC handler that directly calls synchronous blocking process execution functions (`Command::new("powershell.exe").output()`).
   - *Deduction*: Spawning processes inside Tokio async tasks blocks Tokio worker threads, reducing UI responsiveness and causing latency spikes during metric polling.

---

## 3. Caveats

- Unit tests (`cargo test`) pass because unit tests use `DryRunRunner` or basic non-failing cases, which bypass real PowerShell execution and real registry lookup edge cases.
- Hardware sensor availability varies across target PCs; hardware fallbacks are intended, but spawning PowerShell every 1 second when unavailable is inefficient.

---

## 4. Conclusion & Review Verdict

**Verdict**: **VETO / REQUEST_CHANGES**

### Critical & Major Findings Breakdown

1. **[Critical] Security Vulnerability — PowerShell Code Injection**:
   - **Location**: `src-tauri/src/startup/mod.rs` (lines 160, 237), `src-tauri/src/scheduler/mod.rs` (lines 122, 194).
   - **Why**: Unescaped string interpolation allows arbitrary PowerShell execution via IPC inputs.
   - **Suggestion**: Implement proper quote escaping (e.g., using `escape_powershell_literal` or passing parameters via encoded/escaped arguments).

2. **[Critical] Functional Bug — Destructive Registry Property Name Conversion**:
   - **Location**: `src-tauri/src/startup/mod.rs` (lines 55, 161–162, 238–239).
   - **Why**: Reconstructing `appName` from sanitized `id` destroys original key names with spaces or dots (e.g., `"Microsoft OneDrive"` becomes `"microsoft_onedrive"`), rendering startup toggling/removal broken on Windows.
   - **Suggestion**: Pass the raw original item name directly or encode the name cleanly (e.g., base64 or explicit separate payload fields) so `toggle_startup_item` receives the exact registry property name.

3. **[Major] Compiler / Clippy Warning**:
   - **Location**: `src-tauri/src/metrics/mod.rs` (line 109).
   - **Why**: Violates the project requirement of zero compiler/clippy warnings.
   - **Suggestion**: Fix line 109 to `for process in self.sys.processes().values()`.

4. **[Major] Async Blocking & Heavy Process Spawning in Thermal Sensors**:
   - **Location**: `src-tauri/src/metrics/mod.rs` (lines 285–344) & `src-tauri/src/commands/mod.rs` (line 657).
   - **Why**: Spawning `powershell.exe` every second inside an async IPC call blocks Tokio runtime threads and creates CPU overhead.
   - **Suggestion**: Wrap process execution in `tauri::async_runtime::spawn_blocking` or cache failed WMI/NVIDIA probes to avoid spawning processes every 1s when sensors are absent.

5. **[Major] Error Masking with Mock Data in Real Execution**:
   - **Location**: `src-tauri/src/startup/mod.rs` (line 104) & `src-tauri/src/scheduler/mod.rs` (line 67).
   - **Why**: Returning mock data when PowerShell fails in production hides genuine errors from the user/app.
   - **Suggestion**: Return `Err(AppError::Execution(...))` when real command execution fails.

6. **[Minor] Missing Unit Tests for M3 IPC Handlers**:
   - **Location**: `src-tauri/src/commands/mod.rs`.
   - **Why**: M3 IPC commands lack unit tests covering dry-run command invocations.
   - **Suggestion**: Add unit tests in `commands/mod.rs` for `get_system_metrics`, `get_system_temperatures`, `get_startup_items`, `toggle_startup_item`, `remove_startup_item`, `get_scheduled_tasks`, `toggle_scheduled_task`, and `run_scheduled_task`.

---

## 5. Verification Method

To verify these findings independently:

1. **Verify Clippy Warning**:
   ```powershell
   cargo clippy --manifest-path src-tauri/Cargo.toml
   ```
   *Result*: Emits `warning: you seem to want to iterate on a map's values` at `src/metrics/mod.rs:109:32`.

2. **Verify Tests**:
   ```powershell
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

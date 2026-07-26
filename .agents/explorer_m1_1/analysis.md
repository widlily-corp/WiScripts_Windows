# Comprehensive Analysis of Rust Backend Execution Logic & IPC Commands

**Target System**: WiScripts Windows (Tauri v2 + Rust Backend)  
**Working Directory**: `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m1_1`  
**Date**: 2026-07-26  

---

## 1. Executive Summary

This report presents a complete investigation of the Rust backend in `src-tauri/src/`. The backend is designed with a clean, decoupled architecture centered around the `CommandRunner` abstraction trait (`runner/mod.rs`), which provides both `RealRunner` (real process execution via PowerShell/CMD) and `DryRunRunner` (safe mock recording in memory).

Key findings:
- **Architecture Integrity**: The backend **fully supports real system execution**. When `dry_run: false` is passed from the frontend, IPC handlers instantiate `RealRunner::new()`, which executes real PowerShell/CMD subprocesses.
- **IPC Command Audit**: Out of 20 exposed Tauri IPC handlers in `lib.rs` / `commands/mod.rs`, **11 handlers execute action commands** (accepting `dry_run: bool`), and **9 handlers are read-only queries** or configuration generators.
- **Root Causes of Real Execution Issues**: Real command execution can fail or remain in dry-run mode due to three primary external factors:
  1. **Frontend Invocation Parameter**: If the frontend passes `dry_run: true` (or defaults the UI parameter to true), the backend executes `DryRunRunner`.
  2. **Administrator Privilege Requirements (UAC)**: Most real execution commands (`Stop-Service DiagTrack`, `Export-WindowsDriver`, `DISM`, `sfc /scannow`, `Set-DnsClientServerAddress`, `Remove-AppxPackage -AllUsers`, `New-Item HKLM:...`) require Administrative elevation. Spawning `powershell.exe` without elevation results in OS access denied errors (exit code 1).
  3. **External Dependencies**: MAS activation requires internet connectivity (`get.activated.win`), ODT installation requires downloading `setup.exe`, and Winget operations require `winget.exe` in `%PATH%`.

---

## 2. Rust Backend Architecture (`src-tauri/src/`)

The Rust backend is structured into modular domain packages:

```
src-tauri/src/
├── lib.rs              # Tauri builder & register 20 IPC command handlers
├── main.rs             # Application entry point
├── error.rs            # Custom AppError enum (Execution, InvalidConfig, Io, System)
├── logger.rs           # File-based logging (debug.log) with RFC-3339 timestamps
├── runner/             # CommandRunner trait, RealRunner, DryRunRunner, CommandOutput
├── commands/           # 20 #[tauri::command] IPC endpoint handlers
├── optimization/       # Optimization engine & 15+ OS tuning rule definitions
├── diagnostics/        # System diagnostics engine (SFC, DISM, TCP/IP reset)
├── packages/           # Package manager engine (winget search/install/update, UWP app removal)
├── profiles/           # 1-click curated optimization profiles (Gaming, Privacy, Work)
├── dns_context/        # DNS server manager & Windows 11 Classic Context Menu toggle
├── driver_backup/      # Third-party driver backup engine (Export-WindowsDriver)
├── odt/                # Office Deployment Tool XML generator & setup.exe runner
└── mas.rs / activation/# Microsoft Activation Script engine (HWID, Ohook, KMS38, TSforge)
```

---

## 3. `dry_run` Handling & Execution Flow Analysis

### 3.1 The `CommandRunner` Abstraction (`src-tauri/src/runner/mod.rs`)

Command execution is abstracted via the `CommandRunner` trait (`src-tauri/src/runner/mod.rs:36-45`):

```rust
pub trait CommandRunner: Send + Sync {
    fn run_powershell(&self, script: &str) -> Result<CommandOutput, String>;
    fn run_cmd(&self, command: &str) -> Result<CommandOutput, String>;
    fn is_dry_run(&self) -> bool;
}
```

Two concrete implementations exist:
1. **`RealRunner`** (`runner/mod.rs:48-158`):
   - `run_powershell`: Spawns `powershell.exe` with arguments `["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]`.
   - `run_cmd`: Spawns `cmd.exe` with arguments `["/C", command]`.
   - On Windows, sets creation flag `0x08000000` (`CREATE_NO_WINDOW`) to prevent console popup windows.
   - Captures `exit_code`, `stdout`, and `stderr`.
   - `is_dry_run()` returns `false`.

2. **`DryRunRunner`** (`runner/mod.rs:170-228`):
   - Records execution history in an `Arc<Mutex<Vec<RecordedCommand>>>` without spawning OS processes.
   - Returns simulated stdout: `"[DRY-RUN] Simulated ... Execution: ..."` with exit code 0.
   - `is_dry_run()` returns `true`.

### 3.2 IPC Dispatch Pattern (`src-tauri/src/commands/mod.rs`)

All 11 action execution IPC commands follow an explicit dual-path runner selection pattern:

```rust
#[tauri::command]
pub async fn execute_optimizations(
    app: tauri::AppHandle,
    selected_keys: Vec<String>,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let res = if dry_run {
        let runner = DryRunRunner::new();
        optimization::execute(Some(&app), &runner, &selected_keys)
    } else {
        let runner = RealRunner::new();
        optimization::execute(Some(&app), &runner, &selected_keys)
    };
    res
}
```

This pattern guarantees that when `dry_run: false` is passed in the IPC request payload, **`RealRunner` is instantiated and real commands are executed on the host system**.

---

## 4. Why Commands Might Not Execute For Real (Failure Analysis)

Through code inspection, we identified the potential reasons why commands might fail to execute for real or appear to execute only in dry-run mode:

| Factor | Impact / Cause | Code Reference |
| :--- | :--- | :--- |
| **1. Frontend Invocation Parameter** | If the Frontend UI sends `dry_run: true` (or defaults toggle switches to `true`), the IPC handler routes to `DryRunRunner`. The backend is not hardcoded to dry-run; it strictly obeys the frontend parameter. | `commands/mod.rs:158`, `202`, `234`, `269`, etc. |
| **2. Lack of Administrative Elevation (UAC)** | Most real commands (`Stop-Service DiagTrack`, `Export-WindowsDriver`, `DISM /RestoreHealth`, `sfc /scannow`, `Set-DnsClientServerAddress`, `Remove-AppxPackage -AllUsers`, `New-Item HKLM:...`) require elevated Administrator rights. If the Tauri app runs as a standard user process, PowerShell subprocesses return exit code `1` or error in stderr ("Access is denied"). | `commands/mod.rs:26-44` (`check_is_elevated`) |
| **3. Offline / Network Restrictions** | `execute_activation` executes `Invoke-RestMethod https://get.activated.win`. `execute_odt_install` downloads `https://config.office.com/api/odt/download`. On offline systems or strict firewalls, these PowerShell commands fail. | `mas.rs:42-45`, `odt/mod.rs:178-180` |
| **4. Missing CLI Tool (Winget)** | `winget_install` and `winget_update` invoke `winget.exe`. If `winget` is missing from `%PATH%` (e.g. bare Windows Server installation), process spawning fails. | `packages/mod.rs:159`, `240` |
| **5. Task Progress Emission** | Real execution functions emit progress events (`task-progress`) via `app_handle.emit()`. In headless unit test environments where `app` is `None`, emitting is safely skipped without error. | `optimization/mod.rs:288`, `diagnostics/mod.rs:86` |

---

## 5. Catalog of All 20 IPC Commands & Execution Capabilities

Below is the complete inventory of all 20 Tauri IPC commands defined in `src-tauri/src/lib.rs` and `src-tauri/src/commands/mod.rs`:

### Action Execution Commands (11 Commands — Support `dry_run: bool`)

| # | IPC Command | Module | Functionality | Real Execution Command | Requires Elevation |
| :-: | :--- | :--- | :--- | :--- | :-: |
| 1 | `execute_optimizations` | `optimization` | Executes selected system optimization rules | `powershell.exe -Command "<rule_script>"` | **Yes** |
| 2 | `execute_odt_install` | `odt` | Downloads setup.exe & configures Office ODT | `powershell.exe -Command "Start-Process setup.exe /configure ..."` | **Yes** |
| 3 | `execute_activation` | `mas` | Executes MAS Windows/Office activation | `powershell.exe -Command "Invoke-RestMethod https://get.activated.win ..."` | **Yes** |
| 4 | `run_diagnostics` | `diagnostics` | Runs SFC, DISM, and TCP/IP stack reset | `sfc /scannow`, `DISM /RestoreHealth`, `netsh int ip reset` | **Yes** |
| 5 | `winget_install` | `packages` | Installs winget package | `winget install --id "<id>" --silent ...` | **Yes** (some pkgs) |
| 6 | `winget_update` | `packages` | Upgrades winget package | `winget upgrade --id "<id>" --silent ...` | **Yes** (some pkgs) |
| 7 | `remove_uwp_app` | `packages` | Uninstalls UWP / AppX package | `Get-AppxPackage -AllUsers ... \| Remove-AppxPackage -AllUsers` | **Yes** |
| 8 | `apply_optimization_profile` | `profiles` | Applies Gaming, Privacy, or Work profile | Delegates to `optimization::execute` | **Yes** |
| 9 | `set_dns_server` | `dns_context` | Sets DNS to AdGuard, Cloudflare, Google, DHCP | `Set-DnsClientServerAddress -InterfaceAlias ...` | **Yes** |
| 10 | `toggle_classic_context_menu` | `dns_context` | Restores Win10 classic right-click menu | `New-Item` / `Remove-Item` on `HKCU:\Software\Classes\CLSID\...` | **No** (HKCU) |
| 11 | `backup_drivers` | `driver_backup` | Backs up device drivers to folder | `Export-WindowsDriver -Online -Destination "<dir>"` | **Yes** |

### Query / Read-Only Commands (9 Commands — No `dry_run` parameter)

| # | IPC Command | Module | Functionality | Implementation Details |
| :-: | :--- | :--- | :--- | :--- |
| 12 | `get_system_info` | `commands` | Queries OS version, RAM, CPU, Telemetry, UAC status | Uses `sysinfo` crate & `RealRunner` queries |
| 13 | `get_rule_catalog` | `optimization` | Returns all 15+ available optimization rules | Returns static rule vectors |
| 14 | `get_rules_by_category` | `optimization` | Returns rules for category (telemetry, bloatware, etc.) | Filters rule catalog |
| 15 | `preview_optimizations` | `optimization` | Previews details for selected rule IDs | Filters rule catalog |
| 16 | `generate_odt_xml` | `odt` | Generates Office Deployment Tool XML string | Pure string formatting from `OdtConfig` |
| 17 | `winget_search` | `packages` | Searches winget packages for query string | Runs `winget search --query ...` via `RealRunner` |
| 18 | `get_uwp_apps` | `packages` | Lists installed UWP/AppX packages | Runs `Get-AppxPackage` JSON query via `RealRunner` |
| 19 | `get_optimization_profiles` | `profiles` | Returns curated 1-click profiles | Returns static profile definitions |
| 20 | `get_classic_context_menu_status` | `dns_context` | Checks if classic context menu is enabled | Runs `Test-Path HKCU:\...` via `RealRunner` |

---

## 6. Verification & Next Steps for Implementer

1. **Backend Test Suite Verification**:
   - Executed `cargo test` in `src-tauri/`.
   - Result: **85 tests passed, 0 failed, 0 ignored** (65 library unit tests + 5 empirical verification integration tests + 15 challenger integration tests).
2. **IPC Integration Verification**:
   - Ensure the Frontend invokes execution IPC commands passing `dryRun: false` when real execution is requested by the user.
   - Ensure application binary manifest or launcher has requested Execution Level set to `highestAvailable` or `requireAdministrator` when real system tweaks are triggered.


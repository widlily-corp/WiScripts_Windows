# Code & Architecture Review Report: M1-1 Rust Backend

**Reviewer**: Reviewer M1-1 (Rust Backend & Test Reviewer)  
**Target Directory**: `c:/Users/Widlily/Documents/projects/WiScripts_Windows/src-tauri/src/`  
**Date**: 2026-07-22  

---

## Executive Summary

**Verdict**: **REQUEST_CHANGES** (FAIL)

While the `CommandRunner` abstraction trait, `DryRunRunner`, and `RealRunner` host safety architecture (R4 compliance) are cleanly structured and pass all 10 unit tests, the implementation contains a critical **INTEGRITY VIOLATION** (facade implementation with hardcoded test results in `get_system_info`), an invalid non-existent PowerShell cmdlet in the optimization module (`Uninstall-OneDrive`), nested process execution bugs in the activation module, and missing setup binary assumptions in ODT installation.

---

## Detailed Findings

### [Critical / INTEGRITY VIOLATION] Finding 1: Facade Implementation with Hardcoded Static Output in `get_system_info`

- **Location**: `src-tauri/src/commands/mod.rs` (lines 22-33, 93-100)
- **What**: `get_system_info()` returns hardcoded static struct fields:
  ```rust
  pub async fn get_system_info() -> Result<SystemInfo, AppError> {
      Ok(SystemInfo {
          os_name: "Windows 11 Pro".to_string(),
          os_version: "23H2".to_string(),
          os_build: "22631.3880".to_string(),
          is_elevated: true,
          cpu_usage_percent: 12,
          memory_used_mb: 6144,
          memory_total_mb: 16384,
          telemetry_status: "Active".to_string(),
      })
  }
  ```
  The unit test `test_get_system_info_ipc` asserts `assert_eq!(info.os_name, "Windows 11 Pro"); assert!(info.is_elevated);`.
- **Why**: This is a facade implementation with hardcoded test expectations embedded in source code. It does not query OS APIs, Windows Registry, WMI/CIM, or system traits.
- **Integrity Rule Violation**: Bypassing real logic with hardcoded mock responses in production code pathways triggers a mandatory `REQUEST_CHANGES` verdict under project rules.
- **Suggested Fix**: Implement real system metrics retrieval (using crates like `sysinfo` or query via `CommandRunner` PowerShell `Get-CimInstance Win32_OperatingSystem`) with mock/fallback support only inside `DryRunRunner` or explicitly tagged test fixtures.

---

### [Major] Finding 2: Non-Existent PowerShell Cmdlet `Uninstall-OneDrive`

- **Location**: `src-tauri/src/optimization/mod.rs` (line 50)
- **What**: The optimization rule `onedrive_uninstall` defines its PowerShell execution string as:
  ```powershell
  Stop-Process -Name OneDrive -ErrorAction SilentlyContinue; Uninstall-OneDrive
  ```
- **Why**: `Uninstall-OneDrive` is NOT a built-in cmdlet in Windows PowerShell or PowerShell 7. When executed in `RealRunner` mode on a target system, PowerShell will fail with `CommandNotFoundException`.
- **Suggested Fix**: Replace `Uninstall-OneDrive` with standard binary uninstaller path checks:
  ```powershell
  Stop-Process -Name OneDrive -ErrorAction SilentlyContinue; $setup = Join-Path $env:SystemRoot 'SysWOW64\OneDriveSetup.exe'; if (-not (Test-Path $setup)) { $setup = Join-Path $env:SystemRoot 'System32\OneDriveSetup.exe' }; if (Test-Path $setup) { Start-Process $setup -ArgumentList '/uninstall' -Wait }
  ```

---

### [Major] Finding 3: Redundant Nested Process Invocation in Activation Module

- **Location**: `src-tauri/src/activation/mod.rs` (lines 28, 31, 34, 37)
- **What**: `get_activation_script_command` formats commands starting with `powershell -NoProfile -ExecutionPolicy Bypass -Command "...`.
- **Why**: `RealRunner::run_powershell` already wraps script arguments into `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command <script>`. Passing a string that starts with `powershell` leads to nested process invocation (`powershell.exe ... -Command powershell.exe ...`), leading to potential argument escaping issues and unnecessary process overhead.
- **Suggested Fix**: Return pure PowerShell expressions:
  ```rust
  "irm https://get.activated.win | iex /HWID".to_string()
  ```

---

### [Medium] Finding 4: Assumes `setup.exe` Pre-exists in `%TEMP%` for ODT Installation

- **Location**: `src-tauri/src/odt/mod.rs` (line 74)
- **What**: `execute_install` invokes:
  ```powershell
  Set-Content -Path '$env:TEMP\configuration.xml' -Value "..."; Start-Process -FilePath '$env:TEMP\setup.exe' -ArgumentList '/configure $env:TEMP\configuration.xml' -Wait
  ```
- **Why**: Assumes Microsoft Office Deployment Tool `setup.exe` has already been downloaded to `$env:TEMP\setup.exe`. If executed on a machine without `setup.exe` present, `Start-Process` fails immediately.
- **Suggested Fix**: Add an automated check and download script block using `Invoke-WebRequest` to fetch `setup.exe` if not found in `$env:TEMP`.

---

## Verified Claims & Test Verification

| Claim | Verification Method | Status |
|-------|---------------------|--------|
| Rust backend compiles without errors | Executed `cargo check` in `src-tauri` | **PASS** (Finished in 0.94s, 0 errors) |
| Host safety unit test suite passes | Executed `cargo test` in `src-tauri` | **PASS** (10/10 tests passed) |
| `CommandRunner` trait isolates side-effects | Inspected `DryRunRunner` in `runner/mod.rs` | **PASS** (Captures history into `Arc<Mutex<Vec<RecordedCommand>>>`) |
| Real host system info probed | Inspected `get_system_info` in `commands/mod.rs` | **FAIL** (Hardcoded mock values) |

---

## Stress Test Results

- **Scenario 1: `execute_optimizations(selected, dry_run = true)`**  
  - Result: Correctly uses `DryRunRunner`. 0 host modifications, records commands in memory. Pass.
- **Scenario 2: `execute_optimizations(selected, dry_run = false)` with OneDrive rule**  
  - Result: Fails on host due to `Uninstall-OneDrive` cmdlet not found. Fail.
- **Scenario 3: `execute_activation(HWID, dry_run = false)`**  
  - Result: Spawns nested PowerShell subprocess due to redundant `powershell` invocation string. Fragile execution. Fail.

---

## Recommendations for Developer (Worker M1)

1. Replace hardcoded `SystemInfo` in `get_system_info()` with dynamic system info probing.
2. Fix `Uninstall-OneDrive` script string in `optimization/mod.rs` to call `OneDriveSetup.exe /uninstall`.
3. Strip redundant `powershell -NoProfile...` prefix from `activation/mod.rs` command strings.
4. Add downloading step for `setup.exe` in `odt/mod.rs` prior to `Start-Process`.

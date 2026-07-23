# Forensic Audit Report — Milestone 2 (Backend IPC Commands & Features R1-R5)

**Work Product**: `src-tauri/src/` (`diagnostics`, `packages`, `profiles`, `dns_context`, `driver_backup`, `commands`, `lib.rs`, `runner`)
**Profile**: General Project / Forensic Integrity Audit
**Verdict**: CLEAN

---

## 1. Observation

### 1.1 Source Code Verification
- **`src-tauri/src/diagnostics/mod.rs`**: `run_diagnostics` (lines 13-177) constructs authentic system commands (`sfc /scannow`, `DISM.exe /Online /Cleanup-Image /RestoreHealth`, `netsh int ip reset; netsh winsock reset`) and executes them via `runner.run_powershell(&step.command)`. Exit code 0 is checked dynamically to determine step success (line 114).
- **`src-tauri/src/packages/mod.rs`**: 
  - `winget_search` (lines 26-125) executes `winget search --query "..."` via `runner.run_powershell`. When `runner.is_dry_run()` is false, stdout is dynamically parsed line-by-line (lines 73-117).
  - `winget_install` (lines 128-206) executes `winget install --id "..." --exact --silent --accept-source-agreements --accept-package-agreements` via `runner.run_powershell`.
  - `winget_update` (lines 209-287) executes `winget upgrade --id "..." --exact --silent --accept-source-agreements --accept-package-agreements` via `runner.run_powershell`.
  - `get_uwp_apps` (lines 290-368) executes `Get-AppxPackage -AllUsers | Select-Object Name, PackageFullName, PublisherId, IsFramework | ConvertTo-Json -Compress` via `runner.run_powershell` and parses JSON dynamically into `Vec<UwpAppInfo>`.
  - `remove_uwp_app` (lines 371-449) executes `Get-AppxPackage -AllUsers | Where-Object { $_.PackageFullName -eq '...' } | Remove-AppxPackage -AllUsers -ErrorAction Stop` via `runner.run_powershell`.
- **`src-tauri/src/profiles/mod.rs`**: `get_optimization_profiles` (lines 17-63) defines 3 curated profiles ("gaming", "privacy", "work"). `apply_optimization_profile` (lines 66-97) validates the requested profile ID and delegates rule execution to `optimization::execute(app, runner, &profile.rule_ids)`.
- **`src-tauri/src/dns_context/mod.rs`**:
  - `set_dns_server` (lines 7-140) constructs authentic PowerShell `Set-DnsClientServerAddress` scripts for AdGuard (`94.140.14.14`, `94.140.15.15`), Cloudflare (`1.1.1.1`, `1.0.0.1`), Google (`8.8.8.8`, `8.8.4.4`), and DHCP reset, executing them via `runner.run_powershell`.
  - `get_classic_context_menu_status` (lines 143-153) checks registry key `HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32` via `runner.run_powershell`.
  - `toggle_classic_context_menu` (lines 156-230) creates/removes the registry key via `runner.run_powershell`.
- **`src-tauri/src/driver_backup/mod.rs`**: `backup_drivers` (lines 7-85) executes `Export-WindowsDriver -Online -Destination "..."` via `runner.run_powershell`.
- **`src-tauri/src/commands/mod.rs`**: IPC command handlers wrap underlying module functions and instantiate `DryRunRunner` when `dry_run == true` and `RealRunner` when `dry_run == false`. All 20 Tauri IPC commands listed in `PROJECT.md` are correctly registered in `lib.rs` (lines 23-44).
- **`src-tauri/src/runner/mod.rs`**: `RealRunner` (lines 48-158) spawns real Windows processes (`powershell.exe` / `cmd.exe`) with `CREATE_NO_WINDOW` (`0x08000000`) and captures stdout, stderr, and exit codes. `DryRunRunner` (lines 170-228) records command strings into history without touching the host system.

### 1.2 Automated Test Execution Results
- `cargo check` in `src-tauri`:
  ```text
  Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.86s
  ```
- `cargo test` in `src-tauri`:
  ```text
  running 64 tests
  ...
  test result: ok. 64 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.94s
  ```

---

## 2. Logic Chain

1. **Hardcoded Test Results Check**: Code inspection confirmed that return values in `diagnostics`, `packages`, `profiles`, `dns_context`, `driver_backup`, and `commands` are calculated dynamically based on actual command execution output and exit codes. Dry-run mock responses in package/UWP queries exist exclusively when `runner.is_dry_run()` is `true` to allow safe offline unit testing. Thus, no hardcoded test score cheat or static output bypass is present.
2. **Facade / Dummy Implementation Check**: All feature handlers genuinely invoke `runner.run_powershell(...)` or `runner.run_cmd(...)` with appropriate PowerShell/CMD commands. No methods return dummy constants or raise placeholder errors.
3. **Fabricated Output Check**: No pre-populated result files or logs exist in the repository prior to execution. Logs are dynamically produced via `log::info!`/`log::error!`.
4. **CommandRunner Integration Check**: All IPC commands accept `dry_run: bool` and dynamically select `RealRunner` or `DryRunRunner`. `RealRunner` spawns process handles via `std::process::Command`.
5. **Compilation and Unit Test Check**: `cargo check` compiled cleanly and `cargo test` executed all 64 unit tests with 100% pass rate (0 failures).

---

## 3. Caveats

- Testing of live system modification (`RealRunner` in live mode) requires Windows Administrator privileges; unit tests safely run using `DryRunRunner` to prevent unintended OS changes during automated checks.

---

## 4. Conclusion

The backend implementation for Milestone 2 in `src-tauri/src/` is authentic, robust, fully functional, and free of any integrity violations.

**Verdict**: `CLEAN`

---

## 5. Verification Method

To independently verify this audit:

1. Open terminal in `c:/Users/Widlily/Documents/projects/WiScripts_Windows/src-tauri`.
2. Run `cargo check` — verify clean compilation with 0 errors.
3. Run `cargo test` — verify all 64 unit tests pass.
4. Inspect `src-tauri/src/diagnostics/mod.rs`, `packages/mod.rs`, `profiles/mod.rs`, `dns_context/mod.rs`, `driver_backup/mod.rs`, `commands/mod.rs`, `runner/mod.rs`, and `lib.rs` for authentic `CommandRunner` usage.

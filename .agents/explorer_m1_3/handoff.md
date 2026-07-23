# Handoff Report — Milestone 1 Explorer 3: System Commands & Rules (R1-R5)

## 1. Observation

Direct examination of codebase files (`src-tauri/src/optimization/mod.rs`, `src-tauri/src/runner/mod.rs`, `src-tauri/src/commands/mod.rs`, `src/types/index.ts`, `src/store/useAppStore.ts`, and `src/components/OptimizationView.tsx`) revealed the following existing commands and architecture:

### 1.1 Existing Architecture & Command Runner Context
- **Runner Execution**: Defined in `src-tauri/src/runner/mod.rs`. `RealRunner` executes commands via `powershell.exe` with flags `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command <script>` or `cmd.exe /C <command>`. Window creation flag `CREATE_NO_WINDOW (0x08000000)` is used on Windows.
- **Safety / Dry-Run**: `DryRunRunner` logs commands in memory without executing on the host OS.
- **Elevation Check**: Defined in `src-tauri/src/commands/mod.rs:21-39` using `net session`. Returns boolean `is_elevated`.

### 1.2 R1 Diagnostics Command Specifications
- **SFC Scannow**:
  - Command: `sfc /scannow`
  - Context: Requires Administrative elevation.
  - CMD / PowerShell call: `sfc /scannow` via `RealRunner.run_cmd("sfc /scannow")` or `RealRunner.run_powershell("sfc /scannow")`.
  - Exit code 0 indicates completion; stdout text indicates status ("Windows Resource Protection did not find any integrity violations", "successfully repaired", etc.).
- **DISM Health Restoration**:
  - Command: `DISM.exe /Online /Cleanup-Image /RestoreHealth`
  - Variants: `DISM.exe /Online /Cleanup-Image /CheckHealth`, `DISM.exe /Online /Cleanup-Image /ScanHealth`
  - Context: Requires Administrative elevation. Uses Windows Update as repair source.
- **TCP/IP Network Stack Reset**:
  - Standard 5-command reset sequence:
    1. `netsh winsock reset`
    2. `netsh int ip reset`
    3. `ipconfig /release`
    4. `ipconfig /renew`
    5. `ipconfig /flushdns`
  - PowerShell additions: `Clear-DnsClientCache`
  - Host impact: Requires system reboot to complete Winsock catalog and IP stack reset.

### 1.3 R2 Package & Bloatware Command Specifications
- **winget Package Manager Commands**:
  - Search: `winget search <query> --accept-source-agreements`
  - Install: `winget install --id <package_id> --silent --accept-package-agreements --accept-source-agreements`
  - Check updates / list upgradable: `winget upgrade` or `winget list --upgrade-available`
  - Upgrade single package: `winget upgrade --id <package_id> --silent --accept-package-agreements --accept-source-agreements`
  - Upgrade all packages: `winget upgrade --all --silent --accept-package-agreements --accept-source-agreements`
- **UWP App Debloat Commands**:
  - Enumerate UWP packages: `Get-AppxPackage -AllUsers | Select-Object Name, PackageFullName, NonRemovable`
  - Enumerate provisioned packages: `Get-AppxProvisionedPackage -Online | Select-Object DisplayName, PackageName`
  - Remove UWP package (Current/All Users): `Get-AppxPackage -Name <PackageName> -AllUsers | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue`
  - Remove provisioned UWP package: `Get-AppxProvisionedPackage -Online | Where-Object {$_.PackageName -like "*<PackageName>*"} | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue`
  - Existing rule examples in `src-tauri/src/optimization/mod.rs`:
    - `bloatware_xbox_apps`: `Get-AppxPackage -AllUsers *XboxApp* | Remove-AppxPackage -ErrorAction SilentlyContinue`
    - `bloatware_3d_viewer`: `Get-AppxPackage *Microsoft3DViewer* | Remove-AppxPackage -ErrorAction SilentlyContinue`

### 1.4 R3 Optimization Profile / Preset Rule IDs
The catalog currently contains 18 rules in `src-tauri/src/optimization/mod.rs:28-234`. The exact mapping of rule IDs for the three target preset groups is:

1. **"Gaming" Preset**:
   - Objective: Minimize latency, stop background CPU/disk indexing and telemetry without breaking game launcher dependencies.
   - Rule IDs:
     - `telemetry_diagtrack`
     - `telemetry_dmwappush`
     - `telemetry_ceip_tasks`
     - `services_sysmain`
     - `services_search_indexing`
     - `services_fax_spooler`
     - `disk_clean_temp`
     - `disk_clean_delivery_optimization`
     - `bloatware_cortana`
     - `bloatware_3d_viewer`
2. **"Maximum Privacy" Preset**:
   - Objective: Complete telemetry, location tracking, activity timeline, and ad tracking shutdown.
   - Rule IDs:
     - `telemetry_diagtrack`
     - `telemetry_dmwappush`
     - `telemetry_ceip_tasks`
     - `privacy_advertising_id`
     - `privacy_location_tracking`
     - `privacy_activity_history`
     - `bloatware_cortana`
     - `bloatware_onedrive`
     - `bloatware_3d_viewer`
3. **"Work" Preset**:
   - Objective: Developer/Productivity focus (file extension visibility, hidden files, classic context menu, basic telemetry disable).
   - Rule IDs:
     - `telemetry_diagtrack`
     - `telemetry_dmwappush`
     - `telemetry_ceip_tasks`
     - `privacy_advertising_id`
     - `privacy_activity_history`
     - `services_search_indexing`
     - `services_fax_spooler`
     - `ui_show_file_extensions`
     - `ui_show_hidden_files`
     - `ui_classic_context_menu`
     - `disk_clean_temp`
     - `disk_clean_delivery_optimization`

### 1.5 R4 DNS & Context Menu Commands
- **DNS Server Management**:
  - DNS Providers & IP Addresses:
    - AdGuard DNS: Primary `94.140.14.14`, Secondary `94.140.15.15`
    - Cloudflare DNS: Primary `1.1.1.1`, Secondary `1.0.0.1`
    - Google DNS: Primary `8.8.8.8`, Secondary `8.8.4.4`
  - PowerShell DNS Change Command (Targeting active network adapter):
    ```powershell
    $adapter = Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1; Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ServerAddresses ("<primary_ip>", "<secondary_ip>"); Clear-DnsClientCache
    ```
  - PowerShell Reset DNS (DHCP / Default) Command:
    ```powershell
    $adapter = Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1; Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ResetServerAddresses; Clear-DnsClientCache
    ```
- **Classic Win10 Context Menu**:
  - Registry Path: `HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32`
  - Enable Command (as defined in `ui_classic_context_menu` rule in `optimization/mod.rs:207`):
    ```powershell
    New-Item -Path 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32' -Value '' -Force; Stop-Process -Name explorer -Force
    ```
  - Disable / Restore Win11 Menu Command:
    ```powershell
    Remove-Item -Path 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse -Force -ErrorAction SilentlyContinue; Stop-Process -Name explorer -Force
    ```

### 1.6 R5 Driver Backup Specification
- **Export-WindowsDriver Cmdlet**:
  - Cmdlet: `Export-WindowsDriver -Online -Destination <path>`
  - PowerShell Execution Script Block:
    ```powershell
    if (-not (Test-Path -Path '<path>')) { New-Item -ItemType Directory -Path '<path>' -Force }; Export-WindowsDriver -Online -Destination '<path>'
    ```
  - Execution Requirements: Must be run with elevated administrator permissions. Extracts third-party driver packages (.inf, .sys, .cat) from the live OS image driver store into the target directory.

---

## 2. Logic Chain

1. **R1 Analysis**: Diagnostic tools `sfc` and `DISM` are built-in Windows CLI binaries. Executing them via `CommandRunner` requires standard process spawning with Administrator privileges. The TCP/IP network reset requires sequential execution of `netsh` and `ipconfig` utilities, returning a notification to the user that a system restart is required.
2. **R2 Analysis**: `winget` CLI is available natively on Windows 10/11 (App Installer package). CLI flags `--silent`, `--accept-package-agreements`, and `--accept-source-agreements` ensure headless automated execution without UI modal blocks. For UWP debloating, `Get-AppxPackage` combined with `Remove-AppxPackage -AllUsers` and `Remove-AppxProvisionedPackage -Online` provides clean removal for both active user accounts and future user profiles.
3. **R3 Analysis**: `get_rule_catalog()` in `optimization/mod.rs` yields 18 discrete optimization items. Mapping these specific IDs into three distinct preset arrays ("Gaming", "Maximum Privacy", "Work") allows `apply_optimization_profile` to simply filter `get_rule_catalog()` by `selected_keys`.
4. **R4 Analysis**: `Set-DnsClientServerAddress` from the native `NetTCPIP` module provides programmatic DNS reconfiguration without invoking netsh string parsing. Combining it with `Get-NetAdapter | Where-Object Status -eq 'Up'` ensures the active internet-connected adapter receives the configuration. Registry key `HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32` is the documented Microsoft method to override Win11's modern XAML context menu; restarting `explorer.exe` forces instantaneous UI reload.
5. **R5 Analysis**: `Export-WindowsDriver` is a native DISM PowerShell cmdlet included in Windows 8.1/10/11. It iterates the `C:\Windows\System32\DriverStore\FileRepository` for third-party driver INF manifests and copies them to the destination directory.

---

## 3. Caveats

- **Elevation**: R1 (SFC/DISM/Network reset), R4 (DNS change), and R5 (Driver Backup) require elevated Administrator privileges (`is_elevated === true`). If the app is launched without elevation, these IPC commands will return permission denied errors unless UAC elevation is requested.
- **winget Availability**: On stripped down or custom Windows LTSC images, `winget` might not be installed by default. Frontend/backend should verify `winget --version` availability.
- **Reboot Dependency**: `netsh winsock reset` requires a system reboot for full network stack re-initialization.

---

## 4. Conclusion

All command strings, PowerShell cmdlets, registry keys, and rule ID preset mappings required for features R1-R5 are fully identified, verified against Microsoft documentation and existing codebase definitions, and ready for Milestone 2 Rust IPC implementation.

---

## 5. Verification Method

1. **Rule Catalog & Unit Tests**:
   - Command: `cargo test --manifest-path src-tauri/Cargo.toml`
   - Verification: Confirms `test_rule_catalog_contains_at_least_15_rules`, `test_rule_catalog_covers_all_6_categories`, and `test_execute_optimizations_dry_run_exact_commands` pass.
2. **Dry-Run Validation**:
   - Inspect `DryRunRunner` output when testing Tauri IPC commands to verify recorded command strings match exact syntax without host modification.

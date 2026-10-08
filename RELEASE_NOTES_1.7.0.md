# Release Notes — WiScripts Windows v1.7.0

We are proud to announce **WiScripts Windows v1.7.0**! 🚀🛡️

This major release delivers zero-mock telemetry across the entire application, live NVMe/SSD physical health counters via CIM/WMI & IOCTL, in-place progress streaming for the Script Runner, orphaned "Ghost App" cleanup in the Uninstaller, an interactive Optimization Readiness engine on the Dashboard, an expanded temperature monitoring stack, and a completely overhauled Microsoft Office Deployment (ODT) engine.

---

## 🌟 What's New in v1.7.0

### 1. 💽 Zero-Mock Storage Health & Real SMART Diagnostics
- **Real Physical Disk Telemetry**: Completely eliminated all hardcoded synthetic values (fake 38.0°C, 98% health, 1200h, etc.). Drive telemetry is now collected dynamically via PowerShell `Get-PhysicalDisk` and `Get-StorageReliabilityCounter`.
- **Hybrid IOCTL Enrichment**: When elevated with Administrator privileges, reads raw NVMe SMART log pages for byte-accurate TBW/TBR counters, power-on hours, unsafe shutdowns, and power cycles directly from physical drives.
- **Graceful Elevation Indicators**: When running without administrative rights or on legacy drives that do not expose vendor SMART counters, the UI displays clear badges (`Требуются права админа для SMART`) and clean fallbacks (`—`, `N/A`) instead of fabricated statistics.

### 2. 🧹 Global Mock Purge
- Removed synthetic mock devices from the audio subsystem (`audioMocks.ts` and `audioSlice.ts`). Real audio endpoints and application sessions are queried; IPC failures now surface real errors (`audioError`) and empty states rather than fictitious sound devices.
- Replaced synthetic storage fallbacks with live sysinfo disk partitions.

### 3. ⚡ Script Runner: In-Place Streaming & Responsive Card UI
- **In-Place Progress Bar Streaming**: Resolved the issue where scripts outputting progress bars (e.g. `\r`, `[====] 45%`) flooded the execution console with hundreds of duplicate lines. The Rust backend and frontend state slice now recognize carriage-return (`\r`) overwrites and progress percentage patterns, updating the current line dynamically in place.
- **Card Action Bar Overhaul**: Redesigned the button layout in the Online Script Library cards (`ScriptRunnerView.tsx`). The 3-column grid now features a compact, responsive action bar with tooltip-enabled action icons and full overflow protection across all screen resolutions.

### 4. 🌡️ Enhanced Hardware Temperature Monitoring
- Added physical storage temperature detection across NVMe, SATA SSD, and HDD devices via Storage Reliability counters and WMI `MSStorageDriver_ATAPISmartData`.
- Consolidated ACPI thermal zone polling (`MSAcpi_ThermalZoneTemperature`, `Win32_PerfFormattedData_Counters_ThermalZoneInformation`, and `Win32_TemperatureProbe`) into single batched executions for minimal overhead and zero process spin-up lag.
- Expanded sensor classification rules for SoC, APU, and motherboard thermal probes.

### 5. 👻 Ghost App Detection & Registry Purge in Uninstaller
- **Orphaned Application Detection**: The uninstaller scanner now inspects executable paths and installation directories on disk. If an application's uninstaller executable or folder has been deleted but the entry remains in the Windows Registry, it is marked as a **Ghost App** (`is_ghost: true`).
- **Safe Registry Cleanup**: Added a dedicated "Удалить запись из реестра" feature with security guardrails that purges orphaned entries directly from `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` and `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` with 1-click confirmation.

### 6. 📊 Live Dashboard Optimization Readiness
- Upgraded the "Готовность к оптимизации" card on the main dashboard from a static placeholder into a live, interactive diagnostic widget.
- Real-time progress bar and percentage indicator (e.g. `8/14 применены • 57%`).
- Categorized status breakdown (Telemetry, Performance, Services, Privacy) with pending optimization counters and quick-action navigation.

### 7. 🏢 Overhauled Office Deployment (ODT) Engine
- Replaced the deprecated 404 endpoint with official Microsoft Office Deployment Tool binaries (`https://download.microsoft.com/.../officedeploymenttool_*.exe`) and dynamic link discovery from Microsoft's download portal.
- Implemented automatic quiet extraction (`/extract /quiet`) of Microsoft's official `setup.exe` into a temporary staging workspace.
- Seamless execution of `setup.exe /configure configuration.xml` with exit code propagation and task progress events.

---

## 🧪 Verification & Quality Metrics

- **Rust Backend**: 267/267 unit and integration tests passed (`cargo test --manifest-path src-tauri/Cargo.toml --lib`).
- **Frontend Build**: 100% clean TypeScript compilation and Vite production bundling (`npm run build`).
- **Security Guardrails**: Verified registry purge authorization rules protecting non-uninstall hives.
- **BOM Invariant**: Strict UTF-8 BOM encoding preserved across all script runner execution paths.

---

## 📦 Release Artifacts

- **Installer**: `WiScripts_1.7.0_x64-setup.exe` (NSIS Installer with OTA Auto-Updater support)
- **Manifest**: `latest.json` (Cryptographically signed with Minisign)
- **Signature**: `WiScripts_1.7.0_x64-setup.exe.sig`

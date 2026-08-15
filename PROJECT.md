# Project: WiScripts_Windows v0.9.9

## Architecture Overview
WiScripts_Windows is a desktop system optimization, diagnostics, script execution workstation, and hardware monitoring application for Windows 10/11 built on React 18, TypeScript 5.6, Zustand 4.5, Tailwind CSS, Vite, and Tauri v2 (Rust 2021).

- **Frontend**: React 18 + TS in `src/`, UI components & modals in `src/components/`, high-density feature views in `src/views/`, state in `src/store/slices/`, localization in `src/i18n/locales/`.
- **Backend**: Rust 2021 in `src-tauri/`, IPC command handlers in `src-tauri/src/commands/mod.rs`, execution runner in `src-tauri/src/runner/mod.rs`, streaming script engine in `src-tauri/src/script_runner/mod.rs`, multi-tier hardware metrics in `src-tauri/src/metrics/mod.rs`, state engine in `src-tauri/src/state_engine/mod.rs`, and resource governor in `src-tauri/src/governor/mod.rs`.
- **Testing**: 57-test multi-tier E2E testing suite in `tests/e2e/runner.js`, component & i18n tests in `tests/`, and Rust unit tests in `src-tauri/src/`.

---

## Feature Inventory

| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | **F1.1 Script Runner UI** | Dedicated script editor with `.ps1`/`.bat`/`.cmd` uploader, syntax metrics, and live streaming output | M1 | COMPLETED |
| 2 | **F1.2 Streaming IPC Execution** | Rust backend `execute_custom_script` command streaming stdout/stderr `script-output-line` IPC events | M1 | COMPLETED |
| 3 | **F1.3 Output Log Download** | UI button & backend helper to export terminal execution logs with timestamps | M1 | COMPLETED |
| 4 | **F1.4 UAC & Elevation Banner** | Elevation status indicator and Dry-Run toggle safety guard | M1 | COMPLETED |
| 5 | **F2.1 Celebratory Success Banner** | Dynamic top banner switching to green celebratory state when queue N = 0 | M2 | COMPLETED |
| 6 | **F2.2 Status Polling on Mount** | Automatic trigger of `fetchOptimizationsStatus()` on Dashboard mount | M2 | COMPLETED |
| 7 | **F2.3 Dynamic Telemetry Styling** | Dynamic badge colors and styling for Telemetry card based on `telemetryStatus` | M2 | COMPLETED |
| 8 | **F2.4 Localization Parity** | Full English and Russian translation keys for Script Runner and banners | M2 | COMPLETED |
| 9 | **F3.1 Multi-Tier Temp Collector** | 6-tier sensor cascade (LHM, OHM, NVML DLL, ACPI WMI, nvidia-smi, sysinfo) | M3 | COMPLETED |
| 10 | **F3.2 Extended Sensor Payload** | Detailed sensor list (`sensor_items`) with provider, ID, label, and reading | M3 | COMPLETED |
| 11 | **F3.3 Manual Sensor Selector UI** | Dropdown selector in `TemperatureSensorWidget` allowing user sensor selection override & persistence | M3 | COMPLETED |
| 12 | **F4.1 Win32 Native Elevation** | Native Win32 `OpenProcessToken` + `TOKEN_ELEVATION` check replacing legacy `net session` | M4 | COMPLETED |
| 13 | **F4.2 ShellExecuteW Escaping** | Robust double-quote and escape sanitization in `uninstaller/mod.rs` preventing argument injection | M4 | COMPLETED |
| 14 | **F4.3 WMI Subprocess Timeout** | 3-second non-blocking timeout protection for WMI PowerShell subprocesses in `metrics/mod.rs` | M4 | COMPLETED |
| 15 | **F4.4 Secure Temp Dir Execution** | Isolated script execution directory (`%LOCALAPPDATA%\WiScripts\TempScripts\`) with drop cleanup | M1/M4 | COMPLETED |
| 16 | **F4.5 Autorun & Security Fixes** | Registry key sanitization, lock error handling (sharing violation), path traversal guards | M4 | COMPLETED |

---

## Milestones & Delivery Status

| # | Milestone Name | Scope | Dependencies | Status | Test Coverage |
|---|----------------|-------|-------------|--------|---------------|
| **M1** | Script Runner Engine & UI | Script runner view, streaming IPC backend, log download, safe temp script execution (F1.1-F1.4, F4.4) | None | **COMPLETED** | 100% (Tier 1 & 2) |
| **M2** | Dynamic Dashboard & Queue State | Celebratory N=0 success banner, mount status polling, dynamic telemetry card, i18n parity (F2.1-F2.4) | None | **COMPLETED** | 100% (Tier 1 & 2) |
| **M3** | Multi-Tier Temp Sensors & Selector | 6-tier sensor cascade, extended payload, manual sensor dropdown selector UI (F3.1-F3.3) | None | **COMPLETED** | 100% (Tier 1 & 2) |
| **M4** | Security Audit & Codebase Hardening | Native Win32 elevation check, ShellExecuteW argument escaping, WMI 3s timeouts, security bugfixes (F4.1-F4.3, F4.5) | None | **COMPLETED** | 100% (Tier 1 & 2) |
| **M_E2E** | Multi-Tier E2E Test Suite | Automated test harness & 57 test cases covering Tiers 1-4 with 100% pass rate | M1-M4 | **COMPLETED** | 57 / 57 Passing |
| **M_V1.0** | Production Release Candidate | Adversarial stress testing, release packaging, automated updater integrity, documentation polishing | M_E2E | **IN_PROGRESS** | Planned |

---

## Interface Contracts

### 1. Script Runner IPC Contract
- **Command:** `execute_custom_script`
  - **Input:**
    ```json
    {
      "script_content": "Get-Process | Select-Object -First 10",
      "script_type": "ps1",
      "dry_run": false
    }
    ```
  - **Output:**
    ```json
    {
      "exit_code": 0,
      "stdout": "...",
      "stderr": ""
    }
    ```
  - **Streaming Event:** `app.emit("script-output-line", { line: String, stream: "stdout" | "stderr" })`

### 2. Multi-Tier Temperature IPC Contract
- **Commands:** `get_temperatures`, `get_system_info`, `get_system_temperatures`
  - **Output Payload:**
    ```json
    {
      "cpu_temp_celsius": 45.2,
      "gpu_temp_celsius": 52.0,
      "is_cpu_temp_available": true,
      "is_gpu_temp_available": true,
      "sensor_source": "LibreHardwareMonitor WMI",
      "sensor_items": [
        {
          "id": "lhm_cpu_package",
          "name": "AMD Ryzen 7 7800X3D Package",
          "label": "CPU Package",
          "temperature_celsius": 45.2,
          "sensor_type": "cpu",
          "provider": "LibreHardwareMonitor WMI"
        },
        {
          "id": "nvml_gpu_0",
          "name": "NVIDIA GeForce RTX 4080",
          "label": "GPU Core",
          "temperature_celsius": 52.0,
          "sensor_type": "gpu",
          "provider": "NVIDIA NVML"
        }
      ],
      "selected_cpu_sensor_id": null,
      "selected_gpu_sensor_id": null
    }
    ```

### 3. StateEngine IPC Contract
- **Command:** `create_state_snapshot` / `rollback_state_snapshot`
  - **Input:** `{ label: String, description: String }` / `{ snapshot_id: String }`
  - **Output:** `StateSnapshot` / `RollbackResult { success: bool, rolled_back_count: u32, errors: Vec<String> }`

### 4. ProFlow Resource Governor IPC Contract
- **Commands:** `apply_process_governor_rule`, `trim_process_working_set`, `get_governor_status`
  - **Input:** `{ rule: GovernorRule }` / `{ pid: u32 }`
  - **Output:** `GovernorStatus { active_rules: Vec<GovernorRule>, managed_processes_count: usize, memory_saved_mb: u64 }`

---

## Code Layout & Organization

- **Frontend Core:** `src/App.tsx`, `src/main.tsx`, `src/index.css`
- **Frontend Views (`src/views/`):** `AutorunsView.tsx`, `GovernorView.tsx`, `StateEngineView.tsx`, `UninstallerView.tsx`
- **Frontend Components (`src/components/`):** `Dashboard.tsx`, `ScriptRunnerView.tsx`, `OptimizationView.tsx`, `AudioView.tsx`, `PackageManagerView.tsx`, `StorageUtilities.tsx`, `SystemCleaner.tsx`, `DiagnosticsView.tsx`, `MasView.tsx`, `OdtView.tsx`, `PresetsView.tsx`, `StartupView.tsx`, `SchedulerView.tsx`, `DnsContextMenuView.tsx`, `DriverBackupView.tsx`, `RestorePointsView.tsx`, `SettingsView.tsx`, `TemperatureSensorWidget.tsx`, `AdminElevationBanner.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`
- **Frontend Store (`src/store/slices/`):** `audioSlice`, `optimizationSlice`, `packageManagerSlice`, `scriptRunnerSlice`, `systemSlice`, `systemToolsSlice`, `uiSlice`, `updaterSlice`
- **Frontend Localization (`src/i18n/`):** `ru.json`, `en.json`
- **Backend Rust Modules (`src-tauri/src/`):** 23 modules (`commands`, `script_runner`, `metrics`, `governor`, `state_engine`, `autoruns`, `cleaner`, `storage`, `audio`, `uninstaller`, `winapi`, `runner`, etc.)
- **E2E & Integration Tests:** `tests/e2e/` (runner.js, suite.js, specs)
- **Utility Scripts:** `scripts/` (migration & data consolidation tools)

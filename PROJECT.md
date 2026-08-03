# Project: WiScripts_Windows v0.9.9

## Architecture
WiScripts_Windows is a desktop system optimization, diagnostics, script runner, and hardware monitoring application for Windows 10/11 built on React 18, TypeScript, Zustand, Tailwind CSS, Vite, and Tauri v2 (Rust).

- **Frontend**: React 18 + TS in `src/`, UI components in `src/components/`, state in `src/store/slices/`, localization in `src/i18n/locales/`.
- **Backend**: Rust 2021 in `src-tauri/`, IPC command handlers in `src-tauri/src/commands/mod.rs`, execution runner in `src-tauri/src/runner/mod.rs`, metrics collector in `src-tauri/src/metrics/mod.rs`.
- **Testing**: `cargo test --lib` inside `src-tauri/`, JS/TS i18n & component tests in `tests/`, and E2E test suite in `tests/e2e/`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1.1 Script Runner UI | Dedicated `ScriptRunnerView.tsx` with textarea editor, `.ps1`/`.bat`/`.cmd` uploader, live terminal log streaming | M1 | R1 Survey |
| 2 | F1.2 Streaming IPC Execution | Rust backend command `execute_custom_script` with live stdout/stderr `script-output-line` IPC events | M1 | R1 Survey |
| 3 | F1.3 Output Log Download | UI button to export/download script execution terminal output to log file | M1 | R1 Survey |
| 4 | F1.4 UAC & Elevation Banner | Display UAC warning / admin elevation indicator for script runner | M1 | R1 Survey |
| 5 | F2.1 Celebratory Success Banner | Dynamic top banner in `Dashboard.tsx` switching to green success state when N=0 unapplied/queued | M2 | R2 Survey |
| 6 | F2.2 Status Polling on Mount | Trigger `fetchOptimizationsStatus()` when Dashboard mounts | M2 | R2 Survey |
| 7 | F2.3 Dynamic Telemetry Styling | Dynamic badge colors for Telemetry card based on actual `telemetryStatus` | M2 | R2 Survey |
| 8 | F2.4 Localization Additions | i18n strings for success banner states in `ru.json` and `en.json` | M2 | R2 Survey |
| 9 | F3.1 Multi-Tier Temp Collector | Multi-tier Rust temp collector (LHM/OHM WMI, NVML DLL for NVIDIA, ACPI WMI, sysinfo) | M3 | R3 Survey |
| 10 | F3.2 Extended Sensor Payload | Detailed `sensor_items` list returned to IPC frontend | M3 | R3 Survey |
| 11 | F3.3 Manual Sensor Selector UI | Dropdown selector in `TemperatureSensorWidget` allowing user sensor selection override & persistence | M3 | R3 Survey |
| 12 | F4.1 Win32 Native Elevation | Native Win32 `OpenProcessToken` elevation check replacing `net session` | M4 | R4 Survey |
| 13 | F4.2 ShellExecuteW Escaping | Fix argument escaping in `uninstaller/mod.rs` | M4 | R4 Survey |
| 14 | F4.3 WMI Subprocess Timeout | 3-second timeout protection for WMI PowerShell calls in `metrics/mod.rs` | M4 | R4 Survey |
| 15 | F4.4 Secure Script Execution Temp Dir | Temp file sanitization (`%LOCALAPPDATA%\WiScripts\TempScripts\`) & drop cleanup for R1 | M1 | R4 Survey |
| 16 | F4.5 Codebase Audit Bugfixes | Fix autorun registry sanitization, cleaner lock error handling, diagnostic dump path check | M4 | R4 Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Script Runner Engine & UI | Script runner view, streaming IPC backend, log download, safe temp script creation (F1.1-F1.4, F4.4) | None | IN_PROGRESS |
| M2 | Dynamic Dashboard & Queue State | Celebratory N=0 success banner, mount status polling, dynamic telemetry card, i18n strings (F2.1-F2.4) | None | IN_PROGRESS |
| M3 | Multi-Tier Temp Sensors & Selector | LHM/OHM/NVML backend collector, extended sensor payload, manual dropdown selector UI (F3.1-F3.3) | None | IN_PROGRESS |
| M4 | Security Audit & Codebase Bugfixes | Native Win32 elevation check, ShellExecuteW argument escaping, WMI timeouts, audit bugfixes (F4.1-F4.3, F4.5) | None | IN_PROGRESS |
| M_E2E | E2E Testing Track | Requirement-driven test harness, runner, and test cases (Tiers 1-4) -> publishes `TEST_READY.md` | None | IN_PROGRESS |
| M_FINAL | Final Milestone | Pass 100% E2E test suite (Phase 1), followed by Tier 5 Adversarial Coverage Hardening (Phase 2) | M1, M2, M3, M4, M_E2E | PLANNED |

## Interface Contracts
### Script Runner IPC Contract
- Command: `execute_custom_script`
  - Input: `{ script_content: String, script_type: String ("ps1" | "bat"), dry_run: bool }`
  - Output: `CommandOutput { exit_code: i32, stdout: String, stderr: String }`
  - Event emitted: `app.emit("script-output-line", { line: String, stream: "stdout" | "stderr" })`

### Extended Temperature IPC Contract
- Command: `get_temperatures` / `get_system_info`
  - Output Payload:
    ```json
    {
      "cpu_temp_celsius": 45.2,
      "gpu_temp_celsius": 52.0,
      "is_cpu_temp_available": true,
      "is_gpu_temp_available": true,
      "sensor_source": "LibreHardwareMonitor WMI",
      "sensor_items": [
        { "id": "lhm_cpu_package", "name": "AMD Ryzen 7 7800X3D Package", "label": "CPU Package", "temperature_celsius": 45.2, "sensor_type": "cpu", "provider": "LibreHardwareMonitor WMI" }
      ],
      "selected_cpu_sensor_id": null,
      "selected_gpu_sensor_id": null
    }
    ```

## Code Layout
- Frontend UI: `src/components/`
- Frontend Store: `src/store/slices/`
- Frontend Locales: `src/i18n/locales/`
- Rust Commands: `src-tauri/src/commands/mod.rs`
- Rust Script Runner: `src-tauri/src/script_runner/mod.rs`
- Rust Metrics: `src-tauri/src/metrics/mod.rs`
- E2E Tests: `tests/e2e/`

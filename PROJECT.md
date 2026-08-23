# Project: WiScripts Windows v1.4.1 Maintenance & Release

## Architecture
WiScripts Windows is an enterprise-grade Windows optimization, management, and diagnostics desktop application.
- **Backend (Rust / Tauri v2)**: Native Windows APIs (Win32, COM, WMI, ADL2, NVML, ACPI), elevated process execution runner with pipe streaming and process tree teardown, hardware telemetry collectors, and memory purge engine.
- **Frontend (React 18 / TypeScript / Tailwind CSS / Zustand / i18n)**: High-density modular UI, dual-tier safety pre-flight modals, terminal script execution console, hardware telemetry charts, and dual-locale English/Russian translation engine.
- **Scripts Library (`scripts_lib/`)**: 27 verified, parameter-driven PowerShell 5.1/7 scripts with administrator elevation guards, idempotent registry/service configurations, and UTF-8 BOM encoding.
- **Testing Track (`tests/` & `tests/e2e/`)**: 24 automated regression test suites, 4 E2E testing tiers (66 scenarios), Rust library test harness (237 tests), and TypeScript compilation verification.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Rust Backend Telemetry & Concurrency Stability | Multi-tier AMD ADL2/PMLog & NVIDIA NVML DLL bindings, ACPI laptop zones, WMI queries, deadlock-free process pipe runner | M1 | Survey |
| 2 | Frontend State Store & Buffer Safety | Fix unbounded `outputLogs` append in `scriptRunnerSlice.ts` by enforcing a 2,000-line buffer limit | M2 | Survey |
| 3 | Subsystem Header Localization & Tab Titles | Add `gaming_latency`, `smart_ram`, `network_shield`, `hardware_health` tab titles in `Header.tsx` and `en.json`/`ru.json` | M2 | Survey |
| 4 | Keyboard Accessibility (A11y) & Modal Dismissal | Add `Escape` key event listeners in `SafetyModal.tsx` and `GitHubIssueModal.tsx` | M2 | Survey |
| 5 | UI Localization Hardening | Localize `TemperatureSensorWidget.tsx`, `SafetyModal.tsx`, and component UI strings across EN and RU | M2 | Survey |
| 6 | PowerShell Script Library Safeguards | Verify all 27 scripts in `scripts_lib/` maintain elevation checks, UTF-8 BOM, and idempotent execution | M3 | Survey |
| 7 | Full Automated Regression & E2E Test Suite | Execute all 24 Node test suites, 66 E2E tests, 237 Rust tests, and TypeScript build with 100% pass rate | M4 | Survey |
| 8 | Version Synchronization (v1.4.1) | Synchronize version `1.4.1` across `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, `updaterSlice.ts`, and test assertions | M5 | Survey |
| 9 | Release Documentation & Git Finalization | Publish `RELEASE_NOTES_1.4.1.md` and commit all release changes adhering to Conventional Commits | M5 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Rust Backend Telemetry, IPC & Concurrency Verification | Audit and verify Rust backend commands, telemetry collectors, and runner | none | DONE |
| M2 | Frontend Defect Remediation & i18n Hardening | Patch `scriptRunnerSlice.ts`, `Header.tsx`, `SafetyModal.tsx`, `GitHubIssueModal.tsx`, `TemperatureSensorWidget.tsx`, and locales | M1 | DONE |
| M3 | PowerShell Script Library Validation & Safety | Verify script parameter schemas, elevation safeguards, and syntax | none | DONE |
| M4 | Comprehensive Test Suite & Regression Verification | Run full suite of 24 Node tests, 66 E2E tests, 237 Rust tests, and frontend build | M2, M3 | DONE |
| M5 | Release v1.4.1 Packaging, Version Sync & Git Finalization | Bump version to 1.4.1 across 7 files, author `RELEASE_NOTES_1.4.1.md`, verify build, and commit | M4 | DONE |

## Interface Contracts
### Frontend (`src/store/slices/scriptRunnerSlice.ts`) ↔ UI Components
- `outputLogs`: Array of `ScriptOutputLine`, bounded to `MAX_SCRIPT_LOG_LINES = 2000`.
- `addOutputLine(payload)`: Appends line and slices to last 2,000 items.

### Navigation / Header ↔ Locales (`en.json` / `ru.json`)
- `header.tab_titles.gaming_latency`: EN / RU string.
- `header.tab_titles.smart_ram`: EN / RU string.
- `header.tab_titles.network_shield`: EN / RU string.
- `header.tab_titles.hardware_health`: EN / RU string.

## Code Layout
- `src/`: React 18 TypeScript frontend source code
  - `src/components/`: Modular UI components (Navigation, Header, Modals, Widgets)
  - `src/store/slices/`: Zustand state management slices
  - `src/i18n/locales/`: Localization catalogs (`en.json`, `ru.json`)
- `src-tauri/`: Tauri Rust backend source code
  - `src-tauri/src/commands/`: IPC command handlers
  - `src-tauri/src/metrics/`: Hardware telemetry, ADL2, NVML, ACPI collectors
  - `src-tauri/src/script_runner/`: Process execution, elevation runner, pipe streaming
- `scripts_lib/`: PowerShell 5.1 / 7 scripts library
- `tests/`: Automated Node.js regression test suites and E2E test runner

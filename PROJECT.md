# Project: WiScripts Windows v1.6.0 Release

## Architecture
- **Script Runtime Stabilization & AST Formatting (`scripts_lib/`, `src/store/slices/scriptRunnerSlice.ts`)**:
  - Replace unhandled terminating `throw` statements across all 33 administrative scripts in `scripts_lib/` with structured non-terminating error reporting (`Write-Host [ERROR] ...`) and clean `exit 1` to prevent unhandled `ScriptHalted` / `RuntimeException` crashes.
  - Optimize long-running maintenance (`safe_browser_cache_cleaner.ps1`) using fast .NET batch directory enumeration (`[System.IO.Directory]::EnumerateFiles`) to guarantee completion under 15 seconds.
  - Implement bounded per-target timeouts (3–5 seconds) in network diagnostic tools (`diagnose_network_health.ps1`, `test_network_stability.ps1`) to eliminate runner freezes and TCP wait hangs.
  - Refactor `formatScriptWithParameters` to preserve top-level `param(...)` block AST (preventing child `ScriptBlockAst` flattening) and use valid PowerShell boolean parameter syntax (`-$param:$true` / `-$param:$false`).
- **On-Demand UAC Elevation Bridge (`src-tauri/src/script_runner/`, `src/components/`)**:
  - Rust Backend: Provide an on-demand elevation bridge executing PowerShell scripts with elevated privileges via `Start-Process powershell.exe -Verb RunAs`.
  - Cross-MIC Streaming: Stream elevated process output in real-time (<50ms latency) via shared log files (`FILE_SHARE_READ | FILE_SHARE_WRITE`) emitted to `script-output-line`.
  - Cross-MIC Cancellation: Terminate elevated process trees safely via a dedicated elevated watcher thread monitoring `.cancel` sentinel files, bypassing Windows Mandatory Integrity Control restrictions.
  - Frontend UI: Add "Run as Administrator" toggles and action triggers in Editor toolbar, Script Cards, Details Modal, and Parameter Dialog, with real-time log streaming and cancellation.
- **Script Library Expansion (Win11 24H2 & Gaming Suites, `scripts_lib/manifest.json`)**:
  - 5 new production-ready scripts:
    1. `scripts_lib/security/toggle_ai_recall_copilot.ps1`: Toggle Windows 11 24H2 Recall and Copilot background tasks/policies.
    2. `scripts_lib/security/disable_modern_telemetry_24h2.ps1`: Disable modern diagnostic telemetry tasks and data collection.
    3. `scripts_lib/performance/restore_classic_context_menu.ps1`: Restore classic Windows File Explorer right-click context menu.
    4. `scripts_lib/network/configure_qos_dscp_gaming.ps1`: Configure policy-based QoS DSCP 46 (Expedited Forwarding) for low-latency game traffic.
    5. `scripts_lib/network/optimize_nagle_algorithm.ps1`: Optimize TCP_NODELAY and disable delayed ACK on network interfaces.
  - `manifest.json`: Full catalog update (45 total scripts) with SHA-256 hashes, parameters, risk ratings, and bilingual localization (EN/RU).
- **Execution History, Log Export & Dry-Run Preview (`src/components/`, `src/store/slices/`)**:
  - Zustand persisted store in `localStorage` tracking up to 50 execution records with FIFO eviction and 300 log lines per entry.
  - Execution History UI tab with status badges, 1-click re-run, and `.log` file export.
  - Static impact analyzer (`scriptImpactAnalyzer.ts`) and `ImpactSimulatorModal.tsx` previewing affected registry keys, services, files, and scheduled tasks before execution.
  - 34 new bilingual i18n keys added to `en.json` and `ru.json`.
- **Test Alignment & v1.6.0 Packaging (`tests/`, `package.json`, `Cargo.toml`, `tauri.conf.json`)**:
  - Synchronize version `1.6.0` across all 7 manifests.
  - Align test assertions in `tests/test_challenger1_m3_version_verification.cjs`, static analysis, and regression suites for 45 scripts and v1.6.0.
  - 100% green verification across 24 Node test suites, E2E runner (`npm test`), TypeScript build (`npm run build`), and Rust unit tests (`cargo test --lib`).
  - Publish `RELEASE_NOTES_1.6.0.md`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Graceful Elevation Handling in Admin Scripts | Replace unhandled `throw` with structured error logging and `exit 1` across all 33 admin scripts | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Bounded Fast Browser Cache Cleanup | Refactor `safe_browser_cache_cleaner.ps1` with .NET batch enumeration for <15s completion | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Bounded Network Diagnostic Timeouts | Add strict 3–5s per-target timeouts in `diagnose_network_health.ps1` and `test_network_stability.ps1` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | AST-Safe `formatScriptWithParameters` | Fix parameter formatting to preserve top-level `param()` block and use `-$name:$true` syntax | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Rust On-Demand UAC Elevation Runner | Implement UAC elevation bridge with shared file streaming and `.cancel` sentinel watcher | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Frontend On-Demand Elevation UI Controls | Add "Run as Administrator" option in Editor, Script Cards, and Modals with live streaming & cancel | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Win11 24H2 Suite: AI Recall & Copilot Toggle | Script to enable/disable Recall and Copilot agents with dry-run support | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Win11 24H2 Suite: Modern Telemetry Disabler | Script to disable 24H2 diagnostic telemetry scheduled tasks and services | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Win11 24H2 Suite: Classic Context Menu | Script to restore Windows 10 style right-click context menu in File Explorer | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Gaming Suite: QoS DSCP Priority Tagging | Script to configure DSCP 46 priority tagging for gaming packets | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Gaming Suite: Nagle's Algorithm Optimizer | Script to toggle TCP_NODELAY and TcpAckFrequency on network adapters | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Manifest Synchronization & SHA-256 Integrity | Register all 5 new scripts in `scripts_lib/manifest.json` with exact SHA-256 hashes and metadata | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Persistent Execution History Store | Track execution history (up to 50 records) in Zustand persisted store with FIFO eviction | M4 | ORIGINAL_REQUEST §R4 |
| 14 | Execution History UI & Log Export | History tab with status badges, 1-click re-run, and `.log` download | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Dry-Run / Impact Simulator Preview | Static impact analyzer and preview modal for registry, service, and filesystem mutations | M4 | ORIGINAL_REQUEST §R4 |
| 16 | Bilingual i18n Parity (34 Keys) | Complete dual-language keys in `en.json` and `ru.json` for all v1.6.0 features | M4 | ORIGINAL_REQUEST §R4 |
| 17 | Test Suite Assertion Alignment | Update test suites for version 1.6.0 and 45 script count assertions | M5 | ORIGINAL_REQUEST §R5 |
| 18 | Full Regression & Master E2E Verification | 100% pass across all Node.js suites, master E2E runner, TypeScript build, and Rust tests | M5 | ORIGINAL_REQUEST §R5 |
| 19 | Version 1.6.0 Bump & Release Documentation | Sync v1.6.0 across manifests, author `RELEASE_NOTES_1.6.0.md`, and conduct Victory Audit | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Script Runtime Stabilization & Parameter Formatting | `scripts_lib/`, `src/store/slices/scriptRunnerSlice.ts` | none | DONE |
| M2 | On-Demand UAC Elevation Execution (Backend & UI) | `src-tauri/src/script_runner/`, `src/components/ScriptRunnerView.tsx`, `src/store/slices/scriptRunnerSlice.ts` | M1 | DONE |
| M3 | Script Library Expansion (Win11 24H2 & Gaming Suites) | 5 new scripts in `scripts_lib/`, `scripts_lib/manifest.json` | M1 | DONE |
| M4 | Execution History, Log Export & Dry-Run Preview | `src/store/slices/scriptRunnerSlice.ts`, `src/components/`, `src/utils/scriptImpactAnalyzer.ts`, `src/i18n/` | M1, M2 | DONE |
| M5 | Test Alignment, E2E Verification & v1.6.0 Release | `tests/`, `package.json`, `Cargo.toml`, `tauri.conf.json`, `RELEASE_NOTES_1.6.0.md` | M1, M2, M3, M4 | DONE |

## Interface Contracts
### Rust Tauri Script Runner IPC Command
- `execute_custom_script(script_content: String, script_type: String, dry_run: Option<bool>, execution_id: Option<String>, timeout_seconds: Option<u64>, elevate: Option<bool>, script_args: Option<Vec<String>>) -> Result<ScriptExecutionResult, String>`
- `cancel_script_execution(execution_id: String) -> Result<bool, String>`

### Tauri Events
- `script-output-line` -> payload: `ScriptOutputLinePayload { line: String, stream: String }` (Emitted in real-time from stdout/stderr or shared file pipe)

### Frontend `formatScriptWithParameters`
- Signature: `formatScriptWithParameters(rawContent: string, params: ScriptParameter[], values: Record<string, any>): string`
- Invariant: Must retain valid PowerShell 5.1/7 AST where root AST `ParamBlock != null` if present in `rawContent`, and boolean parameters format as `-$name:$true` / `-$name:$false`.

### Manifest & Script Entry Model
- First statement must be `param(...)` block, UTF-8 BOM, non-terminating elevation check with `exit 1`, valid SHA-256 match in `manifest.json`.

## Code Layout
- Backend:
  - `src-tauri/src/script_runner/mod.rs`: Process spawning, UAC bridge, output streaming, and process cancellation
  - `src-tauri/src/commands/mod.rs`: IPC commands registration
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Frontend:
  - `src/store/slices/scriptRunnerSlice.ts`: Execution state, history, `formatScriptWithParameters`
  - `src/components/ScriptRunnerView.tsx`: Script runner views, editor, library, history tab
  - `src/components/ScriptDetailsModal.tsx`: Code preview and elevation option
  - `src/components/ScriptRunnerModal.tsx`: Parameter dialog and elevation option
  - `src/components/ImpactSimulatorModal.tsx`: Dry-run impact preview modal
  - `src/utils/scriptImpactAnalyzer.ts`: Static impact parser
  - `src/i18n/locales/en.json` & `ru.json`
  - `package.json`
- Script Library:
  - `scripts_lib/manifest.json` (45 scripts)
  - `scripts_lib/diagnostics/`
  - `scripts_lib/maintenance/`
  - `scripts_lib/network/`
  - `scripts_lib/performance/`
  - `scripts_lib/security/`
- Documentation & Release:
  - `RELEASE_NOTES_1.6.0.md`
- Tests:
  - `tests/`

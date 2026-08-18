# Project: WiScripts_Windows Comprehensive Error & Vulnerability Hardening

## Architecture
WiScripts_Windows is a high-performance Windows optimization, debloating, and maintenance desktop application built on Tauri 2.x (Rust backend + WinAPI/COM integration) and React 18 + TypeScript + Zustand + Tailwind CSS (Refined Minimal design aesthetic).

```
Frontend (React 18 / Vite / TypeScript / Zustand / i18n)
       │
       ▼ Tauri IPC Bridge (68 registered commands)
Rust Backend (`src-tauri`: Windows API, Registry, COM, Services, Audio, Storage, Script Runner)
```

## Feature Inventory
Every audited feature and bugfix item is inventoried and mapped to its assigned milestone:

| # | Feature / Issue | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Online Scripts Path Traversal Protection | Sanitize and normalize `script.path` in `sync.rs` to prevent directory traversal | M1 | Explorer 1 |
| 2 | Script Execution Timeout & Kill/Cancel | Implement execution timeout (300s) and cancellation/kill command in `script_runner/` | M1 | Explorer 1 |
| 3 | Resilient Cache & Corrupt JSON Fallback | Catch corrupted JSON in `get_cached_scripts_library()`, prune cache, fall back to local seed | M1 | Explorer 1 |
| 4 | Fix Script Library Bugs & Elevation Codes | Fix `setup_power_switcher_service.ps1`, `optimize_windows_tweaks.ps1`, and elevation return codes | M1 | Explorer 1 |
| 5 | Rust Test Unused Imports Cleanup | Clean up unused imports in `src-tauri/tests/m1_audio_challenger_tests.rs` | M1 | Explorer 3 |
| 6 | Unbounded Log Capping in Zustand | Cap `logs` array to 1,000 entries in `uiSlice.ts` to prevent memory leak | M2 | Explorer 2 |
| 7 | CommandPalette IPC Contract Fix | Pass `dryRun` parameter in `create_restore_point` IPC call in `CommandPalette.tsx` | M2 | Explorer 2 |
| 8 | PresetsView State Batching | Eliminate consecutive unbatched `toggleOptimizationSelected` state updates in `PresetsView.tsx` | M2 | Explorer 2 |
| 9 | Header Tab Titles & i18n Completeness | Add missing tabs in `Header.tsx` `TAB_TITLES` and sync `en.json` & `ru.json` keys | M2 | Explorer 2 |
| 10 | ErrorBoundary & Sub-View Polish | Fix `h-screen` layout blowout, wrap hardcoded labels in `i18n.t()`, fix timer in `ScriptRunnerView` | M2 | Explorer 2 |
| 11 | Parameter Dialog in ScriptRunnerView | Add parameter inputs dialog for parameterized scripts in `ScriptRunnerView.tsx` | M2 | Explorer 1 |
| 12 | Legacy Test Suite Modernization | Update `test_challenger_m1_adversarial.cjs` and `test_m1_challenger_2_script_library.cjs` for 27 scripts | M3 | Explorer 3 |
| 13 | Regression Test Suite Expansion | Add regression tests for path traversal, cache recovery, cancel IPC, and log bounds | M3 | Explorer 1/2/3 |
| 14 | Full E2E & Build Verification | Verify `npm run build`, `cargo check`, `cargo test`, `node tests/e2e/runner.js`, i18n parity | M3 | Original Request |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Rust Backend & Online Scripts Hardening | Items 1, 2, 3, 4, 5: Path traversal security, script timeout/cancellation, cache corruption recovery, script bugs, test imports | None | DONE |
| M2 | Frontend, Zustand Stores, i18n & UI Polish | Items 6, 7, 8, 9, 10, 11: Zustand log bounds, CommandPalette IPC alignment, Presets batching, i18n keys, ErrorBoundary, Script params | M1 (for cancel/params IPC) | DONE |
| M3 | Test Suite Alignment, Regression Prevention & E2E Validation | Items 12, 13, 14: Test script updates, regression suites, full build & E2E verification | M1, M2 | DONE |

## Interface Contracts

### Online Scripts IPC (`src-tauri/src/commands/mod.rs` ↔ `src/store/slices/scriptRunnerSlice.ts`)
- `sync_scripts_library(custom_url: Option<String>) -> Result<ScriptsLibraryManifest, AppError>`
- `get_scripts_library() -> Result<ScriptsLibraryManifest, AppError>`
- `download_script(script_id: String) -> Result<DownloadScriptResult, AppError>`
- `execute_online_script(script_id: String, parameters: Option<HashMap<String, String>>, dry_run: bool) -> Result<ScriptExecutionResult, AppError>`
- `cancel_running_script(execution_id: String) -> Result<(), AppError>`

### Restore Point IPC (`src-tauri/src/commands/mod.rs` ↔ `src/components/CommandPalette.tsx`)
- `create_restore_point(description: String, dry_run: bool) -> Result<RestorePoint, AppError>`

## Code Layout

- `src-tauri/src/` — Rust backend source files:
  - `script_runner/sync.rs` — Manifest fetching, local caching, download, SHA256 integrity
  - `script_runner/mod.rs` — Script execution engine, process spawning, timeout, output capture
  - `commands/mod.rs` — Tauri IPC command handlers
- `scripts_lib/` — PowerShell scripts catalog and `manifest.json`
- `src/` — React / TypeScript frontend:
  - `store/slices/` — Zustand store slices (`uiSlice.ts`, `scriptRunnerSlice.ts`, `presetsSlice.ts`, etc.)
  - `components/` — UI views, modals, command palette, header, error boundary
  - `i18n/locales/` — `en.json`, `ru.json` localization files
- `tests/` — Automated test suite:
  - `e2e/runner.js` — 4-tier E2E test runner
  - `test_*.cjs` — Standalone unit, parity, and challenger test suites

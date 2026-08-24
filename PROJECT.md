# Project: WiScripts Windows v1.5.1 Release

## Architecture
- **Disk Space Analyzer Engine (`src-tauri/src/storage/` & `src/components/DiskSpaceAnalyzer/`)**:
  - `analyzer.rs`: Multi-threaded directory traversal using bounded min-heaps (`BinaryHeap`) for top-N ranking, direct folder-level tree aggregation without retaining raw leaf file objects in RAM, atomic cancellation, and 200ms throttled progress emissions.
  - `commands/storage.rs`: Lean Tauri v2 IPC command serialization avoiding multi-hundred MB JSON graphs; fast path execution.
  - `DiskTreeView.tsx` / `DiskTreeNodeRow.tsx`: Flat-list sliding window virtualization rendering only visible rows (~30 DOM elements) regardless of tree depth or millions of items.
  - `diskAnalyzerSlice.ts`: Structural sharing for tree mutations on item deletion (eliminating `JSON.parse(JSON.stringify())`), 200ms debounced search filtering, and safe multi-level expansion limits.
  - `diskAnalyzer.ts` / UI components: Standardized `formatBytes` supporting continuous, accurate scaling from B up to PB with exact binary threshold rounding (fixing >1000 GB overflow / "1024.0 GB" wrap).
- **Script Library Engine & Manifest (`scripts_lib/` & `src-tauri/src/script_runner/`)**:
  - `optimize_windows_tweaks.ps1`: Decoupled, non-blocking Step 3 execution with granular status reporting, timeout controls, and safety flags preventing silent execution hangs.
  - Existing scripts audit: Fixed `powercfg -duplicatescheme` GUID parsing across power scripts, migrated `Get-EventLog` to `Get-WinEvent`, aligned parameter definitions with `manifest.json`.
  - New production-ready scripts across 5 domains (Diagnostics, Network, Maintenance, Security, Performance) adhering strictly to PowerShell 5.1/7 standards (UTF-8 BOM, ASCII-only `<# ... #>` block comments, `param()` as first statement, soft elevation checks, locale-neutral CLI parsing).
  - `manifest.json`: Fully synchronized catalog with SHA-256 hashes, typed parameters, risk levels, and bilingual English/Russian localization in the UI.
- **Build, Versioning & Release (`package.json`, `Cargo.toml`, `tauri.conf.json`, `RELEASE_NOTES_1.5.1.md`)**:
  - Clean compilation across TypeScript/React frontend and Rust backend with zero host live execution during verification.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Disk Analyzer Multi-TB / PB Format Scaling | Fix `formatBytes` 1000+ GB overflow, rollover bugs, and missing PB unit across all storage views | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Backend Scanner Memory Bounds & Top-N Heap | Replace unbounded file accumulation in `analyzer.rs` with bounded min-heaps and direct folder aggregation | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Lean IPC Payload & Throttled Telemetry | Optimize Tauri IPC tree serialization and throttle progress emissions to prevent V8 heap OOM / black screen crash | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Frontend Virtualized Tree View & Fast Mutation | Replace naive recursive DOM rendering with sliding window virtualization and eliminate `JSON.parse` clones in slice | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Non-Blocking `optimize_windows_tweaks.ps1` Step 3 | Decouple SFC/DISM execution from silent `Out-Null` blocking and provide granular progress & timeout safety | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Script Library AST Audit & Bug Fixes | Fix `powercfg` GUID regex, replace deprecated `Get-EventLog`, fix error handling and parameter bindings | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Hardware & Diagnostics Scripts (Category A) | Battery health/wear report, GPU telemetry info, disk SMART summary scripts | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Advanced Network Diagnostics (Category B) | DNS flush & IP renewal, multi-hop latency/ping diagnostics, adapter soft reset & TCP speed optimizer | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Safe Disk & Cache Cleanup (Category C) | Windows Update cache cleanup, web browser cache cleaner, Delivery Optimization cache cleaner | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Security & Telemetry Tweaks (Category D) | Telemetry tasks/services disabling, Windows Defender scan schedule & resource throttling | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Performance & Resource Optimizer (Category E) | Clear RAM standby list & working sets, optimize Windows visual effects for performance | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Manifest Schema Synchronization & Hashes | Update `scripts_lib/manifest.json` with all new scripts, parameters, risk levels, and calculated SHA-256 hashes | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Version 1.5.1 Bump & Release Documentation | Bump version to 1.5.1 across all 7 manifests and generate `RELEASE_NOTES_1.5.1.md` | M4 | ORIGINAL_REQUEST §R4 |
| 14 | Clean Build & Compilation Verification | Confirm 0 errors on `npm run build`, `cargo check`, and backend unit tests | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Static AST & Schema Verification Test Suite | Static PowerShell AST parsing, manifest validation, and mock test execution without live host execution | M-Test | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Disk Analyzer >1TB Overflow & Black Screen Hardening | `src-tauri/src/storage/`, `src-tauri/src/commands/storage.rs`, `src/components/DiskSpaceAnalyzer/`, `src/utils/diskAnalyzer.ts`, `src/store/slices/diskAnalyzerSlice.ts` | none | DONE |
| M2 | Script Library Audit & `optimize_windows_tweaks.ps1` Fix | `scripts_lib/performance/optimize_windows_tweaks.ps1`, `scripts_lib/performance/enable_ultimate_performance_plan.ps1`, `power_ac_performance_mode.ps1`, `setup_power_switcher_service.ps1`, `analyze_bsod_crash_dumps.ps1` | none | DONE |
| M3 | New Utility Scripts Authoring & Manifest Registration | 13 new scripts across 5 categories in `scripts_lib/`, update `scripts_lib/manifest.json` | M2 | DONE |
| M4 | Version 1.5.1 Bump, Release Notes & Build Verification | `package.json`, `Cargo.toml`, `tauri.conf.json`, `RELEASE_NOTES_1.5.1.md`, build verification | M1, M2, M3 | DONE |
| M-Test | Static AST Verification & Opaque Test Suite | `tests/static_analysis/`, `tests/e2e/`, `TEST_READY.md` | none | DONE |

## Interface Contracts
### Rust Tauri Storage IPC Commands
- `scan_disk_space(path: String, scan_id: String) -> Result<DiskScanResult, String>`
- `cancel_disk_scan(scan_id: String) -> Result<bool, String>`
- `delete_filesystem_items(paths: Vec<String>, permanent: bool) -> Result<DeletionResult, String>`

### Tauri Events
- `disk-scan-progress` -> payload: `DiskScanProgressPayload { scanId, currentPath, filesCount, dirsCount, totalBytesScanned, isCompleted, isCancelled }` (Throttled to 200–250ms)

### Manifest & Script Entry Model
- Script files must start with `param(...)` block, use UTF-8 BOM, ASCII block comments `<# ... #>`, soft elevation guards, and exit codes (0 = Success, 1 = Error, 2 = Warning/Cancelled).

## Code Layout
- Backend:
  - `src-tauri/src/storage/analyzer.rs`
  - `src-tauri/src/storage/drives.rs`
  - `src-tauri/src/storage/deletion.rs`
  - `src-tauri/src/storage/guardrails.rs`
  - `src-tauri/src/commands/storage.rs`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Frontend:
  - `src/components/DiskSpaceAnalyzer/DiskTreeView.tsx`
  - `src/components/DiskSpaceAnalyzer/DiskTreeNodeRow.tsx`
  - `src/components/DiskSpaceAnalyzer/DiskToolbar.tsx`
  - `src/components/DiskSpaceAnalyzer/DiskSpaceAnalyzerView.tsx`
  - `src/components/DiskSpaceAnalyzer/DiskScanProgress.tsx`
  - `src/components/DiskSpaceAnalyzer/DiskScanSummary.tsx`
  - `src/components/StorageUtilities.tsx`
  - `src/components/SystemCleaner.tsx`
  - `src/utils/diskAnalyzer.ts`
  - `src/store/slices/diskAnalyzerSlice.ts`
  - `package.json`
- Script Library:
  - `scripts_lib/manifest.json` (40 scripts)
  - `scripts_lib/diagnostics/`
  - `scripts_lib/maintenance/`
  - `scripts_lib/network/`
  - `scripts_lib/performance/`
  - `scripts_lib/security/`
- Documentation & Release:
  - `RELEASE_NOTES_1.5.1.md`
- Tests:
  - `tests/`

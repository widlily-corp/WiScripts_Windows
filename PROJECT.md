# Project: Disk Space Analyzer & Filesystem Tree Explorer

## Architecture
- **Rust Backend (`src-tauri/src/storage/`)**:
  - `drives.rs`: Enumerates drives and free/total storage metrics via sysinfo / winapi.
  - `analyzer.rs`: Multi-threaded `WalkDir` ingestion, bottom-up tree aggregation, top 20 ranked items, atomic cancellation token registry, throttled 100ms progress emission (`disk-scan-progress`).
  - `deletion.rs`: Safe recursive deletion with Windows Recycle Bin (`trash` crate) and Permanent Deletion (`clear_readonly` + bottom-up removal).
  - `guardrails.rs`: Protection against deleting root drives (`C:\`), Windows SystemRoot (`C:\Windows`, `System32`, `SysWOW64`), `Boot`, `$Recycle.Bin`, `pagefile.sys`, Program Files, and User profile roots.
  - `commands/storage.rs`: Tauri v2 IPC command wrappers running on `tauri::async_runtime::spawn_blocking`.
- **React Frontend (`src/components/DiskSpaceAnalyzer/`)**:
  - `DiskSpaceAnalyzerView.tsx`: Main view coordinating scanning, navigation, metrics, tree, and deletion.
  - `DiskTargetSelector.tsx`: Drive picker + custom folder path selector.
  - `DiskScanProgress.tsx`: Non-blocking progress bar, telemetry counters, cancellation button.
  - `DiskScanSummary.tsx`: Total scanned size, file/folder counts, top directory metrics.
  - `DiskBreadcrumbs.tsx`: Path drilldown navigation.
  - `DiskToolbar.tsx`: Search/filter, sort, view toggles (Tree vs Ranked Largest).
  - `DiskTreeView.tsx` & `DiskTreeNodeRow.tsx`: Interactive expandable directory tree with proportional visual usage bars and tabular bytes.
  - `DiskRankedLargestView.tsx`: Top largest folders & files tables.
  - `DiskDeleteModal.tsx`: Deletion confirmation modal (Recycle Bin vs Permanent Deletion, system protection alert, `CONFIRM` input).
- **State Management (`src/store/slices/diskAnalyzerSlice.ts`)**:
  - Zustand store managing scanning state, cancellation tokens, tree filtering, breadcrumbs, and `syncTreeAfterDeletion` in-memory recalculation.
- **Integration (`src/components/StorageUtilities.tsx` & `src/components/SystemCleaner.tsx`)**:
  - Integrated sub-tab inside StorageUtilities (`analyzer`, `duplicates`, `large`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | High-Performance Filesystem Scanner | Multi-threaded async scanning with progress telemetry and cancellation | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Recursive Size & Item Calculation | Accurate bottom-up sizing, item counts, and percentage calculations | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Ranked Largest Folders & Files | Top 20 largest folders and top 20 largest files overview | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Interactive Filesystem Tree View | Expandable/collapsible tree with formatted sizes, tabular bytes, usage bars | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Breadcrumb Navigation & Filter | Path navigation and live search filtering in scanned trees | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Item Quick Actions | Open in File Explorer and Copy Path to clipboard | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Safe Recursive Deletion Engine | Deletion via Windows Recycle Bin and Permanent Deletion | M3 | ORIGINAL_REQUEST §R3 |
| 8 | System Directory Protection Guardrail | Multi-layered blocking of C:\Windows, System32, Boot, etc. | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Real-time Tree & Space Recalculation | In-memory tree delta update and freed storage calculation post-deletion | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Refined Minimal / Dark UI Styling | High-density dark aesthetic, Geist Mono tabular metrics, accessible UI | M4 | ORIGINAL_REQUEST §R4 |
| 11 | Full Bilingual i18n (EN/RU) | Complete key parity under diskAnalyzer in en.json and ru.json | M4 | ORIGINAL_REQUEST §R4 |
| 12 | System Cleaner & Storage UI Integration | Embedded sub-tab in StorageUtilities.tsx and navigation hookup | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Rust Scanner & Deletion Backend | `src-tauri/src/storage/` & `src-tauri/src/commands/storage.rs` | none | DONE |
| M2 | React Tree View & Ranked Views | `src/components/DiskSpaceAnalyzer/` & `src/store/slices/diskAnalyzerSlice.ts` | M1 | DONE |
| M3 | Deletion Engine, Guardrails & Sync | `DiskDeleteModal.tsx`, `guardrails.rs`, `syncTreeAfterDeletion` | M1, M2 | DONE |
| M4 | StorageUtilities Integration & i18n | `StorageUtilities.tsx`, `SystemCleaner.tsx`, `en.json`, `ru.json` | M1-M3 | DONE |
| M5 | E2E Testing, Adversarial Hardening & Audit | `tests/e2e/`, unit tests, cargo check, tsc, forensic audit | M1-M4 | DONE |

## Interface Contracts
### Rust Tauri IPC Commands
- `get_disk_drives() -> Result<Vec<DiskDriveInfo>, String>`
- `scan_disk_space(path: String, scan_id: String) -> Result<DiskScanResult, String>`
- `cancel_disk_scan(scan_id: String) -> Result<bool, String>`
- `delete_filesystem_items(paths: Vec<String>, permanent: bool) -> Result<DeletionResult, String>`
- `check_path_protection(path: String) -> Result<PathProtectionStatus, String>`
- `open_in_file_explorer(path: String) -> Result<(), String>`

### Tauri Events
- `disk-scan-progress` -> payload: `DiskScanProgressPayload { scanId, currentPath, filesCount, dirsCount, totalBytesScanned, isCompleted, isCancelled }`

## Code Layout
- Backend:
  - `src-tauri/src/storage/mod.rs`
  - `src-tauri/src/storage/analyzer.rs`
  - `src-tauri/src/storage/deletion.rs`
  - `src-tauri/src/storage/guardrails.rs`
  - `src-tauri/src/storage/drives.rs`
  - `src-tauri/src/commands/storage.rs`
- Frontend:
  - `src/types/diskAnalyzer.ts`
  - `src/utils/diskAnalyzer.ts`
  - `src/store/slices/diskAnalyzerSlice.ts`
  - `src/components/DiskSpaceAnalyzer/` (10 components)
  - `src/components/StorageUtilities.tsx`
  - `src/components/SystemCleaner.tsx`
  - `src/i18n/locales/en.json` & `ru.json`
- Tests:
  - `tests/e2e/disk_space_analyzer.test.js`
  - `tests/e2e/runner.js`
  - `src/utils/__tests__/diskAnalyzer.test.ts`
  - `src-tauri/tests/`

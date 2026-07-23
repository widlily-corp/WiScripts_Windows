# Project: WiScripts Windows — Six Premium Features

## Architecture
- **Backend**: Rust (`src-tauri`), Tauri v2 (`tauri = "2.0.0"`), PowerShell runner / IPC interface in `src-tauri/src/commands/` and domain modules in `src-tauri/src/`.
- **Frontend**: React 18 / TypeScript (`src`), Zustand state management (`src/store/`), Tailwind CSS, Lucide icons, component tabs in `src/components/`.

## Features Scope
1. **R1. Advanced Diagnostics & Recovery**: Commands for `sfc /scannow`, `DISM /Online /Cleanup-Image /RestoreHealth`, TCP/IP network stack reset.
2. **R2. Package & Bloatware Manager**: `winget` search/install/update GUI wrapper, UWP app debloat manager.
3. **R3. Optimization Profiles / Presets**: 1-click profiles ("Gaming", "Maximum Privacy", "Work") executing curated lists of existing rules.
4. **R4. DNS & Context Menu Manager**: AdGuard/Cloudflare/Google DNS toggles, Classic Win10 context menu toggle.
5. **R5. Driver Backup**: `Export-WindowsDriver` target folder selection and execution.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Architecture Discovery | Explore Rust backend commands, Runner execution model, and React frontend navigation/components | none | DONE |
| 2 | Rust Backend IPC Commands & Runner Integration | Implement `#[tauri::command]` handlers for R1-R5 features using `Runner` in `src-tauri/src/` | M1 | DONE |
| 3 | React Frontend UI Modules & State | Implement UI tabs & state logic for Diagnostics, Package Manager, Profiles, DNS/Context, Driver Backup | M1, M2 | DONE |
| 4 | E2E Verification & Forensic Audit | End-to-end testing, cargo check, npm run build, Challenger verification, Forensic Audit | M2, M3 | DONE |

## Interface Contracts (Tauri IPC Commands)
- `run_diagnostics(action: String, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`
- `winget_search(query: String)` -> `Result<Vec<WingetPackage>, AppError>`
- `winget_install(package_id: String, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`
- `winget_update(package_id: String, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`
- `get_uwp_apps()` -> `Result<Vec<UwpAppInfo>, AppError>`
- `remove_uwp_app(package_full_name: String, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`
- `get_optimization_profiles()` -> `Result<Vec<OptimizationProfile>, AppError>`
- `apply_optimization_profile(profile_id: String, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`
- `set_dns_server(provider: String, interface_alias: Option<String>, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`
- `get_classic_context_menu_status()` -> `Result<bool, AppError>`
- `toggle_classic_context_menu(enable: bool, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`
- `backup_drivers(output_dir: String, dry_run: bool)` -> `Result<ExecutionSummary, AppError>`

## Verification Evidence
- Rust Backend: `cargo check` PASSED (0 errors, 0 warnings), `cargo test` PASSED (85/85 tests passed 100%).
- React Frontend: `npx tsc --noEmit` PASSED (0 type errors), `npm run build` PASSED in 4.98s (production bundle generated).
- Forensic Integrity Audits: Forensic Auditor M2 (CLEAN), Forensic Auditor M3 (CLEAN).

## Code Layout
- `src-tauri/src/`:
  - `diagnostics/mod.rs`: R1 SFC, DISM, network reset logic (PASSED 85/85 tests)
  - `packages/mod.rs`: R2 Winget & UWP debloat logic
  - `profiles/mod.rs`: R3 Gaming, Privacy, Work preset definitions
  - `dns_context/mod.rs`: R4 DNS providers & Win10 classic context menu registry
  - `driver_backup/mod.rs`: R5 Export-WindowsDriver logic
  - `commands/mod.rs`: IPC handlers exposed to Tauri
  - `runner/mod.rs`: Execution engine & dry-run runner
- `src/`:
  - `components/`: UI components and feature tabs (`DiagnosticsView.tsx`, `PackageManagerView.tsx`, `PresetsView.tsx`, `DnsContextMenuView.tsx`, `DriverBackupView.tsx`)
  - `store/`: Zustand state stores (`useAppStore.ts`)
  - `types/`: Shared TypeScript interfaces (`types/index.ts`)

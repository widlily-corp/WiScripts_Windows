# Implementation Plan — WiScripts Windows Six Premium Features

## Scope & Objective
Extend the WiScripts Windows application with five major functional modules comprising six premium features:
1. **R1. Advanced Diagnostics & Recovery**: IPC commands and UI section for running `sfc /scannow`, `DISM /Online /Cleanup-Image /RestoreHealth`, and resetting the TCP/IP stack via PowerShell.
2. **R2. Package & Bloatware Manager**: `winget` GUI wrapper (search/install/update) and UWP debloat mechanism to query and uninstall pre-installed UWP apps.
3. **R3. Optimization Profiles / Presets**: 1-click presets ("Gaming", "Maximum Privacy", "Work") applying curated subsets of existing optimization rules.
4. **R4. DNS & Context Menu Manager**: System DNS toggles (AdGuard, Cloudflare, Google) and classic Win10 context menu toggle (`reg add` / `reg delete`).
5. **R5. Driver Backup**: Export 3rd-party drivers via `Export-WindowsDriver` to a specified folder.

All execution tracking must use the `Runner` implementation for dry-runs and execution logging.

## Milestones & Timeline
| Milestone | Description | Strategy | Outputs |
|---|---|---|---|
| M1: Architecture & Codebase Exploration | Deep exploration of Rust `src-tauri` IPC structure, Runner integration, command registration, and React frontend navigation/store. | 3 Parallel Explorers | Handoff reports with explicit code locations and implementation strategies. |
| M2: Backend IPC Commands & Runner Integration | Implement all Rust `#[tauri::command]` handlers for R1-R5 features, integrating `Runner` for dry-run and execution state. | Worker -> 2 Reviewers -> 2 Challengers -> Forensic Auditor | Compiling Rust backend (`cargo check`), new IPC commands in `src-tauri/src/commands/`. |
| M3: Frontend React UI Tabs & Modules | Implement new navigation tabs and components for Diagnostics, App Manager, Profiles, DNS/Context Menu, and Driver Backup. | Worker -> 2 Reviewers -> 2 Challengers -> Forensic Auditor | Building React frontend (`npm run build`), updated UI tabs and Zustand store integration. |
| M4: E2E Verification & Forensic Integrity Audit | Complete integration test pass across all modules, build verification, and strict integrity audit. | 2 Challengers -> Forensic Auditor | Verified feature functionality, passing build/check, CLEAN audit report. |

## Verification Criteria
- `cargo check` passes with 0 errors.
- `npm run build` succeeds without TypeScript or bundle errors.
- React frontend includes clear UI sections/tabs for all 5 module areas.
- Rust backend exposes IPC commands for PowerShell integration and `Runner` dry-runs.
- Zero AI-slop, zero mock/facade shortcuts.

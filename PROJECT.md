# Project: WiScripts Windows — Diagnostics, Safe Logging, Rich Updater & Error Reporting

## Architecture
- **Framework**: Tauri 2 (Rust backend + React 18 / TypeScript frontend + Tailwind CSS + Zustand store).
- **Backend Logging**: Safe logging to `%LOCALAPPDATA%\WiScripts\logs\debug.log` via `logger.rs` and `dirs::data_local_dir()`.
- **System Information**: Extended `SystemInfo` struct in `src-tauri/src/commands/mod.rs`.
- **Diagnostic ZIP Export**: `export_diagnostic_dump` IPC command using `zip` crate to package `debug.log` and `system_info.json` onto `dirs::desktop_dir()`.
- **Updater & Release Notes**: Tauri updater (`tauri-plugin-updater`) endpoint fix, fallback/mock handling, and React `ReleaseNotesModal` component with Markdown rendering.
- **GitHub Issues API Reporting**: `create_github_issue` IPC command for submitting issues directly via PAT or opening pre-filled browser URL.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Safe Logging & Extended System Info | R3: Update logger path to `%LOCALAPPDATA%\WiScripts\logs\debug.log`; extend system info struct & unit tests. | none | DONE |
| 2 | Diagnostic Dump Export | R2: Backend ZIP packaging of logs/system_info to Desktop; IPC command & Settings UI button. | M1 | DONE |
| 3 | Rich UI Updater & Release Notes | R1: Fix updater release JSON check/error handling; add Markdown Release Notes dialog component. | none | DONE |
| 4 | GitHub Issues Error Reporting | R4: Backend command for GitHub Issues API & browser fallback URL; UI trigger in Settings & ErrorBoundary. | M1 | DONE |
| 5 | Final E2E Integration & Audit | E2E test verification, adversarial test hardening, and Forensic Auditor verification. | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Rust Backend ↔ React Frontend (Tauri IPC)
1. `get_system_info() -> SystemInfo`:
   Returns extended hardware, OS, elevation, and telemetry state.
2. `export_diagnostic_dump() -> Result<String, AppError>`:
   Creates timestamped `WiScripts_Diagnostic_Dump_*.zip` on Desktop containing `debug.log` and `system_info.json`. Returns absolute path string.
3. `create_github_issue(payload: GitHubIssuePayload) -> Result<GitHubIssueResult, AppError>`:
   Submits issue to GitHub API or returns pre-filled browser submission URL.
4. `check_for_updates() / tauri-plugin-updater`:
   Returns update metadata including Markdown release notes in `update.body`.

## Code Layout
- `src-tauri/src/logger.rs`: Log directory resolution and initialization.
- `src-tauri/src/commands/mod.rs`: IPC command handlers (`get_system_info`, `export_diagnostic_dump`, `create_github_issue`).
- `src-tauri/src/lib.rs`: Tauri builder, plugin initialization, IPC handler registration.
- `src-tauri/Cargo.toml`: Cargo dependencies (`zip = "2.2"`).
- `src/store/useAppStore.ts`: Frontend Zustand store state and IPC wrappers.
- `src/components/SettingsView.tsx`: Settings UI with Diagnostics card and buttons.
- `src/components/ReleaseNotesModal.tsx`: Rich UI Markdown modal for updates.
- `src/components/GitHubIssueModal.tsx`: Modal dialog for submitting error reports.
- `src/components/ErrorBoundary.tsx`: React error boundary with issue reporting trigger.

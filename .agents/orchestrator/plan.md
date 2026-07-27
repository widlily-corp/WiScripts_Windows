# WiScripts Windows Roadmap Plan

## Overview
Full implementation plan for WiScripts Windows roadmap:
- R1. Auto-Updater (`tauri-plugin-updater`, `tauri.conf.json` version fetching, Toast/Banner notifications, background update triggers).
- R2. Safety, Tools & Fixes (Window/Taskbar app icon fix, ODT regional block bypass registry command, auto Restore Point before optimizations, System Restore manager tab with view & rollback).
- R3. System Monitoring & Management (Real-time CPU/RAM/Disk/Network metrics & charts, CPU/GPU temperature sensors, Startup Apps manager tab, Task Scheduler background tasks manager tab).
- R4. Customization & Profiles (`i18next` RU/EN localization, Settings tab with persistence, JSON import/export for optimization presets).
- R5. Finalization & Release (Clean working tree, Conventional Commits, git push, release tagging).

## Milestones Breakdown
1. **Milestone 1: Auto-Updater Integration**
   - Rust backend: setup `tauri-plugin-updater` dependency in `Cargo.toml`, register plugin in `main.rs`/`lib.rs`.
   - Frontend: fetch app version dynamically from Tauri API, render Toast/Banner notification for available updates, implement silent/explicit update download & install workflow.

2. **Milestone 2: Safety, Tools & Fixes**
   - App Icon Fix: Verify `tauri.conf.json` icons configuration, build script, assets, and window icon assignment.
   - ODT Regional Block Bypass: Implement registry command (`HKLM\SOFTWARE\Policies\Microsoft\office\...` or appropriate ODT bypass key) in Rust backend command runner & UI toggle/action.
   - System Restore Automation: Implement PowerShell/WMI helper function to create restore point prior to running optimization scripts.
   - Restore Points Tab: React tab displaying existing system restore points with date/description and ability to trigger rollback/restore.

3. **Milestone 3: System Monitoring & Management**
   - Real-time Metrics & Graphs: Rust sysinfo / WMI backend commands polling CPU, RAM, Disk I/O, Network I/O. Dashboard live chart components.
   - Temperature Sensors: Rust backend reading CPU & GPU temperatures via WMI/OHM/sysinfo or Win32 APIs, displaying on Dashboard.
   - Startup Apps Manager Tab: Backend command listing registry & startup folder entries, frontend UI to view, enable, and disable startup items.
   - Task Scheduler Manager Tab: Backend command querying scheduled tasks (`Get-ScheduledTask`), frontend UI to view, enable, disable, and run tasks.

4. **Milestone 4: Customization & Profiles**
   - i18next Localization: Configure `i18next` and `react-i18next`, extract text strings into `en.json` and `ru.json` translation files, add language selector in UI.
   - Settings Tab: Settings state management, local storage / file persistence for theme (dark/light/system) and default preferences.
   - Presets Import/Export: JSON schema for optimization preset files, import file dialog, export file dialog, preset application logic.

5. **Milestone 5: Verification, Git & Release Tagging**
   - Comprehensive test pass: `cargo check`, `cargo test`, `npm run build`, `npm run test` (if present).
   - Forensic Auditor verification.
   - Commit history check: verify conventional commits format.
   - Git push and release tag creation based on version in `tauri.conf.json`.

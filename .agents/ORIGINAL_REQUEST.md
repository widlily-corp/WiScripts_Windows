# Original User Request

## Initial Request — 2026-07-22T16:06:52Z

# Teamwork Project Prompt — Draft

Implement a real-time progress reporting system in the WiScripts Windows application to show execution progress and errors for long-running tasks.

Working directory: c:/Users/Widlily/Documents/projects/WiScripts_Windows
Integrity mode: development

## Requirements

### R1. Backend Event Emission
Modify the Rust backend (e.g., the execution engines in `optimization::execute` and others) to take a `tauri::AppHandle` or `tauri::Window` and emit real-time progress events (e.g., `task-progress`). The events should contain the current step index, total steps, a status message, and an error flag.

### R2. Frontend Progress Bar & Log Viewer
Update the frontend React components (specifically the execution modals, like the one shown during "Processing...") to listen to the `task-progress` Tauri events. Implement a visual progress bar that updates as tasks complete.

### R3. Error and Status Console
Add a scrollable log viewer area in the execution modal that appends the status messages received from the backend events. Errors must be clearly highlighted (e.g., in red text) so the user can easily see if a specific task failed.

## Acceptance Criteria

### Backend Event Logic
- [ ] Rust code successfully compiles.
- [ ] Backend emits an event before and after executing individual optimization rules.

### UI Implementation
- [ ] Frontend uses `listen` from `@tauri-apps/api/event` to capture progress.
- [ ] Progress bar visually reflects `(current_step / total_steps) * 100`.
- [ ] The execution modal contains a scrollable text area showing the live logs/errors.

## Follow-up — 2026-07-23T13:54:43Z

# Teamwork Project Prompt — Draft

Extend the WiScripts Windows application with six premium features: Diagnostics, App Manager, Optimization Profiles, DNS/Network tweaks, Context Menu Manager, and Driver Backup.

Working directory: c:/Users/Widlily/Documents/projects/WiScripts_Windows
Integrity mode: demo

## Requirements

### R1. Advanced Diagnostics & Recovery
Implement a new UI section and backend commands to run `sfc /scannow`, `DISM /Online /Cleanup-Image /RestoreHealth`, and reset the TCP/IP network stack via PowerShell.

### R2. Package & Bloatware Manager
Implement a GUI wrapper for `winget` (search, install, update) and a debloat mechanism to remove pre-installed UWP apps.

### R3. Optimization Profiles (Presets)
Implement 1-click profiles ("Gaming", "Maximum Privacy", "Work") that automatically select and apply a curated list of existing optimization rules.

### R4. DNS & Context Menu Manager
Implement toggles to switch system DNS to AdGuard/Cloudflare/Google, and a toggle to restore the Windows 10 classic context menu.

### R5. Driver Backup
Implement a feature to export all 3rd-party drivers using `Export-WindowsDriver` to a specified folder.

## Acceptance Criteria

### Execution & Compilation
- [ ] Rust code successfully compiles (`cargo check`).
- [ ] Frontend successfully builds (`npm run build`).

### Feature Verification
- [ ] The React frontend contains new tabs/sections for the 5 modules.
- [ ] The Rust backend correctly implements IPC commands (`#[tauri::command]`) for all PowerShell integrations.
- [ ] The `Runner` implementation is correctly utilized for dry-runs and execution tracking.


# Original User Request

## Initial Request — 2026-07-23T13:54:43Z

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

## 2026-07-23T13:55:33Z
You are Explorer 3 for Milestone 1 of the Six Premium Features project in WiScripts Windows.
Working directory: c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/explorer_m1_3
Project Scope document: c:/Users/Widlily/Documents/projects/WiScripts_Windows/PROJECT.md

Your objective:
Investigate exact Windows PowerShell / System commands required for R1-R5 and check existing rule definitions:
1. R1 Diagnostics: `sfc /scannow`, `DISM /Online /Cleanup-Image /RestoreHealth`, TCP/IP network stack reset commands.
2. R2 Package & Bloatware: `winget` commands (search, install, upgrade/update) and UWP debloat commands (`Get-AppxPackage`, `Remove-AppxPackage`).
3. R3 Presets: Identify exact rule IDs in the codebase for "Gaming", "Maximum Privacy", and "Work" preset groups.
4. R4 DNS & Context Menu: Exact commands/APIs to set DNS for AdGuard (`94.140.14.14`), Cloudflare (`1.1.1.1`), Google (`8.8.8.8`) and reset DNS; exact registry command for Win10 classic context menu (`HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32`).
5. R5 Driver Backup: `Export-WindowsDriver -Online -Destination <path>`.

Write your detailed handoff report to `c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/explorer_m1_3/handoff.md` and send a message back to parent.

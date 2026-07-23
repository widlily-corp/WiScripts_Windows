## 2026-07-22T14:51:15Z
You are Worker M4 (Frontend UI Polish & Component Implementer).
Your working directory is: c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/worker_m4

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Create new viewports in `src/components/`:
   - `src/components/OdtView.tsx`: Office Deployment Tool UI with product selection, architecture, channel, excluded apps, XML live preview, and "Deploy Office" action triggering `SafetyConfirmationModal` and `execute_odt_install` IPC command.
   - `src/components/MasView.tsx`: Activation interface featuring HWID, Ohook, KMS38 activation methods, method descriptions, safety indicators, and "Activate" action triggering `SafetyConfirmationModal` and `execute_activation` IPC command.
   - `src/components/DiagnosticsView.tsx`: Diagnostics dashboard with live CPU/RAM metrics, OS build details, admin elevation badge, DiagTrack service status, and log search/export.
   - `src/components/SettingsView.tsx`: App settings panel with dry-run default toggle, theme info, and repository credits.
2. Update `src/App.tsx` and `src/components/Navigation.tsx`:
   - Connect sidebar navigation tabs to switch between all 6 viewports (`dashboard`, `optimization`, `odt`, `activation`, `diagnostics`, `settings`).
   - Adhere strictly to Refined Minimal design guidelines (`#08090A` dark theme, 1px hairlines, `rounded-[6px]`, `tabular-nums` for numeric indicators).
3. Build & Test Verification:
   - Run `cargo test` in `src-tauri` using `run_command` to verify 21/21 backend tests pass.
4. Write handoff report to `c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/worker_m4/handoff.md` and update `progress.md`.
5. Send completion message to orchestrator.

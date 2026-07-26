## 2026-07-26T19:32:37Z

You are Implementer for Milestone 2 & Milestone 3 of WiScripts Windows.
Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\implementer_m2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context & Task:
Refer to `PROJECT.md` and Explorer reports in:
- `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m1_1\handoff.md`
- `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m1_2\handoff.md`
- `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m1_3\handoff.md`

Your Responsibilities:

1. **Rust Backend (`src-tauri/src/`)**:
   - Implement real backend execution modules in `src-tauri/src/`:
     - `diagnostics/mod.rs` (run_diagnostics: sfc, dism, tcpip reset)
     - `packages/mod.rs` (winget_search, winget_install, winget_update, get_uwp_apps, remove_uwp_app)
     - `profiles/mod.rs` (get_optimization_profiles, apply_optimization_profile for "Gaming", "Maximum Privacy", "Work")
     - `dns_context/mod.rs` (set_dns_server for AdGuard/Cloudflare/Google/DHCP, get_classic_context_menu_status, toggle_classic_context_menu)
     - `driver_backup/mod.rs` (backup_drivers via Export-WindowsDriver)
   - Expose `#[tauri::command]` functions in `src-tauri/src/commands/mod.rs`.
   - Register commands in `src-tauri/src/lib.rs` (`tauri::generate_handler![]`).
   - Ensure handlers use `RealRunner` when `dry_run` is false (spawning `powershell.exe` / `cmd.exe` with `CREATE_NO_WINDOW`) and `DryRunRunner` when `dry_run` is true.
   - Run `cargo check` and `cargo test` in `src-tauri/` to verify zero errors and passing unit tests.

2. **React Frontend & Zustand Store (`src/`)**:
   - In `src/store/useAppStore.ts`:
     - Set default `dryRunMode` to `false`.
     - Implement actions calling the Tauri IPC commands.
     - Add `isElevated` state and `checkElevation()` action on initialization.
   - In `src/types/index.ts`: Define clean TypeScript interfaces for all return types. Absolutely NO `any` types.
   - In `src/components/` (`DiagnosticsView.tsx`, `PackageManagerView.tsx`, `PresetsView.tsx`, `DnsContextMenuView.tsx`, `DriverBackupView.tsx`, `App.tsx` or Header/Sidebar):
     - Ensure execution buttons invoke store actions with `dry_run: false` by default.
     - Implement clear, responsive Administrator UI warnings (using Tailwind CSS & Lucide icons like `ShieldAlert` or `AlertTriangle`) when `isElevated` is false.
     - Clearly notify users when privileges are missing and disable/warn on buttons requiring elevation.
   - Run `npm run build` and `npx tsc --noEmit` at project root to verify zero TypeScript or build errors.

3. **Deliverables & Handoff**:
   - Write implementation summary in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\implementer_m2\changes.md`.
   - Write handoff report in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\implementer_m2\handoff.md` with build & test output logs.
   - Send message to parent (orchestrator) with handoff report summary.

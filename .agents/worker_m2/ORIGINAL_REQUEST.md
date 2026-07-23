## 2026-07-22T16:17:12Z

You are Worker M2 (worker_m2). Your working directory is c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m2.
Your task is to implement Milestone 2: Frontend Progress Bar & Live Log Console in `src/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Specific Implementation Requirements:
1. Read `c:\Users\Widlily\Documents\projects\WiScripts_Windows\PROJECT.md` and `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m1_2\handoff.md`.
2. Update `src/types/index.ts`:
   Define `TaskProgressPayload` interface:
   ```typescript
   export interface TaskProgressPayload {
     currentStep: number;
     totalSteps: number;
     message: string;
     isError: boolean;
   }
   ```
3. Update `src/store/useAppStore.ts`:
   Add progress state fields & actions:
   - `currentStep: number`
   - `totalSteps: number`
   - `setCurrentProgress: (currentStep: number, totalSteps: number) => void`
   - `setExecutionProgress: (percent: number) => void`
4. Create `src/components/ExecutionProgressModal.tsx`:
   - Display a modal overlay whenever `isExecuting === true`.
   - Listen to Tauri `task-progress` events using `listen` from `@tauri-apps/api/event`:
     ```typescript
     import { listen } from '@tauri-apps/api/event';
     import { TaskProgressPayload } from '../types';
     ```
   - Update `currentStep`, `totalSteps`, and calculate percentage: `(currentStep / totalSteps) * 100`.
   - Render a visual progress bar reflecting the calculated percentage.
   - Render a scrollable log viewer console displaying live status messages.
   - Highlight error messages clearly with red text/background styling (e.g. `text-red-400 bg-red-950/40 border border-red-800/40`).
   - Use `useRef<HTMLDivElement>` to auto-scroll the log console container (`logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight`).
   - Clean up event listener when execution completes or component unmounts.
5. Mount `<ExecutionProgressModal />` in `src/App.tsx`.
6. Ensure `OptimizationView.tsx`, `MasView.tsx`, `OdtView.tsx` set `isExecuting(true)` and trigger Tauri IPC commands (`execute_optimizations`, `execute_activation`, `execute_odt_install`) via `invoke` from `@tauri-apps/api/core`.
7. Verify build using `npx tsc --noEmit` and `npm run build` in root. Document build results.
8. Create `.agents\worker_m2\changes.md` and `.agents\worker_m2\handoff.md`. Send completion message to parent orchestrator.

## 2026-07-23T18:56:55Z

You are Worker M2 for Milestone 2 of the Six Premium Features project in WiScripts Windows.
Working directory: c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/worker_m2
Project Scope document: c:/Users/Widlily/Documents/projects/WiScripts_Windows/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your objective:
Implement the Rust backend domain modules and `#[tauri::command]` handlers for features R1 through R5 in `src-tauri/src/`:

1. Domain Submodules to create:
   - `src-tauri/src/diagnostics/mod.rs`: `run_diagnostics` (sfc_scannow, dism_restorehealth, reset_tcpip).
   - `src-tauri/src/packages/mod.rs`: Winget search/install/update, UWP app listing and removal.
   - `src-tauri/src/profiles/mod.rs`: Optimization profiles ("gaming", "privacy", "work") presets mapping existing rule IDs.
   - `src-tauri/src/dns_context/mod.rs`: DNS provider toggles (AdGuard, Cloudflare, Google, DHCP) & classic Win10 context menu registry toggle.
   - `src-tauri/src/driver_backup/mod.rs`: `backup_drivers` using `Export-WindowsDriver`.

2. Command Handlers in `src-tauri/src/commands/mod.rs`:
   - `run_diagnostics(app: tauri::AppHandle, action: String, dry_run: bool)`
   - `winget_search(query: String)`
   - `winget_install(app: tauri::AppHandle, package_id: String, dry_run: bool)`
   - `winget_update(app: tauri::AppHandle, package_id: String, dry_run: bool)`
   - `get_uwp_apps()`
   - `remove_uwp_app(app: tauri::AppHandle, package_full_name: String, dry_run: bool)`
   - `get_optimization_profiles()`
   - `apply_optimization_profile(app: tauri::AppHandle, profile_id: String, dry_run: bool)`
   - `set_dns_server(app: tauri::AppHandle, provider: String, interface_alias: Option<String>, dry_run: bool)`
   - `get_classic_context_menu_status()`
   - `toggle_classic_context_menu(app: tauri::AppHandle, enable: bool, dry_run: bool)`
   - `backup_drivers(app: tauri::AppHandle, output_dir: String, dry_run: bool)`

3. Register commands in `src-tauri/src/lib.rs` inside `tauri::generate_handler![]`.

4. All execution paths MUST use `CommandRunner` (`RealRunner` when `dry_run == false`, `DryRunRunner` when `dry_run == true`) and emit `"task-progress"` events via `app: Option<&tauri::AppHandle>` or `tauri::AppHandle`.

5. Write unit tests for the new modules in `src-tauri/src/`.

6. Run `cargo check` and `cargo test` in `src-tauri` to verify error-free compilation and test execution.

Write your handoff report to `c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/worker_m2/handoff.md` and send a message back to parent when complete.

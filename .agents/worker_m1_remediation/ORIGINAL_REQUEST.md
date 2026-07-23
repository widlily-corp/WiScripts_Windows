## 2026-07-22T08:24:58Z
You are Worker M1 Remediation (Tauri Setup & Core Architecture Remediation Implementer).
Your working directory is: c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/worker_m1_remediation

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Input Review Reports:
- Backend Review: c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/reviewer_m1_1/review.md
- Frontend Review: c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/reviewer_m1_2/review.md

Required Remediation Actions:
1. Rust Backend (`src-tauri/`):
   - Add `sysinfo = "0.30"` dependency in `src-tauri/Cargo.toml`.
   - In `src-tauri/src/commands/mod.rs`: Fix `get_system_info` to probe real system metrics dynamically using `sysinfo::System` (CPU usage, used RAM, total RAM, OS name, OS version, OS build). Remove all hardcoded static values.
   - In `src-tauri/src/optimization/mod.rs`: Replace non-existent `Uninstall-OneDrive` cmdlet with valid PowerShell command sequence for OneDrive uninstallation.
   - In `src-tauri/src/activation/mod.rs`: Remove redundant nested `powershell -NoProfile ...` command string prefixes.
   - In `src-tauri/src/odt/mod.rs`: Ensure ODT installer checks and downloads `setup.exe` if absent.
2. Frontend React (`src/`):
   - In `src/App.tsx`, `Header.tsx`, `Dashboard.tsx`: Wire real Tauri IPC calls via `@tauri-apps/api/core` `invoke` or `useTauriCommand`.
   - `get_system_info`: Invoke on app mount and Header refresh button click to populate real stats into Zustand store.
   - `execute_optimizations`: Wire `handleExecuteOptimization` to invoke backend `execute_optimizations` IPC command with selected keys and `dry_run` state, writing returned `ExecutionSummary` into Zustand log stream.
   - `execute_activation`: Wire `handleExecuteMas` to invoke backend `execute_activation` IPC command with target/method and `dry_run` state, writing returned `ExecutionSummary` into Zustand log stream.
   - `execute_odt_install`: Wire ODT installation trigger to invoke backend `execute_odt_install` IPC command.
3. Build & Test Verification:
   - Run `cargo check` in `src-tauri` using `run_command`.
   - Run `cargo test` in `src-tauri` using `run_command`.
4. Write your handoff report to `c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/worker_m1_remediation/handoff.md` and update `progress.md`.
5. Send a message to the orchestrator with your results.

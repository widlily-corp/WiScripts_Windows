## 2026-07-27T06:00:57Z
You are Worker M3 for Milestone 3 (System Monitoring & Management).
Your working directory is: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m3
Create your working directory and your own BRIEFING.md / progress.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Task Requirements for Milestone 3:
1. System Monitoring Backend & Real-time Dashboard UI:
   - Create `src-tauri/src/metrics/mod.rs` with persistent `MetricsCollector` state (`sysinfo::System`, `sysinfo::Disks`, `sysinfo::Networks`).
   - Implement real-time CPU %, RAM (total/used/free), Disk I/O (read/write rates B/s), and Network I/O (rx/tx rates B/s) payload `SystemMetricsPayload`.
   - Implement multi-tiered CPU & GPU temperature sensor pipeline (`sysinfo::Components` -> WMI ACPI -> nvidia-smi -> safe fallback `is_available: false`) with `SystemTemperaturesPayload`.
   - Register `MetricsCollector` state via `.manage(...)` in `src-tauri/src/lib.rs`.
   - Expose `get_system_metrics` and `get_system_temperatures` IPC commands in `src-tauri/src/commands/mod.rs` and `lib.rs`.
   - Frontend: Implement custom SVG area sparklines `SparklineAreaGraph.tsx`, CPU/GPU temperature widgets `TemperatureSensorWidget.tsx`, hook `useMetricsPoller.ts`, and integrate into `src/components/Dashboard.tsx` with polling controls.

2. Startup Apps Manager Tab:
   - Create `src-tauri/src/startup/mod.rs` querying Windows Registry Run keys (`HKCU\...\Run`, `HKLM\...\Run`, WOW6432Node), Startup folders, and binary disabled flags in `StartupApproved\Run`.
   - Implement backend IPC commands: `get_startup_items`, `toggle_startup_item`, `remove_startup_item` supporting dry-run mode.
   - Frontend: Implement `StartupView.tsx` with search/filter, table, enable/disable switches, location badges, refresh button, delete safety modal.

3. Task Scheduler Background Tasks Tab:
   - Create `src-tauri/src/scheduler/mod.rs` querying Windows Task Scheduler (`Get-ScheduledTask`).
   - Implement backend IPC commands: `get_scheduled_tasks`, `toggle_scheduled_task`, `run_scheduled_task` supporting dry-run mode.
   - Frontend: Implement `SchedulerView.tsx` with search/filter, state badges (`Ready`, `Running`, `Disabled`), trigger/action info, run task now action button, toggle switch.

4. Integration & Navigation:
   - Update `src/types/index.ts` with all metric, startup, and scheduler types, and expand `TabType` to include `'startup'` and `'scheduler'`.
   - Update `src/store/useAppStore.ts` with state fields & IPC actions.
   - Update `src/components/Navigation.tsx` (add `Power` & `Clock` icons) and `src/App.tsx` router.

5. Testing & Verification:
   - Write Rust unit tests in `metrics`, `startup`, and `scheduler` modules.
   - Write empirical TypeScript test `src/tests/m3_metrics_empirical.ts`.
   - Ensure `cargo test --manifest-path src-tauri/Cargo.toml` passes 100% cleanly.
   - Ensure `npx tsc --noEmit` and `npm run build` pass with zero errors.

Refer to Explorer reports for detailed design guidelines:
- `.agents/explorer_m3_1/handoff.md`
- `.agents/explorer_m3_2/handoff.md`
- `.agents/explorer_m3_3/handoff.md`

Write your completion report to:
`c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m3\handoff.md`
When done, send a message to parent with build/test results and report path.

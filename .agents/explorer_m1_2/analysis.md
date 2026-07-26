# React Frontend Execution & Dry-Run Integration Analysis

## 1. Overview & Objectives
This analysis investigates the React frontend in `src/components/`, `src/store/`, `src/types/`, and `src/App.tsx` for Milestone 1 of WiScripts Windows. The objective is to analyze how execution buttons across UI views trigger backend commands and determine why executions are currently executing in dry-run mode or how to configure them for real execution (`dry_run: false`).

---

## 2. Codebase Architecture & IPC Flow

### Frontend Architecture
- **State Management**: Zustand store (`src/store/useAppStore.ts`) manages global state, including active tab, system info, execution logs, and the `dryRunMode` boolean flag.
- **Type Definitions**: `src/types/index.ts` defines `ExecutionSummary`, `ExecutedAction`, `CommandOutput`, `SystemInfo`, `OptimizationProfile`, etc.
- **Tauri IPC Binding**: `invoke` from `@tauri-apps/api/core` is used to send JSON payloads to Rust Tauri command handlers (`src-tauri/src/commands/mod.rs`).
- **IPC Key Mapping**: Tauri automatically converts camelCase JavaScript keys (e.g., `{ dryRun: boolean }`) to Rust snake_case function parameters (`dry_run: bool`).

---

## 3. Detailed Audit of Execution Views

| View Component | File Location | Trigger Button / Action | Store Method / IPC Command | Current `dryRun` Argument Passing |
| :--- | :--- | :--- | :--- | :--- |
| **DiagnosticsView** | `src/components/DiagnosticsView.tsx:137,173,210` | "Run SFC Scan", "Run DISM Repair", "Reset Network Stack" | `runDiagnostics(action)` -> `invoke('run_diagnostics', { action, dryRun: dryRunMode })` | Passes store state `dryRunMode` (defaults to `true`) |
| **PackageManagerView** | `src/components/PackageManagerView.tsx:235,247,352` | "Install", "Upgrade" (WinGet), "Uninstall" (UWP) | `wingetInstall`, `wingetUpdate`, `removeUwpApp` -> `invoke('winget_install' / 'winget_update' / 'remove_uwp_app', { ..., dryRun: dryRunMode })` | Passes store state `dryRunMode` (defaults to `true`) |
| **PresetsView** | `src/components/PresetsView.tsx:127` | "Apply [Profile]" | `applyOptimizationProfile(id)` -> `invoke('apply_optimization_profile', { profileId, dryRun: dryRunMode })` | Passes store state `dryRunMode` (defaults to `true`) |
| **DnsContextMenuView** | `src/components/DnsContextMenuView.tsx:163,179,266` | "Enable Classic Menu", "Restore Win11 Modern Menu", "Set [DNS Provider]" | `toggleClassicContextMenu(enable)`, `setDnsServer(provider, interface)` -> `invoke('toggle_classic_context_menu' / 'set_dns_server', { ..., dryRun: dryRunMode })` | Passes store state `dryRunMode` (defaults to `true`) |
| **DriverBackupView** | `src/components/DriverBackupView.tsx:89` | "Start Driver Backup" | `backupDrivers(path)` -> `invoke('backup_drivers', { outputDir, dryRun: dryRunMode })` | Passes store state `dryRunMode` (defaults to `true`) |
| **OptimizationView** | `src/components/OptimizationView.tsx:170` | "Execute Selected (N)" | Opens `SafetyConfirmationModal` -> `invoke('execute_optimizations', { selectedKeys, dryRun: currentDryRun })` | Passes store state `dryRunMode` (defaults to `true`) |
| **OdtView** | `src/components/OdtView.tsx:137` | "Deploy Office" | Opens `SafetyConfirmationModal` -> `invoke('execute_odt_install', { config, dryRun: currentDryRun })` | Passes store state `dryRunMode` (defaults to `true`) |
| **MasView** | `src/components/MasView.tsx:133` | "Activate ([Method])" | Opens `SafetyConfirmationModal` -> `invoke('execute_activation', { method, dryRun: currentDryRun })` | Passes store state `dryRunMode` (defaults to `true`) |

---

## 4. Findings on `dry_run` Handling

1. **No Hardcoded `dry_run: true` in Calls**:
   - The frontend does NOT hardcode `dry_run: true` or `dryRun: true` in tool invocations.
   - All components and store methods dynamically fetch and send `dryRunMode` from `useAppStore`.

2. **Default Store Configuration**:
   - In `src/store/useAppStore.ts` (line 347):
     ```typescript
     dryRunMode: true,
     ```
   - The store is initialized with `dryRunMode: true` by default.

3. **LocalStorage Persistence**:
   - In `src/store/useAppStore.ts` (lines 754-762):
     ```typescript
     partialize: (state) => ({
       dryRunMode: state.dryRunMode,
       ...
     })
     ```
   - `dryRunMode` is saved in `localStorage` under key `'wiscripts-app-store'`. If a user or test previously loaded the application, `dryRunMode: true` remains saved until explicitly changed.

4. **Direct Execution vs Safety Modal**:
   - `OptimizationView`, `OdtView`, and `MasView` route actions through `SafetyConfirmationModal.tsx`, which displays a toggle checkbox allowing users to disable Dry-Run mode prior to confirming execution.
   - `DiagnosticsView`, `PackageManagerView`, `PresetsView`, `DnsContextMenuView`, and `DriverBackupView` execute actions directly without popping up `SafetyConfirmationModal`. They rely purely on the current state of `dryRunMode` in `useAppStore`.

---

## 5. Required Frontend Changes for Real Backend Execution (`dry_run: false`)

To ensure user actions trigger real backend execution (`dry_run: false`) properly:

1. **Update Default `dryRunMode` in Zustand Store**:
   - In `src/store/useAppStore.ts` (line 347), change default `dryRunMode: true` to `dryRunMode: false` (or make it configurable via initial props/environment setting).

2. **Add Optional Parameter Overrides in Store Actions**:
   - Enhance store actions in `src/store/useAppStore.ts` to accept an optional `dryRun?: boolean` parameter:
     - `runDiagnostics: (action: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
     - `wingetInstall: (packageId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
     - `wingetUpdate: (packageId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
     - `removeUwpApp: (packageFullName: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
     - `applyOptimizationProfile: (profileId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
     - `setDnsServer: (provider: string, interfaceAlias?: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
     - `toggleClassicContextMenu: (enable: boolean, dryRun?: boolean) => Promise<ExecutionSummary | null>`
     - `backupDrivers: (outputDir: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
   - Implementation logic: `const effectiveDryRun = dryRun ?? get().dryRunMode;`.

3. **Consistency Across Views**:
   - In `DiagnosticsView`, `PackageManagerView`, `PresetsView`, `DnsContextMenuView`, and `DriverBackupView`, ensure the UI visually reflects whether Live Execution or Safety Dry-Run is active (via the `Header.tsx` toggle switch or view-level indicators), or optionally wrap critical actions with `SafetyConfirmationModal`.

4. **Storage Migration / Reset**:
   - Ensure existing persisted `localStorage` data does not silently force `dryRunMode: true` when default is updated to `false`.

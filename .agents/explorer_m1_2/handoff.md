# Handoff Report — React Frontend Real Execution Investigation

## 1. Observation
- **State Management & Store Configuration**:
  - File `src/store/useAppStore.ts` line 347: `dryRunMode: true` initializes the Zustand store with Safety Dry-Run enabled by default.
  - File `src/store/useAppStore.ts` lines 754-763: `dryRunMode` is persisted in `localStorage` under key `'wiscripts-app-store'`.
- **IPC Invocations Across Views**:
  - `src/components/DiagnosticsView.tsx` lines 39-47 calls `runDiagnostics(action)` which invokes `run_diagnostics` with `{ action, dryRun: dryRunMode }`.
  - `src/components/PackageManagerView.tsx` lines 64-92 calls `wingetInstall`, `wingetUpdate`, `removeUwpApp` which invoke `winget_install`, `winget_update`, `remove_uwp_app` with `{ packageId/packageFullName, dryRun: dryRunMode }`.
  - `src/components/PresetsView.tsx` lines 39-47 calls `applyOptimizationProfile(profileId)` which invokes `apply_optimization_profile` with `{ profileId, dryRun: dryRunMode }`.
  - `src/components/DnsContextMenuView.tsx` lines 80-99 calls `setDnsServer` and `toggleClassicContextMenu` which invoke `set_dns_server` and `toggle_classic_context_menu` with `{ ..., dryRun: dryRunMode }`.
  - `src/components/DriverBackupView.tsx` lines 32-48 calls `backupDrivers(path)` which invokes `backup_drivers` with `{ outputDir, dryRun: dryRunMode }`.
  - `src/components/OptimizationView.tsx`, `OdtView.tsx`, `MasView.tsx` invoke `execute_optimizations`, `execute_odt_install`, `execute_activation` with `{ ..., dryRun: currentDryRun }` via `SafetyConfirmationModal`.
- **Parameter Translation**:
  - Tauri IPC automatically maps frontend `camelCase` keys (`{ dryRun: boolean }`) to Rust backend `snake_case` command arguments (`dry_run: bool`).
  - Rust command signatures in `src-tauri/src/commands/mod.rs` (lines 151, 195, 226, 261, 299, 329, 367, 404, 436, 475, 507) expect `dry_run: bool`.

## 2. Logic Chain
1. **Frontend passes store state**: None of the frontend components hardcode `dry_run: true` directly in their function calls. Rather, all components query `dryRunMode` from `useAppStore` or pass `dryRunMode` as the `dryRun` IPC argument.
2. **Default state triggers simulation**: Because `useAppStore.ts` defaults `dryRunMode` to `true`, any execution triggered without explicitly setting `dryRunMode: false` will send `{ dryRun: true }` to Tauri IPC.
3. **Persisted state preserves dry run**: Because `dryRunMode` is stored in `localStorage`, once saved as `true`, browser sessions retain `dryRunMode: true`.
4. **Action parameter flexibility**: Store actions currently do not allow caller components to pass an explicit `dryRun` override flag (e.g. `runDiagnostics(action, dryRun)`), relying exclusively on internal state `get().dryRunMode`.

## 3. Caveats
- No caveats. Investigation covers all UI views (`DiagnosticsView`, `PackageManagerView`, `PresetsView`, `DnsContextMenuView`, `DriverBackupView`, `OptimizationView`, `OdtView`, `MasView`, `SettingsView`), Zustand store, types, and Rust Tauri IPC parameter binding.

## 4. Conclusion
- Frontend components correctly pass `dryRun` flags to backend IPC functions.
- To enable real backend execution (`dry_run: false`), the required changes are:
  1. Set default `dryRunMode` to `false` in `src/store/useAppStore.ts` (line 347), or set `dryRunMode` to `false` when real execution is desired.
  2. Update store actions in `src/store/useAppStore.ts` to accept an optional `dryRun?: boolean` parameter (e.g., `runDiagnostics(action, dryRun?: boolean)`), defaulting to `get().dryRunMode` if omitted.
  3. Ensure UI components (`DiagnosticsView`, `PackageManagerView`, `PresetsView`, `DnsContextMenuView`, `DriverBackupView`) provide clear visual feedback or toggle capability for dry-run vs live execution.

## 5. Verification Method
1. Inspect `src/store/useAppStore.ts` and verify `dryRunMode` initialization and action IPC invocation parameters.
2. Run `npx ts-node src/tests/m3_views_empirical.ts` or empirical tests to verify state toggles and action calls.
3. Inspect `src-tauri/src/commands/mod.rs` to confirm parameter matching (`dryRun` -> `dry_run`).

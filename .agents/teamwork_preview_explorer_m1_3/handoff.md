# Handoff Report: Frontend IPC Invocation Wrappers, Store Management & Notification UI

**Agent**: Explorer 3  
**Working Directory**: `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_explorer_m1_3`  
**Milestone**: Milestone 1: Fix Execution & UI Hangs  
**Handoff Type**: Hard Handoff (Task Complete)  

---

## 1. Observation

1. **Unused IPC Hook**:
   - `src/hooks/useTauriCommand.ts:10-64` defines a generic `useTauriCommand` hook for executing IPC commands.
   - Grep search across `src/` confirmed **0 occurrences of `useTauriCommand` being imported or called** in any view or store.
   - Line 60 of `useTauriCommand.ts` contains `[commandName, dryRunMode, addLog, options]` in `useCallback` dependency array, which recreates `execute` on every render when inline options objects are passed.

2. **IPC Command Distribution**:
   - 34 direct calls to `@tauri-apps/api/core` `invoke` exist across `src/`:
     - `src/store/useAppStore.ts`: 25 `invoke` calls across store actions.
     - `src/components/MasView.tsx:93`: `const summary = await invoke<ExecutionSummary>('execute_activation', ...)`
     - `src/components/OdtView.tsx:97`: `const summary = await invoke<ExecutionSummary>('execute_odt_install', ...)`
     - `src/components/OdtView.tsx:148`: `const summary = await invoke<ExecutionSummary>('execute_odt_regional_bypass', ...)`
     - `src/components/OptimizationView.tsx:95`: `const summary = await invoke<ExecutionSummary>('execute_optimizations', ...)`
     - `src/components/Header.tsx:34`: `const info = await invoke<SystemInfo>('get_system_info')`
     - `src/App.tsx:43,70`: `get_system_info`, `generate_odt_xml`

3. **Toast System & Error Notification Audit**:
   - `src/components/ToastContainer.tsx:65-78` renders toasts from `useAppStore` (`toasts: ToastNotification[]`).
   - Only 3 features trigger error toasts on failure:
     - `checkForUpdates` / `downloadAndInstallUpdate` (`useAppStore.ts:499, 561`)
     - `toggleStartupItem` / `removeStartupItem` (`useAppStore.ts:1184, 1209`)
     - `toggleScheduledTask` / `runScheduledTask` (`useAppStore.ts:1242, 1261`)
   - Over 15 store actions and view component handlers (`runDiagnostics`, `wingetInstall`, `wingetUpdate`, `removeUwpApp`, `applyOptimizationProfile`, `setDnsServer`, `toggleClassicContextMenu`, `backupDrivers`, `createRestorePoint`, `restoreSystemToPoint`, `execute_activation`, `execute_odt_install`, `execute_optimizations`) catch exceptions and log to `addLog`, but **NEVER call `addToast`**.

4. **`ExecutionSummary` Fulfills Promise on Failure**:
   - Commands returning `Result<ExecutionSummary, String>` resolve normally with `ExecutionSummary { success: false, ... }` when internal command steps fail.
   - Code in `MasView.tsx:98-102`, `OdtView.tsx:102-106`, `OptimizationView.tsx:100-104`, `useAppStore.ts:670, 718, 742, 784, 835, 870, 910, 939 font` checks `summary.success` only for log levels (`summary.success ? 'info' : 'error'`). None of them trigger an error toast when `summary.success === false`.

5. **Missing React Error Boundaries**:
   - Search across `src/` revealed **zero `<ErrorBoundary>` components**.
   - Neither `App.tsx` nor individual tab views are wrapped in Error Boundaries.

6. **Masked Telemetry Failures**:
   - `src/store/useAppStore.ts:1116-1136` (`fetchLatestMetrics`):
     ```typescript
     } catch (e) {
       const ramUsed = Math.floor(4000 + Math.random() * 1500);
       ...
       get().pushMetricSnapshot(simSnapshot);
       return simSnapshot;
     }
     ```
     IPC hardware metric errors silently inject random numbers into the store without alerting the user.

---

## 2. Logic Chain

1. **Observation 1 & 2** show that frontend IPC calls are split between direct component calls (`MasView`, `OdtView`, `OptimizationView`) and store actions (`useAppStore`), while the designed `useTauriCommand` hook is unused.
2. **Observation 3** proves that over 80% of backend IPC command invocations fail to emit user-facing error toasts when errors occur, leaving the user with no notification when an operation fails.
3. **Observation 4** shows that because Rust returns `Ok(ExecutionSummary { success: false, ... })` on command failure, JS promises resolve successfully. Because code only checks `summary.success` for logging without calling `addToast`, domain failures pass completely unnoticed by the UI notification system.
4. **Observation 5** establishes that an uncaught error in component rendering or async lifecycle will crash the React component tree without recovery fallback, freezing the UI.
5. Therefore, the frontend lacks a unified IPC error handling pipeline, leading to silent failures, missing error toasts, and UI hang hazards.

---

## 3. Caveats

- **Backend Rust Handlers**: This investigation focused strictly on frontend TS/React files (`src/`). Backend Rust command implementations (`src-tauri/src/`) were not modified or examined in depth.
- **Empirical Test Suite**: The empirical test suite (`src/tests/m1_updater_toast_empirical.ts`) validates updater store actions and toasts, but does not yet cover all 15+ missing toast paths in other modules.

---

## 4. Conclusion

The WiScripts frontend currently suffers from fragmented IPC invocation patterns and silent failure modes. Commands that fail at the backend or return `ExecutionSummary { success: false }` do not notify the user via Toast alerts, and the absence of React Error Boundaries creates potential UI hang risks. Implementing a centralized `invokeSafe` IPC utility and wrapping tab components in `<ErrorBoundary>` will resolve these vulnerabilities.

---

## 5. Verification Method

1. **Inspect Analysis Report**:
   Read `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_explorer_m1_3\analysis.md`.
2. **Run Empirical Test Suite**:
   Execute `npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" src/tests/m1_updater_toast_empirical.ts`.
3. **Test Toast Trigger Invalidation**:
   Trigger any store command (e.g. `wingetInstall('invalid.package')` or `runDiagnostics('sfc_scannow')`) under an environment where IPC returns `summary.success === false`. Verify whether a Toast appears in `ToastContainer`. (Currently no toast appears).

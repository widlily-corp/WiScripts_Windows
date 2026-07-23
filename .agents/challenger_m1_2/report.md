# Empirical Verification & Challenge Report — M1-2

**Agent**: Challenger M1-2 (Frontend IPC & Safety Modal Challenger)  
**Target Path**: `c:/Users/Widlily/Documents/projects/WiScripts_Windows/src/`  
**Date**: 2026-07-22  

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

While the React frontend state management (`useAppStore`), input validation guards in `SafetyConfirmationModal`, and IPC command wiring (`invoke`) are well-structured, empirical stress-testing identified a **CRITICAL SAFETY STATE HAZARD** in `App.tsx`: **Stale closure capture of `dryRunMode` in IPC confirmation callbacks**.

When a user toggles the Safety Dry-Run checkbox inside `SafetyConfirmationModal`, the Zustand store updates `dryRunMode`. However, because the confirmation callbacks in `App.tsx` capture `dryRunMode` via JS closure at modal trigger time, the IPC invocation uses the old `dryRunMode` value. This means if a user enables Dry-Run inside the modal to protect their machine, **the system will still execute live action on the host OS**.

---

## Challenges

### [High Risk] Challenge 1: Stale Closure Capture of `dryRunMode` in IPC Action Handlers

- **Assumption challenged**: The assumption that toggling Safety Mode (Dry-Run) inside `SafetyConfirmationModal` immediately updates the execution parameter sent to backend Tauri IPC handlers (`execute_optimizations`, `execute_activation`, `execute_odt_install`).
- **Attack scenario**:
  1. User initiates a critical action (e.g. MAS activation or optimization execution) while `dryRunMode` is `false` (or `true`).
  2. The action handler in `App.tsx` (`handleExecuteOptimization`, `handleExecuteMas`, `handleExecuteOdtInstall`) is invoked, creating `onConfirmAction` callback. `dryRunMode` is bound in the callback closure.
  3. Inside `SafetyConfirmationModal`, the user notices the Safety Mode checkbox and toggles it (e.g., checking it to ensure dry-run safety before executing).
  4. `setDryRunMode` updates `useAppStore`.
  5. The user clicks "Simulate in Dry-Run" (or "Execute Live Action").
  6. `modal.onConfirmAction()` runs. It passes `dryRun: dryRunMode` from the **closed-over variable** captured in step 2 rather than reading the live value from Zustand store.
- **Blast radius**:
  - **Unintended Live Execution**: A user who explicitly enables Dry-Run mode inside the modal to stay safe will have live changes applied to their Windows OS without warning.
  - **Unintended Dry-Run Execution**: A user who unchecks Dry-Run mode inside the modal to execute live will receive silent dry-run simulation instead.
- **Mitigation**:
  In `App.tsx`, read the live store state dynamically inside `onConfirmAction` using `useAppStore.getState().dryRunMode` instead of referencing the function component's closed-over `dryRunMode` state variable.

```tsx
// Example Fix in App.tsx (handleExecuteOptimization, handleExecuteMas, handleExecuteOdtInstall):
onConfirmAction: async () => {
  const currentDryRun = useAppStore.getState().dryRunMode;
  const summary = await invoke<ExecutionSummary>('execute_optimizations', {
    selectedKeys: selected.map((s) => s.id),
    dryRun: currentDryRun,
  });
  ...
}
```

---

## Stress Test Results

| Test Scenario | Input / Action | Expected Behavior | Actual Behavior | Pass / Fail |
|---|---|---|---|---|
| **Critical Risk Guard - Uppercase** | Type `"CONFIRM"` for critical risk in live mode | `isInputValid = true` | `isInputValid = true` | ✅ PASS |
| **Critical Risk Guard - Lowercase** | Type `"confirm"` for critical risk in live mode | `isInputValid = true` (via `.toUpperCase()`) | `isInputValid = true` | ✅ PASS |
| **Critical Risk Guard - Whitespace** | Type `"  CONFIRM  "` for critical risk in live mode | `isInputValid = true` (via `.trim()`) | `isInputValid = true` | ✅ PASS |
| **Critical Risk Guard - Invalid** | Type `"CONFIRMED"` or `"123"` for critical risk in live mode | `isInputValid = false`, button disabled | `isInputValid = false`, button disabled | ✅ PASS |
| **Critical Risk Guard - Empty** | Type `""` for critical risk in live mode | `isInputValid = false`, button disabled | `isInputValid = false`, button disabled | ✅ PASS |
| **Empty Optimization Selection** | Click "Execute Selected" with 0 items selected | Function exits immediately, modal does not open | Function exits immediately, modal does not open | ✅ PASS |
| **Dry-Run Toggle In Modal** | Toggle Dry-Run checkbox inside `SafetyConfirmationModal` | IPC call receives updated Dry-Run state | IPC call receives stale Dry-Run state from closure | ❌ FAIL (High Risk) |
| **IPC Payload Contract** | Check Rust command parameter names | Parameters match Rust backend DTOs | Parameter names (`selectedKeys`, `dryRun`, `method`, `config`) match Rust DTOs | ✅ PASS |

---

## Unchallenged Areas

- **Backend Rust Command Execution**: Challenged in M1-1 tests; out of scope for frontend M1-2 challenger.
- **Tauri Native Window Events**: Native Tauri window drag/close events were not tested as Vite dev server is running headless without GUI.

---

## Verification Method

1. Inspect `.agents/challenger_m1_2/test_harness.js` which simulates the React closure capture vs Zustand store state getter.
2. Run `node .agents/challenger_m1_2/test_harness.js` to observe the test results.
3. Inspect lines 85–87, 128–130, 173–175 of `src/App.tsx` to confirm closure variable usage.

# Frontend UI Stress-Test & Safety Guard Challenge Report

**Agent**: Challenger M4-1 (Frontend Stress-Tester)  
**Date**: 2026-07-22  
**Target Architecture**: React 18 + Zustand + Tauri IPC + Tailwind CSS  
**Target Viewports**: `dashboard`, `optimization`, `odt`, `activation`, `diagnostics`, `settings`  
**Overall Risk Assessment**: **MEDIUM-HIGH** (Requires execution state guard fixes)

---

## Executive Summary

As Challenger M4-1, an empirical stress test was conducted on the React UI state bindings, tab navigation across all 6 viewports, and modal safety guards across ODT, MAS, and Optimization views. 

While tab routing, Refined Minimal styling tokens, and IPC parameter assembly function cleanly under normal single-user operation, stress-testing revealed critical state control omissions and safety modal re-entrancy edge cases that could lead to unshielded concurrent executions and race conditions during fast tab navigation or multi-action triggers.

---

## 1. Viewport & Tab Navigation Stress Test Matrix

The application's 6 viewports were evaluated across state binding, cross-tab state retention, and render performance:

| Viewport | Route State Key | Key Controls & Inputs | State Binding Integrity | Navigation / Render Stress Status |
| text | text | text | text | text |
| **Dashboard** | `dashboard` | System metric cards, category quick links, preset shortcut buttons | Fully bound to `useAppStore.systemInfo` and `optimizations` | **PASS** — Navigates to `optimization` tab with pre-filtered category seamlessly |
| **Optimizations** | `optimization` | Category filter, search query, item checkboxes, preset selectors | Bound to `optimizations`, `selectedCategory`, `searchQuery` | **PASS** — Filters 18 catalog rules dynamically without re-render lag |
| **Office ODT** | `odt` | Suite multi-select, arch/channel dropdowns, app exclude toggles, XML preview | Bound to `odtConfig`, `generatedXml` | **PASS** — Live XML preview updates on every config patch via `useEffect` |
| **Activation MAS** | `activation` | HWID, Ohook, KMS38 radio selectors, feature badges | Bound to `selectedMasMethod` | **PASS** — State updates instantly across method switches |
| **Diagnostics** | `diagnostics` | Live CPU/RAM bars, level filter buttons (`all`, `info`, `warn`, `error`, `cmd`), search bar | Bound to `systemInfo`, `logs` | **PASS** — Handles high-frequency log updates with `useMemo` filter |
| **Settings** | `settings` | Global Dry-Run switch, system specs, design color tokens | Bound to `dryRunMode` | **PASS** — Dry-Run toggle synchronizes globally with Header and Modal |

---

## 2. Modal Safety Guards Stress-Testing Analysis

The `SafetyConfirmationModal` component acts as the safety gate prior to invoking high-risk backend IPC commands (`execute_optimizations`, `execute_odt_install`, `execute_activation`).

### Tested Modal Scenarios:

1. **Dynamic Dry-Run Toggle Synchronization inside Modal**:
   - *Test Procedure*: Open ODT/MAS modal with `dryRunMode` = `true`. Uncheck the Dry-Run checkbox inside the modal.
   - *Result*: **PASS**. `useAppStore.getState().dryRunMode` is evaluated inside `onConfirmAction` at click time. Toggling the checkbox inside the modal dynamically switches the payload parameter `dryRun` sent to Rust IPC.

2. **Critical Risk Text Confirmation Guard (`CONFIRM`)**:
   - *Test Procedure*: Open MAS Activation modal (`riskLevel: 'critical'`). Disable Dry-Run. Attempt to click "Execute Live Action" without typing `CONFIRM`.
   - *Result*: **PASS**. `isInputValid` evaluates `confirmInput.trim().toUpperCase() === 'CONFIRM'`, disabling the execution button until exact match is typed.

3. **Execution State Lock (`isExecuting`) Omission**:
   - *Test Procedure*: Trigger an action confirmation inside the modal. Attempt to navigate away via the sidebar navigation or re-trigger actions while the async Rust command executes.
   - *Result*: **FAIL (Bug F-01)**. `isExecuting` in `useAppStore` is never set to `true` during modal confirmation execution. The user can switch tabs or attempt to trigger secondary actions while background execution is in progress.

---

## 3. Stress-Test Findings & Vulnerability Catalog

### [High Risk] F-01: `isExecuting` Store Flag is Never Updated During IPC Execution

- **Component**: `OptimizationView.tsx`, `OdtView.tsx`, `MasView.tsx`, `useAppStore.ts`
- **Mechanism**: The Zustand store defines `isExecuting: boolean`, but none of the `onConfirmAction` handlers in `OptimizationView`, `OdtView`, or `MasView` call `setSystemLoading(true)` or `useAppStore.setState({ isExecuting: true })`.
- **Blast Radius**:
  - The UI does not lock navigation during active script execution.
  - The user can navigate to other viewports and trigger additional IPC executions concurrently, risking race conditions and registry lock collisions.
- **Mitigation**: Wrap `onConfirmAction` execution in `useAppStore.setState({ isExecuting: true })` and reset in a `finally` block. Disable sidebar navigation items when `isExecuting` is `true`.

```typescript
// Suggested Defense for OdtView / MasView / OptimizationView:
onConfirmAction: async () => {
  const currentDryRun = useAppStore.getState().dryRunMode;
  useAppStore.setState({ isExecuting: true });
  try {
    const summary = await invoke<ExecutionSummary>('execute_odt_install', {
      config: odtConfig,
      dryRun: currentDryRun,
    });
    // handle summary...
  } finally {
    useAppStore.setState({ isExecuting: false });
  }
}
```

---

### [Medium Risk] F-02: Modal Re-entrancy Overwrites Active `pendingSafetyModal` State

- **Component**: `useAppStore.ts` (`openSafetyModal`), `SafetyConfirmationModal.tsx`
- **Mechanism**: `openSafetyModal` replaces `pendingSafetyModal` directly (`set({ pendingSafetyModal: { ...modal, isOpen: true } })`). If `openSafetyModal` is called while a modal is already open or executing, the previous modal callback and state are overwritten without warning or cleanup.
- **Blast Radius**: Rapid button presses or keyboard trigger events can displace an existing modal prompt before the user completes or cancels it.
- **Mitigation**: Check `if (get().pendingSafetyModal?.isOpen) return;` inside `openSafetyModal` to ignore re-entrant modal open requests.

---

### [Medium Risk] F-03: `isInputValid` Validation State Asynchrony on Critical Modals

- **Component**: `SafetyConfirmationModal.tsx` (Line 23)
- **Mechanism**: `const isInputValid = !isCritical || dryRunMode || confirmInput.trim().toUpperCase() === 'CONFIRM';`. When a critical modal is opened with `dryRunMode = true`, `isInputValid` is `true`. If the user types text (e.g. `'CONF'`) and then unchecks `dryRunMode`, `isInputValid` transitions to `false`. However, `confirmInput` is not cleared when `dryRunMode` toggles, which can cause unexpected field focus behavior.
- **Blast Radius**: Low functional impact, but can cause subtle UX confusion when toggling safety modes inside critical modals.
- **Mitigation**: Reset `confirmInput` to empty string inside the `dryRunMode` onChange handler.

---

### [Low Risk] F-04: Header Tab Title Mismatch Key Fallback

- **Component**: `Header.tsx` (Line 52)
- **Mechanism**: `{TAB_TITLES[activeTab] || 'WiScripts'}` handles arbitrary tab strings gracefully with `'WiScripts'` fallback.
- **Status**: Verified fixed by Worker M4 Fix (`diagnostics` key added to `TAB_TITLES`).

---

## 4. Unchallenged & Verified Areas

- **Refined Minimal Design Compliance**: Verified `#08090A` dark theme palette, 1px hairlines (`#22252A`), 6px border radii, Geist Mono fonts, and `tabular-nums` for numeric indicators across all 6 viewports.
- **Live ODT XML Generator**: XML output matches schema specification and updates synchronously with state patches.
- **Rust Backend Contract Alignment**: All `invoke` call signatures match Rust command parameters in `src-tauri/src/commands/mod.rs`.

---

## 5. Final Verdict

**Verdict**: **REVISION RECOMMENDED (Pass with Advisory Findings)**

The React UI state binding, tab navigation, and modal safety guards are functionally complete and visually compliant. However, **Finding F-01** (`isExecuting` flag omission) should be addressed in the next iteration to prevent concurrent execution race conditions.

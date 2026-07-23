# Frontend React & UX Review Report (M1-2)

**Reviewer**: Reviewer M1-2 (Frontend React & UX Reviewer)  
**Date**: 2026-07-22  
**Target Path**: `c:/Users/Widlily/Documents/projects/WiScripts_Windows/src/`  
**Verdict**: **REQUEST_CHANGES (FAIL)**  

---

## Review Summary

During the review of the frontend React and UX implementation for WiScripts Windows, an **INTEGRITY VIOLATION** was detected. While the UI styling complies with the Refined Minimal design guidelines (#08090A background, 1px hairlines, `rounded-[6px]`, `tabular-nums`, mobile-only hyphens), the frontend action handlers in `App.tsx`, `Header.tsx`, and `Dashboard.tsx` bypass backend IPC execution entirely. 

The custom IPC hook `useTauriCommand` (`src/hooks/useTauriCommand.ts`) was created but is **never imported or used** anywhere in the application. As a result, action execution handlers (optimizations, MAS activation, system info refresh) operate as **facade implementations** that only log local text messages without dispatching commands to the Tauri Rust backend (`execute_optimizations`, `execute_activation`, `get_system_info`).

---

## Findings

### [Critical] Finding 1: INTEGRITY VIOLATION — Facade / Unwired IPC Hooks & Dummy Handlers

- **What**: The frontend provides a `useTauriCommand` hook (`src/hooks/useTauriCommand.ts`), but this hook is unreferenced across all UI components (`App.tsx`, `Header.tsx`, `Dashboard.tsx`, `SafetyConfirmationModal.tsx`). Action handlers in `App.tsx` append local mock log strings instead of invoking Tauri backend IPC methods (`execute_optimizations`, `execute_activation`, `get_system_info`, `generate_odt_xml`).
- **Where**:
  - `src/App.tsx` (Lines 25–58): `handleExecuteOptimization` and `handleExecuteMas` only call `addLog(...)` with a static string message. No IPC call is dispatched to `execute_optimizations` or `execute_activation`.
  - `src/components/Header.tsx` (Lines 74–82): Refresh button contains an empty arrow function `onClick={() => { // Trigger refresh }}`.
  - `src/components/Dashboard.tsx`: Displays static mock system information from initial Zustand state without fetching real stats via `get_system_info`.
  - `src/hooks/useTauriCommand.ts`: Dead code / unintegrated hook.
- **Why**: This is a facade implementation that creates the illusion of functioning UI actions and safety confirmations without performing real backend operations.
- **Suggestion**:
  1. Integrate `useTauriCommand` (or `@tauri-apps/api/core` `invoke`) into `App.tsx` and UI components.
  2. Wire `handleExecuteOptimization` in `App.tsx` to invoke `execute_optimizations(selectedKeys, dryRunMode)`.
  3. Wire `handleExecuteMas` in `App.tsx` to invoke `execute_activation(selectedMasMethod, dryRunMode)`.
  4. Wire `Header.tsx` refresh button and `Dashboard.tsx` initial load to invoke `get_system_info`.
  5. Wire ODT configurator view to call `generate_odt_xml` and `execute_odt_install`.

---

## Compliance Verification Matrix

| Category | Requirement | Status | Notes |
|---|---|---|---|
| **Design Rules** | `#08090A` dark theme | ✅ PASS | Configured in `tailwind.config.js` and `App.tsx` |
| **Design Rules** | `1px hairlines` | ✅ PASS | Subtle borders (`border-border`, `border-border-subtle`) used throughout |
| **Design Rules** | `rounded-[6px]` | ✅ PASS | Explicit 6px border radii on buttons, containers, and modals |
| **Design Rules** | `tabular-nums` | ✅ PASS | Applied to CPU and RAM numeric stats in `Header.tsx` & `Dashboard.tsx` |
| **Design Rules** | Mobile-only hyphens | ✅ PASS | Constrained to `@media (max-width: 768px)` in `index.css` |
| **Aesthetics** | Zero AI-slop | ✅ PASS | Clean typography, no filler content, strict contrast ratios |
| **Safety Guard** | `SafetyConfirmationModal` | ⚠️ WARN | Guard UI logic (`CONFIRM` input requirement for critical risk when live) is implemented correctly, but guards a facade action |
| **State Store** | Zustand slices | ✅ PASS | `useAppStore.ts` manages state, devtools, persistence, and log history |
| **Type Safety** | TypeScript types | ✅ PASS | Strict interfaces in `types/index.ts` |
| **Backend IPC** | Real IPC Wireup | ❌ FAIL | `useTauriCommand.ts` is unused; IPC calls bypassed in `App.tsx` & `Header.tsx` |

---

## Verified Claims

- `#08090A` dark background theme → verified via `tailwind.config.js` & `index.css` → PASS
- Responsive word break mobile restriction → verified via `src/index.css` lines 11–17 → PASS
- `SafetyConfirmationModal` `CONFIRM` string requirement for `critical` risk level in live mode → verified via `src/components/SafetyConfirmationModal.tsx` line 23 → PASS
- Backend IPC integration → verified via grep & AST tracing → FAIL (Facade implementation)

---

## Unverified / Failed Items

- Real execution of PowerShell optimizations and MAS activation via Tauri IPC (bypassed in UI).
- Real system telemetry fetching via `get_system_info` (unwired).

---

## Conclusion & Recommendation

The frontend visual design and component architecture strictly adhere to the Refined Minimal aesthetic and User Rules. However, because backend IPC integration is unwired and actions rely on dummy state updates, the verdict is **REQUEST_CHANGES (FAIL)** under the Critical finding of **INTEGRITY VIOLATION**.

**Required Action**: Update `App.tsx`, `Header.tsx`, and `Dashboard.tsx` to connect UI events to the Tauri backend IPC commands via `useTauriCommand` or direct `invoke` calls.

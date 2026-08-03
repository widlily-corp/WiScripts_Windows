# Release Notes — WiScripts Windows v0.9.7

**Release Date:** 2026-08-03

---

## Architecture

- **Zustand Slice Architecture**: The monolithic `useAppStore.ts` (1900+ lines) has been decomposed into 7 focused, independent slices: `systemSlice`, `updaterSlice`, `uiSlice`, `optimizationSlice`, `audioSlice`, `packageManagerSlice`, and `systemToolsSlice`.
- **Constants & Mocks Extraction**: Large data arrays (`DEFAULT_OPTIMIZATIONS`, mock audio payloads) moved to dedicated `src/constants/` and `src/mocks/` directories.
- **Utility Module**: Shared error handling utilities extracted to `src/utils/`.

## Code Quality

- **Type Safety**: All `as any` type assertions eliminated across the entire codebase. Replaced with proper TypeScript Type Guards (`instanceof Error` checks, `unknown` narrowing).
- **Early Returns**: Deeply nested conditional logic (e.g., `checkForUpdates`) refactored to flat, readable control flow.
- **AI-Slop Removal**: Redundant comments (`// Category 1: telemetry`, `// Feature R1`, `// Global App Settings`) purged from store and component files.

## Performance

- **Optimized Bundle Splitting**: Added Vite `manualChunks` configuration to split vendor dependencies (`react`, `lucide-react`, `i18next`, `zustand`, `@tauri-apps`) into separate cacheable chunks. Eliminates the previous 500kB+ chunk warning.

## Backend (Rust)

- **Clippy Compliance**: Resolved all `cargo clippy` warnings across 14 Rust source files.
- **Mock Runner Fixes**: Added `is_native_enabled` trait method to `CommandRunner`, fixing 4 failing unit tests in optimization and system restore modules.
- **Test Suite**: All 226 Rust unit tests passing.

## Frontend (React/TypeScript)

- **String Interpolation Fix**: Resolved template literal formatting issues in `OptimizationView.tsx` and `PresetsView.tsx`.
- **Localization Completeness**: Extracted remaining hardcoded Russian strings from `SettingsView.tsx`, `SystemCleaner.tsx`, and other components into i18n translation files (`en.json`, `ru.json`).
- **Cleanup**: Removed leftover `replace.py` utility script from the components directory.

## Full Commit History (since v0.9.0)

```
refactor(store): split useAppStore into slices and extract constants
refactor(ui): remove AI-slop, enforce type guards, localize hardcoded strings
test: add store stress tests and update documentation
fix(backend): resolve clippy warnings and mock test assertions
fix(ui): fix string interpolation and localize remaining strings
perf(build): add manual chunks for optimal code splitting
docs: update project documentation
chore(release): bump version to 0.9.7
```

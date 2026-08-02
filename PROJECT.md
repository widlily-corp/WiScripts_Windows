# Project: WiScripts Windows Application Refactoring

## Architecture
- React 18 + Vite + TypeScript (strict mode)
- Zustand v4 state store refactored into domain slices
- i18next + react-i18next localization system
- Tauri desktop integration framework

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Zustand Store Refactoring & Data Extraction | Extract constants to src/constants/, mocks to src/mocks/, break useAppStore.ts into 7 slices, re-export backward-compatible hook | M1 | ORIGINAL_REQUEST R1 |
| 2 | Code Quality & AI-Slop Removal | Remove 30+ redundant AI-slop comments (// Category 1, // Feature, etc.) across store and views | M2 | ORIGINAL_REQUEST R2 |
| 3 | Strict Typing & Error Handling | Remove all `as any` casting, add `src/utils/errors.ts`, add early returns in checkForUpdates & store actions | M3 | ORIGINAL_REQUEST R3 |
| 4 | Localization (i18n) | Extract hardcoded Russian text from SettingsView.tsx, GitHubIssueModal.tsx, UninstallerView.tsx into en/ru locale JSON files | M4 | ORIGINAL_REQUEST R4 |
| 5 | E2E Verification, Conventional Commits & Git Push | Verify build/tests, create atomic conventional commits, and push to remote origin/main | M5 | ORIGINAL_REQUEST R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: State Store Slices & Constants | Extract constants & mocks, split store into 7 Zustand slices, re-export useAppStore | None | DONE |
| 2 | M2: Code Quality & AI-Slop Cleanup | Remove redundant comments, category headers, section dividers across src/ | M1 | DONE |
| 3 | M3: Strict Typing & Error Handling | Create src/utils/errors.ts, replace `as any`, non-null assertions, apply early returns | M1 | DONE |
| 4 | M4: Localization i18n | Update en.json & ru.json, refactor UI components to use useTranslation & t() | M1 | IN_PROGRESS |
| 5 | M5: Verification, Commits & Push | Run full build, tsc check, node test suite, atomic Conventional Commits, push to remote | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Store ↔ Components
- Unified `useAppStore` hook export from `src/store/useAppStore.ts` combining all 7 slices
- Backward-compatible `useAppStore.getState()` access for non-hook callers

## Code Layout
- `src/constants/`: `optimizations.ts`
- `src/mocks/`: `audioMocks.ts`
- `src/utils/`: `errors.ts`
- `src/store/slices/`: `systemSlice.ts`, `updaterSlice.ts`, `uiSlice.ts`, `optimizationSlice.ts`, `audioSlice.ts`, `packageManagerSlice.ts`, `systemToolsSlice.ts`
- `src/store/useAppStore.ts`: Composition and re-export of Zustand store
- `src/i18n/locales/`: `en.json`, `ru.json`
- `src/components/`: `SettingsView.tsx`, `GitHubIssueModal.tsx`, etc.
- `src/views/`: `UninstallerView.tsx`, `ReleaseNotesModal.tsx`, etc.

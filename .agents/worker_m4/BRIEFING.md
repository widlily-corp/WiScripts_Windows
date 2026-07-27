# BRIEFING — 2026-07-27

## Mission
Implement Milestone 4 (Customization & Profiles): i18next localization (RU/EN), Settings view with persistent preferences (Zustand persist middleware, theme switching), Rust preset import/export with schema validation, UI preset import/export integration, and comprehensive Rust/Empirical tests.

## 🔒 My Identity
- Archetype: implementer, qa, specialist
- Roles: implementer, qa, specialist
- Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m4
- Original parent: 6c6f016c-dd55-496a-91cb-59ac4d72d307
- Milestone: Milestone 4 (Customization & Profiles)

## 🔒 Key Constraints
- CODE_ONLY network mode (no external web requests)
- Refined Minimal design style (dark `#08090A`, subtle 1px borders, clear typography)
- Genuine implementation with no hardcoded test shortcuts or dummy mocks
- Standardized Conventional Commits / Clean code standards
- Pass `cargo test --manifest-path src-tauri/Cargo.toml` 100%
- Pass `npx tsc --noEmit` and `npm run build` with 0 errors

## Current Parent
- Conversation ID: 6c6f016c-dd55-496a-91cb-59ac4d72d307
- Updated: 2026-07-27

## Task Summary
- **What to build**:
  1. i18next RU / EN Localization setup, locales `en.json` & `ru.json`, integration across all components.
  2. `SettingsView.tsx` with Dark/Light/System theme toggling, Zustand persist middleware for user settings (language, themeMode, dryRunMode, autoCreateRestorePoint, pollingIntervalMs).
  3. Preset import/export in Rust (`src-tauri/src/profiles/mod.rs`), IPC commands, and frontend UI in `PresetsView.tsx` (or modal/tab) with JSON file save/upload & schema validation.
  4. Rust unit tests for profiles & empirical TypeScript test script (`src/tests/m4_empirical.ts`).
- **Success criteria**: All tests pass, build clean, full functionality working.
- **Interface contracts**: PROJECT.md / Explorer handoff reports.

## Change Tracker
- **Files modified**: TBD
- **Build status**: Pending initial run
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pending
- **Lint status**: Clean expected
- **Tests added/modified**: Pending

## Loaded Skills
- None

## Artifact Index
- `.agents/worker_m4/BRIEFING.md` — Agent working state & briefing
- `.agents/worker_m4/progress.md` — Task progress & heartbeat
- `.agents/worker_m4/handoff.md` — Final completion report

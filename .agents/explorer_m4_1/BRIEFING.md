# BRIEFING — 2026-07-27T06:30:43Z

## Mission
Investigate and plan i18next and react-i18next localization (RU/EN) for WiScripts Windows React app.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: i18next Localization Explorer
- Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m4_1
- Original parent: 6c6f016c-dd55-496a-91cb-59ac4d72d307
- Milestone: Milestone 4

## 🔒 Key Constraints
- Read-only investigation — do NOT implement source code changes directly
- Output structured handoff report to handoff.md

## Current Parent
- Conversation ID: 6c6f016c-dd55-496a-91cb-59ac4d72d307
- Updated: 2026-07-27T06:30:43Z

## Investigation State
- **Explored paths**: `package.json`, `PROJECT.md`, `src/store/useAppStore.ts`, `src/components/Navigation.tsx`, `src/components/Dashboard.tsx`, `src/components/OptimizationView.tsx`, `src/components/StartupView.tsx`, `src/components/SchedulerView.tsx`, `src/components/RestorePointsView.tsx`, `src/components/SettingsView.tsx`, `src/components/ToastContainer.tsx`, `src/components/Header.tsx`
- **Key findings**:
  - `i18next`, `react-i18next`, and `i18next-browser-languagedetector` are required dependencies.
  - Locale files should be structured under `src/i18n/locales/en.json` and `src/i18n/locales/ru.json`.
  - Initializer `src/i18n/index.ts` configures i18next with fallback `ru`/`en` and detection.
  - Comprehensive translation key hierarchy designed for Navigation, Dashboard, Optimizations, Startup, Scheduler, Restore Points, Settings, Toast notifications, Header, and Common components.
  - Zustand store (`useAppStore.ts`) needs `language: 'ru' | 'en'` and `setLanguage` action, persisted in `partialize`.
  - SettingsView language selector widget designed with 🇷🇺 RU / 🇬🇧 EN options.
- **Unexplored areas**: None. Full scope analyzed.

## Key Decisions Made
- Default fallback language set to `ru` (primary userbase) with fallback to `en`.
- Persist language key `language` in Zustand store's `partialize` array under name `wiscripts-app-store`.
- Structure locale files as single nested JSON files (`en.json` and `ru.json`) for straightforward bundling and maintainability.

## Artifact Index
- ORIGINAL_REQUEST.md — Initial task request
- BRIEFING.md — Context and identity
- progress.md — Heartbeat and step tracking
- handoff.md — Final investigation report

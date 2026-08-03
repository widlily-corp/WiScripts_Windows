# Project: WiScripts Windows v0.9.7 Release & Bugfix

## Architecture
- Frontend: React 18, TypeScript, Tailwind CSS, Lucide icons, Zustand (7 slices), Vite bundler.
- Backend: Rust 2021, Tauri v1, Windows WinAPI, MMDeviceAPI, PolicyConfig.
- Target OS: Windows 10/11.

## Feature Inventory
| # | Feature / Requirement | Description | Milestone | Source |
|---|------------------------|-------------|-----------|--------|
| 1 | Frontend Bug Fixes | Fix `OptimizationView.tsx` string interpolation, delete `replace.py`, standardize `App.tsx` imports, i18n strings in `SystemCleaner.tsx` and `PresetsView.tsx` | M1 | Survey |
| 2 | Vite Chunk Optimization | Configure `manualChunks` in `vite.config.ts` to fix >500kB bundle warning | M1 | Survey |
| 3 | Backend Clippy & Warnings Fix | Fix unused variable in `storage/mod.rs` and 29 clippy warnings across 12 Rust files | M1 | Survey |
| 4 | Version Bump to 0.9.7 | Update version to 0.9.7 in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `updaterSlice.ts`, `Navigation.tsx`, `UpdateBanner.tsx`, Rust commands unit tests, empirical test assertions | M2 | Requirement R2 |
| 5 | Release Notes Generation | Create `RELEASE_NOTES_0.9.7.md` summarizing store refactoring, quality improvements, new features, and bug fixes | M3 | Requirement R3 |
| 6 | Version Control & Release | Commit changes with clean atomic Conventional Commits and push to remote repository | M4 | Requirement R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend & Frontend Fixes | R1: Fix TS/React UI bugs, Vite config, delete `replace.py`, fix Rust clippy & unused var warnings | None | DONE |
| M2 | Version Bump (0.9.7) | R2: Bump version across 8 config/source/test files | M1 | IN_PROGRESS |
| M3 | Release Notes Generation | R3: Generate `RELEASE_NOTES_0.9.7.md` based on git history | M2 | PLANNED |
| M4 | Version Control & Push | R4: Git commit with Conventional Commits and push to remote | M3 | PLANNED |

## Code Layout
- `src/` - React frontend application code
- `src/store/slices/` - Zustand store slices
- `src/components/` - UI components
- `src/views/` - Main application views
- `src/i18n/` - Localization files
- `src-tauri/` - Rust Tauri backend
- `src-tauri/src/` - Rust source code
- `RELEASE_NOTES_0.9.7.md` - Release notes document (to be created)

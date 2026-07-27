# Project: WiScripts Windows Roadmap Implementation

## Architecture
- Tech Stack: Tauri v2 (Rust backend), React + TypeScript + Tailwind CSS (Frontend), Vite build tool.
- Architecture: IPC bridge via `#[tauri::command]`, modular Rust backend services (`src-tauri/src/`), React modular frontend (`src/components/`, `src/tabs/`, `src/i18n/`).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Auto-Updater | tauri-plugin-updater integration, version API, update UI Toast/Banner | None | DONE |
| 2 | M2: Safety, Tools & Fixes | App icon fix, ODT registry bypass, auto restore points, restore point manager UI | M1 | DONE |
| 3 | M3: System Monitoring & Management | Dashboard real-time charts (CPU/RAM/Disk/Net), CPU/GPU temps, Startup Apps, Task Scheduler | M2 | DONE |
| 4 | M4: Customization & Profiles | i18next RU/EN, Settings tab (theme & defaults), JSON preset import/export | M3 | DONE |
| 5 | M5: Finalization & Release | Clean git, Conventional Commits, git push, release tag push | M1, M2, M3, M4 | IN_PROGRESS |

## Code Layout
- Backend: `src-tauri/`
  - `Cargo.toml`: Rust dependencies
  - `tauri.conf.json`: Application metadata & plugin config
  - `src/main.rs` / `src/lib.rs`: Entry point & command routing
  - `src/commands/` or `src/modules/`: Backend features
- Frontend: `src/`
  - `App.tsx`: Main dashboard and tab router
  - `components/`: Reusable UI components
  - `tabs/`: Section views (Dashboard, Diagnostics, Restore, Startup, Scheduler, Settings, etc.)
  - `i18n/`: Internationalization resources

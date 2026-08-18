# WiScripts Windows v1.0 Production Release Project

## Architecture
- **Backend**: Rust 2021 Edition + Tauri v2.0 desktop core. 25 modular domain engines handling Windows management, optimization rules, service management, process governor controls, audio COM routing, security autoruns, storage deduplication, and custom script execution.
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS. 21 functional views, Zustand state management, Refined Minimal aesthetic token system.
- **Online Script Library**: GitHub-backed repository structure in `scripts_lib/` with typed `manifest.json` catalog and SHA-256 integrity verification.
- **IPC Interface**: Tauri IPC command surface (`#[tauri::command]`) with async Tokio threading and camelCase serde mapping.

## Code Layout
```
c:\Users\Widlily\Documents\projects\WiScripts_Windows\
├── .github/
│   └── workflows/
│       └── release.yml
├── scripts_lib/
│   ├── manifest.json
│   ├── maintenance/
│   ├── network/
│   ├── security/
│   ├── performance/
│   └── diagnostics/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── commands/
│       ├── metrics/
│       ├── optimization/
│       ├── script_runner/
│       │   └── sync.rs
│       ├── storage/
│       └── winapi/
│           ├── registry.rs
│           └── services.rs
└── src/
    ├── App.tsx
    ├── components/
    │   ├── CommandPalette.tsx
    │   ├── Header.tsx
    │   ├── Navigation.tsx
    │   ├── SafetyModal.tsx
    │   └── ViewSkeleton.tsx
    ├── hooks/
    │   └── useTauriCommand.ts
    ├── store/
    ├── types/
    └── views/
        ├── OptimizationView.tsx
        ├── PresetsView.tsx
        ├── ScriptRunnerView.tsx
        ├── SystemCleaner.tsx
        └── UninstallerView.tsx
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `scripts_lib` Repo Structure | 15 categorized PowerShell scripts in 5 categories with SHA-256 | M1 (DONE) | R1 |
| 2 | `manifest.json` Typed Catalog | JSON catalog schema with script metadata, risk badges, hashes | M1 (DONE) | R1 |
| 3 | Backend Sync Engine | ETag / If-None-Match HTTP client, SHA-256 verification, local cache | M1 (DONE) | R1 |
| 4 | `ScriptRunnerView` Dual-Tab UI | Tabs "Editor & Terminal" and "Online Library", filtering, preview modal | M1 (DONE) | R1 |
| 5 | Win32 SCM Native Queries | Replace PowerShell `Get-Service` with `OpenSCManagerW` / `QueryServiceConfigW` | M2 | R2 |
| 6 | Storage 2-Stage Hashing | 4KB header hash + full SHA-256 with small-file direct reuse optimization | M2 | R2 |
| 7 | Uninstaller Chronological Sort | Multi-format millisecond date parsing for app uninstaller table | M2 | R2 |
| 8 | Zero-Warning Clippy Compliance | Fix collapsible `str::replace` in `src/metrics/mod.rs` for `-D warnings` | M2 | R2 |
| 9 | `React.lazy` Code-Splitting | Lazy-load heavy views with `Suspense` and `ViewSkeleton` (<150KB initial) | M3 | R3 |
| 10 | IPC Hook Optimization | `useTauriCommand` memoization via `useRef` and `getState()` to eliminate re-renders | M3 | R3 |
| 11 | Command Palette (`Ctrl + K`) | Global fuzzy search across 21 tabs, 74 tweaks, 15 scripts, and apps | M4 | R4 |
| 12 | Pre-Flight Safety Snapshot | Multi-tier safety engine: StateEngine delta JSON + VSS Restore Point | M4 | R4 |
| 13 | Windows 11 24H2 Tweaks | Registry/Policy tweaks: Disable Copilot, Recall AI, Start recommendations | M4 | R4 |
| 14 | `.wiscripts` Profile Import/Export | JSON profile schema for tweaks, ProFlow rules, and autorun preferences | M4 | R4 |
| 15 | Refined Minimal Design Tokens | Enforce semantic Tailwind tokens, eradicate hardcoded hex colors | M5 | R5 |
| 16 | WCAG 2.1 AA A11y Compliance | ARIA roles, labels, keyboard navigation (Space/Enter) in Cleaner & Tables | M5 | R5 |
| 17 | Tabular Numeric Typography | Apply `tabular-nums font-mono` to CPU/RAM gauges and telemetry | M5 | R5 |
| 18 | Version 1.0.0 Synchronization | Sync version in `package.json`, `Cargo.toml`, `tauri.conf.json`, `Navigation.tsx` | M6 | R6 |
| 19 | Release Notes & CI/CD Validation | Generate `RELEASE_NOTES_1.0.0.md` and validate `.github/workflows/release.yml` | M6 | R6 |
| 20 | Git History & Push | Atomic Conventional Commits (`feat:`, `fix:`, `refactor:`, `perf:`, `chore:`) and push | M6 | R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Online Script Library & Sync Engine | Features 1, 2, 3, 4 (R1) | none | DONE |
| M2 | Core Rust Backend Hardening | Features 5, 6, 7, 8 (R2) | none | DONE |
| M3 | Frontend Code Splitting & IPC Optimization | Features 9, 10 (R3) | none | PLANNED |
| M4 | Flagship Features & Win 11 24H2 Support | Features 11, 12, 13, 14 (R4) | M1, M2 | PLANNED |
| M5 | Design Tokens, A11y & Typography | Features 15, 16, 17 (R5) | M3, M4 | PLANNED |
| M6 | Release Engineering, Version Sync & Git Push | Features 18, 19, 20 (R6) | M1-M5 | PLANNED |

## Interface Contracts
### `scripts_lib` Sync Engine ↔ Frontend IPC
- `sync_scripts_library(force: bool)` -> `Result<ScriptsLibraryManifest, AppError>`
- `get_cached_scripts_library()` -> `Result<ScriptsLibraryManifest, AppError>`
- `read_library_script(script_id: String)` -> `Result<String, AppError>`

### Win32 SCM Services ↔ Optimization Engine
- `winapi::services::query_service_start_type(name: &str)` -> `Result<u32, String>` (2=Auto, 3=Manual, 4=Disabled)
- `winapi::services::is_service_disabled(name: &str)` -> `Result<bool, String>`
- `winapi::registry::get_dword(key: &str, val: &str)` -> `Result<u32, String>`

### StateEngine / System Restore ↔ Safety Pipeline
- `create_preflight_snapshot(description: String, rule_ids: Vec<String>)` -> `Result<PreflightSnapshotResult, AppError>`

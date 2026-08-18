# Release Notes — WiScripts Windows v1.2.0

We are thrilled to announce the release of **WiScripts Windows v1.2.0**! 🚀

This major release brings enterprise-grade security and reliability hardening to the **Online Scripts Engine**, fixes the **OTA Auto-Updater Release Notes pipeline**, introduces significant **frontend performance optimizations** (up to 20x faster preset execution), and achieves **100% localization parity** across English and Russian.

---

## 🌟 What's New in v1.2.0

### 1. 🛡️ Online Scripts Engine & PowerShell Hardening
- **Path Traversal & Sandbox Protection**:
  - Implemented strict path normalization in Rust backend (`src-tauri/src/script_runner/sync.rs`), systematically blocking directory traversal (`..`), null-byte injections, and unauthorized directory escapes.
- **Process Supervision & Live Cancellation**:
  - Added process tree tracking (`taskkill /F /T /PID`) and a 300-second execution timeout guard.
  - Implemented the `cancel_running_script` IPC command and frontend cancellation timer to gracefully terminate frozen background processes without leaving orphan handles.
- **Resilient Cache Auto-Pruning**:
  - Added automatic corruption detection and healing for local script caches, falling back immediately to the verified repository seed catalog.
- **PowerShell 5.1 & CP1251 AST Compatibility**:
  - Placed `param(...)` declarations strictly at line 1 in all automation scripts, removing backend header prepending that violated the PowerShell Abstract Syntax Tree.
  - Replaced non-ASCII characters within block comments `<# ... #>` and enforced binary **UTF-8 BOM** writing to prevent syntax corruption on Russian Windows systems.
- **Universal Multi-Language Windows Compatibility**:
  - Converted power management tools to standard `SCHEME_CURRENT` aliases and locale-agnostic regular expressions, eliminating crashes on localized Windows installations.
- **Dynamic Pathing & Safe Elevation**:
  - Replaced hardcoded filesystem paths with dynamic `$PSScriptRoot` resolution.
  - Upgraded 24 administrative scripts with soft privilege checks (`WindowsPrincipal`), exiting with code 1 instead of throwing red unhandled CLI exceptions.
- **Cryptographic Catalog Verification**:
  - Verified 100% SHA-256 hash matches for all 27 automation scripts in `scripts_lib/` against `manifest.json`.

---

### 2. 🔄 OTA Auto-Updater & Release Notes Pipeline Fix
- **Changelog Embedding in `latest.json`**:
  - Updated the GitHub Actions release pipeline (`release.yml`) to automatically extract the release notes from `RELEASE_NOTES_${VERSION}.md` and pass them into `tauri-action` via `releaseBody`. This guarantees that `latest.json` always contains the full changelog in its `"notes"` field.
- **Client-Side Fallback Fetcher**:
  - Enhanced `updaterSlice.ts` with a resilient fallback mechanism: if `latest.json` lacks release notes or is served without them, the application automatically queries the GitHub Releases API to fetch the full markdown changelog on the fly.
- **Enhanced Update Dialog UI**:
  - Polished `ReleaseNotesModal.tsx` and `UpdateBanner.tsx` with smooth typography, Markdown rendering, release date badges, and keyboard navigation.

---

### 3. ⚡ Frontend Architecture & Performance
- **Zustand Log Ring Buffer (Memory Leak Prevention)**:
  - Bounded the state logger in `src/store/slices/uiSlice.ts` to a 1,000-entry ring buffer, preventing unbounded memory growth during continuous diagnostic monitoring.
- **Atomic Preset Batching (14.8x – 20.1x Speedup)**:
  - Replaced sequential unbatched store dispatches in `PresetsView.tsx` with atomic `setOptimizations` batching, dramatically reducing UI re-renders and improving responsiveness.
- **CommandPalette IPC Alignment**:
  - Synchronized `create_restore_point` invocations with `dryRun` safety parameters.
  - Interactive Parameter Configuration Modal Dialog in `ScriptRunnerView.tsx`.

---

### 4. 🌐 100% Localization Parity (i18n)
- Completely synchronized all **1,173 keys** across English (`en.json`) and Russian (`ru.json`).
- Verified zero missing keys across all 78 UI components, diagnostic tools, and modals.

---

## 📊 Verification & Test Metrics

| Suite / Check | Result | Metrics |
| :--- | :---: | :--- |
| **Frontend Production Build** | **PASS** | 1,890 modules, 0 errors, 0 warnings, 70.59 KB gzip entry |
| **Rust Backend Tests** | **PASS** | 282/282 tests passed (206 unit + 76 integration) |
| **E2E Test Suite (Tier 1–4)** | **PASS** | 54/54 tests passed |
| **Master Regression Suite** | **PASS** | 21/21 tests passed |
| **i18n Key Parity** | **PASS** | 1,173/1,173 keys matched (0 missing) |
| **Script Hash Verification** | **PASS** | 27/27 SHA-256 hashes matched |

---

## 📦 Release Artifacts & Compatibility
- **Supported Operating Systems**: Windows 10 (1809+) & Windows 11 (all versions including 23H2 / 24H2).
- **Architecture**: x86_64 (64-bit native).
- **Distributions**:
  - `WiScripts_1.2.0_x64-setup.exe` (NSIS Installer with auto-updater support)
  - `WiScripts_1.2.0_x64_Portable.zip` (Standalone portable package)

---

## 🛠️ Commit Log Highlights
- `feat(updater): auto-inject release notes into tauri-action and add GitHub API fallback`
- `fix(scripts-lib): harden PowerShell 5.1 AST param() positioning and UTF-8 BOM encoding`
- `fix(backend): add path traversal sandbox protection and process supervision`
- `perf(frontend): introduce Zustand log ring buffer and atomic preset batching`
- `chore(release): bump version to 1.2.0 and publish release documentation`

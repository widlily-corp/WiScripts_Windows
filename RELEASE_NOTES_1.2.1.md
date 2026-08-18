# Release Notes — WiScripts Windows v1.2.1

We are pleased to announce the release of **WiScripts Windows v1.2.1** (Hotfix Release)! 🚀

This update delivers an immediate hotfix for the **Online Scripts Integrity Engine**, ensuring cross-platform SHA-256 validation across all Windows and network environments, alongside all features and optimizations from v1.2.0.

---

## 🌟 What's New in v1.2.1

### 1. 🛡️ Hotfix: Resilient Cross-Platform SHA-256 Script Verification
- **Cross-Platform Line Ending & BOM Normalization**:
  - Implemented `verify_script_hash` in the Rust sync engine (`src-tauri/src/script_runner/sync.rs`), supporting direct binary verification, CRLF/LF line ending normalization, and UTF-8 BOM awareness.
  - Eliminated false integrity rejection errors (such as `SHA-256 integrity verification failed for script 'maint-clear-wu-cache'`) when scripts are downloaded across Git / GitHub / CDN environments.
- **Corrupt / Stale Cache Auto-Purging**:
  - The sync engine automatically detects and purges outdated or mismatched cached script files, re-fetching and validating verified copies seamlessly.
- **Strict Line Endings Repository Guard (`.gitattributes`)**:
  - Added repository-level `.gitattributes` to lock all PowerShell `.ps1` automation scripts to Windows `CRLF` encoding permanently.

---

### 2. 🛡️ Online Scripts Engine & PowerShell Hardening (from v1.2.0)
- **Path Traversal & Sandbox Protection**: Strict path normalization in Rust backend (`sync.rs`), systematically blocking directory traversal (`..`), null-byte injections, and unauthorized directory escapes.
- **Process Supervision & Live Cancellation**: Process tree tracking (`taskkill /F /T /PID`), 300-second execution timeout guard, and `cancel_running_script` IPC command.
- **PowerShell 5.1 & CP1251 AST Compatibility**: Placed `param(...)` declarations strictly at line 1 in all automation scripts; removed non-ASCII characters from `<# ... #>` comments.
- **Universal Multi-Language Windows Compatibility**: `SCHEME_CURRENT` power scheme targeting and locale-agnostic regular expressions.
- **Dynamic Pathing & Safe Elevation**: Dynamic `$PSScriptRoot` resolution and soft privilege checks (`WindowsPrincipal`) across 24 administrative scripts.

---

### 3. 🔄 OTA Auto-Updater & Release Notes Pipeline
- **Automated Changelog Injection**: GitHub Actions pipeline automatically extracts `RELEASE_NOTES_${VERSION}.md` and passes it to `tauri-action` `releaseBody`, embedding the changelog directly into `latest.json`.
- **Client-Side Fallback Fetcher**: Dynamic GitHub API fallback queries in `updaterSlice.ts` to ensure release notes always render.

---

### 4. ⚡ Frontend Architecture, Zustand & i18n
- **Memory Leak Protection**: Bounded Zustand `logs` array to a 1,000-entry ring buffer.
- **Atomic Preset Batching**: 14.8x – 20.1x faster preset application in `PresetsView.tsx`.
- **100% Localization Parity**: Full parity across all 1,173 keys in English (`en.json`) and Russian (`ru.json`).

---

## 📦 Release Artifacts & Compatibility
- **Supported Operating Systems**: Windows 10 (1809+) & Windows 11 (all versions including 23H2 / 24H2).
- **Architecture**: x86_64 (64-bit native).
- **Distributions**:
  - `WiScripts_1.2.1_x64-setup.exe` (NSIS Installer with auto-updater support)
  - `WiScripts_1.2.1_x64_Portable.zip` (Standalone portable zero-install package)

---

## 🛠️ Commit Log Highlights
- `fix(sync): resilient cross-platform script hash normalization and add gitattributes`
- `feat(updater): auto-inject release notes into tauri-action and add GitHub API fallback`
- `fix(scripts-lib): harden PowerShell 5.1 AST param() positioning and UTF-8 BOM encoding`
- `chore(release): bump version to 1.2.1 and publish hotfix release notes`

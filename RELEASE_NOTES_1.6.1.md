# Release Notes — WiScripts Windows v1.6.1

We are pleased to announce **WiScripts Windows v1.6.1** (PowerShell Runtime Parser Fix & Seamless OTA Update)! 🚀🛡️

This critical patch release resolves a parser encoding defect that affected PowerShell scripts starting with `param()` in localized environments, sanitizes UTF-8 BOM handling across both Rust backend execution bridges and the frontend state engine, and ensures that all users—including those who updated to v1.6.0—receive a seamless 1-click update via the built-in OTA Auto-Updater.

---

## 🌟 What's Fixed in v1.6.1

### 1. 🛡️ Critical Fix: Elimination of Duplicate UTF-8 BOM (`?param()` Parser Crash)
- **Root Cause & Behavior**:
  - When library scripts were loaded from `scripts_lib/`, their UTF-8 BOM (`0xEF, 0xBB, 0xBF`) was converted by Rust into the Unicode codepoint `\u{feff}`.
  - When preparing temporary execution files in `%LOCALAPPDATA%\WiScripts\TempScripts\`, the script runner prepended `[0xEF, 0xBB, 0xBF]` to `script_content.as_bytes()`.
  - Because `script_content` already began with `\u{feff}`, the output file contained **two consecutive UTF-8 BOMs** (`0xEF 0xBB 0xBF 0xEF 0xBB 0xBF`).
  - Windows PowerShell consumed the first BOM as the file encoding and decoded the second BOM as a character preceding `param()`. On localized Windows systems, this character was rendered as `?` (`?param()`), which PowerShell parsed as the built-in `Where-Object` alias, triggering a fatal syntax error: `После '(' ожидалось выражение` / `An expression was expected after '('` (`ExpectedExpression`).
- **Resolution**:
  - **Rust Runner (`src-tauri/src/script_runner/mod.rs`)**: Strips leading `\u{feff}` characters (`trim_start_matches('\u{feff}')`) in both standard execution (`execute_custom_script`) and elevated UAC execution (`execute_script_elevated_bridge`) before prepending the single UTF-8 BOM.
  - **Sync Engine (`src-tauri/src/script_runner/sync.rs`)**: Sanitizes decoded script strings in `read_library_script` across all cached and local read paths.
  - **Frontend Slice (`src/store/slices/scriptRunnerSlice.ts`)**: Applies regex sanitization (`replace(/^\uFEFF+/, '')`) upon loading scripts into the editor, preview pane, parameter modal, and before transmitting execution requests to Tauri.
  - **AST Verification**: Verified with `[System.Management.Automation.Language.Parser]::ParseFile` across all 45 scripts in `scripts_lib/` with 100% pass rate (0 syntax or parser errors).

---

### 2. 🔄 Seamless OTA Auto-Updater Compatibility
- Bumps application version to `1.6.1` across all 7 manifests (`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `src/store/slices/updaterSlice.ts`, and `scripts_lib/manifest.json`).
- Enables users already on v1.6.0 as well as those on v1.5.1 and earlier to automatically receive the update in one click through the built-in `@tauri-apps/plugin-updater`.

---

## 🧪 Verification & Quality Metrics

- **Rust Backend**: 258/258 unit and integration tests passed (`cargo test --lib`).
- **Frontend & E2E**: 142/142 tests passed (`npm test`).
- **Production Build**: Clean TypeScript compilation and Vite bundling (`npm run build`).
- **Empirical AST Verification**: All 45 scripts cataloged in `scripts_lib/manifest.json` passed AST validation.

---

## 📦 Release Artifacts

- **Installer**: `WiScripts_1.6.1_x64-setup.exe` (NSIS Installer with OTA Auto-Updater support)
- **Manifest**: `latest.json` (Cryptographically signed with Minisign)
- **Signature**: `WiScripts_1.6.1_x64-setup.exe.sig`

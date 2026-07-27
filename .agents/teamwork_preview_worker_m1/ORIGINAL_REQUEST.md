## 2026-07-27T01:06:57Z
You are Worker 1 for Milestone 1 (Auto-Updater Integration & App Icon Fix).
Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_worker_m1\

Task:
Implement the complete Auto-Updater Integration (R1) and App Icon Display Fix (part of R2) for WiScripts Windows based on Explorer reports in:
- `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_explorer_m1_1\handoff.md`
- `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_explorer_m1_2\handoff.md`
- `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_explorer_m1_3\handoff.md`

Specific Steps to Perform:
1. **Backend & App Icon Fixes**:
   - Add `tauri-plugin-updater = "2.0.0"` to `src-tauri/Cargo.toml`.
   - Update `src-tauri/src/lib.rs` to register `tauri_plugin_updater::Builder::new().build()`.
   - Expose dynamic app version IPC command `get_app_version` via `#[tauri::command]` returning string from `app_handle.package_info().version`.
   - Fix `src-tauri/build.rs`: Remove or correct the logic that overwrites `icons/icon.ico` with 48 dummy bytes. Ensure valid PNG/ICO assets exist in `icons/` folder and valid ICO is built.
   - Update `src-tauri/capabilities/default.json` to include `"updater:default"`.
   - Update `src-tauri/tauri.conf.json` to configure `"plugins": { "updater": { "endpoints": ["https://github.com/widlily/WiScripts_Windows/releases/latest/download/latest.json"] } }`, set `"createUpdaterArtifacts": true`, set icon paths in `"bundle": { "icon": [...] }`, and set `"icon": "icons/icon.ico"` in `windows[0]`.

2. **Frontend Dependencies & Updater UI**:
   - Add `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` to `package.json`.
   - Update Zustand store (`src/store/useStore.ts` or equivalent) to store `appVersion`, `updateStatus` (`'idle' | 'checking' | 'available' | 'upToDate' | 'downloading' | 'ready' | 'error'`), `updateInfo`, `updateProgress`, `toasts`, `addToast`, `dismissToast`, `checkForUpdates`, and `downloadAndInstallUpdate`.
   - Create notification components (`ToastContainer.tsx`, `UpdateBanner.tsx`).
   - Integrate dynamic app version reading from `get_app_version` (or `@tauri-apps/api/app`) in UI components (`Navigation.tsx`, `SettingsView.tsx`).

3. **Build & Test Verification**:
   - Run `npx tsc --noEmit` and `npm run build` to verify frontend compilation.
   - Run `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml` to verify backend compilation and unit tests.
   - Document commands executed and build/test outputs in your handoff report.

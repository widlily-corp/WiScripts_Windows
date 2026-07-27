# Original User Request

## 2026-07-27T10:17:54Z

Fix the Tauri auto-updater workflow by migrating the GitHub Actions release pipeline to use `tauri-apps/tauri-action@v0`. This will ensure `latest.json` and signature artifacts are automatically generated and attached to the GitHub release, resolving the 404 error.

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: demo

## Requirements

### R1. Migrate to tauri-action
Refactor `.github/workflows/release.yml`. Remove the manual `npm run tauri build` step and the `softprops/action-gh-release@v2` step. Replace them with the official `tauri-apps/tauri-action@v0` which natively builds the app and handles GitHub releases.

### R2. Updater Artifacts & Secrets
Ensure the new action is properly configured to sign the binaries and generate updater artifacts (`latest.json`). It must receive the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets.

## Acceptance Criteria

### Workflow Refactoring
- [ ] The `release.yml` file uses `uses: tauri-apps/tauri-action@v0` for the build and release step.
- [ ] The `softprops/action-gh-release` step is completely removed.
- [ ] The required signing secrets are passed to the `tauri-action` step under `env`.

## Follow-up — 2026-07-27T11:24:46Z

Fix execution bugs causing the UI to hang (e.g., ActionConfirmationModal stuck on "Processing...") and ensure all backend commands execute correctly. Additionally, implement new system utility features: Application Uninstaller (via registry UninstallString), System Cleaner (temp/cache), Duplicate File Finder, and Large File Finder.

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: demo

## Requirements

### R1. Fix Execution & UI Hangs
Investigate and resolve the issue where the `ActionConfirmationModal` gets stuck on "Processing..." and ensure that all frontend commands properly trigger their backend Rust/WinAPI counterparts without hanging or failing silently. Ensure errors from Rust are properly propagated to the UI.

### R2. Application Uninstaller
Read Windows Registry (HKLM and HKCU Uninstall keys) to find installed apps and their `UninstallString`. Provide a UI to list them and execute them in standard GUI mode so the user can interact.

### R3. System Cleaner & Storage Utilities
Implement backend logic and frontend UI for:
1. **System Cleaner**: Safely scan and clean temporary files (`%TEMP%`) and Windows update leftovers.
2. **Storage Analysis**: Find duplicate files (by SHA-256 hash/size) and identify large files taking up disk space, restricted to the current User's profile directory (`%USERPROFILE%`).

## Acceptance Criteria

### Execution Fixes
- [ ] Clicking "Confirm" in `ActionConfirmationModal` successfully executes the backend command, and the modal closes or updates state upon completion/error (no infinite "Processing...").

### App Uninstaller
- [ ] A Rust unit test successfully reads the registry and returns a list of at least 5 installed applications with valid `UninstallString`s.
- [ ] Triggering the uninstaller from the UI correctly launches the native uninstaller process.

### Cleaner & Storage
- [ ] A Rust unit test can scan a mock directory, correctly calculating total size of "temp" files.
- [ ] A Rust unit test can scan a mock directory with duplicate files and correctly identify them by matching hashes.
- [ ] The frontend displays the results from the storage analysis and cleaner commands correctly.

## Follow-up — 2026-07-27T11:31:59Z

After completing all requirements (R1-R3), MANDATORILY create a new release:
1. Commit all changes using Conventional Commits.
2. Update the version in `package.json` and `src-tauri/tauri.conf.json` (bump to next minor/patch version).
3. Push changes to git remote (`git push`).
4. Create and push a new git release tag (e.g. `v...`) to trigger the auto-updater release workflow.


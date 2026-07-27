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

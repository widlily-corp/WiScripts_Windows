# Task Context

## Overview
Migrate Tauri release pipeline in `.github/workflows/release.yml` from manual `npm run tauri build` + `softprops/action-gh-release@v2` to `tauri-apps/tauri-action@v0`.

## Target Requirements
1. Use `tauri-apps/tauri-action@v0` for build and release step.
2. Remove manual `npm run tauri build` step.
3. Remove `softprops/action-gh-release@v2` step.
4. Configure `env` for `tauri-apps/tauri-action@v0` with:
   - `TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}`
   - `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (or standard secret token)

## Target Files
- `.github/workflows/release.yml`

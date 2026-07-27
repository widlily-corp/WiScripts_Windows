# Project: Tauri Auto-Updater Release Workflow Migration

## Architecture
- GitHub Actions Workflow (`.github/workflows/release.yml`) for building Tauri app on Windows and creating GitHub release with signing keys and `latest.json`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Release Workflow Migration | Refactor `.github/workflows/release.yml` to use `tauri-apps/tauri-action@v0` with signing secrets, removing manual build and `softprops/action-gh-release@v2`. | none | IN_PROGRESS |

## Interface Contracts
- Input: GitHub release tag event or workflow trigger.
- Environment Secrets: `GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Outputs: Built Windows binary installer, signatures, and `latest.json` published to GitHub Release via `tauri-action@v0`.

## Code Layout
- `.github/workflows/release.yml`

# Changes Summary

## Files Modified

- `.github/workflows/release.yml`
  - Replaced manual `npm run tauri build` step and `softprops/action-gh-release@v2` step with single `tauri-apps/tauri-action@v0` step.
  - Configured `env` variables `GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
  - Configured `with` parameters `tagName: v__VERSION__`, `releaseName: 'WiScripts v__VERSION__'`, `releaseDraft: false`, and `prerelease: false`.

## Rationale & Design Decisions
- Consolidates Tauri build and GitHub release creation into official `tauri-apps/tauri-action@v0`.
- Simplifies CI workflow by removing manual artifact globbing and dedicated release action.

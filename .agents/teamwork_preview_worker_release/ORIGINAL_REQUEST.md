## 2026-07-27T10:19:48Z
You are Worker (teamwork_preview_worker).
Your working directory is `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_worker_release`.
Please create your working directory if needed.

Task Objective:
Refactor `.github/workflows/release.yml` in the project root to migrate the release workflow to `tauri-apps/tauri-action@v0`.

Requirements:
1. Replace manual `npm run tauri build` step and `softprops/action-gh-release@v2` step with `tauri-apps/tauri-action@v0`.
2. Configure `tauri-apps/tauri-action@v0` to receive `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` under `env` alongside `GITHUB_TOKEN`.
3. The resulting `.github/workflows/release.yml` must match the following specification:

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  release:
    runs-on: windows-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Install frontend dependencies
        run: npm install

      - name: Build and Publish Tauri App
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'WiScripts v__VERSION__'
          releaseDraft: false
          prerelease: false
```

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Output & Verification:
Write `changes.md` and `handoff.md` in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_worker_release`.
When complete, notify parent (conversation ID: `d02c9092-d66b-4740-9102-f4088b4ad62f`) via `send_message`.

# Tauri Release Workflow Migration Analysis

## Overview
This document analyzes `.github/workflows/release.yml` and project configuration (`package.json`, `src-tauri/tauri.conf.json`) to provide an exact migration plan replacing manual `npm run tauri build` and `softprops/action-gh-release@v2` with `tauri-apps/tauri-action@v0`.

---

## Codebase Context & Configuration Inspection

### 1. `package.json`
- **Version**: `"0.4.1"`
- **Tauri CLI**: `"@tauri-apps/cli": "^2.0.0"`
- **Script**: `"tauri": "tauri"`

### 2. `src-tauri/tauri.conf.json`
- **Schema**: `https://schema.tauri.app/config/2` (Tauri v2)
- **Version**: `"0.4.1"`
- **Bundle Targets**: `["nsis"]`
- **Updater Artifacts**: `"createUpdaterArtifacts": true`
- **Updater Plugin Endpoint**: `"https://github.com/widlily-corp/WiScripts_Windows/releases/latest/download/latest.json"`

---

## Current Release Workflow Analysis (`.github/workflows/release.yml`)

```yaml
 1: name: Release
 2: on:
 3:   push:
 4:     tags:
 5:       - 'v*'
 6:   workflow_dispatch:
 7: 
 8: jobs:
 9:   release:
10:     runs-on: windows-latest
11:     permissions:
12:       contents: write
13: 
14:     steps:
15:       - uses: actions/checkout@v4
16: 
17:       - name: Install Node.js
18:         uses: actions/setup-node@v4
19:         with:
20:           node-version: 20
21: 
22:       - name: Install Rust stable
23:         uses: dtolnay/rust-toolchain@stable
24: 
25:       - name: Install frontend dependencies
26:         run: npm install
27: 
28:       - name: Build Tauri app
29:         run: npm run tauri build
30:         env:
31:           TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
32:           TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
33: 
34:       - name: Create GitHub Release
35:         uses: softprops/action-gh-release@v2
36:         with:
37:           draft: false
38:           prerelease: false
39:           generate_release_notes: true
40:           files: |
41:             src-tauri/target/release/bundle/nsis/*.exe
42:             src-tauri/target/release/bundle/nsis/*.zip
43:             src-tauri/target/release/bundle/nsis/*.sig
44:             src-tauri/target/release/bundle/nsis/latest.json
45:         env:
46:           GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Limitations of Current Workflow
1. **Redundant Build & Upload Steps**: Lines 28–33 execute `npm run tauri build`, and lines 34–46 manually collect build artifacts using glob paths.
2. **Fragile Path Hardcoding**: The glob patterns in lines 40–44 (`src-tauri/target/release/bundle/nsis/*`) break if output directories or bundle targets change.
3. **No Automatic Updater Manifest Generation**: `softprops/action-gh-release@v2` requires `latest.json` to be pre-generated in specific paths, whereas `tauri-action` handles signing, building, and updater release manifest publishing atomically.

---

## Migration Recommendation for `.github/workflows/release.yml`

Replace lines 28–46 with a single `tauri-apps/tauri-action@v0` step.

### Exact Line-by-Line Recommendation

#### Before (Lines 28–46):
```yaml
      - name: Build Tauri app
        run: npm run tauri build
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          draft: false
          prerelease: false
          generate_release_notes: true
          files: |
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/nsis/*.zip
            src-tauri/target/release/bundle/nsis/*.sig
            src-tauri/target/release/bundle/nsis/latest.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### After (Replacing Lines 28–46):
```yaml
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

---

## Complete Proposed `.github/workflows/release.yml`

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

---

## Key Benefits of Migration
1. **Full Environment Variable Alignment**: `GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are all bound under `env` for `tauri-apps/tauri-action@v0`.
2. **Native Tauri v2 Support**: `tauri-action@v0` natively detects Tauri v2 projects (`tauri.conf.json`), builds NSIS installers and updater artifacts (`.sig`, `.nsis.zip`), and attaches them to the release.
3. **Dynamic Tagging**: `tagName: v__VERSION__` dynamically reads `0.4.1` from `tauri.conf.json` / `package.json`, formatting tag as `v0.4.1`.

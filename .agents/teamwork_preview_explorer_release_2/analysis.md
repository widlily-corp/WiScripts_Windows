# GitHub Actions Release Workflow Analysis & Migration Guide for `tauri-apps/tauri-action@v0`

## Executive Summary
This analysis evaluates `.github/workflows/release.yml` for **WiScripts Windows** and outlines the migration from manual build/release steps (`npm run tauri build` + `softprops/action-gh-release@v2`) to the official `tauri-apps/tauri-action@v0`.

By standardizing on `tauri-apps/tauri-action@v0`, the workflow gains:
- Automatic asset discovery and upload (eliminates hardcoded NSIS/updater glob paths).
- Integrated signing and updater manifest (`latest.json`) generation for Tauri v2.
- Streamlined environment and permission management.

---

## Codebase Inspection & Context

### 1. Project Configuration Files
- **`package.json`**:
  - Version: `0.4.1`
  - CLI: `@tauri-apps/cli`: `^2.0.0`
  - Node version required: `20`
- **`src-tauri/tauri.conf.json`**:
  - Schema: `https://schema.tauri.app/config/2` (Tauri v2)
  - Version: `0.4.1`
  - Bundle targets: `["nsis"]`
  - Updater config: `createUpdaterArtifacts: true`, endpoint configured for GitHub releases.

### 2. Existing Workflow (`.github/workflows/release.yml`)
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

---

## 1. Steps to Remove

| Step Name in Existing Workflow | Lines | Reason for Removal |
|---|---|---|
| `Build Tauri app` (`run: npm run tauri build`) | Lines 28–33 | **Redundant Build Invocation**: `tauri-apps/tauri-action@v0` handles building the application automatically (running `beforeBuildCommand` and calling Tauri CLI build under the hood). Pre-building causes redundant compilation and slows down workflow execution. |
| `Create GitHub Release` (`uses: softprops/action-gh-release@v2`) | Lines 34–46 | **Fragile File Globs & Lack of Tauri Updater Integration**: `softprops/action-gh-release` relies on explicit, brittle glob paths (`src-tauri/target/release/bundle/nsis/*.exe`, etc.). It cannot automatically discover multi-target assets or generate formatted updater manifests (`latest.json`). `tauri-action` replaces this entire step natively. |

---

## 2. `tauri-apps/tauri-action@v0` Configuration Breakdown

### Required Environment Variables (`env:`)
- **`GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`**:
  - *Purpose*: Grants `tauri-action` authorization to create releases, edit release descriptions, and upload build artifacts via GitHub REST API.
- **`TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}`**:
  - *Purpose*: Private key used by Tauri CLI to sign application bundles and generate `.sig` files and `latest.json` updater manifest.
- **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}`**:
  - *Purpose*: Password / passphrase protecting the private key.

### Action Parameters (`with:`)
- **`tagName: v__VERSION__`**:
  - *Behavior*: Uses `v__VERSION__` where `__VERSION__` is dynamically populated from `package.json` or `tauri.conf.json` (e.g. `v0.4.1`). If triggered by pushing a tag (e.g. `v0.4.1`), `tauri-action` binds to that tag.
- **`releaseName: 'WiScripts v__VERSION__'`**:
  - *Behavior*: Sets the title of the GitHub release.
- **`releaseDraft: false`**:
  - *Behavior*: Ensures the release is published immediately upon build completion.
- **`prerelease: false`**:
  - *Behavior*: Marks the release as a production release (not a pre-release).

### Trigger Conditions (`on:`)
- **`push.tags: ['v*']`**: Automatically triggers when tags like `v0.4.1` are pushed.
- **`workflow_dispatch`**: Allows manual trigger from GitHub Actions console.

---

## 3. Permissions Verification

- **`permissions: contents: write`**:
  - Required at job level so `GITHUB_TOKEN` has `write` scope for repository contents and releases.
  - Without `contents: write`, release creation will fail with `403 Forbidden`.

---

## Exact Proposed YAML Block for `.github/workflows/release.yml`

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

## Summary of Changes
1. **Removed**: Manual build step `npm run tauri build` (lines 28–33).
2. **Removed**: `softprops/action-gh-release@v2` step and hardcoded glob patterns (lines 34–46).
3. **Added**: Single `tauri-apps/tauri-action@v0` step combining building, signing, updater asset generation, and release publishing.

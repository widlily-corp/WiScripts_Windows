# GitHub Actions Release Workflow Analysis & Overhaul Specification

**Author**: Explorer 3 (`teamwork_preview_explorer`)  
**Date**: 2026-07-27  
**Target Repository**: `WiScripts_Windows`  
**Target Workflow File**: `.github/workflows/release.yml`  

---

## 1. Executive Summary & Audit of Current Workflow

The existing GitHub Actions release workflow located at `.github/workflows/release.yml` automates the release build process for the WiScripts Windows desktop application when a version tag (e.g. `v0.4.1`) is pushed or when manually dispatched.

### Current Workflow File Content (`.github/workflows/release.yml`):
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

### Key Audit Findings & Weaknesses:
1. **Manual Build & Release Separation**: The workflow currently splits building (`npm run tauri build`) and uploading artifacts (`softprops/action-gh-release@v2`). While functional, it requires explicit and fragile file pattern matching (`src-tauri/target/release/bundle/nsis/*`).
2. **Absence of Dependency & Build Caching**:
   - Node modules are not cached (`setup-node` is missing `cache: 'npm'`).
   - Cargo registry, index, and target compilation artifacts are not cached, causing total build times to exceed 12–18 minutes per run on `windows-latest`.
3. **`npm install` vs `npm ci`**: CI workflows should utilize `npm ci` rather than `npm install` to guarantee strict adherence to `package-lock.json` and prevent unintended lockfile mutation.
4. **Fragile Asset Globbing**: Hardcoded file paths in `softprops/action-gh-release` (such as `src-tauri/target/release/bundle/nsis/*.sig`) will fail the workflow if signature generation is skipped or if path conventions shift in future Tauri minor updates.
5. **No Native Tauri Action Integration**: `tauri-apps/tauri-action@v0` is the official standard action maintained by the Tauri team. It handles build, signing, version substitution (`v__VERSION__`), installer bundle collection, and release creation in a unified step.

---

## 2. Comprehensive Prerequisites & Edge Cases Analysis

### A. Tauri v2 Configuration & Signing Requirements
- **Configuration Check**: `src-tauri/tauri.conf.json` specifies:
  - `"bundle": { "active": true, "targets": ["nsis"], "createUpdaterArtifacts": true }`
  - `"plugins": { "updater": { "pubkey": "...", "endpoints": [...] } }`
- **Signing Key Secret**: When `createUpdaterArtifacts` is set to `true`, Tauri v2 requires `TAURI_SIGNING_PRIVATE_KEY` during `tauri build`. If this secret is missing or empty in GitHub repository settings, `tauri build` fails with an error stating that signing keys are unconfigured.
- **Key Password**: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` must also be supplied (even if empty, passed via `${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}`).

### B. Rust Toolchain & Target Prerequisites
- **Runner**: `windows-latest` default target is `x86_64-pc-windows-msvc`.
- **Target Specification**: Explicitly declaring `targets: x86_64-pc-windows-msvc` in `dtolnay/rust-toolchain@stable` ensures toolchain completeness.
- **Cargo Caching**: Integrating `swatinem/rust-cache@v2` dramatically cuts down compilation time by caching crate dependencies across workflow runs.

### C. Node.js Setup & Package Management
- **Node Version**: 20 LTS.
- **Cache Strategy**: Add `cache: 'npm'` to `actions/setup-node@v4`.
- **Deterministic Installs**: Use `npm ci` to install exact dependencies listed in `package-lock.json`.

### D. GitHub Release & Permission Model
- **Permissions**: `permissions: { contents: write }` must be set at the job or workflow level to grant the `GITHUB_TOKEN` permission to create releases and upload release assets.
- **Workflow Dispatch Handling**: When manually triggered via `workflow_dispatch`, `github.ref` is a branch ref (e.g. `refs/heads/main`), not a tag ref. Using `tagName: v__VERSION__` in `tauri-action` allows `tauri-action` to automatically extract the app version from `tauri.conf.json` (e.g., `0.4.1`) and format the tag as `v0.4.1`.

---

## 3. Recommended Updated `release.yml` Architecture

Below is the complete, production-ready specification for `.github/workflows/release.yml` using `tauri-apps/tauri-action@v0`:

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
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc

      - name: Cache Rust build dependencies
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install frontend dependencies
        run: npm ci

      - name: Build and Release Tauri App
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'WiScripts v__VERSION__'
          releaseBody: 'Release binaries and updater artifacts for WiScripts Windows.'
          releaseDraft: false
          prerelease: false
```

---

## 4. Potential Pitfalls & Syntax Issues in GitHub Actions YAML

1. **Unquoted Glob Patterns in Triggers**:
   - *Issue*: Writing `tags: - v*` without quotes can trigger YAML parsing errors in some parsers.
   - *Fix*: Always quote string globs: `tags: - 'v*'`.
2. **Incorrect Secret Variable Names**:
   - *Issue*: Environment variables in `tauri-action` must match `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` exactly in upper case.
   - *Fix*: Ensure exact casing in `env:` block.
3. **Missing `GITHUB_TOKEN` Environment Variable**:
   - *Issue*: `tauri-apps/tauri-action@v0` requires `GITHUB_TOKEN` in `env:` to publish release assets via the GitHub API. Omitting it causes `401 Unauthorized` or `403 Forbidden` API errors.
   - *Fix*: Declare `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` inside `env:`.
4. **Indentation and Mapping Types**:
   - *Issue*: Mixing tab spaces instead of two spaces or invalid indentation under `with:` or `env:`.
   - *Fix*: Enforce strict 2-space indentation.
5. **Cache Invalidation Issues**:
   - *Issue*: Incorrect `workspaces` key in `swatinem/rust-cache@v2` when Tauri project resides in `src-tauri`.
   - *Fix*: Specify `workspaces: './src-tauri -> target'` so `rust-cache` tracks `src-tauri/Cargo.lock`.
6. **Missing Repository Secrets**:
   - *Issue*: If `TAURI_SIGNING_PRIVATE_KEY` is not populated in repository secrets, release builds will fail when creating updater bundles.
   - *Fix*: Ensure repository admins configure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` under `Settings -> Secrets and variables -> Actions`.

---

## 5. Verification Strategy

To verify this workflow setup:
1. Validate YAML syntax using `actionlint` or standard YAML linter.
2. Confirm repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` exist in repository settings.
3. Perform a test run via `workflow_dispatch` or by pushing a test tag `v0.4.1-test`.

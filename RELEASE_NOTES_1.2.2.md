# Release Notes — WiScripts Windows v1.2.2

We are pleased to announce the release of **WiScripts Windows v1.2.2** (Engine & Compiler Hardening Release)! 🚀

This release focuses on comprehensive code quality hardening, Rust compiler and Clippy zero-warning compliance across all targets, test suite robustness, and refined codebase stability.

---

## 🌟 What's New in v1.2.2

### 1. 🦀 Rust Backend & Clippy Zero-Warning Hardening
- **Strict Clippy Compliance**:
  - Enforced zero-warning policy (`-D warnings`) across all crate targets and test suites.
  - Eliminated `suspicious_open_options` in cleaner module by adding explicit truncate behavior.
  - Replaced redundant `len() > 0` checks with clear, idiomatic `!is_empty()` calls in governor and metrics collectors.
  - Optimized vector allocations to fixed stack arrays in uninstaller test assertions and storage duplicate benchmarks.
  - Cleaned up module structure and eliminated module inception warnings in WinAPI registry and services test modules.
  - Replaced dynamic string formatting within `expect()` calls with lightweight lazy panic closures (`unwrap_or_else`).

### 2. 🧪 Test Suite & Verification Matrix
- **Unit & Integration Test Parity**:
  - 100% pass rate across all 206 Rust core library tests (`cargo test --lib`).
  - 100% pass rate across all Rust adversarial empirical suites (`m1_challenger_adversarial_empirical_suite` and `m2_storage_duplicate_empirical_stress_tests`).
  - 100% pass rate across all 54 E2E test cases across 4 testing tiers (`npm test`).

### 3. ⚡ Core Engine & Stability Refinements
- **Type Safety & Build Integrity**:
  - Clean TypeScript compilation with zero type errors.
  - Synchronized version metadata across all project manifests (`package.json`, `Cargo.toml`, `tauri.conf.json`, and Zustand store).

---

## 📦 Release Artifacts & Compatibility
- **Supported Operating Systems**: Windows 10 (1809+) & Windows 11 (all versions including 23H2 / 24H2).
- **Architecture**: x86_64 (64-bit native).
- **Distributions**:
  - `WiScripts_1.2.2_x64-setup.exe` (NSIS Installer with auto-updater support)
  - `WiScripts_1.2.2_x64_Portable.zip` (Standalone portable zero-install package)

---

## 🛠️ Commit Log Highlights
- `fix(clippy): achieve 100% zero-warning compliance across all Rust targets and suites`
- `refactor(winapi): clean up registry test structure and remove module inception`
- `test(storage): optimize array allocations in deduplication empirical tests`
- `chore(release): bump version to 1.2.2 and publish release notes`

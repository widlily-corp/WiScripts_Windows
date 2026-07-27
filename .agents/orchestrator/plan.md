# WiScripts Windows Deep System Engine Plan

## Overview
Implementation plan for WiScripts Windows "Deep System Engine":
- R1. Deep System Integration (Rust WinAPI): Refactor core optimization logic in Rust backend to use direct Windows API calls (`windows` crate) for registry manipulation, service management, deep debloat, etc. Must include unit tests in `src-tauri` and read-back verification.
- R2. Automatic Administrator Privileges: Create `app.manifest` in `src-tauri` with `requireAdministrator` and embed via `build.rs`. Ensure compilation via `cargo check` and `cargo build`.
- R3. Safe Execution (System Restore Point): Implement native Rust System Restore Point creation routine (WMI/WinAPI) prior to applying tweaks, with unit/integration test.
- R4. Robust Verification & Error Handling: Programmatically verify every state-changing WinAPI call (read back registry key/value immediately after setting) to ensure changes are applied to the OS.
- R5. Release & Git Tagging (v0.4.0): Update `tauri.conf.json` version to `0.4.0`, commit all changes using Conventional Commits, push git repository (`git push`), create and push release tag (`v0.4.0`).

## Milestones Breakdown
1. **Phase 1: Exploration & Architecture Analysis**
   - Explorer 1: Analyze Rust backend codebase (`src-tauri`), identify registry/service/debloat logic to convert from PowerShell to direct WinAPI calls using `windows` crate, and design read-back verification.
   - Explorer 2: Analyze `app.manifest` configuration, `build.rs` manifest embedding setup with `tauri-build`, and UAC elevation requirements.
   - Explorer 3: Analyze native Rust System Restore Point implementation (via WinAPI `SRSetRestorePointW` or WMI COM interface) and test harness design in `src-tauri`.

2. **Phase 2: Deep System Engine Implementation**
   - Worker implementation: `app.manifest`, `build.rs`, `windows` crate dependencies, WinAPI registry & service modules with read-back verification, Rust System Restore Point function, unit & integration tests.

3. **Phase 3: Multi-Layer Verification & Audit**
   - Reviewer 1 & 2: Independent code review (correctness, safety, error handling, clean architecture).
   - Challenger: Empirical execution verification, edge cases, read-back verification testing.
   - Forensic Auditor: Verification of genuine WinAPI calls, no hardcoded or fake test results.

4. **Phase 4: Release & Git Tagging (v0.4.0)**
   - Update `tauri.conf.json` to version `0.4.0`.
   - Commit all changes using Conventional Commits (`feat(engine): native WinAPI deep system engine with UAC manifest and restore point`).
   - Push to remote repository (`git push`).
   - Create annotated tag `v0.4.0` and push to origin (`git tag -a v0.4.0 -m "v0.4.0: Deep System Engine Release" && git push origin v0.4.0`).



## 2026-07-27T07:52:50Z
You are Worker M6 (Deep System Engine Implementer) for the WiScripts Windows project.
Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m6
Project root: c:\Users\Widlily\Documents\projects\WiScripts_Windows

Your Task:
Read the 3 Explorer handoff reports before beginning:
1. `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m6_1\handoff.md`
2. `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m6_2\handoff.md`
3. `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m6_3\handoff.md`

Implement the complete Deep System Engine requirements:

1. **R1. Deep System Integration (Rust WinAPI)**:
   - Add `windows` dependency to `src-tauri/Cargo.toml` with `cfg(windows)` features (`Win32_System_Registry`, `Win32_System_Services`, `Win32_System_TaskScheduler`, `Win32_System_SystemServices`, `Win32_System_Com`, `Win32_Security`).
   - Create clean WinAPI modules in `src-tauri/src/winapi/` (or equivalent structure):
     - Registry module: `set_dword`, `set_string`, `set_binary`, `delete_key`, each with immediate `RegQueryValueExW` read-back verification.
     - Services module: `configure_service`, `stop_service` with immediate `QueryServiceConfigW` & `QueryServiceStatusEx` read-back verification.
   - Refactor core optimization logic to use direct Windows API calls via `windows` crate, bypassing PowerShell where appropriate.
   - Add unit tests in `src-tauri` under `HKCU\Software\WiScriptsTest\UnitTests` verifying successful execution of native WinAPI tweaks and read-back verification.

2. **R2. Automatic Administrator Privileges**:
   - Create `src-tauri/app.manifest` containing `<requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>` and appropriate compatibility metadata.
   - Configure `src-tauri/build.rs` to embed `app.manifest` into the compiled Windows executable using `tauri_build::WindowsAttributes::new().app_manifest(...)`.
   - Verify compilation with `cargo check` and `cargo build`.

3. **R3. Safe Execution (System Restore Point)**:
   - Implement native Rust System Restore Point creation routine in `src-tauri/src/system_restore/mod.rs` (using direct `SRSetRestorePointW` via `srclient.dll` or native WinAPI calls).
   - Ensure system restore point creation executes before tweaks in `optimization::execute()`.
   - Add unit/integration tests validating successful initiation of a restore point.

4. **R4. Robust Verification & Error Handling**:
   - Programmatically verify every state-changing WinAPI call (read back registry key/value immediately after setting). Return explicit error if read-back fails.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Verification Requirements:
- Run `cargo test` in `src-tauri` and ensure all tests pass.
- Run `cargo check` and `cargo build` in `src-tauri`.
- Document commands and results in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m6\handoff.md`.

## 2026-07-27T12:59:26Z
Additional requirement R5 (Deep System Engine Release):
1. Update version in `src-tauri/tauri.conf.json` to `0.4.0` (and `package.json` / `Cargo.toml` if applicable).
2. Ensure all changes are committed using Conventional Commits (`feat(engine): native WinAPI deep system engine with UAC manifest and restore point`).
3. Push changes to remote repository (`git push`).
4. Create release tag `v0.4.0` and push it to origin (`git tag -a v0.4.0 -m "v0.4.0: Deep System Engine Release" && git push origin v0.4.0`).

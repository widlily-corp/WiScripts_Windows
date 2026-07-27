# Handoff Report — Explorer M2-1 (Backend ODT Regional Bypass Integration)

## 1. Observation
- Analyzed existing ODT execution engine in `src-tauri/src/odt/mod.rs` (lines 139–244).
- Analyzed IPC command routing in `src-tauri/src/commands/mod.rs` (lines 195–225).
- Inspected command runner abstraction in `src-tauri/src/runner/mod.rs` (`CommandRunner`, `RealRunner`, `DryRunRunner`, `ExecutionSummary`, `ExecutedAction`).
- Confirmed progress reporting pattern using `TaskProgressPayload` emitted via `tauri::Emitter` to `"task-progress"`.
- Identified required registry paths and keys to bypass ODT regional distribution restrictions:
  - Policy key: `HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate`
  - Values: `PreventRegionalBlock` (DWORD: 1), `EnableAutomaticUpdates` (DWORD: 1)
  - Experiment Config key: `HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs`
  - Value: `CountryCode` (String: "US")

## 2. Logic Chain
1. **Existing ODT Architecture**: `execute_odt_install` accepts `app: Option<&tauri::AppHandle>`, `runner: &dyn CommandRunner`, `config: &OdtConfig`, `setup_path: Option<String>`, `dry_run: bool`, returning `Result<ExecutionSummary, String>`.
2. **Registry Bypass Implementation Strategy**: To integrate regional block bypass natively into the ODT backend without breaking current ODT installation workflows, a dedicated function `execute_odt_regional_bypass` should be exposed in `odt/mod.rs`.
3. **PowerShell Execution Script**:
   - Checks if `HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate` exists; if not, creates key.
   - Sets `PreventRegionalBlock` = `1` (DWORD).
   - Sets `EnableAutomaticUpdates` = `1` (DWORD).
   - Checks if `HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs` exists; if not, creates key.
   - Sets `CountryCode` = `'US'` (String).
4. **IPC Wireup & Dry-Run Support**:
   - `execute_odt_regional_bypass` Tauri IPC command in `commands/mod.rs` receives `app: tauri::AppHandle, dry_run: bool`.
   - On `dry_run == true`, instantiates `DryRunRunner::new()`, ensuring zero system state changes and logging command history.
   - On `dry_run == false`, instantiates `RealRunner::new()`.
   - Register command in `src-tauri/src/lib.rs`.

## 3. Caveats
- Modifying HKLM registry keys requires administrative elevation. `commands::get_system_info` can be checked by UI if elevation status warning is needed.
- If Office keys do not yet exist on a fresh Windows system, `New-Item -Path ... -Force` ensures key creation succeeds without throwing path non-existent errors.

## 4. Conclusion
The ODT regional block bypass registry command design is completely specified, fully compatible with existing `CommandRunner` / `DryRunRunner` and `TaskProgressPayload` IPC paradigms, and ready for immediate implementation in `src-tauri/src/odt/mod.rs`, `src-tauri/src/commands/mod.rs`, and `src-tauri/src/lib.rs`.

## 5. Verification Method
- Run `cargo test --package wi-scripts-windows` in `src-tauri` directory.
- Verify that `test_execute_odt_regional_bypass_dry_run` passes and `DryRunRunner` history contains exact registry modification commands.
- Verify IPC command is correctly registered in `lib.rs`.

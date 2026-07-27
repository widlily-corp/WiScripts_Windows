## 2026-07-27T05:45:12Z
You are Worker 3 for Milestone 2: Safety, Tools & Fixes in WiScripts Windows.
Working directory for metadata: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task Scope (Milestone 2 Implementation):
1. **App Icon Fix**:
   - Create `public/` folder in project root if missing, and copy `src-tauri/icons/icon.png` to `public/icon.png`.
   - Update `index.html` link tag to `<link rel="icon" type="image/png" href="/icon.png" />`.
   - Update `src-tauri/tauri.conf.json` under `app.windows[0]` to add `"icon": "icons/icon.ico"`.

2. **ODT Regional Block Bypass (Backend & UI)**:
   - In `src-tauri/src/odt/mod.rs`, add `pub fn execute_odt_regional_bypass(app: Option<&AppHandle>, runner: &dyn CommandRunner, dry_run: bool) -> Result<ExecutionSummary, String>`.
     Commands to execute via PowerShell:
     `if (-not (Test-Path 'HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate')) { New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate' -Force } ; Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate' -Name 'PreventRegionalBlock' -Value 1 -Type DWord ; Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate' -Name 'EnableAutomaticUpdates' -Value 1 -Type DWord ; if (-not (Test-Path 'HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs')) { New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs' -Force } ; Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs' -Name 'CountryCode' -Value 'US' -Type String`
   - Emit progress event `"task-progress"`.
   - In `src-tauri/src/commands/mod.rs`, export `#[tauri::command] pub async fn execute_odt_regional_bypass(app: tauri::AppHandle, dry_run: bool) -> Result<ExecutionSummary, String>`.
   - Register in `src-tauri/src/lib.rs`.
   - Unit test in `odt/mod.rs` verifying dry-run output and command recorded.
   - UI: In ODT view component (`src/components/OdtView.tsx` or similar), add a "Bypass Regional Lock" action button.

3. **System Restore Backend (`src-tauri/src/system_restore/mod.rs`)**:
   - Create `src-tauri/src/system_restore/mod.rs` module and declare it in `src-tauri/src/lib.rs`.
   - Define `RestorePoint` struct: `sequence_number: u32`, `description: String`, `restore_point_type: String`, `creation_time: String` (derive `Debug`, `Clone`, `Serialize`, `Deserialize`).
   - Implement functions:
     - `create_restore_point(runner: &dyn CommandRunner, description: &str) -> Result<ExecutedAction, String>` executing `Checkpoint-Computer -Description "<description>" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop`.
     - `get_restore_points(runner: &dyn CommandRunner) -> Result<Vec<RestorePoint>, String>` executing `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, RestorePointType, CreationTime | ConvertTo-Json -Compress`. On dry-run or mock json response, return parsed list.
     - `restore_system_point(runner: &dyn CommandRunner, sequence_number: u32) -> Result<ExecutedAction, String>` executing `Restore-Computer -SequenceNumber <sequence_number> -Confirm:$false`.
   - Integrate auto-creation into `execute_optimizations` in `commands/mod.rs` / `optimization/mod.rs` with `create_restore_point: Option<bool>` parameter (default true). If creating restore point fails (e.g. 24h frequency limit warning), log warning to task progress and proceed non-fatally.
   - Export IPC commands in `commands/mod.rs`: `create_restore_point`, `get_restore_points`, `restore_system_point`.
   - Register in `src-tauri/src/lib.rs`.
   - Write comprehensive unit tests in `src-tauri/src/system_restore/mod.rs` exercising dry-run execution and restore point parsing.

4. **Restore Points UI Tab**:
   - Add `'restore_points'` to `TabType` in `src/types/index.ts`.
   - Add Restore Points tab in `src/components/Navigation.tsx`.
   - Extend `src/store/useAppStore.ts` with `restorePoints`, `isLoadingRestorePoints`, `fetchRestorePoints`, `createRestorePoint`, `restoreSystemToPoint`.
   - Create `src/components/RestorePointsView.tsx` (or `src/tabs/RestoreTab.tsx`) with status card, create form, restore point list table, and rollback modal.
   - Route tab in `src/App.tsx`.

5. **Verification & Build**:
   - Run `cargo check` and `cargo test` in `src-tauri/`.
   - Run `npm run build` in root directory.
   - Document all changes and verification outputs in `.agents/worker_m2/handoff.md`. Communicate completion via send_message to parent.

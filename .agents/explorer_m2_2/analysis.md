# System Restore Points Automation & Management Backend Analysis

## Executive Summary
This report presents the architectural investigation and implementation blueprint for System Restore Points automation and management in WiScripts Windows (Milestone 2: Safety, Tools & Fixes).

System Restore Points provide an essential system safety net prior to executing OS optimizations, telemetry changes, or package removals. This analysis details the Win32/PowerShell underlying commands (`Checkpoint-Computer`, `Get-ComputerRestorePoint`, `Restore-Computer`), the design of a new Rust module `system_restore`, the seamless integration into `execute_optimizations` with opt-out and fallback capabilities, the full Tauri IPC command layer, and test coverage using `DryRunRunner`.

---

## 1. PowerShell & Win32/WMI Technical Deep Dive

### 1.1 Creating a System Restore Point (`Checkpoint-Computer`)
- **Primary Cmdlet**: `Checkpoint-Computer`
- **PowerShell Script**:
  ```powershell
  Checkpoint-Computer -Description "<description>" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
  ```
- **Restore Point Types**:
  - `"MODIFY_SETTINGS"` (Type 12): Standard type for OS tweaks, registry modifications, and background service adjustments.
  - `"APPLICATION_INSTALL"` (Type 100): Standard type for software installation.
  - `"DEVICE_DRIVER_INSTALL"` (Type 102): Driver backup/install operations.
- **Windows Throttle & Elevation Prerequisites**:
  1. **Elevation**: Requires Administrator privileges. If executed unprivileged, PowerShell returns Access Denied error.
  2. **Frequency Throttling**: Windows 10/11 limits `Checkpoint-Computer` to once every 24 hours (1440 minutes) by default via registry key `HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore\SystemRestorePointCreationFrequency`. If called within 24 hours of a previous point, PowerShell throws a non-fatal error: *"A new system restore point cannot be created because one has already been created within the past 1440 minutes"*.
  3. **Protection State**: System Restore must be enabled on the target volume (`C:\`). If disabled, PowerShell raises an error stating that system restore is disabled on the drive.

### 1.2 Querying System Restore Points (`Get-ComputerRestorePoint`)
- **Primary Cmdlet**: `Get-ComputerRestorePoint`
- **Alternative WMI/CIM Query**: `Get-CimInstance -Namespace root/default -ClassName SystemRestore`
- **PowerShell Script for JSON Output**:
  ```powershell
  $pts = Get-ComputerRestorePoint -ErrorAction SilentlyContinue; if ($null -eq $pts) { "[]" } else { @($pts | Select-Object SequenceNumber, Description, RestorePointType, @{Name="CreationTime"; Expression={$_.CreationTime.ToString("o")}} ) | ConvertTo-Json -Compress }
  ```
- **Extracted Fields**:
  - `SequenceNumber` (`u32`): Unique integer identifier (e.g. `101`, `102`).
  - `Description` (`String`): User or system-defined label.
  - `RestorePointType` (`u32`): Event classification code (`12` = Modify Settings, `100` = App Install).
  - `CreationTime` (`String`): ISO 8601 formatted timestamp string.

### 1.3 Triggering a System Restore / Rollback (`Restore-Computer`)
- **Primary Cmdlet**: `Restore-Computer`
- **PowerShell Script**:
  ```powershell
  Restore-Computer -SequenceNumber <sequence_number> -Confirm:$false
  ```
- **System Behavior**:
  - Invoking `Restore-Computer` schedules the OS to revert files, registry, and drivers to the selected `SequenceNumber`.
  - Windows requires a system restart to complete the restore operation.

---

## 2. Architecture & Design of Rust `system_restore` Module

### 2.1 Proposed File Location
- **Module File**: `src-tauri/src/system_restore/mod.rs`
- **Module Export**: Add `pub mod system_restore;` to `src-tauri/src/lib.rs`.

### 2.2 Data Structures & Rust Types
```rust
use serde::{Deserialize, Serialize};

/// Represents an existing Windows System Restore Point.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestorePoint {
    pub sequence_number: u32,
    pub description: String,
    pub restore_point_type: u32,
    pub creation_time: String,
}
```

### 2.3 Core Function Signatures
```rust
use crate::error::AppError;
use crate::runner::{CommandRunner, ExecutedAction, ExecutionSummary};

/// Queries existing system restore points via Get-ComputerRestorePoint.
pub fn get_restore_points(runner: &dyn CommandRunner) -> Result<Vec<RestorePoint>, AppError>;

/// Creates a new restore point with the given description.
pub fn create_restore_point(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    description: &str,
) -> Result<ExecutionSummary, AppError>;

/// Restores the system to a specified restore point sequence number.
pub fn restore_system_point(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    sequence_number: u32,
) -> Result<ExecutionSummary, AppError>;
```

---

## 3. Seamless Integration into `execute_optimizations`

### 3.1 Function Signature Update
Modify `optimization::execute` in `src-tauri/src/optimization/mod.rs`:
```rust
pub fn execute(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    selected_keys: &[String],
    auto_create_restore_point: bool,
) -> Result<ExecutionSummary, AppError>
```

### 3.2 Execution Flow & Non-Fatal Fallback Strategy
1. **Opt-Out Check**: If `auto_create_restore_point` is `false`, log notice and proceed directly to optimization steps.
2. **Restore Point Attempt**:
   - If `auto_create_restore_point` is `true`, attempt `system_restore::create_restore_point(app, runner, "WiScripts Optimization Restore Point")`.
3. **Fallback & Error Handling Policy**:
   - **Elevation Check**: If process is unprivileged (`!is_elevated`), log warning: `"[OptimizationEngine] System Restore requires elevation; skipping auto restore point."`
   - **Throttling / Service Disabled**: If `Checkpoint-Computer` returns an error (e.g. 24h frequency limit or System Restore service disabled), log warning: `"[OptimizationEngine] System Restore point creation failed or throttled (non-fatal): ..."`
   - **Progress Notification**: Emit `task-progress` event with warning message: `"Warning: Could not create restore point (System Restore disabled or frequency limit reached). Proceeding with optimizations..."`
   - **Continuity**: The optimization execution **must not abort** on restore point failure unless strict mode is explicitly requested.

---

## 4. Proposed Tauri IPC Commands (`commands/mod.rs`)

### 4.1 New IPC Handlers
```rust
#[tauri::command]
pub async fn get_restore_points() -> Result<Vec<RestorePoint>, AppError> {
    log::info!("[IPC] get_restore_points request received");
    let runner = RealRunner::new();
    system_restore::get_restore_points(&runner)
}

#[tauri::command]
pub async fn create_restore_point(
    app: tauri::AppHandle,
    description: String,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!("[IPC] create_restore_point request received: desc='{}', dry_run={}", description, dry_run);
    if dry_run {
        let runner = DryRunRunner::new();
        system_restore::create_restore_point(Some(&app), &runner, &description)
    } else {
        let runner = RealRunner::new();
        system_restore::create_restore_point(Some(&app), &runner, &description)
    }
}

#[tauri::command]
pub async fn restore_system_point(
    app: tauri::AppHandle,
    sequence_number: u32,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!("[IPC] restore_system_point request received: seq_num={}, dry_run={}", sequence_number, dry_run);
    if dry_run {
        let runner = DryRunRunner::new();
        system_restore::restore_system_point(Some(&app), &runner, sequence_number)
    } else {
        let runner = RealRunner::new();
        system_restore::restore_system_point(Some(&app), &runner, sequence_number)
    }
}
```

### 4.2 Registration in `lib.rs`
Add `commands::get_restore_points`, `commands::create_restore_point`, and `commands::restore_system_point` to `tauri::generate_handler![]`.

---

## 5. DryRunRunner Unit Test Suite Plan

The following test cases will be added to `tests/m2_challenger_tests.rs`:

1. `test_restore_point_create_dry_run_recording()`:
   - Verifies that `create_restore_point(None, &runner, "Pre-Tweak Snapshot")` records exact PowerShell command `Checkpoint-Computer -Description "Pre-Tweak Snapshot" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop`.
2. `test_restore_point_query_dry_run()`:
   - Verifies that `get_restore_points(&runner)` returns deterministic mock restore points in dry-run mode and records `Get-ComputerRestorePoint`.
3. `test_restore_point_rollback_dry_run_recording()`:
   - Verifies that `restore_system_point(None, &runner, 105)` records `Restore-Computer -SequenceNumber 105 -Confirm:$false`.
4. `test_execute_optimizations_with_auto_restore_point_dry_run()`:
   - Verifies that calling `optimization::execute(None, &runner, &selected, true)` records both restore point creation and subsequent optimization scripts sequentially in `runner.get_history()`.
5. `test_create_restore_point_empty_description_error()`:
   - Verifies that passing an empty string to `create_restore_point` returns `AppError::InvalidConfig`.

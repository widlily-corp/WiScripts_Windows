# Handoff Report: WinAPI Refactoring & Deep System Engine Analysis

## 1. Observation

Direct inspection of the Rust backend codebase located in `src-tauri/` reveals that core optimization features, registry tweaks, service controls, scheduled tasks, system restore points, and debloat functions are currently implemented by executing external `powershell.exe` and `cmd.exe` processes rather than calling direct Windows APIs.

### Key Observations from Codebase:

1. **`src-tauri/Cargo.toml` (Lines 15–25)**:
   ```toml
   [dependencies]
   tauri = { version = "2.0.0", features = [] }
   tauri-plugin-opener = "2.0.0"
   tauri-plugin-updater = "2.0.0"
   serde = { version = "1.0", features = ["derive"] }
   serde_json = "1.0"
   thiserror = "1.0"
   sysinfo = "0.30"
   log = "0.4"
   simplelog = "0.12"
   ```
   *Finding*: The official `windows` crate is currently missing from `Cargo.toml`. All system manipulation is done via child process invocation.

2. **Process Runner Architecture (`src-tauri/src/runner/mod.rs`, Lines 35–158)**:
   ```rust
   pub trait CommandRunner: Send + Sync {
       fn run_powershell(&self, script: &str) -> Result<CommandOutput, String>;
       fn run_cmd(&self, command: &str) -> Result<CommandOutput, String>;
       fn is_dry_run(&self) -> bool;
   }
   ```
   *Finding*: `RealRunner` spawns `powershell.exe` with flags `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ...`. `DryRunRunner` mocks execution by storing script text in memory.

3. **Registry Tweaks (`src-tauri/src/optimization/mod.rs` & `src-tauri/src/dns_context/mod.rs`)**:
   - `bloatware_cortana` (Line 72): `Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' -Name 'AllowCortana' -Value 0 -Type DWord -Force`
   - `privacy_advertising_id` (Line 116): `Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' -Name 'Enabled' -Value 0 -Type DWord -Force`
   - `privacy_location_tracking` (Line 128): `Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location' -Name 'Value' -Value 'Deny' -Type String -Force`
   - `privacy_activity_history` (Line 139): `Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -Name 'PublishUserActivities' -Value 0 -Type DWord -Force`
   - `ui_show_file_extensions` (Line 185): `Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name 'HideFileExt' -Value 0 -Type DWord -Force`
   - `ui_show_hidden_files` (Line 196): `Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name 'Hidden' -Value 1 -Type DWord -Force`
   - `ui_classic_context_menu` (Line 207 & `dns_context/mod.rs` Line 185): `New-Item -Path 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32' -Value '' -Force`
   - `odt_regional_bypass` (`src-tauri/src/odt/mod.rs` Line 275): Sets registry values in `HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate` (`PreventRegionalBlock`, `EnableAutomaticUpdates`) and `HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs` (`CountryCode`).

4. **Service Control (`src-tauri/src/optimization/mod.rs` & `src-tauri/src/commands/mod.rs`)**:
   - `telemetry_diagtrack` (Line 38): `Stop-Service -Name DiagTrack; Set-Service -Name DiagTrack -StartupType Disabled`
   - `telemetry_dmwappush` (Line 49): `Stop-Service -Name dmwappushservice; Set-Service -Name dmwappushservice -StartupType Disabled`
   - `services_sysmain` (Line 151): `Stop-Service -Name SysMain; Set-Service -Name SysMain -StartupType Disabled`
   - `services_search_indexing` (Line 162): `Set-Service -Name WSearch -StartupType Manual`
   - `services_fax_spooler` (Line 173): `Stop-Service -Name Fax -ErrorAction SilentlyContinue; Set-Service -Name Fax -StartupType Disabled`
   - `probe_telemetry_status` (`commands/mod.rs` Line 54): Spawns `powershell.exe` to run `Get-Service -Name DiagTrack`.

5. **Task Scheduler Management (`src-tauri/src/scheduler/mod.rs` & `src-tauri/src/optimization/mod.rs`)**:
   - `telemetry_ceip_tasks` (Line 60): `Disable-ScheduledTask -TaskPath '\Microsoft\Windows\Customer Experience Improvement Program\' -TaskName 'Consolidator', 'UsbCeip'`
   - `get_scheduled_tasks` (`scheduler/mod.rs` Line 31): Invokes PowerShell `Get-ScheduledTask` and converts results to JSON.
   - `toggle_scheduled_task` (`scheduler/mod.rs` Line 136): Invokes `Enable-ScheduledTask` / `Disable-ScheduledTask`.

6. **System Restore (`src-tauri/src/system_restore/mod.rs`)**:
   - `create_restore_point` (Line 33): `Checkpoint-Computer -Description ... -RestorePointType "MODIFY_SETTINGS"`
   - `get_restore_points` (Line 68): `Get-ComputerRestorePoint`
   - `restore_system_point` (Line 139): `Restore-Computer -SequenceNumber ...`

7. **Startup Approved Toggle (`src-tauri/src/startup/mod.rs`, Lines 182-196)**:
   - Sets binary data in `HKCU`/`HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`.

---

## 2. Logic Chain

1. **Why PowerShell Overhead Must Be Eliminated**:
   - Spawning `powershell.exe` for each optimization step introduces process startup overhead (~100ms - 300ms per invocation), requires PowerShell script execution policies, and depends on external host binaries.
   - Native Windows API calls execute in microseconds, operate directly inside the application binary, eliminate external shell process dependencies, and allow precise error handling via Windows error codes (`WIN32_ERROR` / `HRESULT`).

2. **Refactoring Strategy via `windows` Crate**:
   - Add `windows` crate dependency to `src-tauri/Cargo.toml` with `Win32_System_Registry`, `Win32_System_Services`, `Win32_System_TaskScheduler`, `Win32_System_SystemServices`, `Win32_System_Com`, and `Win32_Security` features enabled.
   - Extend `CommandRunner` abstraction or introduce `NativeSystemEngine` trait to allow both real WinAPI execution (`RealSystemEngine`) and zero-host-modification dry-run mode (`DryRunSystemEngine`).

3. **Concrete WinAPI Mapping**:

   - **Registry Operations (`windows::Win32::System::Registry`)**:
     - Replace `Set-ItemProperty` and `New-Item` with:
       - `RegOpenKeyExW` / `RegCreateKeyExW` to obtain handle `HKEY`.
       - `RegSetValueExW` for `REG_DWORD`, `REG_SZ`, and `REG_BINARY`.
       - `RegDeleteKeyW` / `RegDeleteValueW` / `RegDeleteTreeW` for key removal.
       - `RegCloseKey` for resource cleanup.

   - **Service Management (`windows::Win32::System::Services`)**:
     - Replace `Stop-Service` / `Set-Service` / `Get-Service` with:
       - `OpenSCManagerW(None, None, SC_MANAGER_ALL_ACCESS)` to obtain SCM handle.
       - `OpenServiceW(scm_handle, service_name, SERVICE_CHANGE_CONFIG | SERVICE_STOP | SERVICE_START | SERVICE_QUERY_STATUS)`.
       - `ChangeServiceConfigW(service_handle, SERVICE_NO_CHANGE, dw_start_type, SERVICE_NO_CHANGE, None, None, None, None, None, None, None)` where `dw_start_type` is `SERVICE_DISABLED` (0x00000004), `SERVICE_AUTO_START` (0x00000002), or `SERVICE_DEMAND_START` (0x00000003).
       - `ControlService(service_handle, SERVICE_CONTROL_STOP, &mut service_status)` to stop running services.
       - `CloseServiceHandle` for proper cleanup.

   - **Task Scheduler Management (`windows::Win32::System::TaskScheduler` & COM `ITaskFolder`, `IRegisteredTask`)**:
     - Replace `Disable-ScheduledTask` / `Get-ScheduledTask` with COM interfaces:
       - `CoInitializeEx(None, COINIT_MULTITHREADED)`
       - `CoCreateInstance(&CLSID_TaskScheduler, None, CLSCTX_INPROC_SERVER)` -> `ITaskService`
       - `ITaskService::Connect(...)` and `ITaskService::GetFolder(...)`
       - `ITaskFolder::GetTask(...)` -> `IRegisteredTask`
       - `IRegisteredTask::put_Enabled(VARIANT_FALSE)` / `put_Enabled(VARIANT_TRUE)`

   - **System Restore (`SRSetRestorePointW`)**:
     - Replace `Checkpoint-Computer` with direct WinAPI call to `SRSetRestorePointW` using `RESTOREPOINTINFOW` struct with `dwEventType = BEGIN_SYSTEM_CHANGE` and `dwRestorePtType = MODIFY_SETTINGS`.

4. **Mandatory Programmatical Read-Back Verification Architecture**:
   - For every state-changing WinAPI operation, immediately execute a read-back check to verify the host state matches expectations before returning success:
     - **Registry Read-Back**: Call `RegQueryValueExW` or `RegGetValueW` immediately after `RegSetValueExW`. Verify `dwType` and byte contents match expected value. If query fails or values mismatch, return `AppError::Execution("Read-back verification failed for key ...")`.
     - **Service Read-Back**: Call `QueryServiceConfigW` to verify `dwStartType` matches desired startup type. Call `QueryServiceStatusEx` to verify service current state (`dwCurrentState == SERVICE_STOPPED`).
     - **Task Read-Back**: Call `IRegisteredTask::get_Enabled(&mut is_enabled)` and verify `is_enabled` matches target state.
     - **Restore Point Read-Back**: Verify `SRSetRestorePointW` status output `pSMGRStatus.nStatus == ERROR_SUCCESS` and returned `llSequenceNumber > 0`.

5. **Unit Testing Strategy**:
   - Write unit tests in `src-tauri/src/winapi/tests.rs` adhering to the AAA (Arrange, Act, Assert) pattern.
   - Use dedicated temporary test keys (`HKCU\Software\WiScriptsTest\UnitTests`) for registry unit tests to prevent tampering with host OS settings.
   - Test read-back failure handling by artificially verifying mismatched values.
   - Include non-elevated graceful error tests (e.g. `ERROR_ACCESS_DENIED` handling).

---

## 3. Caveats

- **Elevation Requirements**: Writing to `HKLM` (HKEY_LOCAL_MACHINE) or modifying system services (`SC_MANAGER_ALL_ACCESS`) requires Administrative privileges (UAC elevation). Non-elevated test runs will return `ERROR_ACCESS_DENIED` (0x5) for HKLM and SCM operations.
- **UWP / AppX Package Management**: `Remove-AppxPackage` and `Get-AppxPackage` use WinRT COM interfaces (`Windows.Management.Deployment.PackageManager`). While `windows` crate supports WinRT, wrapping AppX package deployment via WinRT requires careful COM apartment initialization (`RoInitialize`).
- **Disk Cleanup & Temp Files**: File deletion remains best handled via Rust standard library `std::fs::remove_file` / `std::fs::remove_dir_all` with read-back verification checking `std::fs::metadata(path).is_err()`.
- **Alternative Interpretations Considered**: Using `winreg` crate for registry instead of `windows::Win32::System::Registry`. Recommendation: Use `windows` crate directly to maintain uniform WinAPI binding architecture across registry, services, task scheduler, and restore points.

---

## 4. Conclusion

The Rust backend in `src-tauri` is fully ready to be refactored from process-based PowerShell scripts to direct, native Windows API calls via the `windows` crate.

### Actionable Implementation Plan for Implementer:

1. **Step 1 (`Cargo.toml`)**: Add `windows` dependency with target `cfg(windows)` features (`Win32_System_Registry`, `Win32_System_Services`, `Win32_System_TaskScheduler`, `Win32_System_SystemServices`, `Win32_System_Com`, `Win32_Security`).
2. **Step 2 (`src-tauri/src/winapi/mod.rs`)**: Create native abstraction modules:
   - `winapi::registry`: Implements `set_dword`, `set_string`, `set_binary`, `delete_key`, each with immediate `RegQueryValueExW` read-back verification.
   - `winapi::services`: Implements `configure_service` and `stop_service`, with immediate `QueryServiceConfigW` & `QueryServiceStatusEx` read-back verification.
   - `winapi::tasks`: Implements task state toggle via COM `ITaskService` and `IRegisteredTask::put_Enabled`, with `get_Enabled` read-back verification.
   - `winapi::restore`: Implements `SRSetRestorePointW` native restore point creation.
3. **Step 3 (`src-tauri/src/runner/mod.rs` & Optimization Engine)**: Integrate native WinAPI handlers into `RealRunner` and update `optimization/mod.rs`, `dns_context/mod.rs`, `odt/mod.rs`, `startup/mod.rs`, `scheduler/mod.rs`, `system_restore/mod.rs`.
4. **Step 4 (`src-tauri/src/winapi/tests.rs`)**: Add unit tests under `HKCU\Software\WiScriptsTest\UnitTests` testing native WinAPI operations, mandatory read-back verification, and error paths.

---

## 5. Verification Method

To independently verify the codebase and future WinAPI refactoring:

1. **Cargo Test Execution**:
   Run the Rust test suite from project root:
   ```powershell
   cargo test --manifest-path c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\Cargo.toml
   ```
   *Expected result*: All unit tests pass, verifying dry-run mode, JSON serialization, and isolated registry read-back verification tests.

2. **File Inspection**:
   Inspect `Cargo.toml` and new native modules in `src-tauri/src/` to confirm direct call usage of `windows::Win32::System::Registry` and `windows::Win32::System::Services`.

3. **Invalidation Conditions**:
   - If any state-changing WinAPI call completes without immediate read-back verification, the verification fails layout compliance.
   - If `cargo test` modifies non-test host registry keys outside `HKCU\Software\WiScriptsTest`, host safety isolation is violated.

# Review Handoff Report: WinAPI & Security Review (Milestone 6)

**Verdict**: **PASS**

---

## 1. Observation

### 1.1 Command Outputs & Build Verification
* **Cargo Check**:
  Command: `cargo check --manifest-path src-tauri/Cargo.toml`
  Result:
  ```
  Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.20s
  ```
* **Cargo Build**:
  Command: `cargo build --manifest-path src-tauri/Cargo.toml`
  Result:
  ```
  Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.15s
  ```
* **Cargo Test (Library Unit Tests)**:
  Command: `cargo test --lib --manifest-path src-tauri/Cargo.toml`
  Result:
  ```
  test result: ok. 98 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.23s
  ```
* **UAC Manifest Enforcement Verification**:
  Command: `cargo test --manifest-path src-tauri/Cargo.toml` (Binary target test execution under non-elevated prompt)
  Result:
  ```
  Caused by:
    Запрошенная операция требует повышения. (os error 740)
  ```
  *Note: OS Error 740 ("Requested operation requires elevation") confirms that Windows OS actively enforces the embedded `requireAdministrator` manifest level at process launch.*

### 1.2 Code Inspection Observations

* **UAC Manifest Configuration**:
  - `src-tauri/app.manifest` (lines 10-16):
    ```xml
    <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
      <security>
        <requestedPrivileges>
          <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
        </requestedPrivileges>
      </security>
    </trustInfo>
    ```
  - `src-tauri/build.rs` (lines 1-5):
    ```rust
    fn main() {
        let windows = tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest"));
        let attrs = tauri_build::Attributes::new().windows_attributes(windows);
        tauri_build::try_build(attrs).expect("failed to run tauri-build");
    }
    ```

* **Direct `windows` Crate Usage**:
  - `src-tauri/Cargo.toml` (lines 25-34): Crate `windows` version `0.58.0` with Win32 features (`Win32_Foundation`, `Win32_System_Registry`, `Win32_System_Services`, `Win32_System_TaskScheduler`, `Win32_System_SystemServices`, `Win32_System_Com`, `Win32_Security`).
  - `src-tauri/src/winapi/registry.rs`: Uses `windows::core::PCWSTR` and native registry functions (`RegCreateKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteTreeW`, `RegDeleteKeyW`, `RegDeleteValueW`, `RegOpenKeyExW`, `RegCloseKey`).
  - `src-tauri/src/winapi/services.rs`: Uses native service functions (`OpenSCManagerW`, `OpenServiceW`, `ChangeServiceConfigW`, `ControlService`, `QueryServiceStatusEx`, `QueryServiceConfigW`, `CloseServiceHandle`).

* **Dynamic C-FFI Loading of `SRSetRestorePointW`**:
  - `src-tauri/src/system_restore/mod.rs` (lines 42-76):
    ```rust
    let dll_name: Vec<u16> = std::ffi::OsStr::new("srclient.dll").encode_wide().chain(std::iter::once(0)).collect();
    let h_module = LoadLibraryW(dll_name.as_ptr());
    ...
    let proc_name = std::ffi::CString::new("SRSetRestorePointW").map_err(|e| e.to_string())?;
    let proc_addr = GetProcAddress(h_module, proc_name.as_ptr() as *const u8);
    ...
    let res = sr_set_restore_point(&spec, &mut status);
    FreeLibrary(h_module);
    ```
  - `RESTOREPOINTINFOW` (528 bytes) & `STATEMGRSTATUS` (16 bytes) structs are annotated with `#[repr(C)]`. Line 77 explicitly checks:
    ```rust
    if res != 0 && (status.n_status == ERROR_SUCCESS || status.n_status == ERROR_ALREADY_EXISTS)
    ```
  - Struct alignment unit test `test_native_restore_point_struct_alignment` passes.

* **Mandatory Read-Back Verification**:
  - `set_dword` (`registry.rs` lines 78-106): Issues `RegQueryValueExW` immediately after `RegSetValueExW`, verifying `read_type == REG_DWORD` and `read_val == data`.
  - `set_string` (`registry.rs` lines 154-194): Issues `RegQueryValueExW` after `RegSetValueExW`, verifying `read_type == REG_SZ` and `trimmed_read_str == data`.
  - `set_binary` (`registry.rs` lines 236-272): Issues `RegQueryValueExW` after `RegSetValueExW`, verifying `read_type == REG_BINARY` and `read_buf == data`.
  - `delete_key` (`registry.rs` lines 292-306): Issues `RegOpenKeyExW` after `RegDeleteTreeW`/`RegDeleteKeyW`, verifying key no longer exists (`check_res.is_err()`).
  - `delete_value` (`registry.rs` lines 337-353): Issues `RegQueryValueExW` after `RegDeleteValueW`, verifying value no longer exists (`query_res.is_ok()` returns error).
  - `configure_service` (`services.rs` lines 60-87): Issues `QueryServiceConfigW` after `ChangeServiceConfigW`, verifying `current_start_type == target_start`.
  - `stop_service` (`services.rs` lines 156-182): Issues `QueryServiceStatusEx` after `ControlService(SERVICE_CONTROL_STOP)`, verifying `final_status.dwCurrentState` is `SERVICE_STOPPED` or `SERVICE_STOP_PENDING`.

* **Resource Cleanup & Handle Management**:
  - All registry handle openings (`RegCreateKeyExW`, `RegOpenKeyExW`) have matching `RegCloseKey(key_handle)` on all success and error execution branches.
  - All Service Control Manager handle openings (`OpenSCManagerW`, `OpenServiceW`) have matching `CloseServiceHandle` on all success and error execution branches.
  - Dynamic DLL loading (`LoadLibraryW("srclient.dll")`) has matching `FreeLibrary(h_module)` on both function completion and null address resolution failure paths.

---

## 2. Logic Chain

1. **Native API Correctness**: The codebase employs the direct `windows` crate (v0.58.0) for registry and service manipulation, using Win32 API functions natively. Handles are created and cleaned up deterministically (`RegCloseKey`, `CloseServiceHandle`).
2. **Read-Back Verification Guarantee**: Modifying registry settings or service configurations without read-back confirmation could allow silent failures (e.g., restricted permissions or group policy overrides). The implementation executes mandatory query checks (`RegQueryValueExW`, `QueryServiceConfigW`, `QueryServiceStatusEx`) immediately following mutation and fails with descriptive errors if values or states mismatch.
3. **Dynamic C-FFI System Restore**: `SRSetRestorePointW` is loaded dynamically via `LoadLibraryW` and `GetProcAddress` from `srclient.dll` with C memory layout (`#[repr(C)]`). Handle cleanup (`FreeLibrary`) is performed, and return status checks handle both `ERROR_SUCCESS` (0) and `ERROR_ALREADY_EXISTS` (183).
4. **Privilege Elevation & Manifest**: The `app.manifest` specifies `requireAdministrator` which is compiled into the binary via `tauri-build` in `build.rs`. Operating system enforcement was empirically verified when Windows OS refused non-elevated binary execution with Error 740.
5. **No Integrity Violations**: No hardcoded test stubs, facade implementations, or bypass shortcuts were found. Unit tests verify exact structural alignment and end-to-end WinAPI read-back behavior.

---

## 3. Caveats

- **Minor Edge Case in `create_restore_point_native`**: In `src-tauri/src/system_restore/mod.rs` (line 53), if `CString::new("SRSetRestorePointW")` returns an `Err`, the function returns early without calling `FreeLibrary(h_module)`. Since the literal string contains no null bytes, `CString::new` will never fail in practice, but wrapping `h_module` in a custom RAII Guard or deferring `FreeLibrary` would make resource cleanup 100% leak-proof under all theoretical conditions.

---

## 4. Findings & Risk Assessment

### Findings Summary

| ID | Severity | Category | Description | Status / Recommendation |
|---|---|---|---|---|
| F-01 | Minor | Resource Cleanup | In `create_restore_point_native`, `CString::new` error branch omits `FreeLibrary(h_module)`. | Low risk. Free library before returning `Err` if `CString::new` fails. |

### Verified Claims Matrix

| Claim | Verification Method | Status |
|---|---|---|
| Direct `windows` crate usage | Inspected `Cargo.toml`, `registry.rs`, `services.rs` | PASS |
| `SRSetRestorePointW` dynamic C-FFI | Inspected `system_restore/mod.rs`, ran `cargo test --lib` | PASS |
| Read-back verification for Registry & Services | Inspected `RegQueryValueExW` & `QueryServiceConfigW` calls | PASS |
| UAC Manifest `requireAdministrator` | Inspected `app.manifest`, `build.rs`, confirmed OS error 740 | PASS |
| Cargo check and build pass cleanly | Ran `cargo check` and `cargo build` | PASS |
| Unit test suite passes | Ran `cargo test --lib` (98 tests passed) | PASS |
| Zero Integrity Violations | Independent codebase scan for hardcoded facade outputs | PASS |

---

## 5. Conclusion

The native Windows API integration, security isolation, error code mapping, resource cleanup, read-back verification, and UAC manifest configuration in `src-tauri/` meet all technical requirements and security criteria. 

**Final Verdict**: **PASS**

---

## 6. Verification Method

To independently re-verify this review:

1. **Verify Backend Check and Build**:
   ```powershell
   cargo check --manifest-path src-tauri/Cargo.toml
   cargo build --manifest-path src-tauri/Cargo.toml
   ```
2. **Verify Library Unit Tests**:
   ```powershell
   cargo test --lib --manifest-path src-tauri/Cargo.toml
   ```
3. **Verify UAC Manifest Enforcement**:
   ```powershell
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
   *Expected output includes OS error 740 for the binary target (`wiscripts_windows.exe`).*
4. **Inspect Source Files**:
   - `src-tauri/app.manifest`
   - `src-tauri/build.rs`
   - `src-tauri/src/winapi/registry.rs`
   - `src-tauri/src/winapi/services.rs`
   - `src-tauri/src/system_restore/mod.rs`

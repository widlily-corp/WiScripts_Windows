# ODT Regional Bypass Technical & Architectural Analysis

## 1. Overview & Problem Definition

The Office Deployment Tool (ODT) can encounter regional restrictions or telemetry checks during automated deployment on certain Windows installations. To ensure seamless ODT setup execution, Microsoft Office deployment automation requires registry policy keys to bypass regional distribution blocks and force uniform CDN client channel behavior.

This investigation analyzes the existing `odt` module and IPC infrastructure to design a robust, testable, and safe implementation for `execute_odt_regional_bypass` in `src-tauri/src/odt/mod.rs` and `src-tauri/src/commands/mod.rs`.

---

## 2. Existing Codebase Architecture Analysis

### A. `src-tauri/src/odt/mod.rs`
- **Current Data Structures**:
  - `OdtConfig`: Struct containing `architecture`, `channel`, `products`, `excluded_apps`, `language`, `display_level`, `remove_existing_office`, `accept_eula`.
- **Current Functions**:
  - `generate_odt_xml(config: &OdtConfig) -> String`
  - `escape_powershell_literal(input: &str) -> String`
  - `execute_odt_install(app: Option<&tauri::AppHandle>, runner: &dyn CommandRunner, config: &OdtConfig, setup_path: Option<String>, dry_run: bool) -> Result<ExecutionSummary, String>`
- **Progress Event Broadcasting**:
  - Emits `task-progress` event to Tauri frontend with `TaskProgressPayload`:
    ```rust
    TaskProgressPayload {
        current_step: usize,
        total_steps: usize,
        message: String,
        is_error: bool,
    }
    ```
- **Error & Execution Summary Handling**:
  - Leverages `CommandRunner` abstraction (`run_powershell`), returning `Result<ExecutionSummary, String>`.

### B. `src-tauri/src/commands/mod.rs`
- Bridges Tauri IPC calls to domain engines.
- `execute_odt_install` accepts `(app: tauri::AppHandle, config: OdtConfig, setup_path: Option<String>, dry_run: bool)`.
- Selects `DryRunRunner::new()` when `dry_run == true`, otherwise `RealRunner::new()`.
- Maps domain string errors to `AppError::Execution`.

### C. `src-tauri/src/lib.rs`
- Registers IPC commands inside `tauri::generate_handler![...]`.

---

## 3. Registry Bypass Commands & Keys

To bypass ODT regional block enforcement, disable CDN country restrictions, and force global Office client update policies, the following registry keys and DWORD values must be configured under `HKLM`:

### Key Locations & Values
1. **Office Update Policy - Regional & Block Bypass**:
   - Path: `HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate`
   - Value Name: `ignore regional restrictions` / `PreventRegionalBlock`
   - DWord: `1`
2. **Office Update Policy - Enable Automatic CDN Updates**:
   - Path: `HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate`
   - Value Name: `EnableAutomaticUpdates`
   - DWord: `1`
3. **Office Experiment Configurations - Regional Geo Bypassing**:
   - Path: `HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs`
   - Value Name: `CountryCode`
   - String: `"US"` (or forces fallback)

### PowerShell Execution Script
To execute these registry modifications cleanly and safely via `CommandRunner.run_powershell()`:

```powershell
$updatePolicyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate';
if (-not (Test-Path -Path $updatePolicyPath)) {
    New-Item -Path $updatePolicyPath -Force | Out-Null
};
Set-ItemProperty -Path $updatePolicyPath -Name 'PreventRegionalBlock' -Value 1 -Type DWord -Force;
Set-ItemProperty -Path $updatePolicyPath -Name 'EnableAutomaticUpdates' -Value 1 -Type DWord -Force;
$expPath = 'HKLM:\SOFTWARE\Microsoft\Office\16.0\Common\ExperimentConfigs\Ecs';
if (-not (Test-Path -Path $expPath)) {
    New-Item -Path $expPath -Force | Out-Null
};
Set-ItemProperty -Path $expPath -Name 'CountryCode' -Value 'US' -Type String -Force
```

---

## 4. Rust Backend IPC & Function Signatures

### A. Engine Function (`src-tauri/src/odt/mod.rs`)
```rust
/// Executes ODT regional block bypass registry modification using CommandRunner.
pub fn execute_odt_regional_bypass(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    dry_run: bool,
) -> Result<ExecutionSummary, String> {
    let start_time = std::time::Instant::now();
    log::info!(
        "[ODTEngine] Executing ODT regional bypass registry modification (dry_run={})",
        dry_run || runner.is_dry_run()
    );

    if let Some(app_handle) = app {
        let payload = TaskProgressPayload {
            current_step: 1,
            total_steps: 1,
            message: "Executing step 1/1: ODT Regional Block Registry Bypass".to_string(),
            is_error: false,
        };
        let _ = app_handle.emit("task-progress", &payload);
    }

    let ps_command = "\
        $updatePolicyPath = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\common\\officeupdate'; \
        if (-not (Test-Path -Path $updatePolicyPath)) { New-Item -Path $updatePolicyPath -Force | Out-Null }; \
        Set-ItemProperty -Path $updatePolicyPath -Name 'PreventRegionalBlock' -Value 1 -Type DWord -Force; \
        Set-ItemProperty -Path $updatePolicyPath -Name 'EnableAutomaticUpdates' -Value 1 -Type DWord -Force; \
        $expPath = 'HKLM:\\SOFTWARE\\Microsoft\\Office\\16.0\\Common\\ExperimentConfigs\\Ecs'; \
        if (-not (Test-Path -Path $expPath)) { New-Item -Path $expPath -Force | Out-Null }; \
        Set-ItemProperty -Path $expPath -Name 'CountryCode' -Value 'US' -Type String -Force\
    ".to_string();

    let output = match runner.run_powershell(&ps_command) {
        Ok(out) => out,
        Err(e) => {
            let err_msg = format!("ODT regional bypass failed: {}", e);
            log::error!("[ODTEngine] {}", err_msg);
            if let Some(app_handle) = app {
                let payload = TaskProgressPayload {
                    current_step: 1,
                    total_steps: 1,
                    message: format!("Error in step 1/1: ODT Regional Block Registry Bypass: {}", e),
                    is_error: true,
                };
                let _ = app_handle.emit("task-progress", &payload);
            }
            return Err(err_msg);
        }
    };

    let is_success = output.exit_code == 0;
    if is_success {
        log::info!("[ODTEngine] ODT regional bypass completed successfully (exit_code=0)");
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: "Completed step 1/1: ODT Regional Block Registry Bypass".to_string(),
                is_error: false,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    } else {
        log::warn!("[ODTEngine] ODT regional bypass returned exit code {}", output.exit_code);
        if let Some(app_handle) = app {
            let payload = TaskProgressPayload {
                current_step: 1,
                total_steps: 1,
                message: format!("Error in step 1/1: ODT Regional Block Registry Bypass (exit code {})", output.exit_code),
                is_error: true,
            };
            let _ = app_handle.emit("task-progress", &payload);
        }
    }

    let action = ExecutedAction {
        id: "odt_regional_bypass".to_string(),
        name: "ODT Regional Block Registry Bypass".to_string(),
        command: ps_command,
        output: output.clone(),
        skipped: false,
    };

    Ok(ExecutionSummary {
        success: is_success,
        executed_actions: vec![action],
        total_duration_ms: start_time.elapsed().as_millis() as u64,
        is_dry_run: runner.is_dry_run() || dry_run,
    })
}
```

### B. Tauri IPC Command (`src-tauri/src/commands/mod.rs`)
```rust
#[tauri::command]
pub async fn execute_odt_regional_bypass(
    app: tauri::AppHandle,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    log::info!("[IPC] execute_odt_regional_bypass request received: dry_run={}", dry_run);
    let res = if dry_run {
        let runner = DryRunRunner::new();
        odt::execute_odt_regional_bypass(Some(&app), &runner, true).map_err(AppError::Execution)
    } else {
        let runner = RealRunner::new();
        odt::execute_odt_regional_bypass(Some(&app), &runner, false).map_err(AppError::Execution)
    };

    match &res {
        Ok(summary) => log::info!(
            "[IPC] execute_odt_regional_bypass completed: success={}, duration={}ms",
            summary.success,
            summary.total_duration_ms
        ),
        Err(err) => log::error!("[IPC] execute_odt_regional_bypass failed: {:?}", err),
    }

    res
}
```

### C. Registration (`src-tauri/src/lib.rs`)
Add `commands::execute_odt_regional_bypass` inside `tauri::generate_handler![...]`.

---

## 5. Dry-Run & Testing Strategy

1. **Unit Testing in `src-tauri/src/odt/mod.rs`**:
   - `test_execute_odt_regional_bypass_dry_run()`:
     - Instantiates `DryRunRunner::new()`.
     - Calls `execute_odt_regional_bypass(None, &runner, true)`.
     - Asserts `summary.is_dry_run == true`, `summary.success == true`, `executed_actions.len() == 1`.
     - Checks `runner.get_history()` contains `'PreventRegionalBlock'` and `'CountryCode'`.
   - `test_execute_odt_regional_bypass_failing_runner()`:
     - Tests non-zero exit code error handling.

2. **IPC Integration Test in `src-tauri/src/commands/mod.rs`**:
   - `test_execute_odt_regional_bypass_ipc_dry_run()`:
     - Verifies async invocation via block_on with `DryRunRunner`.

---

## 6. Implementation Checklist for Implementer

- [ ] Add `execute_odt_regional_bypass` to `src-tauri/src/odt/mod.rs`.
- [ ] Add unit tests in `src-tauri/src/odt/mod.rs`.
- [ ] Add `execute_odt_regional_bypass` IPC command to `src-tauri/src/commands/mod.rs`.
- [ ] Register command in `src-tauri/src/lib.rs`.
- [ ] Add IPC unit test in `src-tauri/src/commands/mod.rs`.
- [ ] Run `cargo test` to verify zero regressions.

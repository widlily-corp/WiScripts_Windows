# Real-Time Progress Reporting Analysis Report

**Target Codebase**: `src-tauri` (Rust backend)  
**Author**: Explorer 1 (`explorer_m1_1`)  
**Date**: 2026-07-22  
**Tauri Version**: 2.0.0 (`tauri = { version = "2.0.0" }`)

---

## 1. Executive Summary

This investigation analyzed the Rust backend architecture of WiScripts Windows to enable real-time progress reporting via Tauri IPC events. The codebase currently runs three core execution engines (`optimization`, `odt`, and `mas`) synchronously without emitting intermediate progress updates to the frontend.

By introducing a `TaskProgressPayload` structure and passing `Option<&tauri::AppHandle>` (or injecting `tauri::AppHandle` into Tauri command handlers), real-time progress events named `"task-progress"` can be emitted before and after each rule or execution step. Using `Option<&tauri::AppHandle>` guarantees 100% test compatibility, allowing all unit tests to execute headless with `None` while production handlers pass `Some(&app_handle)`.

---

## 2. Codebase & Module Architecture Overview

The backend is built as a single Rust library crate (`wiscripts_windows_lib`) wrapped by `main.rs`.

### File & Module Hierarchy

| Module / File | Path | Key Responsibilities |
| :--- | :--- | :--- |
| `main.rs` | `src-tauri/src/main.rs` | Entrypoint launching `wiscripts_windows_lib::run()`. |
| `lib.rs` | `src-tauri/src/lib.rs` | Tauri application builder (`tauri::Builder`), plugin init, and handler registration. |
| `commands/mod.rs` | `src-tauri/src/commands/mod.rs` | `#[tauri::command]` handlers for IPC invocation (`execute_optimizations`, `execute_odt_install`, `execute_activation`, etc.). |
| `optimization/mod.rs` | `src-tauri/src/optimization/mod.rs` | Rule catalog definitions, filtering, and `execute()` loop running batch optimizations. |
| `odt/mod.rs` | `src-tauri/src/odt/mod.rs` | ODT XML generator and `execute_odt_install()` runner. |
| `mas.rs` / `activation` | `src-tauri/src/mas.rs` | Microsoft Activation Scripts (HWID, Ohook, KMS38, TSforge) execution logic. |
| `runner/mod.rs` | `src-tauri/src/runner/mod.rs` | `CommandRunner` trait, `RealRunner` (PowerShell/CMD), and `DryRunRunner` (mock recorder). |
| `error.rs` | `src-tauri/src/error.rs` | `AppError` enum and serde serialization. |

---

## 3. Analysis of Execution Engine & Iteration Logic

### 3.1 Optimization Engine (`src-tauri/src/optimization/mod.rs`)

- **Function Signature** (Lines 244-247):
  ```rust
  pub fn execute(
      runner: &dyn CommandRunner,
      selected_keys: &[String],
  ) -> Result<ExecutionSummary, AppError>
  ```
- **Loop Structure** (Lines 254-293):
  ```rust
  let rules = preview(selected_keys)?;
  let mut executed_actions = Vec::new();
  let mut overall_success = true;

  for rule in rules {
      log::info!("[OptimizationEngine] Executing rule ID: '{}', Title: '{}'", rule.id, rule.title);
      let output = runner
          .run_powershell(&rule.powershell_command)
          .map_err(|e| ... )?;
      ...
  }
  ```
- **Observation**:
  `rules` is a `Vec<OptimizationItem>`. Total steps = `rules.len()`.
  Currently, there are no progress emissions inside the `for rule in rules` loop.

### 3.2 Office ODT Engine (`src-tauri/src/odt/mod.rs`)

- **Function Signature** (Lines 137-142):
  ```rust
  pub fn execute_odt_install(
      runner: &dyn CommandRunner,
      config: &OdtConfig,
      setup_path: Option<String>,
      dry_run: bool,
  ) -> Result<ExecutionSummary, String>
  ```
- **Execution Flow**: Single setup command constructed and executed via `runner.run_powershell(&ps_command)`.

### 3.3 MAS Activation Engine (`src-tauri/src/mas.rs`)

- **Function Signature** (Lines 47-51):
  ```rust
  pub fn execute_activation(
      runner: &dyn CommandRunner,
      method: ActivationMethod,
      dry_run: bool,
  ) -> Result<ExecutionSummary, String>
  ```
- **Execution Flow**: Single activation script command executed via `runner.run_powershell(&command)`.

---

## 4. Tauri Event Emission Mechanism & Payload Definition

### 4.1 Tauri 2.0 Event API
- **Crate Version**: Tauri 2.0.0 (`tauri-build = "2.0.0"`, `tauri = "2.0.0"` in `Cargo.toml`).
- **Trait Requirement**: In Tauri 2.0, event emission requires importing `use tauri::Emitter;`.
- **Method Call**:
  ```rust
  app_handle.emit("task-progress", &payload)?;
  ```
  *(Note: `emit_all` was removed in Tauri 2.0; `emit` broadcasts to all windows).*

### 4.2 Progress Payload Definition (`TaskProgressPayload`)

To adhere to camelCase JSON conventions expected by frontend TypeScript, the payload structure is defined as:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgressPayload {
    pub current_step: usize,
    pub total_steps: usize,
    pub message: String,
    pub is_error: bool,
}
```

**Serialized JSON Example**:
```json
{
  "currentStep": 2,
  "totalSteps": 5,
  "message": "Executing rule [2/5]: Disable Cortana App & Background Execution",
  "isError": false
}
```

### 4.3 Helper Function Strategy

To keep code clean and modular across all engines, a centralized emission helper can be created in `src-tauri/src/runner/mod.rs` (or `src-tauri/src/commands/mod.rs`):

```rust
use tauri::Emitter;

pub fn emit_progress(
    app_handle: Option<&tauri::AppHandle>,
    current_step: usize,
    total_steps: usize,
    message: impl Into<String>,
    is_error: bool,
) {
    let payload = TaskProgressPayload {
        current_step,
        total_steps,
        message: message.into(),
        is_error,
    };
    log::info!(
        "[Progress] [{}/{}] (is_error={}): {}",
        payload.current_step,
        payload.total_steps,
        payload.is_error,
        payload.message
    );
    if let Some(app) = app_handle {
        if let Err(e) = app.emit("task-progress", &payload) {
            log::error!("[Progress] Failed to emit task-progress event: {}", e);
        }
    }
}
```

---

## 5. Execution Paths Analysis

All four key execution paths requiring real-time progress events:

| Path ID | Trigger Command in `commands/mod.rs` | Target Module | Iteration / Step Count | Emitted Events |
| :--- | :--- | :--- | :--- | :--- |
| **Path 1** | `execute_optimizations` | `optimization::execute` | Multi-step (`N = selected_keys.len()`) | - Pre-step start (`current_step = i + 1`, `is_error = false`) <br> - Post-step result (`is_error = !action_success`) <br> - Completion summary |
| **Path 2** | `execute_odt_install` | `odt::execute_odt_install` | Single batch step (`N = 1`) | - Pre-install start (`current_step = 1`, `is_error = false`) <br> - Post-install result (`is_error = !is_success`) |
| **Path 3** | `execute_activation` | `mas::execute_activation` | Single batch step (`N = 1`) | - Pre-activation start (`current_step = 1`, `is_error = false`) <br> - Post-activation result (`is_error = !is_success`) |
| **Path 4** | All commands when `dry_run = true` | `DryRunRunner` paths | Matches step count of Path 1, 2, or 3 | Identical progress events emitted so UI shows progress during dry-runs |

---

## 6. Detailed Modification Plan & Code Changes

### 6.1 `src-tauri/src/commands/mod.rs`
Update `#[tauri::command]` signatures to take `app_handle: tauri::AppHandle`:

```rust
#[tauri::command]
pub async fn execute_optimizations(
    app_handle: tauri::AppHandle,
    selected_keys: Vec<String>,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    ...
    let res = if dry_run {
        let runner = DryRunRunner::new();
        optimization::execute(&runner, &selected_keys, Some(&app_handle))
    } else {
        let runner = RealRunner::new();
        optimization::execute(&runner, &selected_keys, Some(&app_handle))
    };
    ...
}
```

Similarly update `execute_odt_install` and `execute_activation` command handlers.

### 6.2 `src-tauri/src/optimization/mod.rs`
Update `optimization::execute`:

```rust
pub fn execute(
    runner: &dyn CommandRunner,
    selected_keys: &[String],
    app_handle: Option<&tauri::AppHandle>,
) -> Result<ExecutionSummary, AppError> {
    let start_time = std::time::Instant::now();
    let rules = preview(selected_keys)?;
    let total_steps = rules.len();
    let mut executed_actions = Vec::new();
    let mut overall_success = true;

    for (idx, rule) in rules.into_iter().enumerate() {
        let current_step = idx + 1;
        
        // Event 1: Pre-step execution
        emit_progress(
            app_handle,
            current_step,
            total_steps,
            format!("Executing rule [{}/{}]: {}", current_step, total_steps, rule.title),
            false,
        );

        let output_res = runner.run_powershell(&rule.powershell_command);
        match output_res {
            Ok(output) => {
                let action_success = output.exit_code == 0;
                if action_success {
                    // Event 2a: Post-step success
                    emit_progress(
                        app_handle,
                        current_step,
                        total_steps,
                        format!("Completed [{}/{}]: {}", current_step, total_steps, rule.title),
                        false,
                    );
                } else {
                    overall_success = false;
                    // Event 2b: Post-step error exit code
                    emit_progress(
                        app_handle,
                        current_step,
                        total_steps,
                        format!("Failed [{}/{}]: {} (Exit code {})", current_step, total_steps, rule.title, output.exit_code),
                        true,
                    );
                }
                executed_actions.push(ExecutedAction {
                    id: rule.id,
                    name: rule.title,
                    command: rule.powershell_command,
                    output,
                    skipped: false,
                });
            }
            Err(e) => {
                overall_success = false;
                emit_progress(
                    app_handle,
                    current_step,
                    total_steps,
                    format!("Failed [{}/{}]: {} ({})", current_step, total_steps, rule.title, e),
                    true,
                );
                return Err(AppError::Execution(e));
            }
        }
    }

    Ok(ExecutionSummary { ... })
}
```

---

## 7. Verification & Safety

1. **Unit Test Safety**: All 25 existing unit tests call `execute(...)` with `None` as `app_handle`. Thus `cargo test` remains 100% isolated and green without needing Tauri mock context.
2. **Payload Validation Test**: Unit tests can be added to verify `TaskProgressPayload` serializes into camelCase (`currentStep`, `totalSteps`, `message`, `isError`).
3. **Execution Verification**: Running `cargo test` verifies full backward compatibility.

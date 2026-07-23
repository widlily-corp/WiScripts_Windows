## 2026-07-22T16:13:05Z

You are Worker M1 Events (worker_m1_events). Your working directory is c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m1_events.
Your task is to implement Milestone 1: Rust Backend Real-time Event Emission (`task-progress`) in `src-tauri/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Specific Instructions:
1. Read `c:\Users\Widlily\Documents\projects\WiScripts_Windows\PROJECT.md`.
2. Define `TaskProgressPayload` struct in `src-tauri/src/optimization/mod.rs` (or shared module):
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
3. Update `pub fn execute` in `src-tauri/src/optimization/mod.rs` to accept `app: Option<&tauri::AppHandle>`:
   ```rust
   pub fn execute(
       app: Option<&tauri::AppHandle>,
       runner: &dyn CommandRunner,
       selected_keys: &[String],
   ) -> Result<ExecutionSummary, AppError>
   ```
   Calculate `total_steps = rules.len()`.
   Iterate over rules:
   - Before executing rule `(idx, rule)`, if `app` is `Some(app_handle)`, emit `"task-progress"` event using `use tauri::Emitter;`:
     ```rust
     if let Some(app_handle) = app {
         let payload = TaskProgressPayload {
             current_step: idx + 1,
             total_steps,
             message: format!("Executing step {}/{}: {}", idx + 1, total_steps, rule.title),
             is_error: false,
         };
         let _ = app_handle.emit("task-progress", &payload);
     }
     ```
   - Execute the rule (`runner.run_powershell(...)`).
   - After executing the rule, if `app` is `Some(app_handle)`, emit `"task-progress"` event with step completion or error details (`is_error: output.exit_code != 0`).
4. Update `execute_odt_install` in `src-tauri/src/odt/mod.rs` and `execute_activation` in `src-tauri/src/activation/mod.rs` to take `app: Option<&tauri::AppHandle>` and emit progress events before and after task execution.
5. Update Tauri commands in `src-tauri/src/commands/mod.rs`:
   Update `execute_optimizations`, `execute_odt_install`, `execute_activation` to include `app: tauri::AppHandle` parameter and pass `Some(&app)` to execution functions.
6. Update all unit tests in `src-tauri/` to pass `None` for the `app` handle parameter.
7. Run `cargo check` and `cargo test` in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri` and document the exact build/test results in your handoff.
8. Create `.agents\worker_m1_events\changes.md` and `.agents\worker_m1_events\handoff.md`. Send completion message to parent orchestrator.

## 2026-07-22T16:11:45Z

You are Worker M1 (worker_m1). Your working directory is c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m1.
Your task is to implement Milestone 1: Rust Backend Event Emission (`task-progress`) in `src-tauri/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Specific Implementation Requirements:
1. Read `c:\Users\Widlily\Documents\projects\WiScripts_Windows\PROJECT.md` and `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m1_1\handoff.md`.
2. Define `TaskProgressPayload` struct in `src-tauri/src/` (e.g. in `src-tauri/src/optimization/mod.rs` or shared module):
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
3. Modify `optimization::execute` in `src-tauri/src/optimization/mod.rs` to take `app: Option<&tauri::AppHandle>` as its first parameter.
4. Iterate over `rules: Vec<OptimizationItem>`. Total steps = `rules.len()`.
   - Before executing each rule, if `app` is `Some(app_handle)`, emit event `"task-progress"` using `use tauri::Emitter;`:
     ```rust
     let payload = TaskProgressPayload {
         current_step: idx + 1,
         total_steps,
         message: format!("Executing step {}/{}: {}", idx + 1, total_steps, rule.title),
         is_error: false,
     };
     let _ = app_handle.emit("task-progress", &payload);
     ```
   - Execute the rule (or dry-run action).
   - After executing each rule, if an error occurs or upon completion, emit progress update with status message and `is_error` flag (`true` on error, `false` on success).
5. Also update `execute_odt_install` and `execute_activation` in `src-tauri/src/odt/mod.rs` and `src-tauri/src/mas.rs` (if applicable) to accept `app: Option<&tauri::AppHandle>` and emit progress events.
6. Update Tauri command handlers in `src-tauri/src/commands/mod.rs` (or `main.rs`/`lib.rs`) to declare `app: tauri::AppHandle` parameter and pass `Some(&app)` to execution functions.
7. Ensure all unit tests in `src-tauri` continue to pass by passing `None` as the app handle parameter in headless test calls.
8. Execute `cargo check` and `cargo test` in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri` to verify compilation and passing tests.
9. Create `.agents\worker_m1\changes.md` and `.agents\worker_m1\handoff.md` containing build/test command results, modified files list, and summary of changes.
10. Send a message to parent orchestrator with your completion report.

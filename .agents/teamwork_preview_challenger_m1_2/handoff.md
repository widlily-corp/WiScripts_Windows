# Challenge & Handoff Report — Milestone 1: Fix Execution & UI Hangs

**Agent**: Challenger 2 (Empirical Challenger)  
**Milestone**: Milestone 1: Fix Execution & UI Hangs  
**Working Directory**: `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_challenger_m1_2`  
**Target Code**: `src-tauri/src/runner/mod.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

---

## 1. Observation

1. **CRITICAL FINDING: Pipe Buffer Exhaustion Deadlock in `run_command_with_timeout`**:
   - In `src-tauri/src/runner/mod.rs`, `run_command_with_timeout` spawns processes with `Stdio::piped()` for stdout and stderr, but sits in `loop { match child.try_wait() ... std::thread::sleep(100ms) }` without reading from `child.stdout` or `child.stderr` while waiting for completion.
   - When a spawned command (PowerShell, CMD, DISM, SFC, Winget) produces output exceeding the operating system pipe buffer capacity (~64 KB) during execution, the OS suspends/blocks the child process writing to stdout/stderr.
   - Because the child process is blocked waiting for reader capacity, it **never completes**. `child.try_wait()` returns `Ok(None)` continuously until `timeout_secs` (300s / 5 minutes) expires.
   - **Empirical Evidence**: Background test `task-74` executing `test_m1_pipe_buffer_overflow_stress_test` and `test_m1_cmd_large_stdout_pipe_buffer` hung for **exactly 300.08 seconds** before timing out and returning `Err("Process execution timed out after 300 seconds")`.

2. **Grandchild Process Orphan Leak on Timeout**:
   - In `src-tauri/src/runner/mod.rs`, `run_command_with_timeout` calls `child.kill()` and `child.wait()` when execution exceeds `timeout_secs`.
   - On Windows, `std::process::Child::kill()` invokes `TerminateProcess` on the top-level process handle (`cmd.exe` or `powershell.exe`).
   - When PowerShell or CMD spawns child/grandchild processes (e.g. background installers, sub-scripts, or secondary processes), `TerminateProcess` terminates **only** the top-level process. Grandchild processes remain orphaned and active in the background.
   - **Empirical Evidence**: In integration test `test_m1_verify_grandchild_process_tree_kill_behavior`, executing `cmd.exe /C powershell -Command Start-Sleep -Seconds 30` followed by `child.kill()` resulted in `cmd.exe` exiting, but `powershell.exe` remaining active in the background until manually killed.

3. **`cargo test` Execution Behavior**:
   - Running bare `cargo test` fails on binary target `wiscripts_windows-*.exe` with `os error 740: Запрошенная операция требует повышения (Requested operation requires elevation)`.
   - **Root Cause**: `src-tauri/app.manifest` defines `<requestedExecutionLevel level="requireAdministrator" uiAccess="false" />`.
   - Running `cargo test --lib` passes all 98 unit tests.

4. **IPC Endpoints and Async Offloading**:
   - All 27 `#[tauri::command]` endpoints in `src-tauri/src/commands/mod.rs` use `async fn` and wrap blocking runner operations inside `tauri::async_runtime::spawn_blocking`.
   - All endpoints return typed `Result<T, AppError>` where `T` is `ExecutionSummary`, `SystemInfo`, `Vec<OptimizationItem>`, `Vec<WingetPackage>`, `Vec<UwpAppInfo>`, `Vec<OptimizationProfile>`, `Vec<RestorePoint>`, `Vec<StartupItem>`, `Vec<ScheduledTaskItem>`, `SystemMetricsPayload`, `SystemTemperaturesPayload`, `String`, or `bool`.
   - `#[serde(rename_all = "camelCase")]` is applied to all payload structs.

---

## 2. Logic Chain

1. **From Observation 1 to Conclusion**:
   - `run_command_with_timeout` has a **critical deadlock flaw**. Any real PowerShell/CMD script that produces large stdout/stderr (>64 KB) will block forever on write, freeze until the 5-minute timeout expires, and then get forcibly killed as a failure.
   - **Remediation**: `run_command_with_timeout` MUST drain `child.stdout` and `child.stderr` concurrently in background reader threads (or use async `tokio::process::Command` / non-blocking stream reads) while waiting for process termination.

2. **From Observation 2 to Conclusion**:
   - Because `std::process::Child::kill()` on Windows does not terminate process trees, timeouts in `RealRunner` can leave grandchild processes running in the background. Using Windows Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) or `taskkill /F /PID <pid> /T` is required to guarantee full process tree termination.

3. **From Observation 3 to Conclusion**:
   - `cargo test --lib` is the correct test command for CI and non-elevated environments.

4. **From Observation 4 to Conclusion**:
   - Async IPC offloading to `spawn_blocking` prevents UI reactor thread blocking, but backend execution will hang for 5 minutes if pipe deadlock occurs.

---

## 3. Caveats

1. Windows elevation limitations prevent running `wiscripts_windows.exe` binary test harness without Administrator privileges.
2. The pipe deadlock was empirically reproduced under non-elevated test execution within 300 seconds.

---

## 4. Conclusion

- **Verdict**: **REJECTED / CRITICAL BUGS FOUND**
- **Critical Flaws**:
  1. **Pipe Buffer Deadlock**: `run_command_with_timeout` deadlocks on processes producing >64 KB of output, freezing execution for 300 seconds before timing out.
  2. **Grandchild Process Leak**: `child.kill()` on timeout leaves child/grandchild sub-processes orphaned on Windows.
- **Passes**:
  - IPC `spawn_blocking` thread offloading (27/27 endpoints).
  - Strongly typed `Result` / `ExecutionSummary` camelCase IPC payloads.
  - Unit tests in `src/lib.rs` (98/98 passed).

---

## 5. Verification Method

Independent verification commands:

```powershell
# 1. Run library unit tests
cd c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri
cargo test --lib

# 2. Run M1 empirical pipe buffer deadlock test (will fail after 300s timeout)
cargo test --test m1_challenger_tests -- --nocapture
```

---

## Adversarial Challenge Summary

**Overall risk assessment**: CRITICAL

### Challenge Findings

#### [Critical] Challenge 1: `run_command_with_timeout` Pipe Buffer Deadlock
- **Assumption challenged**: `run_command_with_timeout` safely captures stdout/stderr of spawned processes.
- **Attack scenario**: A command generates >64 KB of stdout/stderr (e.g. DISM logs, Winget output, SFC output, or verbose scripts).
- **Blast radius**: The OS pipe buffer fills up, child process blocks on `write()`, parent loops in `try_wait()` sleeping 100ms, execution hangs for 5 minutes until timeout, and the process is killed as failed.
- **Mitigation**: Spawn background threads to continuously drain stdout/stderr from `child.stdout` / `child.stderr` into buffers during `try_wait()` polling, or switch to `tokio::process::Command`.

#### [High] Challenge 2: `child.kill()` leaves grandchild processes orphaned on Windows
- **Assumption challenged**: `child.kill()` in `run_command_with_timeout` terminates all processes started by a command.
- **Attack scenario**: A script spawns background child processes (`powershell -Command Start-Sleep 30` or `winget install ...`) and times out. Calling `child.kill()` terminates the top `cmd.exe` process but leaves the spawned child process running.
- **Blast radius**: Orphaned processes continue running in background, consuming CPU/RAM or holding file locks.
- **Mitigation**: Use Windows Job Objects (`CreateJobObjectW` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) or `taskkill /F /PID <pid> /T` when terminating timed-out processes.

---

## Stress Test Results

- **PowerShell Start-Sleep (1s)** → Expected: Completes < 5s → Actual: Completed in 1.1s → **PASS**
- **PowerShell >100KB stdout pipe stress** → Expected: Completes without deadlock → Actual: **FAILED (Deadlocked for 300s until timeout killed it)** → **FAIL**
- **CMD >100KB stdout pipe stress** → Expected: Completes without deadlock → Actual: **FAILED (Deadlocked for 300s until timeout killed it)** → **FAIL**
- **Grandchild process kill verification** → Expected: Grandchild process killed → Actual: Grandchild process orphaned by `child.kill()` → **FAIL**
- **IPC `spawn_blocking` offloading** → Expected: UI thread unblocked → Actual: All 27 commands use `spawn_blocking` → **PASS**
- **IPC JSON camelCase serialization** → Expected: All fields match frontend contract → Actual: All structs use `#[serde(rename_all = "camelCase")]` → **PASS**

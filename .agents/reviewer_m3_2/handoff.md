# Handoff Report — Milestone 3 IPC & Architecture Review (Reviewer M3-2)

## 1. Observation
- **Tauri IPC Command Registration** (`src-tauri/src/lib.rs:13-22`):
  Commands `generate_odt_xml`, `execute_odt_install`, `execute_activation` are correctly registered in the Tauri invoke handler.
- **IPC Wrappers** (`src-tauri/src/commands/mod.rs:127-159`):
  All IPC handlers return `Result<T, AppError>` where `AppError` implements `serde::Serialize`.
- **Serde Attributes & Field Names**:
  - `OdtConfig` (`src-tauri/src/odt/mod.rs:14-50`) uses `#[serde(rename_all = "camelCase")]` and serde aliases for compatibility.
  - `ActivationMethod` (`src-tauri/src/mas.rs:6-20`) uses serde aliases (`HWID`, `Ohook`, `KMS38`, `TSforge`).
  - **CRITICAL**: `CommandOutput`, `ExecutedAction`, and `ExecutionSummary` (`src-tauri/src/runner/mod.rs:6-30`) **LACK** `#[serde(rename_all = "camelCase")]`.
- **TypeScript Frontend Contract** (`src/types/index.ts:50-69`, `src/App.tsx:94-105, 137-149, 184-195`):
  Frontend expects camelCase keys (`executedActions`, `totalDurationMs`, `isDryRun`, `action.output.exitCode`).
- **Parameter Handling & Sanitization** (`src-tauri/src/odt/mod.rs:127-133`):
  `setup_path` and XML content in `execute_odt_install` are formatted directly into a PowerShell double-quoted string without escaping `$`, `` ` ``, or validating input paths.
- **Safety Architecture & Dry-Run**:
  `DryRunRunner` (`src-tauri/src/runner/mod.rs:102-150`) records all PowerShell and CMD invocations in memory without executing system commands. Safety modal (`src/components/SafetyConfirmationModal.tsx:116-129`) requires typing `CONFIRM` for critical risk operations in live execution mode.
- **Cargo Test Suite**:
  Ran `cargo test` in `src-tauri`. All 17 tests passed (0 failed).

## 2. Logic Chain
1. **IPC Return & Wrapper Logic**:
   - `generate_odt_xml` calls `odt::generate_xml(&config)`, returning `Result<String, AppError>`.
   - `execute_odt_install` and `execute_activation` branches on `dry_run`: `DryRunRunner` for `dry_run = true`, `RealRunner` for `dry_run = false`.
2. **Serde Serialization Incompatibility**:
   - Rust structs `CommandOutput`, `ExecutedAction`, and `ExecutionSummary` in `src-tauri/src/runner/mod.rs` do NOT specify `#[serde(rename_all = "camelCase")]`.
   - Consequently, Rust serializes `ExecutionSummary` as `{"success":..., "executed_actions":..., "total_duration_ms":..., "is_dry_run":...}` and `CommandOutput` as `{"exit_code":...}`.
   - Frontend TypeScript code (`App.tsx`) attempts to read `summary.executedActions`, `summary.totalDurationMs`, `summary.isDryRun`, and `action.output.exitCode`.
   - At JavaScript runtime, `summary.executedActions` resolves to `undefined`. Calling `summary.executedActions.forEach(...)` throws a `TypeError: Cannot read properties of undefined (reading 'forEach')`, breaking UI feedback and logging upon command completion.
3. **PowerShell Injection Vulnerability in `execute_odt_install`**:
   - `execute_odt_install` interpolates `setup_path` and `escaped_xml` into `$setupPath = "{}"` and `-Value "{}"` inside a PowerShell script string.
   - Replacing `"` with `` `"` `` does not escape PowerShell subexpressions (`$(...)`) or variables (`$var`), making live execution vulnerable to script injection if untrusted inputs are provided.

## 3. Caveats
- No caveats. Codebase inspection and `cargo test` execution were performed directly.

## 4. Conclusion
**Verdict**: **CHANGES REQUESTED**

### Critical Findings
1. **Serde Serialization Mismatch on `ExecutionSummary`, `ExecutedAction`, `CommandOutput`**:
   - **Location**: `src-tauri/src/runner/mod.rs`, lines 6-30
   - **Reason**: Missing `#[serde(rename_all = "camelCase")]` on `CommandOutput`, `ExecutedAction`, and `ExecutionSummary`.
   - **Impact**: Frontend throws `TypeError` when processing IPC response from `execute_optimizations`, `execute_odt_install`, and `execute_activation`.
   - **Fix**: Add `#[serde(rename_all = "camelCase")]` above `CommandOutput`, `ExecutedAction`, and `ExecutionSummary` in `src-tauri/src/runner/mod.rs`.

### Major Findings
2. **Unsanitized PowerShell Script Interpolation in `execute_odt_install`**:
   - **Location**: `src-tauri/src/odt/mod.rs`, lines 127-133
   - **Reason**: `setup_path` and XML content are interpolated directly into double-quoted PowerShell code blocks.
   - **Impact**: Vulnerable to subexpression expansion and command injection.
   - **Fix**: Properly escape `$`, `` ` ``, and double quotes, or pass arguments via structured script execution.

## 5. Verification Method
1. **Verify Serde JSON Keys**:
   Add a unit test in `src-tauri/src/runner/mod.rs`:
   ```rust
   #[test]
   fn test_execution_summary_serde_camel_case() {
       let summary = ExecutionSummary {
           success: true,
           executed_actions: vec![],
           total_duration_ms: 100,
           is_dry_run: true,
       };
       let json = serde_json::to_string(&summary).unwrap();
       assert!(json.contains("executedActions"));
       assert!(json.contains("totalDurationMs"));
       assert!(json.contains("isDryRun"));
   }
   ```
2. **Run `cargo test`**:
   Execute `cargo test` in `src-tauri` to ensure all unit tests pass after applying `#[serde(rename_all = "camelCase")]`.

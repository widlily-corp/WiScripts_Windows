# Forensic Audit Report — Milestone 3 Remediation

**Work Product**: Remediated Milestone 3 Implementation (Startup Apps Manager, Task Scheduler, System Metrics & Hardware Sensors, Tauri IPC Commands, React Views, Zustand Store)
**Profile**: General Project (Forensic Integrity Check)
**Verdict**: **CLEAN**

---

## 1. Observations

### 1.1 Source Code Verification
Target files audited:
- `src-tauri/src/startup/mod.rs` (Lines 1–441)
- `src-tauri/src/scheduler/mod.rs` (Lines 1–359)
- `src-tauri/src/metrics/mod.rs` (Lines 1–391)
- `src-tauri/src/commands/mod.rs` (Lines 1–962)
- `src/components/StartupView.tsx` (Lines 1–229)
- `src/components/SchedulerView.tsx` (Lines 1–277)
- `src/store/useAppStore.ts` (Lines 1–1282)

#### Single-Quoted PowerShell Parameter Escaping (`escape_ps_param`)
- In `src-tauri/src/startup/mod.rs` (Lines 19–21):
  ```rust
  fn escape_ps_param(s: &str) -> String {
      s.replace('\'', "''")
  }
  ```
  Used in `toggle_startup_item` (Lines 179–180) and `remove_startup_item` (Lines 268–269):
  ```rust
  let safe_value_name = escape_ps_param(target_value_name);
  let safe_location = escape_ps_param(location);
  ```
  Script embedding: `$valueName = '{safe_value_name}'`, `$loc = '{safe_location}'`.

- In `src-tauri/src/scheduler/mod.rs` (Lines 20–22):
  ```rust
  fn escape_ps_param(s: &str) -> String {
      s.replace('\'', "''")
  }
  ```
  Used in `toggle_scheduled_task` (Lines 134–135) and `run_scheduled_task` (Lines 212–213):
  ```rust
  let safe_name = escape_ps_param(task_name);
  let safe_path = escape_ps_param(task_path);
  ```
  Script embedding: `$name = '{safe_name}'`, `$path = '{safe_path}'`.

#### `value_name` Property Preservation
- `StartupItem` struct in `src-tauri/src/startup/mod.rs` (Lines 8–17) includes `pub value_name: String` with `#[serde(rename_all = "camelCase")]`.
- Both `toggle_startup_item` (Line 144) and `remove_startup_item` (Line 238) compute:
  `let target_value_name = if value_name.is_empty() { id } else { value_name };`
- In `src-tauri/src/commands/mod.rs` (Lines 694 & 715):
  `let v_name = value_name.as_deref().unwrap_or(&id);`
- In `src/store/useAppStore.ts` (Lines 1164 & 1195):
  `valueName = item.valueName || item.name;`
- In `src/components/StartupView.tsx` (Lines 58 & 172):
  `removeStartupItem(item.id, item.valueName || item.name, item.location);`
  `toggleStartupItem(item.id, item.valueName || item.name, item.location, !item.enabled);`

#### Production Error Returns (`AppError::Execution`)
- In `startup/mod.rs`:
  - `runner.run_powershell(script).map_err(AppError::Execution)?;`
  - Returns `Err(AppError::Execution(format!("Failed to get/toggle/remove startup item ..."))` on script failures or exit codes != 0.
- In `scheduler/mod.rs`:
  - `runner.run_powershell(script).map_err(AppError::Execution)?;`
  - Returns `Err(AppError::Execution(format!("Failed to get/toggle/run scheduled task ..."))` on script failures or exit codes != 0.

### 1.2 Test Execution Results
Execution of `cargo test` in `src-tauri`:
```
test result: ok. 92 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.18s
     Running tests\empirical_m2_verification.rs: ok. 5 passed; finished in 0.00s
     Running tests\m2_challenger_tests.rs: ok. 15 passed; finished in 0.00s
```
Total tests passed: **112 tests across unit and integration test suites**.

---

## 2. Logic Chain

1. **Escaping Analysis**: PowerShell single-quoted literals treat `''` as a literal `'`. Replacing `'` with `''` prevents string termination and script injection attacks when user parameters contain quotes (e.g. `O'Reilly` or path spaces/quotes).
2. **Registry Value Preservation Analysis**: Startup items in Windows registry are named by their registry value key (e.g., `Discord` or `Steam.lnk`), which may differ from the internal generated `id` (e.g., `hkcu_run_discord`). Passing `value_name` from frontend -> store -> Tauri IPC -> native Rust startup handler ensures operations target the exact registry value or shortcut name.
3. **Error propagation**: All native calls handle subprocess failure gracefully by wrapping errors into `AppError::Execution`, returning actionable error strings to Tauri IPC.
4. **Behavioral Integrity**: No hardcoded test assertions, pre-populated mock return cheating, or facade implementations were detected in production modules (`startup`, `scheduler`, `metrics`, `commands`). Tests execute genuine dry-run runner logic and real JSON parsing routines.

---

## 3. Caveats

- **Dry-Run vs Live Subprocess**: Unit tests execute using `DryRunRunner` and mock registry/task payloads to avoid modifying the host system during test runs. Live PowerShell execution paths were verified via code inspection on Windows API commands (`Get-ItemProperty`, `Set-ItemProperty`, `Remove-ItemProperty`, `Get-ScheduledTask`, `Enable-ScheduledTask`, `Disable-ScheduledTask`, `Start-ScheduledTask`).
- No other caveats.

---

## 4. Conclusion

Milestone 3 remediated implementation has passed all forensic integrity checks:
- No cheating, hardcoded test logic, or facade implementations.
- `escape_ps_param` properly sanitizes PowerShell parameters across all modules.
- `value_name` property is preserved through all layers (UI -> Store -> IPC -> Native).
- Errors strictly return `AppError::Execution` on failure.
- All unit and integration tests pass (112 passed).

Final Verdict: **CLEAN**

---

## 5. Verification Method

To independently verify this audit:
1. Open terminal in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri`.
2. Run `cargo test`.
3. Confirm 92 library unit tests and 20 integration tests pass with 0 failures.
4. Inspect `src-tauri/src/startup/mod.rs` and `scheduler/mod.rs` for `escape_ps_param` usage and `value_name` handling.

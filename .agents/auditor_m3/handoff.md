# Forensic Audit Report — Milestone 3

**Work Product**: Milestone 3 Rust Backend (`src-tauri`)  
**Profile**: General Project  
**Verdict**: **CLEAN**  

---

## 1. Observation

Direct empirical observations from inspecting `src-tauri` source files and executing test suites:

- **ODT Generator (`src-tauri/src/odt/mod.rs`)**:
  - Lines 69–109: Function `generate_odt_xml(config: &OdtConfig) -> String` dynamically formats XML using structure attributes (`architecture`, `channel`, `products`, `excluded_apps`, `language`, `display_level`, `remove_existing_office`, `accept_eula`).
  - Lines 117–153: Function `execute_odt_install(...)` formats `setup.exe` download, XML content writing (`Set-Content`), and process invocation (`Start-Process -FilePath $setupPath -ArgumentList '/configure ...'`) into a PowerShell string, then passes it to `runner.run_powershell(...)`.
  - Lines 163–261: Unit tests `test_generate_odt_xml_various_channels_and_arch`, `test_generate_odt_xml_multiple_products_and_excluded_apps`, `test_execute_odt_install_dry_run_contains_setup_configure`, and `test_execute_odt_install_dry_run_custom_path` pass without mock shortcut cheating.

- **MAS Script Runner (`src-tauri/src/mas.rs`)**:
  - Lines 33–40: `get_activation_script_command` maps `ActivationMethod` (`Hwid`, `Ohook`, `Kms38`, `TsForge`) to actual PowerShell commands (`irm https://get.activated.win | iex /<Method>`).
  - Lines 43–69: `execute_activation(...)` dispatches script commands to `runner.run_powershell` and records executed actions with `CommandOutput`.
  - Lines 79–126: Unit tests verify exact command string matching for `/HWID`, `/Ohook`, `/KMS38`, `/TSforge` under `DryRunRunner`.

- **IPC Commands & Integration (`src-tauri/src/commands/mod.rs` & `src-tauri/src/lib.rs`)**:
  - Lines 21–65 (`commands/mod.rs`): `check_is_elevated` and `probe_telemetry_status` use real system command probes (`net session`, `powershell.exe Get-Service -Name DiagTrack`).
  - Lines 68–94 (`commands/mod.rs`): `get_system_info` queries live system statistics via `sysinfo::System`.
  - Lines 114–159 (`commands/mod.rs`): `execute_optimizations`, `execute_odt_install`, and `execute_activation` correctly dispatch `dry_run` flag to instantiate `DryRunRunner` vs `RealRunner`.
  - Lines 13–24 (`lib.rs`): All 8 Tauri IPC commands (`get_system_info`, `get_rule_catalog`, `get_rules_by_category`, `preview_optimizations`, `execute_optimizations`, `generate_odt_xml`, `execute_odt_install`, `execute_activation`) are registered in `tauri::generate_handler!`.

- **Command Runner Architecture (`src-tauri/src/runner/mod.rs`)**:
  - Lines 46–91: `RealRunner` spawns actual system processes (`powershell.exe`, `cmd.exe`) via `std::process::Command`.
  - Lines 101–150: `DryRunRunner` records command strings in a thread-safe `Arc<Mutex<Vec<RecordedCommand>>>` history without modifying the host system.

- **Runtime Test Execution**:
  - Command executed: `cargo test` inside `c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri`.
  - Result:
    ```
    running 17 tests
    test mas::tests::test_execute_activation_dry_run_hwid ... ok
    test odt::tests::test_execute_odt_install_dry_run_custom_path ... ok
    test mas::tests::test_execute_activation_dry_run_ohook ... ok
    test odt::tests::test_generate_odt_xml_various_channels_and_arch ... ok
    test odt::tests::test_generate_odt_xml_multiple_products_and_excluded_apps ... ok
    test mas::tests::test_activation_script_commands ... ok
    test optimization::tests::test_rule_catalog_contains_at_least_15_rules ... ok
    test optimization::tests::test_execute_optimizations_dry_run_exact_commands ... ok
    test odt::tests::test_execute_odt_install_dry_run_contains_setup_configure ... ok
    test mas::tests::test_execute_activation_dry_run_kms38 ... ok
    test optimization::tests::test_preview_optimizations ... ok
    test commands::tests::test_execute_activation_ipc_dry_run ... ok
    test runner::tests::test_dry_run_runner_records_powershell_and_cmd ... ok
    test commands::tests::test_execute_odt_install_ipc_dry_run ... ok
    test commands::tests::test_execute_optimizations_ipc_dry_run ... ok
    test optimization::tests::test_rule_catalog_covers_all_6_categories ... ok
    test commands::tests::test_get_system_info_ipc ... ok

    test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.87s
    ```

---

## 2. Logic Chain

1. **Static Analysis of ODT Generator**: Inspected `generate_odt_xml` in `odt/mod.rs`. The code constructs XML strings line-by-line using match blocks and iterations over `config.products` and `config.excluded_apps`. There are zero hardcoded XML test constants or stub outputs.
2. **Static Analysis of MAS Module**: Inspected `get_activation_script_command` in `mas.rs`. Each enum variant returns a distinct, authentic PowerShell invocation string targeting `get.activated.win`. There are zero dummy or facade return values.
3. **Static Analysis of Command Execution Architecture**: Inspected `DryRunRunner` and `RealRunner` in `runner/mod.rs`. `DryRunRunner` captures the exact script payload in its thread-safe `history` vector without altering system state, and returns exit code 0 with a simulated output string. `RealRunner` invokes system processes via standard Rust `std::process::Command`.
4. **Static Analysis of Commands & IPC Layer**: Inspected `commands/mod.rs` and `lib.rs`. System probes query real system resources (`sysinfo`, PowerShell `DiagTrack` status, `net session`). IPC endpoints pass parameters down to the implementation modules cleanly.
5. **Runtime Verification**: `cargo test` was executed cleanly. All 17 tests passed, confirming both static logic and runtime execution behavior.

---

## 3. Caveats

- **No caveats**: The entire codebase in `src-tauri` for Milestone 3 was inspected line-by-line, and all tests were compiled and executed locally.

---

## 4. Conclusion

The Milestone 3 codebase in `src-tauri` is fully authentic, free of hardcoded shortcuts or dummy facades, correctly formats ODT XML, generates valid MAS PowerShell commands, records commands via `DryRunRunner`, and passes all 17 unit/IPC tests cleanly.

Final Verdict: **CLEAN**

---

## 5. Verification Method

To independently verify these findings:

1. Open PowerShell and navigate to `src-tauri`:
   ```powershell
   cd c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri
   cargo test
   ```
2. Inspect the test suite execution output to verify all 17 tests pass.
3. Inspect `src-tauri/src/odt/mod.rs`, `src-tauri/src/mas.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, and `src-tauri/src/runner/mod.rs` to verify dynamic XML generation, PowerShell command construction, and dry-run recording.

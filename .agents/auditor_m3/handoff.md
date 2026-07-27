# Forensic Integrity Audit Report: Milestone 3

**Work Product**: Milestone 3 Telemetry, Startup Apps, and Task Scheduler (`WiScripts_Windows`)  
**Profile**: General Project  
**Auditor**: Forensic Auditor M3  
**Verdict**: **CLEAN**

---

## 1. Observation

### 1.1 Source Code Analysis

#### A. Real-Time Telemetry & Hardware Probes (`src-tauri/src/metrics/mod.rs`)
- **Real API Usage**: `MetricsCollector::collect()` (lines 117–188) uses `sysinfo::{System, Disks, Networks}` to gather live CPU usage (`sys.global_cpu_info().cpu_usage()`), per-core CPU usage (`sys.cpus()`), RAM bytes (`total_memory()`, `used_memory()`, `free_memory()`), process disk I/O (`process.disk_usage()`), and network interface totals (`read_network_totals()`).
- **Temperature Probes**: `collect_temperatures()` (lines 191–283) uses a 3-tier hardware pipeline:
  1. Tier 1: `sysinfo::Components` for native hardware thermal sensors.
  2. Tier 2: WMI PowerShell query `Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature` (lines 285–318).
  3. Tier 3: `nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits` (lines 320–344).
- **Prohibited Patterns**: Zero instances of hardcoded metrics, fake constant returns, or pre-calculated static values found in production execution paths.

#### B. Startup Apps Management (`src-tauri/src/startup/mod.rs`)
- **Real Windows APIs**: `get_startup_items()` (lines 18–111) executes real PowerShell scripts inspecting Windows registry paths:
  - `HKCU:\Software\Microsoft\Windows\CurrentVersion\Run`
  - `HKLM:\Software\Microsoft\Windows\CurrentVersion\Run`
  - `HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run`
  - `HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
  - User Startup Folder: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`
- **Dry-Run Isolation**: Mock data in `get_mock_startup_items()` (lines 290–338) is strictly guarded behind `if runner.is_dry_run()` (line 19) or non-Windows OS targets (line 107).
- **Action Realism**: `toggle_startup_item` (lines 124–205) modifies registry binary values in `StartupApproved\Run`. `remove_startup_item` (lines 207–288) calls `Remove-ItemProperty`.

#### C. Task Scheduler Management (`src-tauri/src/scheduler/mod.rs`)
- **Real Windows APIs**: `get_scheduled_tasks()` (lines 20–75) queries Windows Task Scheduler via PowerShell `Get-ScheduledTask` and `Get-ScheduledTaskInfo`.
- **Dry-Run Isolation**: `get_mock_scheduled_tasks()` (lines 234–281) is strictly guarded behind `if runner.is_dry_run()` (line 21).
- **Action Realism**: `toggle_scheduled_task` (lines 88–161) executes `Enable-ScheduledTask` / `Disable-ScheduledTask`. `run_scheduled_task` (lines 163–232) executes `Start-ScheduledTask`.

#### D. Frontend & State Management (`src/components/`, `src/store/useAppStore.ts`)
- `Dashboard.tsx` (lines 32, 160–227) renders live sparkline graphs (`SparklineAreaGraph.tsx`) and hardware sensor widgets (`TemperatureSensorWidget.tsx`) backed by Zustand state.
- `useAppStore.ts` (lines 1086–1137) invokes Tauri IPC commands `get_system_metrics` and `get_system_temperatures`. Capping at 30 samples is enforced via `.slice(-30)`.
- `StartupView.tsx` and `SchedulerView.tsx` bind directly to store actions (`fetchStartupItems`, `toggleStartupItem`, `removeStartupItem`, `fetchScheduledTasks`, `toggleScheduledTask`, `runScheduledTask`).

---

## 1.2 Test Execution Results

Empirical verification of backend Rust tests and frontend TypeScript integration tests:

1. **Rust Test Suite** (`cargo test`):
   ```text
   running 84 tests in wiscripts_windows_lib
   test metrics::tests::test_metrics_collector_creation_and_collect ... ok
   test metrics::tests::test_collect_temperatures_does_not_panic ... ok
   test metrics::tests::test_payload_serialization_camel_case ... ok
   test startup::tests::test_get_startup_items_dry_run ... ok
   test startup::tests::test_parse_startup_items_json ... ok
   test startup::tests::test_remove_startup_item_dry_run ... ok
   test startup::tests::test_toggle_startup_item_dry_run ... ok
   test scheduler::tests::test_get_scheduled_tasks_dry_run ... ok
   test scheduler::tests::test_parse_scheduled_tasks_json ... ok
   test scheduler::tests::test_run_scheduled_task_dry_run ... ok
   test scheduler::tests::test_toggle_scheduled_task_dry_run ... ok
   ...
   test result: ok. 84 passed; 0 failed; 0 ignored

   Running integration test suites:
   empirical_m2_verification: 5 passed; 0 failed
   m2_challenger_tests: 15 passed; 0 failed
   Total Rust tests: 104 passed; 0 failed.
   ```

2. **Metrics & Hardware Probes Empirical Test** (`npx tsx src/tests/m3_metrics_empirical.ts`):
   ```text
   🧪 Running Empirical Verification for Milestone 3 Metrics & Hardware Probes...
     ✅ Test 1: History ring buffer capping verified (30 max samples).
     ✅ Test 2: Polling config state updates verified.
     ✅ Test 3: Thermal status mapping logic verified.
     ✅ Test 4: SVG path calculation verified.
   🎉 ALL EMPIRICAL TESTS PASSED CLEANLY (100%)
   ```

3. **Views & State Empirical Test** (`npx tsx src/tests/m3_views_empirical.ts`):
   ```text
   ====================================================
    EMPIRICAL TEST SUITE: Milestone 3 Views & State
   ====================================================
   [Test 1] Navigation & Tab Switching - Passed
   [Test 2] Global Dry Run Mode Toggle - Passed
   [Test 3] Feature R1: Diagnostics Execution - Passed
   [Test 4] Feature R2: Package Manager Search & Debloat Logic - Passed
   [Test 5] Feature R3: Optimization Presets / Profiles - Passed
   [Test 6] Feature R4: DNS & Context Menu - Passed
   [Test 7] Feature R5: Driver Backup Path Validation & Edge Cases - Passed
   [Test 8] Elevation Check State & Action - Passed
   ====================================================
    ALL 8 EMPIRICAL TESTS PASSED SUCCESSFULLY! 🎉
   ====================================================
   ```

---

## 2. Logic Chain

1. **Premise 1**: Genuine production implementation must query real underlying operating system APIs rather than returning fixed mock structures during non-dry-run execution.
   - *Observation*: Code analysis of `metrics/mod.rs`, `startup/mod.rs`, and `scheduler/mod.rs` confirms direct usage of `sysinfo`, PowerShell registry queries (`HKCU`/`HKLM`), `%APPDATA%` startup directory reads, WMI thermal queries, `nvidia-smi`, and `Get-ScheduledTask`.
2. **Premise 2**: Mock data must be isolated exclusively to test fixtures or explicit dry-run modes (`is_dry_run() == true`).
   - *Observation*: `get_mock_startup_items()` and `get_mock_scheduled_tasks()` are invoked strictly when `runner.is_dry_run()` returns true or as OS fallbacks.
3. **Premise 3**: Test suites must execute genuine logic and assert invariant properties.
   - *Observation*: Cargo tests execute collector initialization, JSON serialization/deserialization, and dry-run command formatting. TypeScript empirical tests run ring buffer capping, thermal mapping logic, SVG math, and store state transitions without mocking out the tested functions.
4. **Conclusion**: Milestone 3 contains zero hardcoded test outputs, zero facade implementations, and zero integrity violations.

---

## 3. Caveats

- **WMI ACPI Thermal Sensor Availability**: WMI `MSAcpi_ThermalZoneTemperature` access on Windows requires motherboard firmware support and appropriate process permissions; fallback handling gracefully returns `sensor_source: "Unavailable / Sensor access denied"` if unsupported, which is standard system behavior and not a facade.
- **Hardware GPU Probe**: `nvidia-smi` temperature polling requires NVIDIA GPUs and drivers installed. If absent, `collect_temperatures()` falls back cleanly without failing or panic.

---

## 4. Conclusion

- **Verdict**: **CLEAN**
- **Summary**: Milestone 3 meets all forensic integrity standards under Development, Demo, and Benchmark modes. No cheating, fake facades, or fabricated outputs exist in the codebase.

---

## 5. Verification Method

To independently verify this audit:

1. **Run Rust Unit & Integration Tests**:
   ```powershell
   cd c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri
   cargo test
   ```
   *Expected*: All 104 tests pass with 0 failures.

2. **Run Empirical Frontend Verification Scripts**:
   ```powershell
   cd c:\Users\Widlily\Documents\projects\WiScripts_Windows
   npx tsx src/tests/m3_metrics_empirical.ts
   npx tsx src/tests/m3_views_empirical.ts
   ```
   *Expected*: Both test suites output 100% pass rates.

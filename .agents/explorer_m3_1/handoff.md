# Milestone 3 Handoff Report: System Monitoring & Management (Metrics & Temp Backend)

## 1. Observation

### Codebase Analysis
1. **`src-tauri/Cargo.toml`**:
   - Line 22: `sysinfo = "0.30"` is already declared under `[dependencies]`.
   - `serde` (line 19) and `serde_json` (line 20) are available with `derive` features.
   - `thiserror` (line 21) is available for custom error types.

2. **`src-tauri/src/lib.rs`**:
   - Lines 1-14: Modular structure exporting domain modules: `activation`, `commands`, `diagnostics`, `dns_context`, `driver_backup`, `error`, `logger`, `mas`, `odt`, `optimization`, `packages`, `profiles`, `runner`, `system_restore`.
   - Lines 25-51: Tauri builder registers commands using `tauri::generate_handler![...]`.

3. **`src-tauri/src/error.rs`**:
   - Line 5-14: `AppError` enum defines `Execution(String)`, `InvalidConfig(String)`, `Io(String)`, and `System(String)`. Implements `serde::Serialize`.

4. **`src-tauri/src/commands/mod.rs`**:
   - Lines 14-25: `SystemInfo` struct uses `#[serde(rename_all = "camelCase")]`.
   - Lines 90-129: Existing `get_system_info()` command uses `sysinfo::System::new_all()` and `sysinfo::MINIMUM_CPU_UPDATE_INTERVAL` to query basic static OS info, CPU %, and memory.
   - Lines 652-655: Existing unit tests verify `get_system_info`.

5. **Test Suite Verification (`cargo test --manifest-path src-tauri/Cargo.toml`)**:
   - Result: 73 unit tests in `wiscripts_windows_lib` + 20 integration tests in `tests/` passed cleanly in 1.13s.

---

## 2. Logic Chain

### Step 1: Real-time System Metrics Strategy
- **Observation 1 & 4**: `sysinfo 0.30.13` is available.
- **Deduction**: `sysinfo` provides global & per-core CPU usage via `sysinfo::System`, RAM metrics via `total_memory()`, `used_memory()`, `free_memory()`.
- **Rate Calculation Requirement**: Disk I/O (read/write B/s) and Network I/O (rx/tx B/s) require delta calculations over time ($\Delta \text{bytes} / \Delta t$).
- **State Management**: To prevent re-instantiating `sysinfo::Disks` and `sysinfo::Networks` on every invocation (which resets deltas and incurs unnecessary overhead), a persistent state struct `MetricsCollector` wrapped in `std::sync::Arc<std::sync::Mutex<MetricsCollector>>` should be registered with `.manage()` in `lib.rs`.

### Step 2: CPU & GPU Temperature Detection Strategy
- **Observation 1 & 4**: Hardware monitoring varies significantly across Windows desktop configurations (Intel vs AMD CPU, NVIDIA vs AMD vs Intel GPU, thermal zones, VM vs bare-metal, admin vs non-admin privileges).
- **Multi-Tiered Sensor Detection Pipeline**:
  1. **Tier 1 (`sysinfo::Components`)**: Query `sysinfo::Components::new_with_refreshed_list()`. Iterate over labels matching CPU ("cpu", "core", "package") and GPU ("gpu", "nvidia", "vram").
  2. **Tier 2 (WMI ACPI Thermal Zones)**: PowerShell / CIM query to `root\wmi` namespace `MSAcpi_ThermalZoneTemperature` (`CurrentTemperature` in tenths of Kelvin $\rightarrow (T - 2732) / 10.0$).
  3. **Tier 3 (NVIDIA GPU via `nvidia-smi`)**: Execute `nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits` with hidden process creation flags (`0x08000000`). If NVIDIA card/driver is installed, returns direct integer GPU temperature in ${}^\circ\text{C}$.
  4. **Tier 4 (Safe Fallback)**: If no sensors respond or permission is denied, return a non-crashing default payload with `is_cpu_temp_available: false`, `is_gpu_temp_available: false`, `cpu_temp_celsius: None`, `gpu_temp_celsius: None`, `sensor_source: "Unavailable / Sensor access denied"`.

### Step 3: Module Architecture & IPC Command API Design
- **Observation 2**: Codebase uses sub-module directories (`diagnostics/`, `dns_context/`, `driver_backup/`, etc.).
- **Deduction**: Create a dedicated module `src-tauri/src/metrics/mod.rs` containing collector logic, temperature probes, structs, and AAA unit tests. Re-export IPC commands in `commands/mod.rs`.
- **Payload Structs**:
  - `SystemMetricsPayload`: CPU %, CPU core count, per-core CPU %, RAM total/used/free/%, Disk read/write rates (B/s), Disk total read/write bytes, Network RX/TX rates (B/s), Network total RX/TX bytes, timestamp_ms.
  - `SystemTemperaturesPayload`: CPU temp (${}^\circ\text{C}$), GPU temp (${}^\circ\text{C}$), CPU availability flag, GPU availability flag, sensor source description, and individual sensor items list (`TemperatureSensorInfo`).
- **IPC Commands**:
  - `#[tauri::command] pub async fn get_system_metrics(state: tauri::State<'_, Arc<Mutex<MetricsCollector>>>) -> Result<SystemMetricsPayload, AppError>`
  - `#[tauri::command] pub async fn get_system_temperatures() -> Result<SystemTemperaturesPayload, AppError>`

### Step 4: Crate Dependency Recommendation
- `sysinfo = "0.30"` (already in `Cargo.toml`) handles CPU, RAM, Disks, Networks, and basic Components.
- No mandatory external C-FFI crate is strictly required for temperatures when using the PowerShell/CIM + `nvidia-smi` + `sysinfo` fallback pipeline, avoiding native build complexities. If native WMI is preferred, `wmi = "0.13"` can be added to `Cargo.toml`.

---

## 3. Caveats

1. **Non-Admin Execution**: On Windows systems without administrator privileges, ACPI WMI thermal zones (`MSAcpi_ThermalZoneTemperature`) may return `Access Denied` or empty output. The multi-tiered fallback strategy guarantees no runtime errors or panics occur in non-admin mode.
2. **Virtual Machines**: Virtualized environments (Hyper-V, VMware, VirtualBox) often do not pass physical CPU/GPU temperature sensors to guest OSes. The fallback flags (`is_cpu_temp_available: false`) handle this scenario gracefully.
3. **NVML / NVIDIA SMI**: `nvidia-smi` is available on systems with NVIDIA GPU drivers. AMD/Intel discrete GPU temperatures will rely on `sysinfo::Components` or WMI sensor queries.

---

## 4. Conclusion

The Rust backend for Milestone 3 (System Monitoring & Management) should be implemented as follows:

1. **New Module**: `src-tauri/src/metrics/mod.rs`
   - Struct `MetricsCollector` holding `sysinfo::System`, `sysinfo::Disks`, `sysinfo::Networks`, and `last_refresh: std::time::Instant`.
   - Function `MetricsCollector::collect(&mut self) -> Result<SystemMetricsPayload, AppError>`.
   - Function `collect_temperatures() -> Result<SystemTemperaturesPayload, AppError>`.
2. **Payload Structs (Serde camelCase)**:
   - `SystemMetricsPayload`
   - `SystemTemperaturesPayload`
   - `TemperatureSensorInfo`
3. **Tauri IPC Commands**:
   - `get_system_metrics`
   - `get_system_temperatures`
4. **State Registration in `src-tauri/src/lib.rs`**:
   - Manage state `.manage(Arc::new(Mutex::new(MetricsCollector::new())))`.
5. **Unit Testing (AAA Pattern)**:
   - Co-located unit tests in `src-tauri/src/metrics/mod.rs` and IPC struct serialization tests in `tests/m3_challenger_tests.rs`.

---

## 5. Verification Method

### Command Verification
Run the Rust test suite from project root:
```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

### Inspection Checklist
1. Verify `src-tauri/src/metrics/mod.rs` exports `MetricsCollector`, `SystemMetricsPayload`, `SystemTemperaturesPayload`.
2. Verify `src-tauri/src/lib.rs` includes `pub mod metrics;`, `.manage(...)`, and registers `get_system_metrics` and `get_system_temperatures` in `tauri::generate_handler!`.
3. Check JSON serialization of `SystemMetricsPayload` and `SystemTemperaturesPayload` uses camelCase property names matching frontend TypeScript interfaces.
4. Ensure `collect_temperatures()` never panics or returns an error on non-elevated or VM hardware.

---
*Report prepared by Explorer 1 for Milestone 3.*

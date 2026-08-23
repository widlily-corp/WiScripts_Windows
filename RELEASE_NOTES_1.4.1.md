# Release Notes — WiScripts Windows v1.4.1

We are pleased to announce the release of **WiScripts Windows v1.4.1** (Full-Stack Hardening & Stability Patch)! 🚀

This maintenance and stabilization release delivers multi-tier AMD & laptop thermal telemetry detection, fixes vertical navigation scrolling across all 25 views, hardens frontend state machines with bounded log buffers, expands keyboard accessibility, achieves 100% translation parity across 1,328 keys in English and Russian, and enforces zero-deadlock backend concurrency.

---

## 🌟 What's New & Fixed in v1.4.1

### 1. 🌡️ Multi-Tier Hardware Telemetry & Temperature Monitoring
- **Dynamic AMD Display Library (ADL2) & Overdrive Support**:
  - Runtime dynamic loading of `atiadlxx.dll` (64-bit) and `atiadlxy.dll` (32-bit fallback) via `libloading` with zero static library coupling or missing DLL errors on non-AMD hardware.
  - Native support for AMD Overdrive 5 (`ADL_Overdrive5_Temperature_Get`) and Overdrive 6 (`ADL2_Overdrive6_Temperature_Get`) telemetry APIs with millidegrees-to-Celsius conversion.
  - Thread-safe Win32 `HeapAlloc` callback allocator (`GetProcessHeap`) ensuring robust C-ABI memory management between graphics drivers and the Rust runtime.
  - Multi-head GPU adapter deduplication by `(bus_number, device_number)` to eliminate duplicate sensor readings across multiple physical display outputs.
  - Dynamic CLI fallback via `amd-smi` when available.
- **NVIDIA NVML & Dual-Namespace ACPI Thermal Zones**:
  - Dynamically resolved NVIDIA NVML hardware telemetry queries.
  - Dual-namespace polling across `root\wmi` (`MSAcpi_ThermalZoneTemperature`) and `root\cimv2` (`Win32_PerfFormattedData_Counters_ThermalZoneInformation`, `Win32_TemperatureProbe`).
  - Native deci-Kelvin `(deci_k - 2732.0) / 10.0`, Kelvin, and Celsius normalization across diverse OEM BIOS implementations (Lenovo, ASUS, Dell, HP, Microsoft Surface).
  - Background process execution using `0x08000000` (`CREATE_NO_WINDOW`) and bounded 2-second timeouts, eliminating UI micro-stutters and console window popups.
- **Intelligent Heuristic Validation & DSDT Stub Filtering**:
  - Strict physical boundary validation (`is_valid_temperature`) rejecting $\le 5.0^\circ\text{C}$, $\ge 118.0^\circ\text{C}$, NaN, and Inf readings.
  - Dynamic heuristic filtering (`is_dummy_acpi_reading`) suppressing static OEM ACPI table stubs ($300.0\text{ K} = 26.85^\circ\text{C}$ and $301.0\text{ K} = 27.85^\circ\text{C}$) emitted on unpopulated motherboard thermal slots.
  - Accurate sensor categorization (`classify_sensor`) ensuring GPU thermistors take precedence over CPU/Motherboard labels.
  - Prioritized sensor selection (`select_primary_cpu_sensor`, `select_primary_gpu_sensor`) favoring active package thermistors (Package, Tdie, Tctl, Core Max) over static board zones.

---

### 2. 🧭 UI Navigation Scrolling & Dark Scrollbar Integration
- **3-Tier Independent Flex Layout**:
  - Restructured `src/components/Navigation.tsx` into 3 independent flex tiers:
    1. **Pinned Brand Header** (`shrink-0`): Logo and version badge stay persistently visible at the top.
    2. **Scrollable Navigation Viewport** (`flex-1 min-h-0 overflow-y-auto custom-scrollbar`): Houses all 25 navigation views, enabling smooth scrolling across any viewport height down to 400px.
    3. **Pinned Admin Elevation Card** (`shrink-0 bg-surface`): Privilege status, refresh action, and elevation controls remain permanently anchored at the bottom.
- **Refined Minimal Dark Scrollbar**:
  - Added dedicated `.custom-scrollbar` utility classes and global scrollbar styles in `src/index.css` matching the `#090A0C` / `#121417` / `#22252A` design system.
  - Subpixel 5px scrollbar track with rounded `#22252A` thumb, smooth `#374151` hover transition, and zero layout shift.
- **Keyboard Accessibility (WCAG 2.1 AA)**:
  - Added `Escape` key event listeners in `SafetyModal.tsx` and `GitHubIssueModal.tsx` for keyboard dismissal.
  - Navigation landmarks (`aria-label="Main Navigation"`), active page indicators (`aria-current="page"`), and visible keyboard focus rings (`focus-visible:ring-1 focus-visible:ring-brand`).
  - Multilingual text truncation with `shrink-0` icon retention and `truncate text-left` label alignment.

---

### 3. 🛡️ Frontend State Machine Hardening & Memory Safety
- **Bounded Script Output Ring Buffer**:
  - Hardened `src/store/slices/scriptRunnerSlice.ts` to enforce a strict 2,000-line ring buffer limit (`MAX_SCRIPT_LOG_LINES = 2000`) on `outputLogs`, preventing browser memory leaks during high-throughput script streaming.
- **Bounded UI Log Ring Buffer**:
  - Enforced a strict 1,000-entry memory cap in `src/store/slices/uiSlice.ts` (`logs`), preventing memory bloat during continuous telemetry logging.
- **Presets Batch Optimization**:
  - Replaced sequential iterative dispatch with atomic single-pass map updates (`setSelectedOptimizations`), achieving a 21.7x performance speedup in preset application.
- **Subsystem Header Localization**:
  - Localized dynamic tab headers in `Header.tsx` for `gaming_latency`, `smart_ram`, `network_shield`, and `hardware_health`.
  - Localized UI elements in `TemperatureSensorWidget.tsx`, `SafetyModal.tsx`, and telemetry diagnostic panels.

---

### 4. 🌐 100% Localization Parity Across 1,328 Keys
- **Dual-Locale Parity (English & Russian)**:
  - 100% 1:1 key parity between `src/i18n/locales/en.json` (1,328 keys) and `src/i18n/locales/ru.json` (1,328 keys).
  - 0 missing keys and 0 orphaned keys across 90+ TypeScript components and modals.
  - 100% interpolation parameter symmetry across all translation placeholders (`{{count}}`, `{{name}}`, `{{version}}`).

---

### 5. ⚡ Backend Concurrency, Thread Safety & Security Safeguards
- **Deadlock-Free Dual-Stream Process Pipe Runner**:
  - Asynchronous background reading of process `stdout` and `stderr` streams with bounded channels, preventing thread deadlocks when scripts output large data blocks.
- **Process Tree Teardown & Safe Cancellation**:
  - Robust Win32 Job Object and process tree termination (`kill_process_tree`) with safe zero-PID handling and idempotent cancellation state transitions.
- **Path Traversal Containment & Elevation Safeguards**:
  - Strict relative path sanitization rejecting directory traversal (`..`), null bytes, absolute drive letters, and UNC paths.
  - Safe PowerShell 5.1/7 invocation with single-quote escaping for parameter injection immunity.
  - Safe error propagation with Rust `Result<T, AppError>` and zero unhandled panics across all Tauri command handlers.

---

## 💎 Automated Verification & Quality Metrics

All verification suites completed with a **100% pass rate**:

| Verification Suite | Target | Result | Status |
|---|---|---|---|
| Rust Cargo Check | `src-tauri` | 0 errors / 0 warnings | ✅ PASS |
| Rust Unit Tests | `cargo test --lib` | 237 / 237 passed | ✅ PASS |
| TypeScript Compiler | `npx tsc --noEmit` | 0 errors | ✅ PASS |
| Vite Production Build | `npm run build` | 1,898 modules transformed in 3.38s | ✅ PASS |
| Version Synchronization | `tests/test_challenger1_m3_version_verification.cjs` | 7 / 7 files verified | ✅ PASS |
| Master Regression Suite | `tests/test_m3_master_regression_suite.cjs` | 21 / 21 checks passed | ✅ PASS |
| E2E Master Runner | `npm test` (`tests/e2e/runner.js`) | 66 / 66 scenarios passed | ✅ PASS |
| i18n Parity Suite | `tests/test_i18n_parity.cjs` | 1,328 / 1,328 keys matched | ✅ PASS |
| Component Key Audit | `tests/test_component_i18n_keys.cjs` | 90 files / 0 missing keys | ✅ PASS |
| All Node Test Suites | `tests/*.cjs` (24 suites) | 100% passed | ✅ PASS |

---

## 📦 Release Artifacts & Compatibility

- **Supported Operating Systems**: Windows 10 (1809+) & Windows 11 (all builds including 23H2 and 24H2).
- **Architecture**: x86_64 (64-bit native Windows executable).
- **Distributions**:
  - `WiScripts_1.4.1_x64-setup.exe` (NSIS Installer with auto-updater support)
  - `WiScripts_1.4.1_x64_Portable.zip` (Standalone portable zero-install package)

---

## 🛠️ Commit Log Highlights
- `feat(telemetry): add multi-tier AMD ADL2 and laptop ACPI temperature detection`
- `feat(ui): implement 3-tier scrollable navigation layout with dark minimal scrollbars`
- `feat(a11y): add Escape key modal dismissal for safety and issue dialogs`
- `fix(store): enforce 2000-line ring buffer on script runner output logs`
- `fix(i18n): achieve 100% key parity across 1,328 translation keys in EN and RU`
- `test(regression): add full automated regression and version verification suites`
- `chore(release): bump version to 1.4.1 and finalize release stability`

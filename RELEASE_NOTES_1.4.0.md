# Release Notes — WiScripts Windows v1.4.0

We are excited to announce the release of **WiScripts Windows v1.4.0** (Hardware Thermals & Navigation Overhaul)! 🚀

This release introduces an enterprise-grade, multi-tier **AMD CPU/GPU and Laptop ACPI Hardware Temperature Monitoring Engine**, resolves navigation accessibility on constrained viewports via a **3-Tier Fixed Header/Footer & Scrollable Navigation Sidebar**, and enforces complete build, type safety, and test suite verification.

---

## 🌟 What's New in v1.4.0

### 1. 🌡️ Robust Multi-Tier Hardware Temperature Monitoring (AMD & Laptops)
- **Dynamic AMD Display Library (ADL) Integration**:
  - Runtime dynamic loading of `atiadlxx.dll` (64-bit) and `atiadlxy.dll` (32-bit fallback) via `libloading` with zero static library coupling or missing DLL errors on non-AMD systems.
  - Full support for AMD Overdrive 5 (`ADL_Overdrive5_Temperature_Get`) and Overdrive 6 (`ADL2_Overdrive6_Temperature_Get`) telemetry APIs with millidegrees-to-Celsius conversion (`val / 1000.0`).
  - Thread-safe Win32 `HeapAlloc` callback allocator (`GetProcessHeap`) ensuring robust C-ABI memory management between AMD graphics drivers and the Rust runtime.
  - Multi-head GPU adapter deduplication by `(bus_number, device_number)` to eliminate duplicate sensor readings across multiple physical display outputs.
  - Dynamic CLI fallback via `amd-smi` when available.
- **Expanded Dual-Namespace ACPI & Laptop Thermal Zones**:
  - Dual-namespace polling across `root\wmi` (`MSAcpi_ThermalZoneTemperature`) and `root\cimv2` (`Win32_PerfFormattedData_Counters_ThermalZoneInformation`, `Win32_TemperatureProbe`).
  - Native deci-Kelvin `(deci_k - 2732.0) / 10.0`, Kelvin, and Celsius normalization across diverse OEM BIOS implementations (Lenovo, ASUS, Dell, HP, Microsoft Surface).
  - Background process execution using `0x08000000` (`CREATE_NO_WINDOW`) and bounded 2-second timeouts, eliminating UI micro-stutters and console window popups.
- **Intelligent Sensor Validation & Dummy Stub Filtering**:
  - Strict physical boundary validation (`is_valid_temperature`) rejecting $\le 5.0^\circ\text{C}$, $\ge 118.0^\circ\text{C}$, NaN, and Inf readings.
  - Dynamic heuristic filtering (`is_dummy_acpi_reading`) suppressing static OEM ACPI table stubs ($300.0\text{ K} = 26.85^\circ\text{C}$ and $301.0\text{ K} = 27.85^\circ\text{C}$) emitted on unpopulated motherboard thermal slots.
  - Accurate sensor categorization (`classify_sensor`) ensuring GPU thermistors take precedence over CPU/Motherboard labels.
  - Prioritized sensor selection (`select_primary_cpu_sensor`, `select_primary_gpu_sensor`) favoring active package thermistors (Package, Tdie, Tctl, Core Max) over static board zones.

---

### 2. 🧭 Navigation Sidebar Scroll Fix & Refined Minimal Aesthetics
- **3-Tier Architectural Flex Layout**:
  - Restructured `Navigation.tsx` into 3 independent flex tiers:
    1. **Pinned Brand Header** (`shrink-0`): Logo and version badge stay persistently visible at the top.
    2. **Scrollable Navigation Viewport** (`flex-1 min-h-0 overflow-y-auto custom-scrollbar`): Houses all 25 navigation items, allowing seamless scrolling across any display height down to 400px.
    3. **Pinned Admin Elevation Card** (`shrink-0 bg-surface`): System privilege status, refresh action, and elevation controls remain permanently anchored at the bottom.
- **Refined Minimal Dark Scrollbar**:
  - Added dedicated `.custom-scrollbar` utility classes and global scrollbar styles in `src/index.css` matching the `#090A0C` / `#121417` / `#22252A` design system.
  - Subpixel 5px scrollbar track with rounded `#22252A` thumb, smooth `#374151` hover transition, and zero layout shift.
- **Accessibility & Internationalization (WCAG 2.1 AA)**:
  - Standard navigation landmarks (`aria-label="Main Navigation"`), active page indicators (`aria-current="page"`), and visible keyboard focus rings (`focus-visible:ring-1 focus-visible:ring-brand`).
  - Text truncation with `shrink-0` icon retention and `truncate text-left` label alignment for seamless multilingual rendering in English and Russian.

---

### 3. 💎 Quality Assurance & Verification Metrics
- **Zero-Warning Code Quality**:
  - TypeScript compiler (`npx tsc --noEmit`): 0 errors across all UI modules.
  - Vite production bundle (`npm run build`): 1,898 modules transformed in ~3.5s with clean chunk splitting.
  - Rust Clippy (`cargo clippy --all-targets -- -D warnings`): 0 warnings across library and test targets.
- **Comprehensive Test Suite Coverage**:
  - **237 / 237** Rust unit tests passing (`cargo test --lib`).
  - **93 / 93** Rust integration tests passing across all 13 suites.
  - **66 / 66** Master E2E tests passing (`npm test`).
  - **21 / 21** Master regression checks passing (`tests/test_m3_master_regression_suite.cjs`).
  - **33 / 33** UI boundary challenger tests passing (`tests/test_challenger2_e2e_ui_boundary_stress.cjs`).
  - **10 / 10** Navigation sidebar scroll tests passing (`tests/test_navigation_sidebar_scroll.cjs`).

---

## 📦 Release Artifacts & Compatibility
- **Supported Operating Systems**: Windows 10 (1809+) & Windows 11 (all builds including 23H2 and 24H2).
- **Architecture**: x86_64 (64-bit native).
- **Distributions**:
  - `WiScripts_1.4.0_x64-setup.exe` (NSIS Installer with auto-updater support)
  - `WiScripts_1.4.0_x64_Portable.zip` (Standalone portable zero-install package)

---

## 🛠️ Commit Log Highlights
- `feat(hardware): implement dynamic AMD ADL (atiadlxx.dll) GPU temperature sensor monitoring`
- `feat(hardware): expand ACPI thermal zone polling and sensor validation/dummy stub filtering`
- `feat(ui): implement 3-tier pinned navigation layout with custom minimal dark scrollbar`
- `test(hardware): add unit and adversarial stress test suites for ADL, ACPI, and sensor selection`
- `test(ui): add automated verification suite for navigation scrollability and accessibility`
- `chore(release): bump version to 1.4.0 across manifests and publish release notes`

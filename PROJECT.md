# Project: WiScripts Windows High-Performance Subsystems (v1.3.0)

## Architecture
WiScripts Windows is a high-performance Windows optimization and system telemetry utility built on Tauri 2.0 (Rust backend) and React 18 + TypeScript + Tailwind CSS (frontend).

### Architectural Layers
1. **Low-Level Native Kernel & Win32 Layer (`src-tauri/src/`)**:
   - Direct Win32 and NT kernel API interactions (`ntdll.dll`, `psapi.dll`, `iphlpapi.dll`, `powrprof.dll`, `kernel32.dll`).
   - Privilege management (`SeProfileSingleProcessPrivilege`, `SeIncreaseQuotaPrivilege`).
   - Memory management (`NtSetSystemInformation` with `SystemMemoryListInformation`, `K32EmptyWorkingSet`).
   - Real-time kernel timers & DPC telemetry (`NtSetTimerResolution`, `timeBeginPeriod`, `QueryPerformanceCounter`, `NtQuerySystemInformation`).
   - Network socket telemetry & firewall shield (`GetExtendedTcpTable`, `GetExtendedUdpTable`, `netsh advfirewall`, Windows Firewall COM).
   - Storage SMART & battery telemetry (`IOCTL_STORAGE_QUERY_PROPERTY` for NVMe Health Log, `GetSystemPowerStatus`, `CallNtPowerInformation`, WMI `BatteryStaticData`, `powercfg`).
2. **Tauri IPC Command Layer (`src-tauri/src/lib.rs`)**:
   - Strongly-typed, serialized IPC command handlers returning `Result<T, AppError>`.
   - Comprehensive error handling and graceful fallbacks for unprivileged execution.
3. **Frontend State & UI Layer (`src/`)**:
   - Modular React 18 views with code-splitting (`React.lazy` + `<Suspense>`).
   - Centralized Zustand store (`useAppStore`) with domain slices.
   - Refined Minimal aesthetic: `#090A0C` background, `#121417` cards, `#22252A` borders, `tabular-nums` typography, accessible ARIA roles, GPU-accelerated micro-charts.
   - Full internationalization parity (`en.json` & `ru.json`).
   - Global Sidebar navigation & fuzzy Command Palette indexing.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | DPC & ISR Latency Analyzer | Real-time measurement and visualization of DPC/ISR latency metrics and timer jitter via QPC / NtQuerySystemInformation | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Game Boost & Timer Resolution | High-priority process assignment, non-essential service suspension during gaming, and 0.5ms timer resolution adjustment (NtSetTimerResolution / timeBeginPeriod) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Standby List Memory Purge | Low-level kernel standby list memory purge via NtSetSystemInformation (MemoryPurgeStandbyList) with SeProfileSingleProcessPrivilege | M2 | ORIGINAL_REQUEST §R2 |
| 4 | Working Set Trimmer & Auto-Optimizer | Process working set clearing via EmptyWorkingSet, configurable RAM percentage background auto-trimmer, safe excluded processes list | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Live Network Socket Monitor | Real-time TCP/UDP socket monitoring with local/remote endpoints, active state, protocol, PID resolution, process names, and bandwidth estimation | M3 | ORIGINAL_REQUEST §R3 |
| 6 | Process Firewall Shield | One-click inbound/outbound firewall rule creation/deletion for target executables via netsh advfirewall / Windows Firewall COM | M3 | ORIGINAL_REQUEST §R3 |
| 7 | Hardware NVMe SMART Health | Physical drive NVMe health telemetry (temperature, TBW, percentage health, spare capacity, power-on hours) via IOCTL_STORAGE_QUERY_PROPERTY / WMI | M4 | ORIGINAL_REQUEST §R4 |
| 8 | Battery & Power Analytics | Battery wear level, charge cycles, discharge rate, power plan enumeration, and one-click activation of Windows Ultimate Performance scheme | M4 | ORIGINAL_REQUEST §R4 |
| 9 | Refined Minimal UI Views | 4 modular React 18 views (Gaming, RAM, Network Shield, Hardware Health) adhering to Refined Minimal aesthetic (#090A0C, tabular-nums) | M5 | ORIGINAL_REQUEST §R5 |
| 10 | Navigation & Command Palette Integration | Integration of 4 new views into Sidebar Navigation, Command Palette indexing, and TabType routing | M5 | ORIGINAL_REQUEST §R5 |
| 11 | Internationalization (i18n) Parity | 100% key and parameter parity across en.json and ru.json for all new features | M5 | ORIGINAL_REQUEST §R5 |
| 12 | Zero-Warning Quality & Multi-Tier Testing | Zero clippy warnings, zero tsc errors, 100% passing Rust unit tests & Node E2E test suite across Tiers 1–4, and adversarial verification | M6 | ORIGINAL_REQUEST §R5 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Simulator engines in harness.js & comprehensive test suite (Tiers 1–4) for R1–R5, publishing TEST_READY.md | none | DONE |
| M1 | Gaming Latency Engine & DPC Analyzer | Backend `src-tauri/src/gaming/` + IPC commands + unit tests | none | DONE |
| M2 | Smart RAM & Standby List Memory Purger | Backend `src-tauri/src/memory/` + IPC commands + unit tests | none | DONE |
| M3 | Live Network Traffic & Process Firewall Shield | Backend `src-tauri/src/network_shield/` + IPC commands + unit tests | none | DONE |
| M4 | Hardware NVMe SMART & Battery Analytics | Backend `src-tauri/src/hardware_health/` + IPC commands + unit tests | none | DONE |
| M5 | UI Architecture & Parity Integration | Frontend types, slices, views, Navigation, Command Palette, en/ru i18n parity, aesthetic styling | M1, M2, M3, M4 | DONE |
| M6 | Final Verification & Quality Pass | 100% Clippy zero warnings, tsc clean, passing cargo tests, 100% passing E2E test suite, and adversarial verification | E2E, M5 | DONE |

---

## Interface Contracts

### 1. Gaming & Latency Subsystem (`M1`)
```rust
// IPC Commands:
// - get_latency_metrics() -> Result<LatencyMetrics, AppError>
// - set_timer_resolution(resolution_100ns: u32) -> Result<TimerResolutionInfo, AppError>
// - toggle_game_boost(target_pid: Option<u32>, enable: bool) -> Result<GameBoostStatus, AppError>
// - get_game_boost_status() -> Result<GameBoostStatus, AppError>
```

### 2. Smart RAM Subsystem (`M2`)
```rust
// IPC Commands:
// - get_memory_breakdown() -> Result<MemoryBreakdown, AppError>
// - purge_standby_memory(mode: StandbyPurgeMode) -> Result<PurgeResult, AppError>
// - purge_working_sets(excluded_pids: Vec<u32>) -> Result<PurgeResult, AppError>
// - configure_ram_auto_trimmer(config: AutoTrimmerConfig) -> Result<AutoTrimmerConfig, AppError>
// - get_ram_auto_trimmer_config() -> Result<AutoTrimmerConfig, AppError>
```

### 3. Network Traffic & Firewall Shield (`M3`)
```rust
// IPC Commands:
// - get_active_network_connections() -> Result<Vec<NetworkConnection>, AppError>
// - get_firewall_rules() -> Result<Vec<FirewallRuleInfo>, AppError>
// - block_process_firewall(process_path: String, rule_name: String) -> Result<FirewallActionResult, AppError>
// - unblock_process_firewall(rule_name: String) -> Result<FirewallActionResult, AppError>
```

### 4. Hardware Health & Power Subsystem (`M4`)
```rust
// IPC Commands:
// - get_storage_devices_health() -> Result<Vec<StorageDeviceHealth>, AppError>
// - get_battery_health_analytics() -> Result<BatteryHealthAnalytics, AppError>
// - get_power_schemes() -> Result<Vec<PowerSchemeInfo>, AppError>
// - set_active_power_scheme(scheme_guid: String) -> Result<bool, AppError>
// - enable_ultimate_performance_scheme() -> Result<PowerSchemeInfo, AppError>
```

---

## Code Layout

### Backend (`src-tauri/src/`)
- `lib.rs` — Tauri command handler registration
- `gaming/mod.rs` — DPC/ISR kernel jitter telemetry, timer resolution, Game Boost orchestration & unit tests
- `memory/mod.rs` — Standby list purge, working set trimmer, auto-trim background task & unit tests
- `network_shield/mod.rs` — Socket table queries (TCP/UDP), process resolver, firewall rules management & unit tests
- `hardware_health/mod.rs` — NVMe SMART IOCTL, battery analytics, power schemes & unit tests

### Frontend (`src/`)
- `types/` — `gaming.ts`, `smartRam.ts`, `networkShield.ts`, `hardwareHealth.ts`, `index.ts`
- `store/slices/` — `gamingSlice.ts`, `smartRamSlice.ts`, `networkShieldSlice.ts`, `hardwareHealthSlice.ts`
- `views/` — `GamingLatencyView.tsx`, `SmartRamView.tsx`, `NetworkShieldView.tsx`, `HardwareHealthView.tsx`
- `components/` — `Navigation.tsx`, `CommandPalette.tsx`, `SparklineAreaGraph.tsx`
- `locales/` — `en.json`, `ru.json`

### Tests (`tests/`)
- `tests/e2e/harness.js` — Simulator engines and mock IPC
- `tests/e2e/tier1_feature_coverage.test.js` — Tier 1 test cases
- `tests/e2e/tier2_boundary_edge.test.js` — Tier 2 test cases
- `tests/e2e/tier3_cross_feature.test.js` — Tier 3 test cases
- `tests/e2e/tier4_real_world.test.js` — Tier 4 test cases
- `tests/test_i18n_parity.cjs` — i18n key and parameter validation
- `tests/test_component_i18n_keys.cjs` — JSX component key validation

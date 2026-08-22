# Release Notes — WiScripts Windows v1.3.0

We are thrilled to announce the major release of **WiScripts Windows v1.3.0** (High-Performance Subsystems Release)! 🚀

This release introduces 4 major, enterprise-grade system subsystems: **Gaming Low-Latency & DPC Latency Analyzer**, **Smart RAM & Standby List Memory Purger**, **Live Network Traffic & Process Firewall Shield**, and **Hardware NVMe SMART & Battery/Power Analytics**, along with an expanded Refined Minimal UI and 100% localization parity.

---

## 🌟 What's New in v1.3.0

### 1. ⚡ Gaming Low-Latency Engine & DPC Latency Analyzer
- **Real-Time Kernel DPC & ISR Telemetry**: Real-time measurement and visualization of DPC and ISR latency metrics, execution counts, and kernel timer jitter via native NT APIs (`NtQuerySystemInformation`, QPC).
- **Game Boost Orchestration**:
  - Precision kernel timer resolution adjustment down to **0.5 ms** (`NtSetTimerResolution` / `timeBeginPeriod`).
  - Dynamic high-priority process class assignment (`HIGH_PRIORITY_CLASS`) for targeted game processes.
  - Automatic temporary suspension of non-essential Windows background services during active gaming sessions.
- **Dedicated View**: `GamingLatencyView.tsx` with live telemetry sparklines, timer precision badges, and one-click game boost control.

---

### 2. 🧠 Smart RAM & Standby List Memory Purger
- **Native Kernel Standby Memory Purging**: Direct NT kernel Standby List memory purge via `NtSetSystemInformation` with `SystemMemoryListInformation` (MemoryPurgeStandbyList) leveraging `SeProfileSingleProcessPrivilege`.
- **Working Set Trimming**: Comprehensive per-process memory clearing via `K32EmptyWorkingSet`.
- **Automated Memory Guard**: Background memory auto-trimmer triggered when physical RAM usage exceeds configurable thresholds (default: 85%), with intelligent protection for critical system processes.
- **Dedicated View**: `SmartRamView.tsx` featuring visual memory breakdown charts (In-Use, Standby, Modified, Free), purge history ledger, and whitelist configuration.

---

### 3. 🛡️ Live Network Traffic & Process Firewall Shield
- **Per-Process Socket Inspection**: Real-time enumeration of active TCP and UDP sockets via Win32 IP Helper API (`GetExtendedTcpTable`, `GetExtendedUdpTable`), displaying local/remote endpoints, TCP state machine status, and resolved process executable names.
- **One-Click Firewall Shield**: Instant inbound/outbound firewall rule creation and removal for any target application via Windows Defender Firewall (`netsh advfirewall`).
- **Real-Time Bandwidth Estimation**: Per-process bandwidth throughput calculation and suspicious port alerting.
- **Dedicated View**: `NetworkShieldView.tsx` with active socket filtering, protocol state badges, and active firewall rule management.

---

### 4. 🔋 Hardware NVMe SMART Health & Battery/Power Analytics
- **Low-Level NVMe SMART Diagnostics**: Direct query of physical storage drives via `IOCTL_STORAGE_QUERY_PROPERTY` returning temperature, Total Bytes Written (TBW), drive health percentage, available spare capacity, and power-on hours.
- **Battery Wear & Cycle Telemetry**: Deep battery health diagnostics (design capacity, current full charge capacity, wear percentage, cycle count, charge rate, and chemistry) via `CallNtPowerInformation` and WMI.
- **Windows Ultimate Performance Scheme**: One-click activation and switching to the hidden Windows **Ultimate Performance** power plan (`e9a42b02-d5df-448d-aa00-03f14749eb61`).
- **Dedicated View**: `HardwareHealthView.tsx` with hardware telemetry cards and power scheme switcher.

---

### 5. 💎 UI Architecture, Design & Quality Standards
- **Refined Minimal Aesthetic**: Deep dark canvas (`#090A0C`), tabular-nums typography, subpixel hairlines, accessible ARIA roles, and GPU-accelerated micro-graphs.
- **Navigation & Command Palette**: All 4 new views seamlessly integrated into the global sidebar (`Navigation.tsx`) and fuzzy-searchable via Command Palette (`Ctrl+K` / `/`).
- **100% i18n Parity**: Full bidirectional translation parity across **1,314 keys** in English (`en.json`) and Russian (`ru.json`).
- **Comprehensive Quality Verification**:
  - Zero warnings on `cargo clippy --all-targets -- -D warnings`.
  - 224 / 224 unit tests passing (`cargo test --lib`).
  - 16 / 16 adversarial stress tests passing (`cargo test --test subsystems_adversarial_stress_tests`).
  - 66 / 66 end-to-end tests passing (`npm test`).
  - Clean TypeScript build (`npm run build`).

---

## 📦 Release Artifacts & Compatibility
- **Supported Operating Systems**: Windows 10 (1809+) & Windows 11 (all versions including 23H2 / 24H2).
- **Architecture**: x86_64 (64-bit native).
- **Distributions**:
  - `WiScripts_1.3.0_x64-setup.exe` (NSIS Installer with auto-updater support)
  - `WiScripts_1.3.0_x64_Portable.zip` (Standalone portable zero-install package)

---

## 🛠️ Commit Log Highlights
- `feat(gaming): implement DPC/ISR kernel latency analyzer and 0.5ms Game Boost engine`
- `feat(memory): add native Standby List memory purge and automated RAM trimmer`
- `feat(network): implement live process socket monitor and 1-click Firewall Shield`
- `feat(hardware): add NVMe SMART diagnostics, battery wear analytics, and Ultimate power plan`
- `feat(ui): add 4 modular Refined Minimal views, Navigation integration, and 100% i18n parity`
- `chore(release): bump version to 1.3.0 and publish release notes`

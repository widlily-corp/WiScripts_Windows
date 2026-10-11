# WiScripts Windows 🚀

[![Release](https://img.shields.io/badge/release-v1.7.1-blue.svg)](https://github.com/widlily-corp/WiScripts_Windows/releases)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-orange.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**WiScripts Windows** is a high-performance, open-source Windows 10/11 optimization, diagnostics, script execution, and hardware monitoring workstation. Engineered with **Tauri v2**, **Rust 2021**, **React 18**, **TypeScript**, **Zustand**, and **Tailwind CSS**, it combines native kernel-level performance with a clean, modern user interface.

---

## 🌟 Key Features (v1.7.1 Release)

### 💽 CrystalDiskInfo Architecture & S.M.A.R.T. Telemetry (v1.7.1)
- **Low-Level Win32 IOCTL Driver Engine:** Adopts low-level hardware communication standards directly from [CrystalDiskInfo](https://github.com/hiyohiyo/CrystalDiskInfo) (by Noriyuki Miyazaki / hiyohiyo):
  - `IOCTL_STORAGE_GET_DEVICE_NUMBER` (`0x002D1080`): Maps logical volumes (`C:`, `D:`) to `PhysicalDriveX`.
  - `NVME_LOG_PAGE_HEALTH_INFO` (Log Page `0x02`): Reads 15 authentic NVMe health metrics with Kelvin-to-Celsius conversion, spare reserve thresholds, and wear indicators.
  - `NVME_IDENTIFY_CNS_CONTROLLER` (CNS `0x01`): Extracts authentic firmware revision, controller serial number, and NVMe specification standard.
- **CrystalDiskInfo Experience UI:**
  - Multi-Drive Selector Bar with real-time temperature pills and health status badges.
  - Circular Wear Health Gauge (`Good 100%`) and color-coded temperature monitoring.
  - 6-Metric Endurance Matrix (TBW, TBR, Power-on Hours, Power-on Cycles, Unsafe Shutdowns, Available Spare Blocks).
  - Searchable interactive S.M.A.R.T. table with raw hex decoding.
  - 1-Click signature CrystalDiskInfo text report export to system clipboard.
  - Open-Source attribution card crediting hiyohiyo and the CrystalDiskInfo community.

### 🧭 Semantic Categorized Navigation & Instant Quick Search (v1.7.1)
- **6 Semantic Navigation Categories:** Organizes 25 system tools into logical groups:
  1. *Мониторинг и Система* (Dashboard, Diagnostics, Hardware Health & SSD, Smart RAM)
  2. *Производительность* (Optimization, Game Boost, CPU Governor ProFlow, Gaming Latency & DPC)
  3. *Диски и Очистка* (Disk Space Analyzer, System Cleaner, Duplicate Finder)
  4. *Система и Программы* (Startup Manager, Services & Scheduler, Uninstaller, Package Manager)
  5. *Безопасность и Сеть* (Network Shield & DNS, Context Menu, Restore Points, State Engine Snapshots)
  6. *Сервис и Настройки* (Script Library, Tweak Presets, Driver Backup, Settings)
- **Real-Time Header Search:** Sidebar quick-filter input instantly filters tabs by keyword with `Esc`/`✕` one-touch reset.

### 📁 Disk Space Analyzer & Filesystem Explorer (v1.6.0)
- **High-Speed Multithreaded Scanning:** Traverses physical volumes and folders recursively with real-time streaming progress events.
- **Visual Ranked Breakdown:** Instant discovery of Top 20 Largest Folders and Top 50 Largest Files.
- **Interactive Directory Tree:** Hierarchical navigation, proportional size bars, extension filters, and size thresholds.
- **Kernel Guardrail Safety:** Strictly prevents deletion of critical Windows OS directories (`System32`, `Windows`, drive roots).

### 🌡️ Multi-Tier Hardware Telemetry & AMD/Laptop Support
- **Cascading Sensor Engine:**
  1. *Tier 1 (In-Process GPU DLLs):* AMD ADL (`atiadlxx.dll`/`atiadlxy.dll`) + NVIDIA NVML (`nvml.dll`).
  2. *Tier 2 (Hardware Monitors):* LibreHardwareMonitor & OpenHardwareMonitor via WMI.
  3. *Tier 3 (Laptop & ACPI Thermal Zones):* `MSAcpi_ThermalZoneTemperature` (`root\wmi`) & `Win32_PerfFormattedData_Counters_ThermalZoneInformation` (`root\cimv2`).
  4. *Tier 4 (CLI Telemetry Fallbacks):* `nvidia-smi` & `amd-smi` with 2-second timeout protection.
  5. *Tier 5 (Universal Kernel Fallback):* `sysinfo` Components.
- **Smart Filtering:** Automatically rejects static BIOS dummy zones and invalid thermal readings.

### 🌐 Online Script Library & GitHub Sync (`scripts_lib`)

### 🧠 ProFlow Resource Governor
- **Dynamic RAM Working Set Trimming:** Free unused physical memory on demand across background processes.
- **Process Affinity & Priority Tuning:** Granular process priority adjustment and P/E-Core CPU affinity pinning for low latency.

### ⏪ StateEngine (Transactional Snapshots & Rollback)
- **Zero-Restart Surgical Rollbacks:** Create point-in-time snapshots of Registry values and Windows Service states.
- **Diff & Revert:** Inspect granular before/after diffs and restore system state with transactional safety.

### 🔎 AutoRuns & Security Inspector
- **25+ Autostart Locations:** High-speed parallel scanning of Registry Run keys, Startup folders, Scheduled Tasks, and Winlogon.
- **Authenticode Verification:** Integrated Win32 digital signature verification for instant malware and unsigned binary detection.
- **Quarantine & Toggle:** Safely disable, quarantine, or re-enable autostart items without destructive file deletion.

### 🔊 WASAPI Audio Session Router
- **Per-Application Routing:** Re-route individual running application audio streams to different playback devices on the fly.
- **Independent Volume Attenuation:** Adjust volume levels per audio endpoint session without global master volume interference.

### 📦 Package & Bloatware Manager
- **`winget` Native GUI:** Search, install, batch-update, and uninstall Windows applications seamlessly.
- **Deep UWP Telemetry Debloater:** Clean pre-installed Windows UWP apps and telemetry packages with safety filters.

### 🧹 System Cleaner & Storage Utilities
- **Safe Cache Clearing:** Purge Windows Update cache, temp directories, crash dumps, and browser artifacts.
- **Multi-Threaded Duplicate Finder:** Blazing-fast parallel file scanning powered by Rayon and cryptographic SHA-256 hashing.

### 🛡️ Diagnostics, Driver Backup & MAS Integration
- **One-Click Diagnostics:** Automated visual runners for `sfc /scannow`, `DISM /RestoreHealth`, and TCP/IP stack resets.
- **Driver Backup:** Export and archive all 3rd-party installed drivers prior to clean installations.
- **Microsoft Activation & ODT:** Integration with MAS and Office Deployment Tool XML generation with regional bypass support.

---

## 🏗️ Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Frontend (React 18 + TypeScript + Vite)                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │ UI Views & Tabs  │  │  Zustand Slices  │  │ Dynamic Telemetry Widgets │  │
│  │ (ScriptRunner,   │  │ (system, audio,  │  │ (Sparkline, Temperature,  │  │
│  │  Governor, etc.) │  │  governor, etc.) │  │  Queue State Banner)      │  │
│  └────────┬─────────┘  └────────┬─────────┘  └─────────────┬─────────────┘  │
└───────────┼─────────────────────┼──────────────────────────┼────────────────┘
            │                     │                          │
            ▼                     ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Tauri v2 Async IPC Command Layer                       │
│       (44 Registered Commands · Strict Serde JSON Serialization · Events)   │
└───────────┬─────────────────────┬──────────────────────────┬────────────────┘
            │                     │                          │
            ▼                     ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Backend (Rust 2021 Core)                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │  23 Domain Rust  │  │  Win32 Native    │  │  Execution Runner         │  │
│  │  Submodules      │  │  APIs & SCM      │  │  (RealRunner/DryRunRunner)│  │
│  └────────┬─────────┘  └────────┬─────────┘  └─────────────┬─────────────┘  │
└───────────┼─────────────────────┼──────────────────────────┼────────────────┘
            │                     │                          │
            ▼                     ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Windows 10 / 11 Operating System                      │
│     [Registry]   [WASAPI Audio]   [Task Scheduler]   [WMI/NVML Sensors]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend:** React 18, TypeScript 5.6, Zustand 4.5, Tailwind CSS 3.4, Lucide Icons, i18next (English & Russian).
- **Backend:** Rust 2021, Tauri v2.0, Windows Sys / WinAPI (0.58), Rayon (Parallel Computing), Sysinfo (0.30).
- **Security:** Native Win32 `OpenProcessToken` elevation verification, `ShellExecuteW` argument quotation escaping, and strict path whitelisting.

---

## 🚀 Installation & Usage

1. Download the latest installer or portable binary from [Releases](https://github.com/widlily-corp/WiScripts_Windows/releases).
2. Run `wiscripts_windows.exe` as **Administrator** (required for system-level tweaks, SCM service control, and PowerShell execution).
3. If prompted by Windows Defender SmartScreen (due to open-source self-signing), click **"More info"** $\to$ **"Run anyway"**.

---

## 👨‍💻 Development & Contributing

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Rust & Cargo](https://rustup.rs/) (v1.75+ recommended)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (C++ build tools & Windows 10/11 SDK)

### Quick Start

```powershell
# 1. Clone the repository
git clone https://github.com/widlily-corp/WiScripts_Windows.git
cd WiScripts_Windows

# 2. Install frontend dependencies
npm install

# 3. Run application in development mode (Vite + Tauri)
npm run tauri dev

# 4. Build production executable
npm run build
npm run tauri build
```

---

## 🧪 Testing & Quality Assurance

WiScripts Windows enforces strict multi-tier testing standards with 100% pass rates:

```powershell
# Run the complete 142-test Frontend & E2E test suite
npm test

# Run the 267 Rust backend unit & integration tests
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

### Test Suite Structure (142 E2E & Static Tests):
- **Static AST & Manifest Schema Verification (9 tests):** Validates script manifests, SemVer synchronization, and UI AST invariants.
- **Multi-TB Formatting & Disk Utilities (10 tests):** Byte conversions, scaling, and safe path normalization.
- **Tier 1 — Feature Coverage (25 tests):** Script Runner, in-place streaming, elevation banners, temp collectors, Win32 token checks.
- **Tier 2 — Boundary & Edge Cases (26 tests):** Input sanitization, burst events, WMI timeouts, path traversal guards, locked registry keys.
- **Tier 3 — Cross-Feature Interactions (9 tests):** Concurrent execution during metrics polling, dynamic locale switching, ProFlow governor affinity.
- **Tier 4 — Real-World Application Scenarios (6 tests):** Competitive gaming mode, heavy IDE RAM reclaim, rogue socket firewall blocks, battery wear telemetry.
- **Disk Space Analyzer & Filesystem Tree Explorer (57 tests):** Recursive folder scanning, cancellation latency, Top 20/50 extraction, and protected OS directory guardrails.

### Rust Backend Test Coverage (267 Tests):
- Full coverage across 23 domain submodules including hardware health IOCTL routines, NVMe log page parsers, Win32 token elevation, script runner execution sandboxing, and registry state transactions.

---

## 📁 Repository Structure

```
WiScripts_Windows/
├── .github/                 # GitHub workflows & CI configuration
├── docs/                    # Architectural documents & design specs
├── public/                  # Static assets & icons
├── scripts/                 # Migration & build utility scripts
├── src/                     # React 18 Frontend
│   ├── components/          # Reusable UI components & modals
│   ├── constants/           # Optimization definitions & constants
│   ├── hooks/               # Custom React hooks (poller, commands)
│   ├── i18n/                # Internationalization (locales: ru.json, en.json)
│   ├── mocks/               # Mock data for testing & simulation
│   ├── store/               # Zustand state slices (audio, system, governor, etc.)
│   ├── types/               # TypeScript interfaces & contracts
│   ├── utils/               # Error handlers and formatters
│   └── views/               # High-density feature views (Governor, AutoRuns, etc.)
├── src-tauri/               # Tauri v2 Backend (Rust 2021)
│   ├── capabilities/        # Tauri v2 permissions & security capabilities
│   ├── src/                 # Rust core submodules (23 domain modules)
│   │   ├── commands/        # Tauri IPC command dispatchers
│   │   ├── script_runner/   # Streaming custom script execution engine
│   │   ├── metrics/         # 6-tier sensor & hardware metrics collector
│   │   ├── governor/        # ProFlow process & RAM management engine
│   │   ├── state_engine/    # Transactional snapshot & rollback engine
│   │   ├── autoruns/        # Parallel autostart scanner & Authenticode verifier
│   │   └── winapi/          # Native Win32 API wrappers (Security, Tokens, Audio)
│   ├── Cargo.toml           # Rust dependencies & metadata
│   └── tauri.conf.json      # Tauri application manifest
├── tests/                   # E2E & component testing suite
│   └── e2e/                 # Comprehensive multi-tier test runner & test specs
├── AGENTS.md                # Engineering rules & project invariants
├── ARCHITECTURE.md          # Comprehensive Architecture Design Document
├── README.md                # Project landing & user documentation
└── package.json             # NPM scripts & dependencies
```

---

## 📝 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

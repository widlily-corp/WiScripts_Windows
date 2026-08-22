# WiScripts Windows 🚀

[![Release](https://img.shields.io/badge/release-v1.4.0-blue.svg)](https://github.com/widlily-corp/WiScripts_Windows/releases)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-orange.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**WiScripts Windows** is a high-performance, open-source Windows 10/11 optimization, diagnostics, script execution, and hardware monitoring workstation. Engineered with **Tauri v2**, **Rust 2021**, **React 18**, **TypeScript**, **Zustand**, and **Tailwind CSS**, it combines native kernel-level performance with a clean, modern user interface.

---

## 🌟 Key Features (v1.4.0 Release)

### 🌡️ Multi-Tier Hardware Telemetry & AMD/Laptop Support (v1.4.0)
- **Multi-Vendor Cascading Sensor Engine:**
  1. *Tier 1 (In-Process GPU DLLs):* AMD ADL (`atiadlxx.dll`/`atiadlxy.dll` with Overdrive 5/6 & multi-head deduplication) + NVIDIA NVML (`nvml.dll`).
  2. *Tier 2 (Dedicated Hardware Monitors):* LibreHardwareMonitor & OpenHardwareMonitor via WMI.
  3. *Tier 3 (Laptop & ACPI Thermal Zones):* `MSAcpi_ThermalZoneTemperature` (`root\wmi`) & `Win32_PerfFormattedData_Counters_ThermalZoneInformation` (`root\cimv2`).
  4. *Tier 4 (CLI Telemetry Fallbacks):* `nvidia-smi` & `amd-smi` with non-blocking 2-second timeout protection and hidden console flags (`0x08000000`).
  5. *Tier 5 (Universal Kernel Fallback):* `sysinfo` Components.
- **Smart Filtering & Primary Sensor Selection:** Automatically rejects static BIOS dummy zones (e.g. $300\text{ K}/301\text{ K} \approx 26.8^\circ\text{C} / 27.8^\circ\text{C}$) and out-of-bound readings ($5^\circ\text{C} - 118^\circ\text{C}$ validation window).
- **Manual Sensor Selector:** Interactive dropdown selector allowing custom CPU/GPU sensor bindings with persistent state.

### 🧭 Flexible Navigation & Dark Scrollbar Integration (v1.4.0)
- **3-Tier Flex Layout:** Pinned Brand Header (`shrink-0`) and Pinned Admin Elevation Card (`shrink-0`) with an independent, flexible scroll container (`flex-1 min-h-0 overflow-y-auto custom-scrollbar`).
- **All 25 Modules Accessible:** Seamless vertical scrolling ensuring all views and tools are reachable across laptops, tablets, and low-resolution displays.
- **Refined Minimal Dark Scrollbar:** Sub-pixel 5px scrollbars styled in dark neutral `#22252a` with hover state transitions.

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

WiScripts Windows enforces strict multi-tier testing standards:

```powershell
# Run the complete 4-tier E2E test suite (57 test cases)
npm test

# Run Rust backend unit & integration tests
cd src-tauri
cargo test
```

### Test Suite Structure:
- **Tier 1 — Feature Coverage (22 tests):** Script Runner, Streaming IPC, Log Export, Elevation Banner, Celebratory Banner, Multi-tier Temp Collectors, Win32 Token Elevation.
- **Tier 2 — Boundary & Edge Cases (22 tests):** Input validation, burst IPC event handling, WMI 3-second timeouts, path traversal guards, locked registry key handling.
- **Tier 3 — Cross-Feature Interactions (7 tests):** Concurrency between metric polling and script execution, dynamic i18n switching, diagnostic export aggregation.
- **Tier 4 — Real-World Application Scenarios (6 tests):** Complete optimization workflows, sensor override lifecycle, security validation workflows.

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
├── ARCHITECTURE.md          # Comprehensive Architecture Design Document
├── PROJECT.md               # Project state, milestones & interface contracts
├── README.md                # Project landing & user documentation
└── package.json             # NPM scripts & dependencies
```

---

## 📝 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

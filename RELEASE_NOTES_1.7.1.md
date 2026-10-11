# Release Notes — WiScripts Windows v1.7.1

We are proud to announce **WiScripts Windows v1.7.1**! 🚀💽

This release introduces a major UI/UX accessibility overhaul, semantic navigation categorization with instant search, and a complete reimagining of the SSD & Storage Diagnostics subsystem modeled directly on the industry-standard architecture of [CrystalDiskInfo](https://github.com/hiyohiyo/CrystalDiskInfo).

---

## 🌟 What's New in v1.7.1

### 1. 💽 CrystalDiskInfo Architecture & Deep NVMe S.M.A.R.T. Engine
- **Direct Win32 IOCTL NVMe Telemetry**: Integrated low-level device communication routines modeled after CrystalDiskInfo:
  - `IOCTL_STORAGE_GET_DEVICE_NUMBER` (`0x002D1080`): Maps logical drive letters (`C:`, `D:`) to physical device instances (`\\.\PhysicalDriveX`).
  - `NVME_LOG_PAGE_HEALTH_INFO` (Log Page `0x02`): Parses 15 standard NVMe S.M.A.R.T. telemetry attributes directly from controller hardware, converting temperatures from Kelvin to Celsius and calculating percentage wear.
  - `NVME_IDENTIFY_CNS_CONTROLLER` (CNS `0x01`): Reads authentic controller model, serial number, firmware revision, and NVMe specification version (`NVM Express 1.4`, etc.).
  - Robust non-elevated and legacy drive fallbacks via `STORAGE_DEVICE_DESCRIPTOR` and partition query mechanisms.
- **CrystalDiskInfo Experience UI**:
  - **Multi-Drive Selector Bar**: Clean horizontal disk selector cards showing drive index `(0)`, model, assigned volume badges `[C:]`, health status indicator, and live temperature gauge.
  - **Drive Master Card**: Prominent circular health status badge with percentage used, live color-coded temperature gauge, total drive capacity, and complete technical specifications matrix (Firmware, Serial Number with 1-click copy, Interface, Transfer Mode, Volumes, Standard, and Feature tags).
  - **6-Metric Endurance Matrix**: Tracks Total Host Writes (TBW), Total Host Reads (TBR), Power-on Hours, Power-on Cycles, Unsafe Shutdowns, and Available Spare Reserve Blocks.
  - **Interactive S.M.A.R.T. Attributes Table**: Full searchable table displaying ID (Hex), Attribute Name, Current Value, Threshold, Raw Values, Status badge, and clear technical descriptions.
  - **1-Click CrystalDiskInfo Text Report Export**: Generates and copies complete system disk diagnostic dumps formatted according to CrystalDiskInfo's classic export standard with toast notifications.
- **Official Open-Source Acknowledgment**: Prominent dedicated credit card thanking Noriyuki Miyazaki (hiyohiyo) and the CrystalDiskInfo open-source project, with a direct 1-click link to [github.com/hiyohiyo/CrystalDiskInfo](https://github.com/hiyohiyo/CrystalDiskInfo).

---

### 2. 🧭 UI/UX Navigation Audit & Instant Quick Search
- **Semantic Grouping**: Organized the 25 flat navigation tools into 6 intuitive semantic categories:
  - *Мониторинг и Система* (Dashboard, Diagnostics, Hardware Health & SSD, Smart RAM)
  - *Производительность* (Optimization, Game Boost, CPU Governor ProFlow, Gaming Latency & DPC)
  - *Диски и Очистка* (Disk Space Analyzer, System Cleaner, Duplicate Finder)
  - *Система и Программы* (Startup Manager, Services & Scheduler, Uninstaller, Package Manager)
  - *Безопасность и Сеть* (Network Shield & DNS, Context Menu, Restore Points, State Engine Snapshots)
  - *Сервис и Настройки* (Script Library, Tweak Presets, Driver Backup, Settings)
- **Real-Time Sidebar Search**: Added an instant quick-filter search bar to the sidebar header with instant `Esc`/`✕` clear functionality, enabling immediate 1-keystroke access to any tool.
- **Strict Accessibility & AST Preservation**: Retained full ARIA compliance, keyboard navigation ergonomics, and strict AST test invariants.

---

## 🧪 Verification & Quality Metrics

- **Rust Backend**: 267/267 unit and integration tests passed (`cargo test --lib --manifest-path src-tauri/Cargo.toml`).
- **Frontend & E2E Suites**: 142/142 tests passed (`npm test -- --run`).
- **Production Build**: 100% clean TypeScript typecheck and Vite bundle generation (`npm run build`).
- **SemVer Synchronization**: All 7 version manifests atomically synchronized to `1.7.1`.

---

## 📦 Release Artifacts

- **Installer**: `WiScripts_1.7.1_x64-setup.exe` (NSIS Installer with OTA Auto-Updater support)
- **Manifest**: `latest.json` (Cryptographically signed with Minisign)
- **Signature**: `WiScripts_1.7.1_x64-setup.exe.sig`

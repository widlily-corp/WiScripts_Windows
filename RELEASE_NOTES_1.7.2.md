# Release Notes — WiScripts Windows v1.7.2

We are excited to announce **WiScripts Windows v1.7.2**! 🚀⚡💽

This release introduces the **Turbo Drill-Down Disk Scanning Engine** — a revolutionary, multi-tiered filesystem inspection architecture that replaces slow, monolithic 40-minute disk crawls with an intelligent descending drill-down approach, powered by native Win32 APIs, COM `Scripting.FileSystemObject`, and multi-threaded Robocopy `/L`.

---

## 🌟 What's New in v1.7.2

### 1. ⚡ Turbo Drill-Down Disk Scanning Architecture (Levels 0–3)
- **Problem Solved**: Traditional disk analyzers (e.g., WinDirStat) attempt a flat recursive crawl from `C:\` across millions of small Windows system files, causing 20–40 minute freezes and excessive disk I/O.
- **Hierarchical Drill-Down Model**:
  - **Level 0 (Volume Capacity in < 0.1s)**: Instantly queries `Win32_LogicalDisk` and `System.IO.DriveInfo` to determine total capacity, free space, and consumed volume without inspecting a single file.
  - **Level 1 (Root Shallow Measurement)**: Analyzes only the 10–15 root-level folders on the drive (`C:\`). Identifies that ~90% of disk space is concentrated in `Program Files`, `Program Files (x86)`, and `Users`. Flags and prunes Windows OS system folders (`C:\Windows\WinSxS`, `$Recycle.Bin`, `System Volume Information`) from deep crawl.
  - **Level 2 (Deep Scan of Heavy Giants Only)**: Recursively inspects only the identified heavy giants, instantly localizing game distribution platforms (Steam, HoYoPlay, Epic Games, Riot) and active user profile directories.
  - **Level 3 (Precision Hotspot Breakdown)**: Performs surgical pinpointing inside heavy hubs:
    - **Steam**: Enumerates `steamapps\common` game installations (CS2, Civilization VI, Dota 2, etc.) with exact byte footprints.
    - **HoYoPlay / miHoYo**: Pinpoints game installations (`Genshin Impact`, `Honkai: Star Rail`, `ZenlessZoneZero`).
    - **User AppData & Storage**: Identifies shader caches, local app data, downloaded installers, and dev environments (`wsl`, `node_modules`, `gradle`, `cargo`).

---

### 2. 🚀 Low-Level Win32 & COM `Scripting.FileSystemObject` Dual Engine
- **Direct NTFS C++ COM Querying**: Bypasses heavy .NET file object allocations using Windows runtime COM server `Scripting.FileSystemObject` (`scrrun.dll`), reading directory sizes directly from kernel structures.
- **Multi-Threaded Robocopy `/L` Integration**: Leverages native 16/32-thread Robocopy in List-Only mode (`/MT:16 /XJ /R:0 /W:0 /BYTES /NFL /NDL`) to measure massive directories and bypass locked files without crashing or hanging.
- **First-Class Script in Catalog**: New standalone maintenance script `scripts_lib/maintenance/fast_disk_drilldown_analyzer.ps1` with JSON export support (`-JsonOutput`), customizable threshold (`-MinSizeGB`), depth control (`-MaxLevel`), and color-coded reporting.
- **Zero GC / Safe Pruning in Tauri Backend**: `src-tauri/src/storage/analyzer.rs` now includes `scan_directory_tree_with_options` with system directory child pruning via `WalkDir::skip_current_dir()`, dropping full drive scan latency from minutes to seconds.
- **Frontend Toggle**: Added a 1-click **⚡ Turbo Drill-Down** toggle in the Disk Space Analyzer UI with full English and Russian localization.

---

## 🧪 Verification & Quality Metrics

- **Rust Backend**: 23/23 storage and core unit tests passed (`cargo test --lib storage`).
- **E2E & Static Analysis**: 142/142 test suite tests passed (`npm test`).
- **BOM Encoding**: Strict UTF-8 Byte Order Mark (`0xEF, 0xBB, 0xBF`) preserved on all PowerShell script files.
- **SemVer Synchronization**: All 7 version manifests atomically synchronized to `1.7.2`.

---

## 📦 Release Artifacts

- **Installer**: `WiScripts_1.7.2_x64-setup.exe` (NSIS Installer with OTA Auto-Updater support)
- **Manifest**: `latest.json` (Cryptographically signed with Minisign)
- **Signature**: `WiScripts_1.7.2_x64-setup.exe.sig`

# Release Notes — WiScripts Windows v1.5.0

We are proud to introduce **WiScripts Windows v1.5.0** (Disk Space Analyzer & Filesystem Tree Explorer Release)! 🚀💾

This major feature release introduces a high-performance, native Rust disk space analyzer, an interactive directory tree explorer with proportional visual disk usage bars, ranked largest folders & files views, seamless Windows Explorer navigation, and safe dual-mode recursive folder deletion protected by multi-tiered Windows OS guardrails.

---

## 🌟 What's New in v1.5.0

### 1. 🗄️ High-Performance Native Disk Space Analyzer (Rust Backend)
- **Multi-Threaded Asynchronous Scanning**:
  - Non-blocking disk space traversal powered by `walkdir` and native thread pools (`tauri::async_runtime::spawn_blocking`).
  - High-speed traversal of 100,000+ files across any physical/logical drive (`C:\`, `D:\`) or custom directory path without freezing the UI.
- **Throttled Real-Time Telemetry & Progress Streaming**:
  - Real-time progress events (`disk-scan-progress`) emitted at 100ms intervals to prevent Tauri IPC saturation.
  - Live display of scan rate (items/sec), elapsed time, processed files/folders count, total size accumulated, and current path.
- **Instant Atomic Scan Cancellation**:
  - Sub-5ms instant cancellation via `CANCELLATION_REGISTRY` and RAII `CancellationGuard`, immediately halting background disk workers.
- **Logical Drive Enumeration & Volume Inspection**:
  - Automated drive discovery using `sysinfo::Disks` with formatted drive cards displaying volume labels, file system types, mount points, and total/free storage capacity gauges.

---

### 2. 🌲 Interactive Filesystem Tree View & Exploration
- **Collapsible Hierarchical Directory Tree**:
  - Multi-level directory tree with expandable/collapsible nodes, item counts (files/subfolders), formatted human-readable sizes (MB/GB), and tabular monospace byte representations (`tabular-nums`).
- **Proportional Visual Disk Usage Bars**:
  - Color-coded percentage bars dynamically representing each folder's disk consumption relative to root or parent directories.
- **Ranked Top 20 Largest Folders & Top 50 Largest Files**:
  - Dedicated ranked view instantly surfacing the heaviest space hogs on the system with one-click direct actions.
- **Breadcrumb Navigation & Drill-Down**:
  - Interactive clickable breadcrumbs and *«Up One Level»* buttons for seamless navigation through deeply nested folder structures.
- **Dynamic Search & Size Filtering**:
  - Live filtering by filename/folder keyword or file extension with minimum size threshold options (`>100 MB`, `>500 MB`, `>1 GB`, `>5 GB`).
- **One-Click Windows Explorer & Clipboard Quick Actions**:
  - Direct *«Open in File Explorer»* (`explorer.exe /select`) focused on the target folder/file and *«Copy Path»* to system clipboard.

---

### 3. 🛡️ Safe Recursive Deletion Engine & OS Guardrails
- **Dual-Mode Recursive Deletion**:
  - **Move to Windows Recycle Bin** (default safe path via `trash-rs`): Allows full recovery of deleted files if needed.
  - **Permanent Recursive Deletion**: Deep recursive deletion bypassing the Recycle Bin with automatic stripping of Windows Read-Only file attributes (`std::fs::set_permissions`).
- **Multi-Layered Windows OS Guardrails (`guardrails.rs`)**:
  - Multi-tiered canonical path inspection rejecting deletion of critical system locations:
    - Root drives (`C:\`, `D:\`, `\\?\C:\`, `\??\C:`)
    - `%SystemRoot%` (`C:\Windows`, `System32`, `SysWOW64`, `WinSxS`)
    - EFI & Boot components (`\boot`, `\efi`, `\recovery`, `bootmgr`, `bootnxt`, `bootstat.dat`)
    - Virtual memory & swap files (`pagefile.sys`, `hiberfil.sys`, `swapfile.sys`, `dumpstack.log`)
    - `System Volume Information` & `$Recycle.Bin` across all volumes
    - Core system roots (`Program Files`, `Program Files (x86)`, `ProgramData`, `Users`, `Users\Default`, `Users\Public`)
  - Resilient normalization handling UNC extended-length prefixes (`\\?\C:\`), directory traversal evasion (`..\..\Windows`), and case-insensitive casing variations.
- **In-Memory Live Tree Delta Synchronization**:
  - Immediate subtraction of freed bytes from all ancestor nodes in memory (`syncTreeAfterDeletion`), rescaling proportional visual bars without requiring a full rescan.

---

### 4. 🎨 Design & Navigation Integration
- **Refined Minimal / Technical High-Density Dark Theme**:
  - Precision UI aligned with `#08090A` / `#121417` palette, 1px hairlines, subpixel shadows, and Geist Mono typography.
- **Dual Integration Across Cleaning & Storage Sections**:
  - Integrated into `StorageUtilities.tsx` as the default primary tab alongside *«Duplicate Files»* and *«Large Files»*.
  - Cross-navigation shortcut added directly in the main action bar of `SystemCleaner.tsx`.
- **100% Dual-Locale Parity (English & Russian)**:
  - 1,402 localization keys in `en.json` and `ru.json` covering all scanner options, tree controls, and deletion safety dialogs.

---

## 🧪 Comprehensive Verification Matrix

- **Master E2E Test Suite**: 123 / 123 tests passing (57 specialized tests for Disk Space Analyzer & Tree Explorer).
- **Rust Test Suite**: 273 / 273 tests passing (251 unit + 22 adversarial challenger & scanner stress tests).
- **TypeScript Compiler**: 0 errors (`npx tsc --noEmit`).
- **Cargo Compilation**: Clean compilation with 0 warnings (`cargo check`).
- **Production Bundle**: Vite production build succeeded cleanly.

---
*WiScripts Windows Team — 2026*

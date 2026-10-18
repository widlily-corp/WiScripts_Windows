# Release Notes — WiScripts Windows v1.7.3

We are pleased to release **WiScripts Windows v1.7.3**! 🛡️⚡💽🧹

This update delivers a critical stability fix for drive scanning on systems with millions of files, redesigns the Turbo Drill-Down toggle into an unmistakable, interactive switch, and unifies the entire Storage & Cleanup section into a single, cohesive all-in-one experience.

---

## 🌟 What's New in v1.7.3

### 1. 🛡️ Memory & IPC Safety: Tree Serialization Depth Bounding (Crash Fix)
- **Root Cause Diagnosed**: When performing scans across large drives with over 1.4 million files and 230,000 directories (such as full `C:\` drives), serializing the unbounded recursive filesystem tree generated a 300+ MB JSON payload. This exceeded WebView2 / Chromium IPC buffer limits and triggered Out-Of-Memory (OOM) renderer crashes.
- **Architectural Solution**:
  - `src-tauri/src/storage/analyzer.rs` now enforces `MAX_SERIALIZE_TREE_DEPTH = 6` and `MAX_SERIALIZE_CHILD_FILES = 150` for the serialized IPC JSON tree.
  - **100% Mathematical Precision Maintained**: Recursive aggregation traverses all directories to calculate exact `total_size_bytes`, `total_file_count`, and `total_dir_count` for every single directory node.
  - **Bounded Heaps Intact**: Top 20 Largest Folders and Top 50 Largest Files min-heaps track true drive-wide maximums.
  - **IPC Payload Shrunk 1000x**: JSON response size dropped from 330 MB to < 1 MB, eliminating freezes, memory spikes, and crashes.

---

### 2. ⚡ Redesigned Turbo Drill-Down Interactive Switch
- **Problem Solved**: Previously, the Turbo Drill-Down button was a flat toggle whose active/inactive state was ambiguous, leading users to accidentally trigger slow deep OS crawls.
- **New Interactive Switch Banner**:
  - **Explicit Status Badges**: Unambiguous `[ВКЛ]` (Neon Green) vs `[ВЫКЛ]` (Muted Slate) badges with bilingual labels.
  - **Smooth Sliding Toggle**: Modern animated switch thumb with immediate visual state feedback.
  - **Descriptive Explanations**:
    - **ON**: *"Пропуск служебных папок Windows ($Recycle.bin, System Volume, WinSxS) для мгновенного нахождения игр и тяжелых папок."*
    - **OFF**: *"Полный перебор всех файлов системы байт-в-байт (может занять несколько минут на системном диске)."*
  - **Enhanced Depth-2 Pruning**: Skips massive Windows Defender signature databases and delivery optimization caches during fast drilldown.

---

### 3. 🧹 Unified All-in-One Storage & Cleanup Hub
- **Cohesive Experience**: Unified `SystemCleaner` (system junk, caches, logs) and `StorageUtilities` (disk tree, duplicates, large files) into a single 4-tab dashboard:
  1. 🧹 **Экспресс-Очистка Мусора (System Express Cleaner)**: Clear Windows Temp, Logs, Prefetch, Thumbnails, Recycle Bin, and Browser Caches with 1-click dry-run simulation.
  2. 📊 **Анализ Занятого Места (Disk Space Analyzer)**: Hierarchical tree visualizer with Turbo Drill-Down, breadcrumbs, and proportional bars.
  3. 🔍 **Поиск Дубликатов (Duplicate File Finder)**: Byte-for-byte 2-stage hash deduplication.
  4. 📦 **Крупные Файлы (Large Files Finder)**: Top space-consuming giant files.
- **Live Volume Capacity Strip**: Header displays real-time capacity and available gigabytes across all connected physical/logical drives (C:\, D:\, etc.) with 1-click direct analysis.
- **Seamless Navigation**: Both `system_cleaner` and `storage_utilities` navigation routes open the unified hub with the requested tab active, allowing 1-click switching without revisiting the sidebar.

---

## 🧪 Verification & Quality Metrics

- **Rust Backend**: 24/24 storage and core unit tests passed (`cargo test --lib storage`), including new tree depth bounding verification test.
- **E2E & Static Analysis**: 142/142 test suite tests passed (`npm test`).
- **AST Test Integrity**: Static AST scanner literal structures in `Navigation.tsx` preserved without regressions.
- **SemVer Synchronization**: All 7 version manifests atomically updated to `1.7.3`.

---

## 📦 Release Artifacts

- **Installer**: `WiScripts_1.7.3_x64-setup.exe` (NSIS Installer with OTA Auto-Updater support)
- **Manifest**: `latest.json` (Cryptographically signed with Minisign)
- **Signature**: `WiScripts_1.7.3_x64-setup.exe.sig`

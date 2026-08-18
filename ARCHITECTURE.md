# WiScripts Windows — Technical Architecture Specification

**Document Version:** 1.0.0  
**Target Release:** WiScripts Windows v1.0.0 (Production Release)  
**Author:** Principal System Architect & Elite Product Designer  
**Classification:** Core System Architecture

---

## 1. Architectural Overview & Design Philosophy

WiScripts Windows is engineered as a hybrid native desktop application marrying the raw execution performance and memory safety of **Rust** with the rapid, reactive interface capabilities of **React 18** and **TypeScript 5.6**, encapsulated inside the lightweight **Tauri v2** framework.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Frontend (React 18 + TypeScript + Vite)                  │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│  │   Navigation & Tabs   │  │ Zustand Store Slices  │  │ Dynamic Widgets │  │
│  │ (ScriptRunner, Audit, │  │ (system, audio, UI,   │  │ (SparklineArea, │  │
│  │  Governor, Views...)  │  │  packages, updates...) │  │  Sensors, Bar)  │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └────────┬────────┘  │
└──────────────┼──────────────────────────┼───────────────────────┼───────────┘
               │                          │                       │
               ▼                          ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Tauri v2 Async IPC Gateway                            │
│           (44 Registered Commands · Serde JSON Payloads · Events)           │
└──────────────┬──────────────────────────┬───────────────────────┬───────────┘
               │                          │                       │
               ▼                          ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Rust Core Backend Engine                          │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ ExecutionRunner │  │ Win32 Native    │  │ Multi-Tier Telemetry Engine │  │
│  │ (Real / DryRun) │  │ (Token, Sec,    │  │ (LHM, OHM, NVML, ACPI,      │  │
│  │                 │  │  SCM, WASAPI)   │  │  nvidia-smi, sysinfo)       │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                 │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌──────────────┴──────────────┐  │
│  │ Script Engine   │  │ StateEngine     │  │ ProFlow Resource Governor   │  │
│  │ (Live Streamer) │  │ (Snapshots/Diff)│  │ (RAM Trim, Core Affinity)   │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
└───────────┼────────────────────┼──────────────────────────┼─────────────────┘
            │                    │                          │
            ▼                    ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Windows Kernel / OS Subsystems                         │
│  [Windows Registry]  [Task Scheduler]  [Service Control Manager]  [WASAPI]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Architectural Principles:
1. **Zero AI-Slop & Maximum Rigor:** Zero uncontrolled `any` types in TypeScript, zero unwrapped panics in Rust, comprehensive error propagation via custom `Result<T, AppError>`.
2. **Deterministic & Isolated Execution:** Sensitive operations (PowerShell/CMD scripts) run in dedicated isolated sandboxes (`%LOCALAPPDATA%\WiScripts\TempScripts\`) with automatic drop cleanup.
3. **Non-Blocking Telemetry & Resilience:** All telemetry collectors (WMI, NVML, sysinfo) run asynchronously with strict 3-second non-blocking timeout protection.
4. **Transactional Safety:** System modifications (Registry, Services) are supported by StateEngine snapshotting for surgical rollback without reboots.
5. **Least Privilege & Native Security:** Privilege elevation is verified directly through Win32 `OpenProcessToken` APIs, and external argument injection is strictly guarded via quotation escaping.

---

## 2. Frontend Architecture (React 18 + TypeScript)

### 2.1 Directory Structure & Conventions
The frontend codebase resides in `src/` and adheres to a strictly modular layout:

```
src/
├── components/              # Reusable UI components, banners, and modals
│   ├── AdminElevationBanner.tsx    # UAC status and dry-run guard banner
│   ├── Dashboard.tsx               # Main landing view with queue state banner
│   ├── ErrorBoundary.tsx           # React runtime fault-isolation boundary
│   ├── ExecutionProgressModal.tsx  # Multi-step progress modal
│   ├── Header.tsx                  # Global status header & system gauges
│   ├── Navigation.tsx              # Sidebar navigation and category tree
│   ├── ScriptRunnerView.tsx        # Terminal script runner with live streaming
│   ├── SparklineAreaGraph.tsx      # SVG GPU/CPU load graph
│   ├── TemperatureSensorWidget.tsx # Sensor telemetry card & selector
│   └── ToastContainer.tsx          # Non-intrusive notifications
├── views/                   # High-density domain views
│   ├── AutorunsView.tsx            # Autostart manager with Authenticode
│   ├── GovernorView.tsx            # ProFlow RAM & CPU affinity manager
│   ├── StateEngineView.tsx         # System snapshot & rollback console
│   └── UninstallerView.tsx         # Direct registry app uninstaller
├── store/                   # State management
│   ├── slices/                     # Atomic Zustand slices
│   └── useAppStore.ts              # Composed centralized store
├── hooks/                   # Custom lifecycle hooks
│   ├── useMetricsPoller.ts         # Periodic system telemetry fetcher
│   └── useTauriCommand.ts          # IPC command wrapper with error boundary
├── i18n/                    # Localization engine (i18next)
│   └── locales/                    # ru.json & en.json locale files
├── types/                   # TypeScript interfaces and contracts
└── utils/                   # Formatting and error handling utilities
```

### 2.2 State Architecture (Zustand Slices)
Global state is partitioned into isolated domain slices composed inside [`useAppStore.ts`](file:///c:/Users/Widlily/Documents/projects/WiScripts_Windows/src/store/useAppStore.ts):

| Slice | File | Responsibility |
|-------|------|----------------|
| **`systemSlice`** | `systemSlice.ts` | OS version, CPU/RAM telemetry, active tab, sensor readings, elevation status |
| **`optimizationSlice`** | `optimizationSlice.ts` | Rule catalogs, selected optimizations, preview diffs, execution logs |
| **`scriptRunnerSlice`** | `scriptRunnerSlice.ts` | Terminal output lines, active script buffer, execution state, dry-run mode |
| **`audioSlice`** | `audioSlice.ts` | WASAPI devices, per-app audio sessions, volume attenuation states |
| **`packageManagerSlice`** | `packageManagerSlice.ts` | `winget` search cache, installed packages, UWP app registry |
| **`systemToolsSlice`** | `systemToolsSlice.ts` | StateEngine snapshots, Governor rules, Cleaner caches, Duplicates |
| **`uiSlice`** | `uiSlice.ts` | Modals visibility, toast notifications, confirmation dialog states |
| **`updaterSlice`** | `updaterSlice.ts` | GitHub release feed, update check status, download progress |

---

## 3. Backend Architecture (Rust 2021 + Tauri v2)

### 3.1 Rust Module Structure
The backend is structured into 23 specialized domain submodules in `src-tauri/src/`:

```
src-tauri/src/
├── lib.rs                   # App initialization, plugins & IPC handler registration
├── main.rs                  # Native entrypoint binary
├── logger.rs                # SimpleLog disk and memory log router
├── error.rs                 # Global AppError and Result types
├── commands/                # IPC entrypoints (44 commands)
│   └── mod.rs               # Command dispatchers and argument parsers
├── script_runner/           # Elevated script execution with live IPC streaming
├── metrics/                 # 6-tier hardware telemetry collector
├── governor/                # ProFlow RAM working-set trimmer and CPU affinity
├── state_engine/            # System state snapshotting & rollback engine
├── autoruns/                # Autostart inspector with Win32 Authenticode checking
├── uninstaller/             # Registry-based app uninstaller with quote escaping
├── cleaner/                 # System temporary file & cache purging
├── storage/                 # Parallel SHA-256 duplicate file finder (Rayon)
├── audio/                   # CoreAudio WASAPI endpoint & session router
├── packages/                # Winget CLI & UWP Appx debloating engine
├── optimization/            # Rule registry and optimization runner
├── diagnostics/             # SFC, DISM, and network stack diagnostics
├── dns_context/             # DNS switcher & Classic Windows 10 context menu
├── driver_backup/           # 3rd-party driver export & archiving engine
├── odt/                     # Office Deployment Tool XML generator & regional bypass
├── mas/                     # Microsoft Activation Scripts integration
├── startup/                 # Startup item and service toggling
├── system_restore/          # VSS System Restore Point manager
└── winapi/                  # Native Win32 API wrappers (Security, Tokens, Audio)
```

---

## 4. Subsystem Deep Dives

### 4.1 Script Runner & Live Streaming Engine
- **Path Isolation:** Scripts are written to `%LOCALAPPDATA%\WiScripts\TempScripts\script_<uuid>.<ext>`.
- **Streaming Pipeline:** Standard output and standard error are captured line-by-line via asynchronous reader threads, emitting `script-output-line` events across the Tauri IPC channel.
- **Drop Cleanup:** An RAII guard ensures that temporary script files on disk are unlinked and destroyed immediately upon process exit or error.

### 4.2 Multi-Tier Temperature Sensor Cascade
To guarantee maximum hardware compatibility across diverse Intel, AMD, and NVIDIA platforms, WiScripts Windows implements a 6-tier discovery cascade:

```
[Get Temperatures Request]
         │
         ▼
┌──────────────────┐  Success
│ 1. LHM (WMI)     ├──────────► [Emit Sensor Readings]
└────────┬─────────┘
         │ (Unavailable / Timeout)
         ▼
┌──────────────────┐  Success
│ 2. OHM (WMI)     ├──────────► [Emit Sensor Readings]
└────────┬─────────┘
         │ (Unavailable / Timeout)
         ▼
┌──────────────────┐  Success
│ 3. NVIDIA NVML   ├──────────► [Emit Sensor Readings]
└────────┬─────────┘
         │ (Unavailable)
         ▼
┌──────────────────┐  Success
│ 4. ACPI (WMI)    ├──────────► [Emit Sensor Readings]
└────────┬─────────┘
         │ (Unavailable)
         ▼
┌──────────────────┐  Success
│ 5. nvidia-smi    ├──────────► [Emit GPU Reading]
└────────┬─────────┘
         │ (Unavailable)
         ▼
┌──────────────────┐
│ 6. sysinfo Fallback (Kernel Generic) ──► [Final Reading / Safe Fallback]
└──────────────────┘
```

All WMI subprocesses are guarded by a 3-second timeout thread to prevent UI lockups on corrupted WMI repositories.

### 4.3 StateEngine (Transactional Snapshots & Rollback)
- **Snapshot Creation:** Serializes target Registry keys (`HKLM\SOFTWARE`, `HKCU\Software`) and Service start types (`SERVICE_DEMAND_START`, `SERVICE_DISABLED`) into JSON payloads stored in `%LOCALAPPDATA%\WiScripts\Snapshots\`.
- **Rollback Engine:** Performs surgical transactional restores by comparing live registry states against the snapshot, reverting only modified values and logging all discrepancies.

### 4.4 ProFlow Resource Governor
- **Working Set Trimming:** Leverages `EmptyWorkingSet()` and `SetProcessWorkingSetSize()` via Win32 API to purge stale physical pages into the standby list.
- **Core Affinity & Priority:** Configures CPU process affinity masks (`SetProcessAffinityMask`) and priority classes (`REALTIME_PRIORITY_CLASS`, `HIGH_PRIORITY_CLASS`, `IDLE_PRIORITY_CLASS`) for critical gaming or productivity workloads.

---

## 5. Complete IPC Command Catalog (44 Commands)

| Subsystem | Command Name | Input Payload | Return Payload |
|-----------|--------------|---------------|----------------|
| **Core** | `get_app_version` | None | `String` |
| **Core** | `log_frontend_event` | `{ level: String, message: String }` | `()` |
| **Core** | `get_system_info` | None | `SystemInfo` |
| **Core** | `get_system_metrics` | None | `SystemMetrics` |
| **Core** | `get_system_temperatures` | None | `TemperatureInfo` |
| **Core** | `get_temperatures` | None | `TemperatureInfo` |
| **Script Runner** | `execute_custom_script` | `{ script_content: String, script_type: String, dry_run: bool }` | `CommandOutput` |
| **Optimization** | `get_rule_catalog` | None | `Vec<OptimizationRule>` |
| **Optimization** | `get_rules_by_category` | `{ category: String }` | `Vec<OptimizationRule>` |
| **Optimization** | `preview_optimizations` | `{ rule_ids: Vec<String> }` | `PreviewResult` |
| **Optimization** | `get_optimizations_status` | None | `OptimizationStatus` |
| **Optimization** | `execute_optimizations` | `{ rule_ids: Vec<String>, dry_run: bool }` | `ExecutionSummary` |
| **Optimization** | `get_optimization_profiles` | None | `Vec<Profile>` |
| **Optimization** | `apply_optimization_profile` | `{ profile_id: String, dry_run: bool }` | `ExecutionSummary` |
| **StateEngine** | `create_state_snapshot` | `{ label: String, description: String }` | `StateSnapshot` |
| **StateEngine** | `rollback_state_snapshot` | `{ snapshot_id: String }` | `RollbackResult` |
| **StateEngine** | `list_state_snapshots` | None | `Vec<StateSnapshotMeta>` |
| **StateEngine** | `delete_state_snapshot` | `{ snapshot_id: String }` | `bool` |
| **Governor** | `apply_process_governor_rule` | `{ rule: GovernorRule }` | `bool` |
| **Governor** | `trim_process_working_set` | `{ pid: u32 }` | `bool` |
| **Governor** | `get_governor_status` | None | `GovernorStatus` |
| **Governor** | `list_active_rules` | None | `Vec<GovernorRule>` |
| **Governor** | `delete_governor_rule` | `{ rule_id: String }` | `bool` |
| **AutoRuns** | `scan_autorun_entries` | None | `Vec<AutorunEntry>` |
| **AutoRuns** | `verify_file_authenticode` | `{ file_path: String }` | `AuthenticodeResult` |
| **AutoRuns** | `toggle_autorun_entry` | `{ entry_id: String, enable: bool }` | `bool` |
| **AutoRuns** | `quarantine_autorun_entry`| `{ entry_id: String }` | `bool` |
| **Packages** | `winget_search` | `{ query: String }` | `Vec<WingetPackage>` |
| **Packages** | `winget_install` | `{ package_id: String }` | `CommandOutput` |
| **Packages** | `winget_update` | `{ package_id: String }` | `CommandOutput` |
| **Packages** | `get_uwp_apps` | None | `Vec<UwpApp>` |
| **Packages** | `remove_uwp_app` | `{ package_full_name: String }` | `CommandOutput` |
| **Uninstaller** | `get_installed_apps` | None | `Vec<InstalledApp>` |
| **Uninstaller** | `uninstall_app` | `{ app_id: String, silent: bool }` | `CommandOutput` |
| **Cleaner** | `scan_system_cleaner` | None | `CleanerScanResult` |
| **Cleaner** | `clean_system_items` | `{ item_ids: Vec<String> }` | `CleanerCleanResult` |
| **Storage** | `scan_duplicate_files` | `{ search_paths: Vec<String>, min_size_bytes: u64 }` | `Vec<DuplicateGroup>` |
| **Storage** | `scan_large_files` | `{ search_paths: Vec<String>, min_size_bytes: u64 }` | `Vec<LargeFileItem>` |
| **Storage** | `delete_files` | `{ file_paths: Vec<String>, use_recycle_bin: bool }` | `DeleteResult` |
| **Audio** | `get_audio_devices` | None | `Vec<AudioDevice>` |
| **Audio** | `set_global_audio_device`| `{ device_id: String }` | `bool` |
| **Audio** | `get_app_audio_sessions` | None | `Vec<AppAudioSession>` |
| **Audio** | `set_app_audio_device` | `{ session_id: String, device_id: String }` | `bool` |
| **Audio** | `set_app_volume` | `{ session_id: String, volume: f32 }` | `bool` |
| **Diagnostics** | `run_diagnostics` | `{ diagnostic_type: String }` | `CommandOutput` |
| **Diagnostics** | `export_diagnostic_dump` | None | `String` |
| **Diagnostics** | `create_github_issue` | `{ title: String, body: String }` | `String` |
| **System** | `set_dns_server` | `{ dns_type: String }` | `CommandOutput` |
| **System** | `get_classic_context_menu_status` | None | `bool` |
| **System** | `toggle_classic_context_menu` | `{ enable: bool }` | `CommandOutput` |
| **System** | `backup_drivers` | `{ backup_path: String }` | `CommandOutput` |
| **System** | `create_restore_point` | `{ description: String }` | `CommandOutput` |
| **System** | `get_restore_points` | None | `Vec<RestorePoint>` |
| **System** | `restore_system_point` | `{ sequence_number: u32 }` | `CommandOutput` |
| **ODT** | `generate_odt_xml` | `{ config: OdtConfig }` | `String` |
| **ODT** | `execute_odt_install` | `{ config: OdtConfig }` | `CommandOutput` |
| **ODT** | `execute_odt_regional_bypass` | None | `CommandOutput` |
| **MAS** | `execute_activation` | `{ activation_type: String }` | `CommandOutput` |

---

## 6. Security & Privilege Specification

1. **Elevation Verification (`OpenProcessToken`):**
   - Direct Win32 token inspection query `GetTokenInformation(TokenElevation)` verifies whether the primary token possesses full administrative privileges (`TOKEN_ELEVATION.TokenIsElevated != 0`).
2. **Path Sanitization & Quoting:**
   - All paths passed into `ShellExecuteW` and child subprocesses are wrapped in escaped quotes (`"\"path\""`), neutralizing command injection vulnerabilities.
3. **Startup & Autorun Whitelisting:**
   - Modifications to registry autostart items are constrained to a strict whitelist of known registry paths (`HKLM\...\Run`, `HKCU\...\Run`, `HKLM\...\RunOnce`).

---

## 7. Testing & Quality Assurance Architecture

```
Testing Pipeline (57 Multi-Tier Test Cases)
├── Tier 1: Feature Coverage (22 Tests)
│   ├── Script Runner execution, loading, format parsing
│   ├── Live streaming IPC stdout/stderr event dispatch
│   ├── Elevation warning banner and dry-run toggling
│   ├── Dynamic celebratory queue banner state (N=0 vs N>0)
│   ├── i18n locale parity & structural integrity
│   └── Multi-tier temperature sensor parsing & payload contracts
├── Tier 2: Boundary & Edge Cases (22 Tests)
│   ├── Empty and oversized script payload validation
│   ├── Burst IPC event streaming throughput
│   ├── WMI 3-second non-blocking subprocess timeout
│   ├── Safe temp directory traversal prevention
│   └── Registry locked key sharing violation recovery
├── Tier 3: Cross-Feature Interactions (7 Tests)
│   ├── Concurrent script execution during background metrics polling
│   ├── Dynamic language switching during live execution
│   └── Diagnostic dump aggregation of logs and telemetry
└── Tier 4: Real-World Application Scenarios (6 Tests)
    ├── End-to-end optimization queue completion workflow
    ├── Hardware sensor discovery and override workflow
    └── Autorun security scanning & quarantine workflow
```

Executed via `npm test` (`tests/e2e/runner.js`) with sub-millisecond execution times and 100% deterministic test isolation.

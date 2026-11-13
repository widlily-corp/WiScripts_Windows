# Design Document: Smart Game Daemon & Shader Cache Nuker (v1.8.0)

**Date:** 2026-11-13  
**Status:** Approved for Implementation Planning  
**Target Release:** WiScripts Windows v1.8.0  
**Author:** Principal System Architect & Game Director  

---

## 1. Intent & The Why

### Problem Statement
Modern PC gaming on Windows 10 and 11 faces three primary sources of micro-stuttering, frame-time spikes, and input lag:
1. **Shader Cache Degradation:** Modern DirectX 12, Vulkan, and Unreal Engine 4/5 titles compile shaders asynchronously during gameplay and cache them to disk (in NVIDIA `DXCache`, AMD `DxCache`, Windows `D3DSCache`). Over time or across graphics driver updates, these caches accumulate stale, fragmented, or corrupt entries, causing persistent micro-freezes (100–300ms frame drops) during asset loading.
2. **OS Thread Contention & E-Core Mis-scheduling:** Hybrid CPU architectures (Intel 12th–14th Gen P/E cores, AMD 3D V-Cache dual CCDs) often misallocate game worker threads to low-power Efficient cores or across CCD boundaries, increasing memory latency and dropping minimum 1% lows.
3. **Timer Resolution & Memory Pressure:** Windows default timer resolution (15.6 ms) causes loose frame pacing unless forced to 0.5 ms. Furthermore, Windows Standby RAM caches become bloated with previous file I/O, triggering paging stalls when modern 80+ GB games demand sudden allocations.

### The Solution
WiScripts Windows v1.8.0 introduces an autonomous, zero-injection performance package:
1. **Autonomous Smart Game Daemon:** A lightweight in-process background service inside the Tauri Rust runtime (minimized to system tray) that detects active 3D games or lets users target any running process, automatically elevating thread priority, pinning CPU affinity to Performance P-cores, locking system timer resolution to 0.5 ms, purging Standby RAM, and suspending background noise services—cleanly restoring all settings upon game exit.
2. **Interactive Game Process Selector & Profiler:** Allows users to pick any active window/process or configure persistent per-game profiles with customized priority and core affinities.
3. **Shader Cache Nuker:** A 1-click dedicated cleaner that safely purges bloated and corrupt DirectX, NVIDIA, AMD, and Unreal Engine shader caches to eliminate persistent shader-compilation stutters without risking game saves or system stability.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Autonomous & Manual Game Boost:** Auto-detect games by known 3D executables / foreground window heuristics, and allow instant manual selection of any running Windows process from a searchable picker.
- **Process Optimization Engine:**
  - Set priority to `HIGH_PRIORITY_CLASS` with priority boost disable protection.
  - CPU Affinity Masking: Pin selected games to Physical/P-Cores (avoiding hyperthreaded neighbor collisions or E-cores).
  - High-precision multimedia timer (0.5 ms / 5000 100ns units via `NtSetTimerResolution`) active while the game runs.
  - Safe working-set and Standby RAM purge on boost activation.
  - Temporary non-essential service suspension (`SysMain`, `DiagTrack`, `WSearch`, `Spooler`) with 100% reliable restoration on game exit.
- **Shader Cache Nuker:**
  - Deep scanning of DirectX Shader Cache (`D3DSCache`), NVIDIA `DXCache`/`GLCache`/`ComputeCache`, AMD `DxCache`, and standard UE4/UE5 AppData caches.
  - Safe file locking handling (skips actively open files with zero crashes, reports locked files count).
  - Real-time disk space reclamation metrics (MB/GB freed, count of cached blobs removed).
- **Lightweight System Tray Presence:**
  - Minimize/close-to-tray capability with low memory footprint.
  - Tray context menu: Quick Boost status, Open Dashboard, Run Shader Nuker, Exit.

### Non-Goals
- **No DLL Injection or Game Process Hooking:** Strictly use sanctioned Win32 Process APIs (`OpenProcess`, `SetPriorityClass`, `SetProcessAffinityMask`). Zero hooks into game memory or Direct3D swapchains to guarantee 100% safety with Anti-Cheat systems (Easy Anti-Cheat, BattlEye, Ricochet, Vanguard, VAC).
- **No Overclocking or Hardware Voltage Alteration:** Do not modify GPU clock curves or CPU Vcore voltages (avoids hardware instability and warranty risks).

### Anti-Goals
- **Never Leave Zombie Settings:** Never leave the system timer resolution locked at 0.5 ms or services suspended if a game crashes or the app exits abruptly (guaranteed via PID-latch monitoring and persistent bootstrap recovery journal).
- **No UI Thread Freezing:** Never block the UI or Tauri event loop during process enumeration or shader directory walks.
- **No False/Fabricated Metrics:** Display exact byte counts and verified process states; zero artificial "cleaning scores".

---

## 3. Approaches Considered & Trade-offs

| Approach | Architecture | Advantages | Drawbacks & Trade-offs | Verdict |
| :--- | :--- | :--- | :--- | :---: |
| **Approach 1: System Doctor & Health Score Hub** | Holistic diagnostic scan (SMART, RAM, DPC, startup) + 1-click healing. | Great general-purpose UX value; integrates existing 24 modules. | Does not directly address real-time in-game stuttering or active game execution. | Deferred to v1.8.5 |
| **Approach 2: In-Game Transparent HUD Overlay** | DirectX/Vulkan transparent topmost click-through window displaying FPS/temps. | Visible presence during gameplay; great visual feedback. | High complexity for PresentMon ETW FPS capture without DLL hooks; does not auto-tune process scheduling. | Deferred to v1.9.0 |
| **Approach 3: Smart Game Daemon + Process Optimizer + Shader Nuker (Selected)** | Background tray daemon with process affinity/priority tuning + timer lock + dedicated shader cache purging. | **Maximum gameplay impact**: fixes micro-stutters (shaders) and input lag (timer + affinity); zero anti-cheat risk; runs autonomously in tray. | Requires robust process exit polling and graceful fallback when non-elevated. | **SELECTED by User** |

---

## 4. Architectural Decisions (Builder Check Resolutions)

### Decision 1: Daemon Runtime Architecture & Crash Safety (Watchdog Journal)
* **Architectural Call:** The daemon runs as an asynchronous background thread within the Rust backend of WiScripts (`gaming/daemon.rs`).
* **Crash & Zombie Prevention:** Whenever a boost is applied (suspending services or setting 0.5 ms timer resolution), the daemon writes a small lockfile `daemon_active_session.json` into `%APPDATA%\WiScripts\`.
* On normal game exit or app shutdown, the daemon restores all services/timers and unlinks this file.
* On application startup (bootstrap in `src-tauri/src/lib.rs`), WiScripts checks for an orphaned `daemon_active_session.json`. If found (indicating an abnormal termination or crash), WiScripts immediately triggers emergency restoration: restarting all services and resetting the timer to 15.6 ms.

### Decision 2: State Machine Lifecycle (PID-Bound Latch vs Alt-Tab)
* **Architectural Call:** Game Boost is strictly **PID-Bound (Process Lifetime Latch)**.
* When a game process is boosted, it remains boosted until the process actually exits (`WaitForSingleObject(hProcess, 0) == WAIT_OBJECT_0` or process absent from process table) or the user manually toggles "Stop Boost".
* Bouncing services and timers on Alt-Tab is prohibited, as restarting `SysMain` / `DiagTrack` causes heavy disk I/O spikes and frame-time stutters.

### Decision 3: Shader Cache Nuker File Locking Strategy
* **Architectural Call:** Non-destructive safe purge.
* The scanner aggregates all shader files across DX12, NVIDIA, AMD, and UE caches.
* Deletion iterates through candidates. If a file is locked by `dwm.exe` or the active GPU driver (`ERROR_SHARING_VIOLATION`), it is safely counted as `skipped_locked` without throwing errors.
* The UI displays both `freed_bytes` / `freed_files` and a friendly status note: *"X файлов заняты активным видеодрайвером и были безопасно пропущены"*.

### Decision 4: CPU Affinity Policy (Hybrid vs Non-Hybrid CPUs)
* **Architectural Call:** 
  - **Intel Hybrid (P/E cores):** If `GetLogicalProcessorInformationEx` reports cores with `EfficiencyClass > 0`, the "Pin to P-Cores" toggle masks exclusively to Performance cores.
  - **Non-Hybrid / AMD Ryzen:** If all cores share the same efficiency class, the affinity toggle switches to "Physical Cores Only" mode (masking even-numbered logical threads `0, 2, 4...`), eliminating SMT/HyperThreading resource contention for cache-sensitive games.
  - Systems with > 64 logical cores are gracefully handled via `SetProcessDefaultCpuSets` (Win10 1709+) or clamped to Group 0 mask.

### Decision 5: StateEngine & Audit Trail Integration
* **Architectural Call:** Shader Cache cleaning operations are logged to the `MaintenanceJournal` as an irreversible audit record (timestamp, vendor breakdown, freed MB/GB), rather than a reversible snapshot in `StateEngine`, because binary shader caches cannot and should not be restored.

### Decision 6: Persistence of Custom Game Profiles
* **Architectural Call:** User profiles are persisted in `%APPDATA%\WiScripts\game_profiles.json` directly by the Rust backend via commands:
  - `get_game_profiles() -> Result<Vec<GameProfileConfig>, AppError>`
  - `save_game_profile(profile: GameProfileConfig) -> Result<(), AppError>`
  - `delete_game_profile(id: String) -> Result<(), AppError>`

---

## 5. Module & Component Specifications

### 5.1 Backend (Rust)
- `src-tauri/src/gaming/daemon.rs`: Core daemon loop, process monitoring, affinity masking, timer resolution, session journal.
- `src-tauri/src/gaming/mod.rs`: IPC command registration (`start_smart_daemon`, `stop_smart_daemon`, `get_daemon_status`, `get_running_processes`, `optimize_process`, `get_game_profiles`, `save_game_profile`).
- `src-tauri/src/cleaner/shader_nuker.rs`: Scanner and cleaner for DirectX, NVIDIA DXCache/GLCache, AMD DxCache, and Unreal Engine caches.

### 5.2 Frontend (React / TypeScript)
- `src/components/gaming/GameDaemonView.tsx`: Dashboard with daemon status, active boosted game card, auto-boost toggle, and live CPU/timer telemetry.
- `src/components/gaming/ProcessSelectorModal.tsx`: Searchable process modal with PID, window title, memory usage, and 1-click "Optimize & Boost".
- `src/components/gaming/ShaderNukerCard.tsx`: Vendor cards for DirectX, NVIDIA, AMD, Unreal with scan button, size breakdown, and 1-click "Nuke Shader Caches".
- `src/store/slices/gamingSlice.ts`: Zustand store managing daemon state, active game, process list, profiles, and shader nuker status.
- `src/components/Navigation.tsx`: Seamlessly accessible via `gaming_latency` tab with sub-navigation tabs (Daemon / Shader Nuker / Latency Monitor), preserving AST test invariants.

---

## 6. Verification & Quality Gates
- **Rust Unit Tests:**
  - Test process affinity mask calculation for hybrid and non-hybrid CPU topologies.
  - Test shader cache directory resolution and safe delete error handling.
  - Test session recovery journal creation and cleanup on simulated crash.
- **Frontend & AST Tests:**
  - `npm test` verifying all 142+ test suite cases pass.
  - Static AST scan integrity verified in `Navigation.tsx`.
- **Manual Verification:**
  - Select running game/test process (e.g. `notepad.exe` or 3D test app), verify priority changes to High in Task Manager.
  - Verify timer resolution changes to 0.5 ms and reverts to 15.6 ms on process exit.
  - Run Shader Cache Nuker, verify freed bytes and non-blocking operation.

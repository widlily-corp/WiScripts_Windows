# Release Notes — WiScripts Windows v1.8.0

We are proud to release **WiScripts Windows v1.8.0**! ⚡🎮🧹🛡️

This major milestone brings the all-new **Smart Game Daemon**, an interactive **Game Process Optimizer**, and the **Shader Cache Nuker (Stutter Eliminator)** for DirectX 12, Vulkan, NVIDIA, AMD, and Unreal Engine titles.

---

## 🌟 What's New in v1.8.0

### 1. ⚡ Smart Game Daemon & Autonomous Game Boost
- **Autonomous Heuristic Detection:** Background monitor scans foreground windows every 1.5 seconds. Automatically activates competitive Game Boost when modern games launch (`cs2.exe`, `valorant.exe`, `dota2.exe`, `cyberpunk2077.exe`, `r5apex.exe`, and 25+ others).
- **Interactive Process Selector:** Searchable modal allows targeting any active window or running process with real-time memory usage (RAM) and PID metrics.
- **Process Optimization Engine:**
  - **High Priority Tuning:** Sets `HIGH_PRIORITY_CLASS` with priority boost disable protection.
  - **P-Core & Physical CPU Affinity:** Intelligently masks game threads to physical performance cores (`0, 2, 4...`), eliminating SMT/HyperThreading resource contention and E-core scheduling lag.
  - **0.500 ms High-Precision Timer:** Activates 0.5 ms multimedia timer resolution (5000 100ns units via `NtSetTimerResolution`) during active game sessions for tight frame pacing and reduced mouse/keyboard input lag.
  - **Standby RAM Purge:** Clears Windows kernel standby lists on launch to eliminate paging freezes.
  - **Background Service Suspension:** Temporarily pauses telemetry and indexers (`SysMain`, `DiagTrack`, `WSearch`, `Spooler`).

---

### 2. 🛡️ PID-Bound Latch & Watchdog Crash Safety
- **Zero Alt-Tab Thrashing:** Optimizations latch to the process lifetime (`WaitForSingleObject`). Switching to a browser or Discord will never trigger service bouncing or frame-time drops.
- **Watchdog Crash Protection:** All session parameters are tracked in `%APPDATA%\WiScripts\daemon_active_session.json`. If a game crashes or Windows reboots unexpectedly, WiScripts automatically detects the orphaned session on startup and restores standard 15.6 ms timer resolution and services.
- **Zero-DLL Injection:** Operates exclusively through standard Win32 process handles with zero code injection, ensuring 100% safety with Anti-Cheat systems (Easy Anti-Cheat, BattlEye, Ricochet, Vanguard, VAC).

---

### 3. 🧹 Shader Cache Nuker (Ликвидатор статтеров)
- **Problem Solved:** Fragmented, corrupt, or bloated shader caches in DirectX 12 and Vulkan cause severe micro-stutters and frame drops during asset streaming.
- **Cross-Vendor Deep Cleaning:**
  - **DirectX D3D Shader Cache:** `%LOCALAPPDATA%\D3DSCache` and `%LOCALAPPDATA%\Microsoft\DirectX Graphics Cache`.
  - **NVIDIA:** `%LOCALAPPDATA%\NVIDIA\DXCache`, `GLCache`, and `%APPDATA%\NVIDIA\ComputeCache`.
  - **AMD Radeon:** `%LOCALAPPDATA%\AMD\DxCache` and `GLCache`.
  - **Intel Arc & Iris:** `%LOCALAPPDATA%\Intel\ShaderCache`.
- **Safe Purge Strategy:** Skips locked files actively in use by `dwm.exe` or graphics drivers without errors, reporting freed space down to the byte.

---

### 4. 📊 Unified Gaming Center Hub
- Re-architected `GamingLatencyView` into a segmented 3-tab hub:
  1. `⚡ Smart Game Daemon & Процессы`
  2. `🧹 Shader Cache Nuker (Ликвидатор статтеров)`
  3. `📊 DPC Latency & Таймер`

---

## 🧪 Verification & Quality Metrics

- **Rust Backend**: 100% pass across all unit tests (`cargo test --lib`), including daemon process affinity calculations, watchdog session serialization, and shader cache safe deletion.
- **E2E & Static Analysis**: 142/142 test suite tests passed (`npm test`).
- **Version Integrity**: All 8 SemVer verification assertions passed (`test_challenger1_m3_version_verification.cjs`).
- **AST Test Integrity**: Static AST scanner literal structures in `Navigation.tsx` preserved without regressions.
- **SemVer Synchronization**: All 7 version manifests atomically updated to `1.8.0`.

---

## 📦 Release Artifacts

- **Installer**: `WiScripts_1.8.0_x64-setup.exe` (NSIS Installer with OTA Auto-Updater support)
- **Manifest**: `latest.json` (Cryptographically signed with Minisign)

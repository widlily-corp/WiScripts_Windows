# Smart Game Daemon & Shader Cache Nuker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Smart Game Daemon (tray/background process optimizer with P-core affinity, 0.5ms timer resolution, and crash recovery) and Shader Cache Nuker (safe DirectX/NVIDIA/AMD/UE cache cleaner), and bump the release to v1.8.0.

**Architecture:** 
1. Rust backend modules in `src-tauri/src/cleaner/shader_nuker.rs` and `src-tauri/src/gaming/daemon.rs` provide safe filesystem cache walks, Toolhelp32 process enumeration, affinity masking, timer resolution control, and disk-backed session recovery.
2. Zustand store `gamingSlice.ts` exposes reactive states for daemon status, active boosted game, running processes, and shader cache summaries.
3. React views in `src/views/GamingLatencyView.tsx` and sub-components provide an interactive Process Selector modal, P-core/Physical affinity switches, and Shader Cache Nuker dashboard.

**Tech Stack:** Rust (Tauri v2, windows-rs, walkdir), React 18, TypeScript, Zustand, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-11-13-smart-game-daemon-shader-nuker-design.md`

## Global Constraints

- Every temporary PowerShell `.ps1` script file written to disk must contain EXACTLY ONE UTF-8 BOM (`0xEF, 0xBB, 0xBF`).
- Preserve scanned literal symbols in `src/components/Navigation.tsx` (e.g. `const NAV_ITEMS: NavItem[] = [...]`).
- Zero-mock policy for hardware telemetry; graceful elevation fallbacks when non-admin.
- When releasing v1.8.0, atomically update all 7 version manifests (`package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, `updaterSlice.ts`, `manifest.json`) and 2 version test assertion targets.

## Review Focus

1. **Active Game Process Termination:** When a boosted game process exits abruptly, the daemon must automatically detect termination and restore default timer resolution (15.6 ms) and suspended services within 2 seconds.
2. **Locked Shader Files (`ERROR_SHARING_VIOLATION`):** When purging shader caches while GPU drivers or DWM hold file handles, the nuker must skip locked files safely without throwing fatal errors.
3. **App Crash Recovery:** If WiScripts itself terminates abnormally while a game is boosted, the bootstrap sequence in `src-tauri/src/lib.rs` must detect `daemon_active_session.json` and restore services and timer resolution on next launch.
4. **Non-Hybrid / AMD CPU Affinity:** On CPUs where all cores share the same efficiency class, affinity must mask to physical even-numbered cores (`0, 2, 4...`) or all cores without failing.
5. **AST Navigation Test Integrity:** Static AST tests in `tests/static_analysis/` and `Navigation.tsx` must pass without regressions.

---

### Task 1: Rust Backend: Shader Cache Nuker Module

**Files:**
- Create: `src-tauri/src/cleaner/shader_nuker.rs`
- Modify: `src-tauri/src/cleaner/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/cleaner/shader_nuker.rs` (unit tests)

**Interfaces:**
- Produces:
  - `pub struct ShaderCacheEntry { pub id: String, pub name: String, pub vendor: String, pub path: String, pub size_bytes: u64, pub file_count: u64 }`
  - `pub struct ShaderScanSummary { pub entries: Vec<ShaderCacheEntry>, pub total_bytes: u64, pub total_files: u64 }`
  - `pub struct ShaderNukeResult { pub bytes_freed: u64, pub files_removed: u64, pub skipped_locked_count: u64, pub errors: Vec<String> }`
  - Tauri commands: `scan_shader_caches()`, `nuke_shader_caches(selected_ids: Vec<String>)`

- [ ] **Step 1: Write unit tests for shader cache path discovery and safe file deletion**
- [ ] **Step 2: Run `cargo test --lib cleaner::shader_nuker` and verify test failure**
- [ ] **Step 3: Implement `shader_nuker.rs` with DirectX, NVIDIA, AMD, and Unreal Engine paths**
- [ ] **Step 4: Register Tauri commands in `src-tauri/src/lib.rs`**
- [ ] **Step 5: Run `cargo test --lib cleaner::shader_nuker` and verify tests pass**
- [ ] **Step 6: Commit changes: `git commit -m "feat(cleaner): implement Shader Cache Nuker backend"`**

---

### Task 2: Rust Backend: Smart Game Daemon & Process Selector Engine

**Files:**
- Create: `src-tauri/src/gaming/daemon.rs`
- Modify: `src-tauri/src/gaming/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/gaming/daemon.rs` (unit tests)

**Interfaces:**
- Produces:
  - `pub struct ProcessSelectorItem { pub pid: u32, pub name: String, pub window_title: String, pub memory_mb: u64, pub priority_class: u32, pub is_known_game: bool }`
  - `pub struct DaemonStatus { pub active: bool, pub auto_detect: bool, pub boosted_pid: Option<u32>, pub boosted_name: Option<String>, pub timer_resolution_applied: bool, pub suspended_services: Vec<String> }`
  - `pub struct GameOptimizationConfig { pub target_pid: u32, pub process_name: String, pub set_high_priority: bool, pub pin_physical_cores: bool, pub set_timer_resolution: bool, pub purge_standby_ram: bool, pub suspend_services: bool }`
  - Tauri commands: `get_running_processes_for_selector()`, `optimize_game_process(config: GameOptimizationConfig)`, `restore_game_process()`, `get_daemon_status()`, `set_daemon_auto_detect(enabled: bool)`

- [ ] **Step 1: Write unit tests for affinity mask calculation (hybrid vs physical cores) and process filter**
- [ ] **Step 2: Run `cargo test --lib gaming::daemon` and verify test failure**
- [ ] **Step 3: Implement `daemon.rs` with Toolhelp32 process snapshotting, affinity masking, and PID-latch monitoring thread**
- [ ] **Step 4: Register Tauri commands in `src-tauri/src/gaming/mod.rs` and `src-tauri/src/lib.rs`**
- [ ] **Step 5: Run `cargo test --lib gaming::daemon` and verify tests pass**
- [ ] **Step 6: Commit changes: `git commit -m "feat(gaming): implement Smart Game Daemon and process selector engine"`**

---

### Task 3: Rust Backend: Crash Protection Journal & Bootstrap Recovery

**Files:**
- Modify: `src-tauri/src/gaming/daemon.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/gaming/daemon.rs` (unit tests for crash recovery)

**Interfaces:**
- Produces:
  - `pub fn check_and_recover_daemon_session() -> Result<bool, AppError>`
  - Writes/removes `%APPDATA%\WiScripts\daemon_active_session.json` on boost/restore.

- [ ] **Step 1: Write test for writing and recovering orphaned daemon session**
- [ ] **Step 2: Implement session journal write on boost, remove on restore, and startup recovery hook in `lib.rs`**
- [ ] **Step 3: Run `cargo test --lib gaming::daemon` and verify pass**
- [ ] **Step 4: Commit changes: `git commit -m "feat(gaming): add session recovery watchdog for crash safety"`**

---

### Task 4: Frontend State: Zustand Gaming Slice & TypeScript Types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/slices/gamingSlice.ts`
- Modify: `src/store/useAppStore.ts`
- Test: `src/tests/` (unit verification)

**Interfaces:**
- Consumes: Tauri invoke endpoints from Tasks 1, 2, 3
- Produces:
  - `gamingSlice` properties: `daemonStatus`, `processList`, `shaderSummary`, `isNukingShaders`, `nukeResult`, `fetchRunningProcesses()`, `optimizeProcess()`, `restoreBoost()`, `scanShaders()`, `nukeShaders()`

- [ ] **Step 1: Add TypeScript interfaces for `ShaderCacheEntry`, `ProcessSelectorItem`, `DaemonStatus`, and `GameOptimizationConfig` to `src/types/index.ts`**
- [ ] **Step 2: Update `src/store/slices/gamingSlice.ts` to implement full state actions and invoke bindings**
- [ ] **Step 3: Run `npm run type-check` or build test to verify type soundness**
- [ ] **Step 4: Commit changes: `git commit -m "feat(frontend): expand gamingSlice with daemon and shader nuker state"`**

---

### Task 5: Frontend UI: Process Selector Modal & Tuning Controls

**Files:**
- Create: `src/components/gaming/ProcessSelectorModal.tsx`
- Create: `src/components/gaming/GameDaemonCard.tsx`
- Modify: `src/views/GamingLatencyView.tsx`

**Interfaces:**
- Consumes: `gamingSlice` state and actions from Task 4

- [ ] **Step 1: Build `ProcessSelectorModal.tsx` with live process search, PID, memory badge, and 1-click optimize**
- [ ] **Step 2: Build `GameDaemonCard.tsx` with active game card, P-core affinity toggle, 0.5ms timer switch, and auto-detect switch**
- [ ] **Step 3: Integrate into `GamingLatencyView.tsx` with segmented tabs ("⚡ Game Daemon & Оптимизатор Процессов", "🧹 Shader Cache Nuker", "📊 DPC Latency & Таймер")**
- [ ] **Step 4: Commit changes: `git commit -m "feat(ui): add interactive process selector and daemon controls"`**

---

### Task 6: Frontend UI: Shader Cache Nuker View

**Files:**
- Create: `src/components/gaming/ShaderNukerCard.tsx`
- Modify: `src/views/GamingLatencyView.tsx`

**Interfaces:**
- Consumes: `scanShaders()`, `nukeShaders()`, `shaderSummary` from `gamingSlice`

- [ ] **Step 1: Build `ShaderNukerCard.tsx` with vendor cards (DirectX, NVIDIA, AMD, Unreal), scanned sizes, warning badges, and 1-click Nuke action**
- [ ] **Step 2: Add safety confirmation and progress state during cache purge**
- [ ] **Step 3: Integrate into `GamingLatencyView.tsx` under the Shader Nuker tab**
- [ ] **Step 4: Commit changes: `git commit -m "feat(ui): add Shader Cache Nuker card and view"`**

---

### Task 7: Localization & Navigation Invariant Verification

**Files:**
- Modify: `src/i18n/locales/ru.json`
- Modify: `src/i18n/locales/en.json`
- Inspect: `src/components/Navigation.tsx`

**Interfaces:**
- Localization keys for all new daemon, process selector, and shader nuker controls.

- [ ] **Step 1: Add Russian translations in `src/i18n/locales/ru.json`**
- [ ] **Step 2: Add English translations in `src/i18n/locales/en.json`**
- [ ] **Step 3: Verify literal symbols in `src/components/Navigation.tsx` are completely intact for AST tests**
- [ ] **Step 4: Commit changes: `git commit -m "feat(i18n): add translations for Game Daemon and Shader Nuker"`**

---

### Task 8: Version Bump to v1.8.0 & Release Notes

**Files:**
- Modify: `package.json` (`"version": "1.8.0"`)
- Modify: `package-lock.json` (`"version": "1.8.0"`)
- Modify: `src-tauri/Cargo.toml` (`version = "1.8.0"`)
- Modify: `src-tauri/Cargo.lock` (`name = "wiscripts_windows"`, `version = "1.8.0"`)
- Modify: `src-tauri/tauri.conf.json` (`"version": "1.8.0"`)
- Modify: `src/store/slices/updaterSlice.ts` (`appVersion: '1.8.0'`)
- Modify: `scripts_lib/manifest.json` (`"version": "1.8.0"`)
- Modify: `tests/test_challenger1_m3_version_verification.cjs`
- Modify: `tests/static_analysis/static_analysis_suite.js`
- Create: `RELEASE_NOTES_1.8.0.md`

- [ ] **Step 1: Atomically update all 7 version manifests to `1.8.0`**
- [ ] **Step 2: Update version assertions in the 2 test files to `1.8.0`**
- [ ] **Step 3: Create comprehensive `RELEASE_NOTES_1.8.0.md` documenting Game Daemon, Process Selector, and Shader Cache Nuker**
- [ ] **Step 4: Commit changes: `git commit -m "chore(release): bump version to v1.8.0 with Smart Game Daemon and Shader Cache Nuker"`**

---

### Task 9: Full Regression, Rust Tests & Static Analysis Suite

**Files:**
- Verification only

- [ ] **Step 1: Run Rust backend test suite (`cargo test --lib`) and confirm 100% pass**
- [ ] **Step 2: Run frontend test suite (`npm test`) and confirm all 142+ tests pass**
- [ ] **Step 3: Run static analysis suite (`node tests/static_analysis/static_analysis_suite.js`) and confirm 0 errors**

---

### Task 10: Git Tag & Release Deployment

- [ ] **Step 1: Create git tag `v1.8.0`**
- [ ] **Step 2: Push commits and tag to `origin/main`**

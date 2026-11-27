# Release Notes — WiScripts Windows v1.8.1

**WiScripts Windows v1.8.1** is a comprehensive security, stability, hardware telemetry, and UI/UX hardening release across both the Rust/Win32 backend and React/TypeScript frontend. 🛡️⚡

---

## 🔒 Security & Safety Hardening

- **Command Execution & Injection Prevention:**
  - Switched `winget` search/install/update in `packages` to direct `Command::args` invocation with strict query/package ID validation and PowerShell literal escaping for UWP removal.
  - Hardened `driver_backup` directory validation and PowerShell `-LiteralPath` escaping.
  - Added XML attribute escaping, enum/ID validation, HTTPS origin checks, and Microsoft Authenticode signature verification before running downloaded Office Deployment Tool executables.
- **Path Traversal & Deletion Guardrails:**
  - Enforced `[A-Za-z0-9_-]+` validation and `canonicalize()` directory containment on State Engine snapshot deletion/rollback and Startup Folder item removal.
  - Blocked `USERPROFILE` root deletion, enforced fail-closed canonical path checks, and removed silent fallback from Recycle Bin to permanent `remove_file`.
  - Restricted `unblock_process_firewall` to app-prefixed rule names (blocking `"all"` and injection payloads) and checked `netsh` exit statuses.
- **XSS, CSP & Safety Gates:**
  - Enforced strict URL scheme filtering (`http:`, `https:`, `mailto:`) in `MarkdownRenderer` and enabled a strict Tauri WebView2 Content Security Policy (`tauri.conf.json`).
  - Fixed `OptimizationView` `critical` risk gate, routed imported profiles in `PresetsView` through `SafetyModal`, reset `DiskDeleteModal` state between items, synced `create_preflight_snapshot` (`rule_ids` + `create_vss_restore_point` + real sequence numbers), and fixed disabled states in `PackageManagerView`.

---

## ⚙️ Backend, Win32 & Telemetry Fixes

- **Zero-Mock Hardware & Authentic Telemetry:**
  - Fixed NVMe IOCTL `protocol_data_offset` (`40`) and response buffer validation in `hardware_health`.
  - Removed synthetic fallback telemetry (`Math.random()` metrics, `query_sysinfo_fallback_drives`, hardcoded battery `cycle_count: Some(120)`, and `MockAudioBackend`/`autoruns` mock fallbacks in production).
  - Fixed `Audio` COM `CLSID_POLICY_CONFIG_CLIENT`, `IAudioPolicyConfig` WinRT vtable layout, and `IsSystemSoundsSession() == S_OK` filtering; implemented real `autoruns` toggle and quarantine operations.
- **Performance, Concurrency & Stability:**
  - Fixed elevated UAC script cancellation/timeout race (`cancelWatcher` acknowledgement + 15s `.meta` startup deadline), cmdlet exit-code tracking, and UTF-8 boundary decoding in `script_runner`.
  - Resolved `metrics` `stdout` pipe deadlock, cached `nvml.dll`, parallelized temperature queries with caching, moved blocking disk/ZIP I/O to `spawn_blocking`, sanitized `debug.log` in diagnostic dumps, and serialized structured `AppError` payloads.
  - Fixed `gaming` daemon physical core detection (`GetLogicalProcessorInformationEx`), `governor` system/foreground exclusions & priority restoration, `memory` excluded process list & dynamic PID enumeration, and `scripts_lib` handle/quoting fixes.

---

## 🎨 Frontend, UI/UX & Localization

- **Store & Performance:** Moved `executionHistory` from synchronous `localStorage` persistence into IndexedDB, fixed script output listener lifecycle races and comment-aware `param()` parsing, added polling in-flight guards + `visibilitychange` pausing, and split oversized views/components.
- **UI Tokens, Accessibility & i18n:** Fixed undefined Tailwind classes across views and modals, corrected `DriverBackupView` error banner styling, added `useAccessibleModal` focus-trapping and `Escape` handling, resolved nested scroll containers, and achieved 100% EN/RU localization parity (`1780` keys).

---

## 🧪 Verification

- **Frontend Build & Typecheck:** `npx tsc --noEmit` and `npm run build` passed (0 errors, 1944 modules).
- **Rust Test Suites:** `cargo check`, `cargo test --lib` (288/288), and all 18 integration test suites (136/136) passed.
- **Static, i18n & E2E Suites:** `static_analysis_suite.js` (9/9), `test_challenger1_m3_version_verification.cjs` (8/8), i18n parity & key checks, and `tests/e2e/runner.js` (142/142) passed.

---

## 📦 Release Artifacts

- **Installer:** `WiScripts_1.8.1_x64-setup.exe` (NSIS Installer with OTA Auto-Updater support)
- **Manifest:** `latest.json` (Cryptographically signed with Minisign)

# Handoff Report: Restore Points UI Tab & App Icon Investigation

## 1. Observation

- **App Icon Configuration (`src-tauri/tauri.conf.json`)**:
  - `bundle.icon` array (lines 29-35): `["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]`.
  - `app.windows[0]` (lines 13-20): Contains `"title": "WiScripts Windows"`, `"width": 1200`, `"height": 800`, `"resizable": true`. Explicit `"icon"` property is missing.
- **Frontend HTML Entry (`index.html`)**:
  - Line 5: `<link rel="icon" type="image/svg+xml" href="/vite.svg" />`.
  - Directory search: `public/` directory does NOT exist in project root. Request to `/vite.svg` yields HTTP 404.
- **Icon Asset Files (`src-tauri/icons/`)**:
  - `32x32.png` (2,205 bytes), `64x64.png` (6,739 bytes), `128x128.png` (21,380 bytes), `128x128@2x.png` (65,891 bytes), `icon.ico` (82,766 bytes), `icon.png` (214,234 bytes), `icon.icns` (1,261,213 bytes).
- **Navigation & Store Architecture (`src/components/Navigation.tsx`, `src/App.tsx`, `src/store/useAppStore.ts`)**:
  - `Navigation.tsx`: Renders navigation items (`NAV_ITEMS`) mapped to `TabType`. Currently 10 tabs (`dashboard`, `optimization`, `package_manager`, `presets`, `dns_context`, `driver_backup`, `diagnostics`, `odt`, `activation`, `settings`).
  - `App.tsx` (lines 85-94): Conditionally mounts view components based on `activeTab`.
  - `useAppStore.ts`: Provides Zustand store with elevation checks, execution modal control, logging (`addLog`), and toast notifications (`addToast`).

## 2. Logic Chain

1. **App Icon Diagnostic Logic**:
   - Observation: `index.html` references `/vite.svg`, but `public/` folder is non-existent.
   - Observation: `app.windows[0]` in `tauri.conf.json` does not specify `"icon"`.
   - Reason: When the WebView window loads, it tries to render the favicon from `/vite.svg`. Failing to find `/vite.svg`, the webview window defaults to blank/generic icon. Concurrently, in dev mode (`cargo tauri dev`), window manager uses default executable icon unless `app.windows[0].icon` is explicitly configured.
   - Deduction: Creating `public/icon.png` and updating `<link rel="icon" href="/icon.png">` plus adding `"icon": "icons/icon.ico"` in `tauri.conf.json` resolves icon display across window titlebar, dev mode, and packaged builds.

2. **System Restore Tab Architecture Logic**:
   - Observation: Existing view pattern (e.g. `DriverBackupView.tsx`, `DiagnosticsView.tsx`) uses a main container, elevation banner, control panel, status cards, and action modals.
   - Reason: The Restore Points tab requires fetching points (`Get-ComputerRestorePoint`), manual point creation (`Checkpoint-Computer`), and system rollback confirmation modal (`Restore-Computer` / `rstrui.exe`).
   - Deduction: Designing `RestorePointsView.tsx` (or `RestoreTab.tsx`) with sub-components (`RestorePointTable`, `RestoreRollbackModal`, `SystemProtectionStatusCard`), adding `'restore_points'` to `TabType` and store methods provides seamless integration with the existing architecture.

## 3. Caveats

- Live System Restore rollback (`Restore-Computer`) triggers a Windows reboot. In dry-run mode (`dryRunMode = true`), powershell commands are simulated without restarting the host OS.
- System Restore (`SystemProtection`) might be disabled by default on some Windows 11 editions. The component design includes an auto-detection banner offering `Enable-ComputerRestore -Drive "C:\"`.

## 4. Conclusion

- **App Icon Fix**:
  1. Add `public/icon.png` copied from `src-tauri/icons/icon.png`.
  2. Update `index.html` line 5 to `<link rel="icon" type="image/png" href="/icon.png" />`.
  3. Add `"icon": "icons/icon.ico"` under `app.windows[0]` in `src-tauri/tauri.conf.json`.
- **System Restore Tab Implementation Blueprint**:
  1. Extend `TabType` in `src/types/index.ts` and `useAppStore.ts` with `restore_points` state and commands (`fetchRestorePoints`, `createRestorePoint`, `restoreSystemToPoint`).
  2. Create `src/components/RestorePointsView.tsx` (or `src/tabs/RestoreTab.tsx`) with full table, creation card, rollback safety modal, loading states, and toast notifications (`addToast`).

## 5. Verification Method

1. **Verify App Icon Setup**:
   - Inspect `index.html` line 5 and check for existence of `public/icon.png`.
   - Inspect `src-tauri/tauri.conf.json` under `app.windows[0]` for `"icon": "icons/icon.ico"`.
2. **Verify Restore Points Tab Component Specs**:
   - Review `.agents/explorer_m2_3/analysis.md` for complete TypeScript interface definitions, Zustand store specs, and component layout hierarchy.

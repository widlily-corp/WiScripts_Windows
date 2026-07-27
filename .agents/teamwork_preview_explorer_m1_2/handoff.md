# Handoff Report — Frontend UI Architecture & Auto-Updater Integration

**Agent Role**: Explorer 2 (Milestone 1: Auto-Updater & Frontend UI Architecture)  
**Target Project**: WiScripts Windows (`c:\Users\Widlily\Documents\projects\WiScripts_Windows`)  
**Working Directory**: `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\teamwork_preview_explorer_m1_2\`  
**Date**: 2026-07-27  

---

## 1. Observation

### 1.1 Existing Frontend Tech Stack & Dependencies (`package.json`)
Direct examination of `package.json` reveals the following key dependencies:
- **Framework & Core**: React `^18.3.1`, React DOM `^18.3.1`, TypeScript `^5.6.0`, Vite `^5.4.0`.
- **Tauri Framework**: `@tauri-apps/api` (`^2.0.0`), `@tauri-apps/plugin-opener` (`^2.0.0`), `@tauri-apps/cli` (`^2.0.0`).
- **State Management**: `zustand` (`^4.5.5`) with `devtools` and `persist` middleware (`src/store/useAppStore.ts`).
- **Styling & UI**: Tailwind CSS (`^3.4.14`), PostCSS (`^8.4.47`), Autoprefixer (`^10.4.20`).
- **Iconography**: `lucide-react` (`latest`).
- **Missing NPM Packages**:
  - `@tauri-apps/plugin-updater`: **NOT currently installed** in `package.json`.
  - `@tauri-apps/plugin-process`: Required for programmatic app restart/relaunch after update installation.

### 1.2 Frontend Architecture & Layout Structure
- **Root Layout (`src/App.tsx`)**:
  - Fixed full-screen container (`flex h-screen w-screen overflow-hidden bg-background text-text-primary`).
  - **Left Sidebar (`src/components/Navigation.tsx`)**: `w-64 border-r border-border bg-surface flex flex-col justify-between`. Contains Brand Header ("WiScripts Windows Utility v2.0") and bottom Admin Elevation Status Card.
  - **Header Bar (`src/components/Header.tsx`)**: `h-14 border-b border-border bg-surface px-6 flex items-center justify-between`. Displays active tab title, CPU/RAM system metrics, Safety Dry-Run toggle switch, and Refresh button.
  - **Main Viewport**: `<main className="flex-1 overflow-auto">` rendering tab components based on `activeTab` from Zustand store (`dashboard`, `optimization`, `package_manager`, `presets`, `dns_context`, `driver_backup`, `diagnostics`, `odt`, `activation`, `settings`).
  - **Global Modals**: `SafetyConfirmationModal` and `ExecutionProgressModal` rendered at root level of `App.tsx`.

### 1.3 UI Aesthetics & Design Tokens (`tailwind.config.js` & `src/index.css`)
- **Theme**: Refined Minimal (Linear/Stripe aesthetic) dark palette.
  - Background: `#08090A`
  - Surface: `#121417` (hover: `#181A1F`, active: `#1F2228`, subtle: `#0E1013`)
  - Border: `#22252A` (subtle: `#1A1C20`, focus: `#3B82F6`)
  - Brand: `#3B82F6` (hover: `#2563EB`, subtle: `rgba(59, 130, 246, 0.1)`)
  - Status Colors: Success `#10B981`, Warning `#F59E0B`, Danger `#EF4444`, Info `#06B6D4`.
  - Typography: Sans (`Inter`, `Geist Sans`), Mono (`Geist Mono`, `JetBrains Mono`).
  - Radii: `DEFAULT` / `md` = `6px`.

### 1.4 Hardcoded Version Display & Notification Mechanisms
- **Version Display Locations**:
  1. `src/components/Navigation.tsx:57`: Static text `"Windows Utility v2.0"`.
  2. `src/components/SettingsView.tsx:70`: Static version `<span className="text-text-primary font-semibold">2.0.0</span>`.
  3. `package.json:4`: `"version": "0.3.0"`.
- **Existing Notification Mechanisms**:
  - Execution log store in `useAppStore.ts` (`logs` array with `addLog({ level, message })`). Displayed in `DiagnosticsView.tsx`.
  - Confirmation modals (`SafetyConfirmationModal.tsx`).
  - **No floating Toast notification component** or **Top Banner component** currently exists in `src/components/`.

---

## 2. Logic Chain

### 2.1 NPM Package Integration Requirements
To enable frontend auto-updater capabilities with Tauri v2, the following packages must be added to `package.json`:
1. `@tauri-apps/plugin-updater` (`^2.0.0` or matching `@tauri-apps/api` version): Provides the frontend JS bindings `check()` to interact with Tauri's Rust update plugin.
2. `@tauri-apps/plugin-process` (`^2.0.0`): Provides `relaunch()` function to restart the application cleanly after binary replacement.

Command to install (for Implementer reference):
```bash
npm install @tauri-apps/plugin-updater@^2.0.0 @tauri-apps/plugin-process@^2.0.0
```

### 2.2 Tauri v2 JS/TS API Call Patterns
1. **Fetching Application Version**:
   ```typescript
   import { getVersion } from '@tauri-apps/api/app';
   const currentVersion = await getVersion(); // Returns e.g. "0.3.0"
   ```
2. **Checking for Updates**:
   ```typescript
   import { check, Update } from '@tauri-apps/plugin-updater';
   
   const update = await check();
   if (update?.available) {
     console.log(`Update to ${update.version} available! Release notes: ${update.body}`);
   }
   ```
3. **Downloading and Installing Update with Progress**:
   ```typescript
   import { relaunch } from '@tauri-apps/plugin-process';

   let downloadedBytes = 0;
   let totalBytes = 0;

   await update.downloadAndInstall((event) => {
     switch (event.event) {
       case 'Started':
         totalBytes = event.payload.contentLength ?? 0;
         break;
       case 'Progress':
         downloadedBytes += event.payload.chunkLength;
         const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
         setDownloadProgress(percent);
         break;
       case 'Finished':
         setUpdateStatus('ready');
         break;
     }
   });

   // Relaunch app to finish update
   await relaunch();
   ```

### 2.3 Store Architecture Enhancement (`src/store/useAppStore.ts`)
The Zustand store (`AppState`) should be expanded with explicit update and notification slices:

```typescript
// 1. Toast Notification Types
export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastNotification {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  durationMs?: number; // Default 5000ms, 0 for persistent
}

// 2. Update State Types
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

// 3. Zustand AppState Slice Additions
interface AppState {
  // Application Version
  appVersion: string;
  setAppVersion: (version: string) => void;

  // Auto-Updater State
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  updateProgress: number; // 0 - 100
  updateError: string | null;
  autoCheckUpdates: boolean;
  bannerDismissed: boolean;
  lastUpdateCheckTime: string | null;

  // Auto-Updater Actions
  setAutoCheckUpdates: (enabled: boolean) => void;
  dismissUpdateBanner: () => void;
  checkForUpdates: (silent?: boolean) => Promise<boolean>;
  downloadAndInstallUpdate: () => Promise<void>;

  // Toast Notification System
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id'>) => string;
  removeToast: (id: string) => void;
}
```

### 2.4 Component Design & Placement Strategy

#### Component 1: `UpdateBanner.tsx` (Top Announcement Banner)
- **Placement**: Rendered in `App.tsx` directly inside the main content container, immediately above `<Header />` or below `<Header />`.
- **Design Tokens**:
  - Container: `bg-surface-subtle border-b border-brand/40 px-4 py-2.5 flex items-center justify-between text-xs animate-fade-in`.
  - Left Section: Glowing brand status badge, text `"WiScripts v{updateInfo.version} is available for download."`, optional collapse button for release notes.
  - Progress Bar (when downloading): Inline 2px hairline progress bar `bg-brand h-1 transition-all duration-200` along the bottom border.
  - Action Controls:
    - Primary Button: `"Update Now"` (`bg-brand hover:bg-brand-hover text-white px-3 py-1 rounded-[6px] font-medium transition-colors`).
    - Secondary Button: `"Release Notes"` (`text-text-secondary hover:text-text-primary px-2 py-1`).
    - Close Icon (`X`): Triggers `dismissUpdateBanner()`.

#### Component 2: `ToastContainer.tsx` & `ToastItem.tsx` (Floating Notifications)
- **Placement**: Fixed bottom-right overlay (`fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none`).
- **Design Tokens**:
  - Container: `pointer-events-auto bg-surface/95 backdrop-blur border border-border rounded-[6px] p-3.5 shadow-lg flex items-start gap-3 animate-scale-in text-xs`.
  - Accents: Left border or icon color reflecting `type`:
    - `info`: Brand `#3B82F6` icon (`Info`)
    - `success`: `#10B981` icon (`CheckCircle2`)
    - `warning`: `#F59E0B` icon (`AlertTriangle`)
    - `error`: `#EF4444` icon (`AlertOctagon`)
  - Auto-dismiss timer: `useEffect` with `setTimeout(durationMs)` unless `durationMs === 0`.

#### Component 3: Version Display & Settings Integration
- **Navigation Sidebar (`src/components/Navigation.tsx`)**:
  Replace hardcoded text with:
  ```tsx
  <span className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
    Windows Utility v{appVersion || '0.3.0'}
  </span>
  ```
- **Settings View (`src/components/SettingsView.tsx`)**:
  Add a dedicated **Auto-Updater & Version Control Card**:
  - Display current version (`appVersion`), target platform (`Windows x64`), last checked timestamp.
  - Toggle switch for `autoCheckUpdates` (persisted in Zustand store).
  - Manual button `"Check for Updates"` with loading spinner state.
  - Update status summary box showing current state (`Up to date`, `Update available: vX.X.X`, `Downloading X%`, `Ready to relaunch`).

### 2.5 Background Update Lifecycle Flow
```
[App Mount (App.tsx)]
       │
       ├──► 1. Invoke `getVersion()` ──► Store `appVersion` in Zustand
       │
       └──► 2. Trigger silent `checkForUpdates(silent=true)` after 3s delay
                 │
                 ├──► No Update / Up to date:
                 │      Log info, keep `updateStatus = 'idle'`
                 │
                 └──► Update Available (v0.4.0):
                        ├──► Store `updateInfo` and set `updateStatus = 'available'`
                        ├──► Show top `UpdateBanner` (if not dismissed)
                        └──► Add Info Toast: "WiScripts v0.4.0 is ready to install"
                                 │
                                 └──► User clicks "Update Now":
                                        ├──► Set `updateStatus = 'downloading'`
                                        ├──► Stream progress (0% -> 100%) in `UpdateBanner`
                                        ├──► Complete download & set `updateStatus = 'ready'`
                                        └──► Trigger `relaunch()` from `@tauri-apps/plugin-process`
```

---

## 3. Caveats

1. **Browser Development Mode Fallback**:
   When developing in browser mode (`npm run dev` without Tauri runtime environment), `@tauri-apps/api/app` and `@tauri-apps/plugin-updater` will throw errors because IPC bindings are missing.
   - *Mitigation*: Wrap all Tauri update calls in `try/catch` blocks and check if window `__TAURI_INTERNALS__` exists. Provide mock version (`"0.3.0-dev"`) and mock update check handling when running outside Tauri host.

2. **Privilege Elevation & Installer Context**:
   WiScripts Windows performs elevated administrative actions (registry tweaks, service modifications). If installed in `C:\Program Files\`, binary overwrite requires elevated write permissions.
   - *Mitigation*: Ensure Tauri updater configuration in `tauri.conf.json` specifies elevated installer runner or NSIS administrative execution mode.

3. **Offline / Network Timeout Handling**:
   If user launches WiScripts while offline or behind strict firewall/proxy, `check()` may throw network errors.
   - *Mitigation*: `checkForUpdates(silent = true)` must catch network errors silently without disrupting the application startup or spamming error banners. Only manual update checks should display an error Toast ("Network error: Unable to connect to update server").

---

## 4. Conclusion

1. **Dependencies**: `package.json` needs `@tauri-apps/plugin-updater@^2.0.0` and `@tauri-apps/plugin-process@^2.0.0`.
2. **State Management**: `useAppStore.ts` should be expanded to manage `appVersion`, `updateStatus`, `updateInfo`, `updateProgress`, `autoCheckUpdates`, and a floating `toasts` array.
3. **UI Layout**:
   - Top `UpdateBanner.tsx` for update announcement and download progress bar.
   - Fixed bottom-right `ToastContainer.tsx` & `ToastItem.tsx` for transient system alerts.
   - Bind `appVersion` dynamically in `Navigation.tsx` brand header and `SettingsView.tsx` runtime info card.
   - Add a manual Update Management card in `SettingsView.tsx`.
4. **Lifecycle**: Non-blocking silent update check on app mount with visual progress feedback and seamless relaunch upon user confirmation.

---

## 5. Verification Method

Once the Implementer applies the recommendations, verify the implementation using the following steps:

1. **NPM Package Verification**:
   - Check `package.json` to confirm `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` are listed under `dependencies`.

2. **Build & Type Checking**:
   - Run build command from project root:
     ```powershell
     npm run build
     ```
   - Confirm TypeScript compilation (`tsc`) completes with zero errors.

3. **Store & State Verification**:
   - Inspect `src/store/useAppStore.ts` to confirm `appVersion`, `updateStatus`, `toasts`, `checkForUpdates`, `downloadAndInstallUpdate`, `addToast`, and `removeToast` exist.

4. **UI Component Inspection**:
   - Inspect `src/components/Navigation.tsx` to verify version string is dynamically rendered.
   - Inspect `src/components/SettingsView.tsx` to verify presence of the Auto-Updater card and manual check button.
   - Inspect `src/components/UpdateBanner.tsx` and `src/components/ToastContainer.tsx` for adherence to Refined Minimal design tokens (1px hairlines, dark background `#08090A`/`#121417`, Geist/Inter typography).

# Technical Analysis & Architecture Specification: App Icon & Restore Points Tab

## Part 1: App Icon Setup & Taskbar Display Diagnostics

### 1.1 Current Icon Asset & Configuration Inventory

Direct investigation of project configuration and assets revealed the following state:

- **Tauri Configuration (`src-tauri/tauri.conf.json`)**:
  - `bundle.icon`: Contains `["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]`.
  - `app.windows[0]`: Contains title, width (1200), height (800), resizable (true). **Missing explicit `"icon"` property**.
- **Frontend Container (`index.html`)**:
  - Line 5: `<link rel="icon" type="image/svg+xml" href="/vite.svg" />`.
  - `public/` directory: **Does not exist**. `/vite.svg` is a 404 missing resource.
- **Physical Assets (`src-tauri/icons/`)**:
  - `32x32.png` (2,205 bytes)
  - `64x64.png` (6,739 bytes)
  - `128x128.png` (21,380 bytes)
  - `128x128@2x.png` (65,891 bytes)
  - `icon.ico` (82,766 bytes)
  - `icon.png` (214,234 bytes)
  - `icon.icns` (1,261,213 bytes)
  - Windows Store & UWP Logos: `Square30x30Logo.png` up to `Square310x310Logo.png`, `StoreLogo.png`.

### 1.2 Root Cause Analysis of Icon Display Failure in Window / Taskbar

1. **Broken Frontend Favicon Reference in WebView**:
   WebView2 (Windows Chromium runtime) attempts to fetch `/vite.svg` on window load. Because the `public` directory is missing and `/vite.svg` returns HTTP 404, WebView fallback fails to load any tab or taskbar favicon preview.
2. **Missing Window-Level Icon Config in `tauri.conf.json`**:
   In Tauri v2, `bundle.icon` is used during NSIS package bundling, but dev runtime window creation reads `app.windows[0].icon`. When unassigned, dev mode windows fall back to default process window icons.
3. **Taskbar Process Association & AppUserModelID (AUMID)**:
   During development (`npm run dev` / `cargo tauri dev`), Windows taskbar binds process icons via `AppUserModelID`. If running uninstalled debug binaries, taskbar defaults to standard Windows executable icons unless `public/icon.png` is served via frontend HTML header and window icon is explicitly defined.

### 1.3 Recommended Fix Strategy for App Icon
1. Create `public/` folder with `public/icon.png` (copied from `src-tauri/icons/icon.png` or `32x32.png`).
2. Update `index.html` line 5 to `<link rel="icon" type="image/png" href="/icon.png" />`.
3. Update `src-tauri/tauri.conf.json` under `app.windows[0]` to include `"icon": "icons/icon.ico"`.

---

## Part 2: Restore Points Tab (`RestoreTab.tsx` / `RestorePointsView.tsx`) Architecture

### 2.1 Component Overview & Purpose
The System Restore tab allows users to view existing Windows System Protection restore points, manually create new restore points prior to applying aggressive tweaks, inspect restore point metadata, and initiate system rollbacks with safety confirmation modals.

### 2.2 Component Hierarchy & Layout
```
src/
├── components/
│   ├── RestorePointsView.tsx         # Main View Component (or src/tabs/RestoreTab.tsx)
│   ├── RestorePointTable.tsx         # Table component for listing restore points
│   ├── CreateRestorePointCard.tsx    # Card for manual creation & preset descriptions
│   ├── RestoreRollbackModal.tsx      # Modal confirmation for system rollback
│   └── SystemProtectionStatusCard.tsx# Status card showing drive protection & space
```

---

## Part 3: Component Specifications, Prop Types & State Management

### 3.1 Data Types (`src/types/index.ts`)

```typescript
export type RestorePointType =
  | 'APPLICATION_INSTALL'
  | 'APPLICATION_UNINSTALL'
  | 'DEVICE_DRIVER_INSTALL'
  | 'MODIFY_SETTINGS'
  | 'CANCELLED_OPERATION'
  | 'MANUAL';

export interface RestorePoint {
  sequenceNumber: number;
  description: string;
  restorePointType: RestorePointType | string;
  creationTime: string; // ISO format or formatted string
}

export interface SystemProtectionStatus {
  isProtectionEnabled: boolean;
  protectedDrives: string[];
}
```

### 3.2 Zustand Store Integration (`src/store/useAppStore.ts`)

```typescript
// Additions to AppState interface:
restorePoints: RestorePoint[];
isRestoreLoading: boolean;
systemProtectionStatus: SystemProtectionStatus | null;

fetchRestorePoints: () => Promise<RestorePoint[]>;
createRestorePoint: (description: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
restoreSystemToPoint: (sequenceNumber: number, dryRun?: boolean) => Promise<ExecutionSummary | null>;
enableSystemProtection: (drive?: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
```

### 3.3 Component Specs & Design Specs

#### 1. `RestorePointsView.tsx` (Main Container)
- **Props**: None (uses Zustand store).
- **State**:
  - `newDescription: string` (controlled input for custom restore point name).
  - `selectedRestorePoint: RestorePoint | null` (for rollback modal target).
  - `isRollbackModalOpen: boolean`.
- **Behavior**:
  - On mount, calls `fetchRestorePoints()`.
  - Renders `AdminElevationBanner`, `SystemProtectionStatusCard`, `CreateRestorePointCard`, `RestorePointTable`, and `RestoreRollbackModal`.
  - Displays non-intrusive toasts (`addToast`) upon point creation or rollback initiation.

#### 2. `RestorePointTable.tsx`
- **Props**:
  - `restorePoints: RestorePoint[]`
  - `isLoading: boolean`
  - `onSelectRollback: (point: RestorePoint) => void`
  - `isElevated: boolean`
  - `isExecuting: boolean`
- **Features**:
  - Table columns: `Sequence #`, `Description`, `Type`, `Created Date`, `Action`.
  - Uses `font-mono tabular-nums` for timestamps and sequence numbers.
  - Action button: "Rollback System..." styled with `bg-status-dangerSubtle text-status-danger hover:bg-status-danger hover:text-white`.

#### 3. `RestoreRollbackModal.tsx`
- **Props**:
  - `isOpen: boolean`
  - `point: RestorePoint | null`
  - `onClose: () => void`
  - `onConfirmRollback: (sequenceNumber: number) => Promise<void>`
- **Features**:
  - Displays warning banner regarding Windows reboot & system rollback.
  - Shows dry-run mode toggle.
  - Requires typing `RESTORE` when live execution (non-dry-run) and risk level critical.

---

## Part 4: Backend Rust & PowerShell Commands Specification

### 4.1 Rust Module (`src-tauri/src/restore/mod.rs`)

1. `get_restore_points`:
   - PowerShell: `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, RestorePointType, CreationTime | ConvertTo-Json`
2. `create_restore_point`:
   - PowerShell: `Checkpoint-Computer -Description "<description>" -RestorePointType "MODIFY_SETTINGS"`
3. `restore_system_to_point`:
   - PowerShell: `Restore-Computer -RestoreSequenceNumber <sequence_number>` or launches `rstrui.exe`.

---

## Part 5: Design System Compliance & Antigravity Rules

- **Palette**: Monochromatic neutral background (`bg-surface`, `bg-surface-subtle`, `border-border`), subtle status badge accents (`bg-status-successSubtle`, `bg-status-warningSubtle`, `bg-status-dangerSubtle`).
- **Typography**: Headers in Inter/Sans, code and sequence numbers in JetBrains Mono / Geist Mono (`font-mono`).
- **Antigravity Skills Principles**: Flat condition flow (early returns), explicit TypeScript types (no `any`), atomic component design, non-intrusive toast notifications.

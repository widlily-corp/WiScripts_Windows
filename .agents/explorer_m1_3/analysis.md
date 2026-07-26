# Administrator Elevation Detection & UI Warning Analysis

## Executive Summary

WiScripts Windows detects administrator privileges in its Rust backend (`src-tauri/src/commands/mod.rs`) via a `net session` check executed with hidden window flags (`CREATE_NO_WINDOW = 0x08000000`). This privilege status is exposed to the React frontend as `isElevated: boolean` via the `get_system_info` Tauri IPC command.

While the backend correctly detects elevation status, **the backend execution engine does not block administrative commands when `isElevated` is `false`**, relying instead on runtime OS access control. Furthermore, **the current React frontend (`src/components/`) only displays elevation status in three places** (`Navigation.tsx` sidebar card, `DiagnosticsView.tsx` metric card, and `DriverBackupView.tsx` info card). All major execution buttons across Optimizations, Package Manager, Presets, DNS, Driver Backup, Diagnostics, ODT, and MAS remain clickable for standard users without warning banners or disabled states.

This document details the backend mechanism, audits all feature actions requiring Administrator privileges, evaluates current UI components, and specifies precise UI design requirements using Tailwind CSS and Lucide icons following the Refined Minimal aesthetic standard.

---

## 1. Backend Elevation Detection Analysis (`src-tauri/src/`)

### 1.1 Detection Mechanism
- **File**: `c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\src\commands\mod.rs`
- **Function**: `check_is_elevated()` (lines 26–44)

```rust
fn check_is_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("net");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.arg("session")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}
```

### 1.2 IPC Exposure to Frontend
- **Command**: `get_system_info()` (lines 83–125 of `commands/mod.rs`)
- **Data Structure**: `SystemInfo` struct (lines 13–24 of `commands/mod.rs` & `src/types/index.ts` lines 1–10)

```typescript
export interface SystemInfo {
  osName: string;
  osVersion: string;
  osBuild: string;
  isElevated: boolean;
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  telemetryStatus: 'Active' | 'Minimized' | 'Disabled' | 'Unknown';
}
```

- **Frontend Invocation**: `App.tsx` calls `invoke<SystemInfo>('get_system_info')` on mount (lines 30–45) and stores the result in Zustand (`useAppStore.ts`).

### 1.3 Backend Privilege Enforcement Gap
- The backend IPC handlers (`execute_optimizations`, `run_diagnostics`, `set_dns_server`, `backup_drivers`, `remove_uwp_app`, `winget_install`, `execute_odt_install`, `execute_activation`) **do not inspect `is_elevated` before invoking PowerShell or process commands**.
- If a standard user triggers an action, PowerShell is spawned under the non-elevated user token, resulting in runtime PowerShell `Access is denied` or command failure exit codes (e.g. `sfc /scannow` returning error code 1).
- Frontend UI guards are therefore critical to inform users before they attempt privileged operations.

---

## 2. Feature Audit: Actions Requiring Administrator Rights

The table below lists all feature actions in WiScripts Windows and their exact privilege requirements:

| Feature / Action | Underlying System Operation / Script | Privilege Required | Impact of Non-Elevated Run |
|---|---|---|---|
| **System File Checker (SFC)** | `sfc /scannow` | **Administrator** | Fails with "You must be an administrator running a console session." |
| **DISM RestoreHealth** | `Dism /Online /Cleanup-Image /RestoreHealth` | **Administrator** | Fails with DISM Error 0x800f0806 / Access Denied. |
| **Network Stack Reset** | `netsh winsock reset; netsh int ip reset; Clear-DnsClientCache` | **Administrator** | `netsh` fails with "The requested operation requires elevation (Run as administrator)". |
| **UWP Bloatware Removal** | `Remove-AppxPackage -Package <FullName>` / `Remove-AppxProvisionedPackage` | **Administrator** | Provisioned and multi-user AppX packages fail with Access Denied. |
| **WinGet System Installs** | `winget install --id ...` / `winget upgrade --id ...` | **Administrator** (for machine-wide MSI/EXE) | Machine-wide installers fail or request UAC elevation dialog. |
| **DNS Server Switcher** | `Set-DnsClientServerAddress -InterfaceAlias ... -ServerAddresses ...` | **Administrator** | Fails with PowerShell `PermissionDenied` error on network adapter. |
| **Classic Context Menu Toggle** | `New-Item -Path 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32'` | Standard User (HKCU) | Succeeds for HKCU, but full Explorer restarts may require elevated rights. |
| **Driver Backup Export** | `Export-WindowsDriver -Online -Destination <path>` | **Administrator** | Fails with "Export-WindowsDriver requires administrative privileges". |
| **Service Optimization** | `Stop-Service -Name DiagTrack; Set-Service -Name DiagTrack -StartupType Disabled` | **Administrator** | Fails with `Cannot open DiagTrack service on computer '.'` (Access Denied). |
| **Scheduled Tasks Tweak** | `Disable-ScheduledTask -TaskPath '\Microsoft\Windows\...'` | **Administrator** | Fails with `Access is denied`. |
| **HKLM Registry Hardening** | `Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\...'` | **Administrator** | Fails with `Requested registry access is not allowed`. |
| **HKCU UI Tweaks** | `Set-ItemProperty -Path 'HKCU:\Software\Microsoft\...'` | Standard User (HKCU) | Succeeds (user hive modification). |
| **Disk Cleanup (Temp & DO)** | `Remove-Item "$env:SystemRoot\Temp\*"` & `Delete-DeliveryOptimizationCache` | **Administrator** | Deleting `C:\Windows\Temp` and DO cache fails due to permissions. |
| **Optimization Profiles** | Batch execution of Service, HKLM, AppX, and Task rules | **Administrator** | Partial failure (HKCU rules succeed, HKLM/Service rules fail). |
| **Office ODT Deployment** | `Setup.exe /configure configuration.xml` | **Administrator** | Setup binary fails to write to Program Files or create Office services. |
| **MAS Activation** | `irm https://get.activated.win \| iex` (HWID / Ohook / KMS38) | **Administrator** | License ticket generation and SPP service hooks fail. |

---

## 3. Current React UI Elevation Check Audit (`src/components/`)

We audited all 14 React components in `src/components/`:

| Component File | Checks `systemInfo?.isElevated`? | Current UI Presentation | Identified UI Defect / Gap |
|---|---|---|---|
| `Navigation.tsx` | YES | Sidebar bottom card displays `ShieldCheck` + `Elevated Privileges` OR `ShieldAlert` + `Standard User`. | Informational only. Bottom of sidebar has low visual prominence when viewing main content. |
| `Header.tsx` | NO | Displays CPU/RAM stats, Safety Dry-Run toggle, Refresh button. | **No elevation status badge or warning** in top header bar. |
| `Dashboard.tsx` | NO | Displays readiness card, CPU/RAM, Telemetry status, rule preview. | **No warning banner** when standard user. "Apply Recommended Presets" button is active. |
| `OptimizationView.tsx` | NO | Rule catalog, search, category tabs, "Execute Selected" button. | **No elevation warning banner**. "Execute Selected" button is enabled for standard users. |
| `PackageManagerView.tsx` | NO | WinGet search/install and UWP debloater list/uninstall. | **No elevation warning banner**. Uninstall and Install buttons remain enabled. |
| `PresetsView.tsx` | NO | Profile cards with "Apply Profile" buttons. | **No elevation warning banner**. "Apply Profile" buttons remain enabled. |
| `DnsContextMenuView.tsx` | NO | Classic menu toggle and DNS provider cards. | **No elevation warning banner**. "Set DNS" buttons remain enabled. |
| `DriverBackupView.tsx` | YES | Secondary card displays `Elevated Administrator` vs `Standard User` badge. | Card shows status, but **"Start Driver Backup" execution button is STILL ENABLED**. |
| `DiagnosticsView.tsx` | YES | Metric card 3 displays `Elevated (Admin)` vs `Standard Privileges`. | Metric card shows status, but **"Run SFC Scan", "Run DISM Repair", "Reset Network Stack" buttons REMAIN ENABLED**. |
| `OdtView.tsx` | NO | XML configurator and "Deploy Office" button. | **No elevation warning banner**. "Deploy Office" button remains enabled. |
| `MasView.tsx` | NO | Method cards (HWID, Ohook, KMS38) and "Activate" button. | **No elevation warning banner**. "Activate" button remains enabled. |
| `SafetyConfirmationModal.tsx` | NO | Risk level, dry-run toggle, command list, confirm input. | **Does NOT show elevation warning** before user confirms live execution. |
| `ExecutionProgressModal.tsx` | NO | Progress bar, step counter, live console. | Shows dry-run mode, but does not display privilege status. |
| `SettingsView.tsx` | NO | Safety toggle, environment info, theme specs, credits. | Shows environment info, but no privilege elevation indicator. |

---

## 4. UI Design Requirements for Elevation Warnings

To maintain strict alignment with the **Refined Minimal (Linear/Stripe style)** design system, all elevation warning UI elements must utilize subtle hairlines (`1px solid`), deep background tones, `6px` border radii, tabular monospaced indicators (Geist Mono), and distinct status colors (`text-status-warning`, `bg-status-warningSubtle`, `border-status-warning/30`).

### 4.1 Specification 1: Header Privilege Status Pill (`Header.tsx`)
- **Location**: In top `<Header />` component between CPU/RAM stats and Safety Dry-Run toggle.
- **Behavior**:
  - When `systemInfo?.isElevated === true`:
    ```tsx
    <div className="flex items-center gap-1.5 bg-surface-subtle border border-border-subtle rounded-[6px] px-3 py-1 text-xs">
      <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
      <span className="text-[11px] font-medium text-text-secondary font-mono">Admin Elevated</span>
    </div>
    ```
  - When `systemInfo?.isElevated === false`:
    ```tsx
    <div className="flex items-center gap-1.5 bg-status-warningSubtle border border-status-warning/30 rounded-[6px] px-3 py-1 text-xs" title="Running with standard user rights. Administrative tasks require elevation.">
      <ShieldAlert className="h-3.5 w-3.5 text-status-warning shrink-0" />
      <span className="text-[11px] font-semibold text-status-warning font-mono">Standard User (Limited)</span>
    </div>
    ```

### 4.2 Specification 2: Reusable View Elevation Warning Banner
- **Component Design**: `AdminElevationBanner.tsx`
- **Container**: `rounded-[6px] border border-status-warning/40 bg-status-warningSubtle/40 p-3.5 flex items-center justify-between gap-3 text-xs`
- **JSX Spec**:
  ```tsx
  {systemInfo && !systemInfo.isElevated && (
    <div className="rounded-[6px] border border-status-warning/40 bg-status-warningSubtle/40 p-3.5 flex items-center justify-between gap-3 text-xs mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <ShieldAlert className="h-4 w-4 text-status-warning shrink-0" />
        <div className="text-text-primary">
          <span className="font-semibold text-status-warning">Administrator Elevation Required:</span>{' '}
          WiScripts is running under a Standard User account. System-wide changes (Services, Registry, SFC/DISM, DNS, Drivers) require Administrator rights.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] uppercase text-status-warning bg-status-warning/10 px-2.5 py-1 rounded border border-status-warning/30">
        Non-Elevated Session
      </div>
    </div>
  )}
  ```
- **Placement**: Top of `OptimizationView.tsx`, `PackageManagerView.tsx`, `PresetsView.tsx`, `DnsContextMenuView.tsx`, `DriverBackupView.tsx`, `DiagnosticsView.tsx`, `OdtView.tsx`, and `MasView.tsx`.

### 4.3 Specification 3: Execution Button Warning Badges & States
- When `isElevated === false` and `dryRunMode === false`:
  - Action buttons (`Execute Selected`, `Start Driver Backup`, `Run SFC Scan`, `Set DNS Server`, `Deploy Office`, `Activate (MAS)`, `Apply Profile`) should feature a subtle warning badge/icon (`<ShieldAlert className="h-3.5 w-3.5 text-status-warning" />`) or display a tooltip warning `Requires Administrator privileges unless running in Safety Dry-Run mode`.
  - Alternatively, buttons can be disabled with tooltip:
    ```tsx
    disabled={isExecuting || (!systemInfo?.isElevated && !dryRunMode)}
    ```

### 4.4 Specification 4: Safety Confirmation Modal Integration (`SafetyConfirmationModal.tsx`)
- **Location**: Inside modal body, above command disclosure box.
- **Condition**: Renders when `!systemInfo?.isElevated`.
- **JSX Spec**:
  ```tsx
  {!systemInfo?.isElevated && (
    <div className="rounded-[6px] border border-status-warning/40 bg-status-warningSubtle/50 p-3 flex items-start gap-2.5 text-xs text-status-warning">
      <ShieldAlert className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold">Standard User Privileges Detected</div>
        <div className="text-[11px] text-text-secondary mt-0.5">
          {dryRunMode
            ? 'Safety Dry-Run is active. Commands will be simulated without requiring elevation.'
            : 'Live execution will likely fail with Windows Access Denied errors unless WiScripts is restarted as Administrator.'}
        </div>
      </div>
    </div>
  )}
  ```

---

## 5. Verification Method

1. **Backend Verification**:
   - Inspect `c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\src\commands\mod.rs` lines 26–44 to verify `check_is_elevated()` implementation.
2. **Frontend Verification**:
   - Run `npm test` or UI empirical test script `npx ts-node src/tests/m3_views_empirical.ts` to confirm component render integrity.
3. **Execution State Verification**:
   - Launch application in standard user mode vs elevated administrator mode to verify `systemInfo.isElevated` value propagation.

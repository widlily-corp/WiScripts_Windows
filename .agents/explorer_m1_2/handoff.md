# Milestone 1: Frontend Architecture & UI Component Handoff Report

## 1. Observation

### 1.1 Navigation & Tab Organization Structure
- **Type Definitions (`src/types/index.ts:86`)**:
  `export type TabType = 'dashboard' | 'optimization' | 'odt' | 'activation' | 'diagnostics' | 'settings';`
- **Sidebar Component (`src/components/Navigation.tsx:21-28`)**:
  `NAV_ITEMS` array defines available navigation items mapping `TabType` to icon and label. Active tab style highlights active item with `bg-surface-active text-brand border border-border-focus/40`. Button interaction is disabled during execution (`isExecuting`).
- **Header Component (`src/components/Header.tsx:7-14, 76-98`)**:
  Renders page title from `TAB_TITLES` map, live system CPU & RAM metrics, dry-run safety toggle switch, and manual system info refresh button (`get_system_info` IPC).
- **App Shell (`src/App.tsx:58-76`)**:
  Renders `<Navigation />`, `<Header />`, conditional view components based on `activeTab`, `<SafetyConfirmationModal />`, and `<ExecutionProgressModal />`.

### 1.2 Zustand Store Architecture (`src/store/useAppStore.ts`)
- **Store Configuration (`src/store/useAppStore.ts:302-430`)**:
  Uses `create<AppState>()` with `devtools` and `persist` middleware (persisting `dryRunMode`, `odtConfig`, `selectedMasMethod`).
- **State Slices**:
  1. **Global App Settings**: `dryRunMode: boolean`, `activeTab: TabType`.
  2. **System Info**: `systemInfo: SystemInfo | null`, `isSystemLoading: boolean`.
  3. **Optimization Rules**: `optimizations: OptimizationItem[]`, `selectedCategory: string`, `searchQuery: string`, rule selection helpers (`toggleOptimizationSelected`, `selectAllOptimizations`, `deselectAllOptimizations`, `selectRecommendedOptimizations`, `selectTelemetryOnlyOptimizations`, `applyPreset`).
  4. **ODT Configuration**: `odtConfig: OdtConfig`, `generatedXml: string`.
  5. **MAS Activation**: `selectedMasMethod: MasMethod`.
  6. **Execution & Progress**: `isExecuting: boolean`, `executionProgress: number`, `currentStep: number`, `totalSteps: number`, `logs: ExecutionLog[]`.
  7. **Safety Confirmation**: `pendingSafetyModal: PendingSafetyModal | null`.
- **Event Streaming Integration (`src/components/ExecutionProgressModal.tsx:21-64`)**:
  Subscribes to Tauri backend IPC event `'task-progress'`, updating `currentStep`, `totalSteps`, `executionProgress` percentage (`Math.round((step / total) * 100)`), and pushing entries to `logs`.

### 1.3 Optimization Rules & Presets Model (`src/types/index.ts:25-36`, `src/store/useAppStore.ts:77-300`)
- **`OptimizationItem` Schema**:
  - `id: string` (e.g. `'telemetry_diagtrack'`, `'ui_classic_context_menu'`)
  - `category: OptimizationCategory` (`'telemetry' | 'bloatware' | 'privacy' | 'services' | 'ui_tweaks' | 'disk_cleanup'`)
  - `title: string`
  - `description: string`
  - `riskLevel: RiskLevel` (`'low' | 'medium' | 'high' | 'critical'`)
  - `isReversible: boolean`
  - `powershellCommand: string`
  - `undoCommand: string`
  - `isRecommended: boolean`
  - `isSelected: boolean`
- **Existing Presets Logic (`src/store/useAppStore.ts:362-374`)**:
  `applyPreset` sets `isSelected` flag on items in `optimizations` list based on preset string (`'recommended'`, `'telemetry_only'`, `'full_debloat'`).

### 1.4 Design System Strategy
- Theme: **Refined Minimal (Linear/Stripe style)**.
- Dark theme background (`#08090A`), surface (`#121417`), sub-surface (`#1A1D21`), 1px borders (`#22252A`), accent brand (`#3B82F6`), status badges (`#10B981` success, `#F59E0B` warning, `#EF4444` danger), monospace tabular digits (`tabular-nums font-mono`).

---

## 2. Logic Chain

1. **Tab & View Expansion Strategy**:
   - To support features R1-R5 in the frontend, `TabType` in `src/types/index.ts` should be expanded to include:
     - `'diagnostics'` (R1: Advanced Diagnostics & Recovery - SFC/DISM/Network)
     - `'package_manager'` (R2: Winget Package & UWP Bloatware Manager)
     - `'presets'` (R3: 1-Click Presets: Gaming, Maximum Privacy, Work)
     - `'dns_context'` (R4: DNS Server & Win10 Classic Context Menu Manager)
     - `'driver_backup'` (R5: Driver Export Backup Manager)
   - In `Navigation.tsx`, `NAV_ITEMS` array can be updated with appropriate icons (`Activity`, `Package`, `Sparkles`, `Globe`, `HardDrive`).
   - In `App.tsx`, conditional rendering adds view components for each active tab.

2. **Zustand State Extension Strategy**:
   - Add state slices for R1-R5 modules to `useAppStore.ts`:
     - **R2 Winget/UWP State**: `wingetPackages: WingetPackage[]`, `uwpApps: UwpApp[]`, `wingetSearchQuery: string`, `isWingetLoading: boolean`, `isUwpLoading: boolean`.
     - **R3 Presets State**: `activePresetProfile: 'gaming' | 'privacy' | 'work' | null`, helper method `applyPresetProfile(profile: 'gaming' | 'privacy' | 'work')`.
     - **R4 DNS/Context Menu State**: `currentDnsProvider: 'adguard' | 'cloudflare' | 'google' | 'dhcp'`, `isClassicContextMenuEnabled: boolean`.
     - **R5 Driver Backup State**: `driverBackupPath: string`, `isDriverBackupRunning: boolean`.

3. **Presets (R3) Integration Mapping**:
   - Gaming Preset: Toggles rules disabling SysMain (`services_sysmain`), DiagTrack telemetry (`telemetry_diagtrack`), Xbox bloatware overlay (`bloatware_xbox_apps`), activity history (`privacy_activity_history`).
   - Maximum Privacy Preset: Toggles all `telemetry` and `privacy` category rules (`telemetry_diagtrack`, `telemetry_dmwappush`, `telemetry_ceip_tasks`, `privacy_advertising_id`, `privacy_location_tracking`, `privacy_activity_history`).
   - Work Preset: Toggles recommended UI tweaks (`ui_show_file_extensions`, `ui_show_hidden_files`, `ui_classic_context_menu`) and temp cleanup (`disk_clean_temp`), while retaining print/fax services.

4. **IPC Command Handlers Contract**:
   - Commands invoked via `invoke<T>(commandName, payload)` or custom hook `useTauriCommand(commandName)`:
     - R1: `run_diagnostics({ action: 'sfc' | 'dism' | 'network_reset', dryRun })`
     - R2: `winget_search({ query })`, `winget_install({ packageId })`, `winget_update({ packageId })`, `get_uwp_apps()`, `remove_uwp_app({ packageName })`
     - R3: `apply_optimization_profile({ profileName, dryRun })`
     - R4: `set_dns_server({ provider })`, `toggle_classic_context_menu({ enable })`
     - R5: `backup_drivers({ outputDir, dryRun })`

---

## 3. Caveats

1. **State Persistence**: Currently `persist` middleware in `useAppStore.ts` only partialize-saves `dryRunMode`, `odtConfig`, and `selectedMasMethod`. New feature preferences (e.g. `driverBackupPath`, `currentDnsProvider`) should be added to `partialize` array if persistent across app reboots is desired.
2. **Elevated Privileges (UAC)**: Commands like SFC, DISM, DNS network configuration, and Driver Export require elevated administrator privileges (`systemInfo.isElevated === true`). UI elements should display a warning banner if `systemInfo.isElevated` is false.
3. **Execution Locks**: `isExecuting` flag correctly prevents concurrent execution across all tabs. Any new action trigger MUST check `isExecuting` and set `isExecuting = true` during IPC calls.

---

## 4. Conclusion

The React frontend architecture in `WiScripts_Windows` is clean, modular, and ready for Milestone 3 UI implementation:
- Navigation is centralized in `src/types/index.ts`, `src/components/Navigation.tsx`, and `src/App.tsx`.
- Zustand store (`src/store/useAppStore.ts`) provides unified state management with event streaming modal integration (`ExecutionProgressModal.tsx`) and dry-run safety confirmation (`SafetyConfirmationModal.tsx`).
- Optimization rules representation (`OptimizationItem[]`) natively supports preset selection logic for R3.
- The 5 new UI module views can follow the Refined Minimal design system with dedicated view components in `src/components/`.

---

## 5. Verification Method

### 5.1 Verification Commands
- Check TypeScript build and linting:
  ```powershell
  npm run build
  ```
- Check Tauri dev compilation:
  ```powershell
  cargo check --manifest-path src-tauri/Cargo.toml
  ```

### 5.2 File Inspection Checklist
- `src/types/index.ts`: Inspect `TabType`, `OptimizationItem`, `ExecutionSummary`, `TaskProgressPayload`.
- `src/store/useAppStore.ts`: Inspect `DEFAULT_OPTIMIZATIONS`, state actions, and `partialize` configuration.
- `src/components/Navigation.tsx`: Confirm `NAV_ITEMS` list and disabled state when `isExecuting`.
- `src/components/Header.tsx`: Confirm `dryRunMode` switch and system info IPC refresh.

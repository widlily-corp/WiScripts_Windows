# Handoff Report: Milestone 3 - System Monitoring & Management (Startup Apps & Task Scheduler)

## 1. Observation

Direct examination of the `WiScripts_Windows` codebase reveals the following existing module patterns, structures, and integration points:

### Backend Structure (`src-tauri/`)
- **Module Declarations (`src-tauri/src/lib.rs:1-14`):**
  ```rust
  pub mod activation;
  pub mod commands;
  pub mod diagnostics;
  pub mod dns_context;
  pub mod driver_backup;
  pub mod error;
  pub mod logger;
  pub mod mas;
  pub mod odt;
  pub mod optimization;
  pub mod packages;
  pub mod profiles;
  pub mod runner;
  pub mod system_restore;
  ```
- **Handler Registration (`src-tauri/src/lib.rs:25-52`):**
  Commands are registered via `tauri::generate_handler![...]`.
- **Command Abstraction (`src-tauri/src/runner/mod.rs:36-45`):**
  The `CommandRunner` trait provides `run_powershell(&self, script: &str)` and `run_cmd(&self, command: &str)` implemented by `RealRunner` and `DryRunRunner`.
- **IPC Wrapper Pattern (`src-tauri/src/commands/mod.rs`):**
  Tauri `#[tauri::command]` functions parse input parameters, select `RealRunner` or `DryRunRunner`, invoke business logic in sub-modules (e.g. `system_restore::create_restore_point`), and wrap results in `ExecutionSummary` or `Result<T, AppError>`.

### Frontend Structure (`src/`)
- **Type Union (`src/types/index.ts:86-97`):**
  `TabType` currently lists 11 tabs (`dashboard`, `optimization`, `package_manager`, `presets`, `dns_context`, `driver_backup`, `diagnostics`, `odt`, `activation`, `restore_points`, `settings`).
- **Navigation Configuration (`src/components/Navigation.tsx:27-39`):**
  `NAV_ITEMS` array maps `TabType` IDs to display labels and Lucide React icons.
- **Store Architecture (`src/store/useAppStore.ts`):**
  Zustand store manages active tab, dry-run mode, elevation status, execution state (`isExecuting`), execution logs, toast notifications, and safety confirmation modal triggers (`openSafetyModal`).
- **Main View Router (`src/App.tsx:86-97`):**
  Renders active view component conditionally based on `activeTab`.

---

## 2. Logic Chain

Based on the observed codebase architecture, the implementation strategy for Milestone 3's Startup Apps Manager and Task Scheduler Manager features is structured as follows:

### Phase 1: Rust Backend Modules

#### 1. Startup Apps Manager Module (`src-tauri/src/startup/mod.rs`)
- **Data Structure (`StartupItem`):**
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
  #[serde(rename_all = "camelCase")]
  pub struct StartupItem {
      pub id: String,               // Composite key: e.g. "hkcu_run_discord"
      pub name: String,             // Item name
      pub command: String,          // Command/target binary path
      pub location: String,         // "HKCU Run", "HKLM Run", "User Startup Folder", "System Startup Folder"
      pub enabled: bool,            // Active state
      pub item_type: String,        // "Registry" or "Shortcut"
      pub publisher: Option<String>,// Resolved publisher or executable vendor
  }
  ```
- **Query Logic (`get_startup_items`):**
  - Executes a PowerShell script inspecting:
    1. `HKCU:\Software\Microsoft\Windows\CurrentVersion\Run`
    2. `HKLM:\Software\Microsoft\Windows\CurrentVersion\Run`
    3. `HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run`
    4. `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup`
    5. `$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup`
  - Cross-references registry flags in `HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run` to evaluate disabled status (binary state byte `02` = enabled, `03` = disabled).
  - Returns `Vec<StartupItem>`. In dry-run mode or test environment, returns mock data (Discord, Spotify, OneDrive, Edge AutoUpdate, Steam).
- **Toggle Logic (`toggle_startup_item`):**
  - Modifies `StartupApproved\Run` binary flags or moves key to toggle enabled/disabled state.
- **Removal Logic (`remove_startup_item`):**
  - Deletes registry property value or startup shortcut `.lnk` file.

#### 2. Task Scheduler Manager Module (`src-tauri/src/scheduler/mod.rs`)
- **Data Structure (`ScheduledTaskItem`):**
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
  #[serde(rename_all = "camelCase")]
  pub struct ScheduledTaskItem {
      pub task_name: String,        // Task name
      pub task_path: String,        // Task folder path (e.g. "\Microsoft\Windows\Customer Experience Improvement Program\")
      pub state: String,            // "Ready", "Running", "Disabled"
      pub enabled: bool,           // state != "Disabled"
      pub trigger_type: String,     // Trigger summary description
      pub author: String,           // Author/Publisher
      pub last_run_time: Option<String>,
      pub next_run_time: Option<String>,
      pub action_summary: String,   // Executed binary / script path
  }
  ```
- **Query Logic (`get_scheduled_tasks`):**
  - Executes PowerShell script:
    `Get-ScheduledTask | Select-Object TaskName, TaskPath, State, Author, @{N='Actions';E={($_.Actions | Select-Object -ExpandProperty Execute -ErrorAction SilentlyContinue) -join '; '}} | ConvertTo-Json -Compress`
  - Parses JSON output into `Vec<ScheduledTaskItem>`. Dry-run mode returns mock tasks (`Consolidator`, `ProgramDataUpdater`, `GoogleUpdateTaskMachineCore`, `Adobe Acrobat Update Task`).
- **Toggle Logic (`toggle_scheduled_task`):**
  - Runs `Enable-ScheduledTask -TaskPath "<path>" -TaskName "<name>"` or `Disable-ScheduledTask -TaskPath "<path>" -TaskName "<name>"`.
- **Execution Logic (`run_scheduled_task`):**
  - Runs `Start-ScheduledTask -TaskPath "<path>" -TaskName "<name>"`.

#### 3. Module Registration & IPC Commands
- Declare `pub mod startup;` and `pub mod scheduler;` in `src-tauri/src/lib.rs`.
- In `src-tauri/src/commands/mod.rs`, expose IPC handlers:
  - `get_startup_items() -> Result<Vec<StartupItem>, AppError>`
  - `toggle_startup_item(app: AppHandle, id: String, enable: bool, dry_run: bool) -> Result<ExecutionSummary, AppError>`
  - `remove_startup_item(app: AppHandle, id: String, dry_run: bool) -> Result<ExecutionSummary, AppError>`
  - `get_scheduled_tasks() -> Result<Vec<ScheduledTaskItem>, AppError>`
  - `toggle_scheduled_task(app: AppHandle, task_name: String, task_path: String, enable: bool, dry_run: bool) -> Result<ExecutionSummary, AppError>`
  - `run_scheduled_task(app: AppHandle, task_name: String, task_path: String, dry_run: bool) -> Result<ExecutionSummary, AppError>`
- Register all 6 commands in `tauri::generate_handler![...]`.

---

### Phase 2: Frontend Types & State Management

#### 1. Type Definitions (`src/types/index.ts`)
- Add `StartupItem` and `ScheduledTaskItem` interfaces.
- Expand `TabType`:
  ```typescript
  export type TabType =
    | 'dashboard'
    | 'optimization'
    | 'package_manager'
    | 'presets'
    | 'dns_context'
    | 'driver_backup'
    | 'diagnostics'
    | 'odt'
    | 'activation'
    | 'restore_points'
    | 'startup'
    | 'scheduler'
    | 'settings';
  ```

#### 2. Zustand Store Extensions (`src/store/useAppStore.ts`)
- **Startup Apps State:**
  - `startupItems: StartupItem[]`
  - `isStartupLoading: boolean`
  - `fetchStartupItems: () => Promise<StartupItem[]>`
  - `toggleStartupItem: (id: string, enable: boolean, dryRun?: boolean) => Promise<ExecutionSummary | null>`
  - `removeStartupItem: (id: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`
- **Task Scheduler State:**
  - `scheduledTasks: ScheduledTaskItem[]`
  - `isSchedulerLoading: boolean`
  - `fetchScheduledTasks: () => Promise<ScheduledTaskItem[]>`
  - `toggleScheduledTask: (taskName: string, taskPath: string, enable: boolean, dryRun?: boolean) => Promise<ExecutionSummary | null>`
  - `runScheduledTask: (taskName: string, taskPath: string, dryRun?: boolean) => Promise<ExecutionSummary | null>`

---

### Phase 3: Frontend Component Implementation

#### 1. `StartupView.tsx` (`src/components/StartupView.tsx`)
- **Style:** Refined Minimal / Linear style.
- **Header:** Title ("Startup Apps Manager"), description, Refresh button with spinning indicator, Dry-run mode indicator.
- **Elevation Banner:** Renders `<AdminElevationBanner featureName="Startup Apps Management" />`.
- **Filters & Badges:** Search filter, Location dropdown (All, HKCU Run, HKLM Run, Startup Folder), status summary cards (Total Items, Enabled, Disabled).
- **Item Table:**
  - Toggle Switch for enabling/disabling startup entry.
  - Name & Publisher.
  - Location Badge.
  - Command path string formatted in `font-mono`.
  - Actions: Delete / Remove button triggering `openSafetyModal`.

#### 2. `SchedulerView.tsx` (`src/components/SchedulerView.tsx`)
- **Style:** Refined Minimal / Linear style.
- **Header:** Title ("Task Scheduler Manager"), description, Refresh button, Dry-run mode indicator.
- **Elevation Banner:** Renders `<AdminElevationBanner featureName="Scheduled Tasks Operations" />`.
- **Filters & Badges:** Search filter, State filter (All, Enabled, Disabled, Running), Quick Telemetry Filter button, status summary metrics.
- **Task Table:**
  - Toggle Switch for Enable/Disable task.
  - Task Name & Task Path (`font-mono`).
  - Author / Publisher.
  - State Badge (`Ready` = green, `Disabled` = muted/warning, `Running` = brand).
  - Command Action String.
  - Action Buttons: `Run Task Now` (Play icon) and Toggle.

#### 3. Navigation & Main Router Updates
- **`src/components/Navigation.tsx`:**
  - Import `Power` and `Clock` icons from `lucide-react`.
  - Add `{ id: 'startup', label: 'Startup Apps', icon: Power }` and `{ id: 'scheduler', label: 'Task Scheduler', icon: Clock }` to `NAV_ITEMS`.
- **`src/App.tsx`:**
  - Import `StartupView` and `SchedulerView`.
  - Conditionally render `{activeTab === 'startup' && <StartupView />}` and `{activeTab === 'scheduler' && <SchedulerView />}`.

---

## 3. Caveats

1. **Elevation Privileges:** Modifying HKLM startup keys or system-wide scheduled tasks requires Administrator elevation. When non-elevated, actions should trigger appropriate warnings or standard user guidance via `AdminElevationBanner`.
2. **PowerShell `ConvertTo-Json` Handling:** PowerShell serializes a single object differently than an array of objects. Deserializers in Rust (`parse_startup_json`, `parse_scheduled_tasks_json`) must handle single object vs JSON array gracefully.
3. **Dry-Run Mode Isolation:** All mutating commands must check `runner.is_dry_run()` to prevent accidental state changes during preview mode.

---

## 4. Conclusion

The proposed implementation strategy seamlessly integrates into the established `WiScripts_Windows` architecture. It satisfies all requirements for Milestone 3, ensuring clean separation of concerns, strict type safety, host safety in dry-run mode, and compliance with the project's UI design system.

---

## 5. Verification Method

To verify the implementation once coded:

1. **Backend Rust Tests:**
   Run `cargo test --manifest-path src-tauri/Cargo.toml` to verify dry-run execution, JSON parsing, and unit tests in `src-tauri/src/startup/mod.rs` and `src-tauri/src/scheduler/mod.rs`.
2. **Frontend Type Check & Verification:**
   Execute `npx tsc --noEmit` to confirm TypeScript type safety across store, components, and navigation.

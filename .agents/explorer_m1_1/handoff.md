# Milestone 1 Exploration Report: Rust Backend & Architecture Discovery

**Author**: Explorer 1 (Rust Backend & Architecture Explorer)  
**Milestone**: M1 - Exploration & Architecture Discovery  
**Target Path**: `c:/Users/Widlily/Documents/projects/WiScripts_Windows/.agents/explorer_m1_1/handoff.md`  

---

## 1. Observation

### 1.1 Tauri Command Registration Structure
Direct inspection of `src-tauri/src/` revealed the entry point and handler registration pipeline:

- **`src-tauri/src/main.rs:5`**:
  ```rust
  fn main() {
      wiscripts_windows_lib::run();
  }
  ```
- **`src-tauri/src/lib.rs:11-31`**:
  `run()` initializes the persistent file logger (`logger::init_logger()`) and builds the Tauri v2 desktop runtime:
  ```rust
  tauri::Builder::default()
      .plugin(tauri_plugin_opener::init())
      .invoke_handler(tauri::generate_handler![
          commands::get_system_info,
          commands::get_rule_catalog,
          commands::get_rules_by_category,
          commands::preview_optimizations,
          commands::execute_optimizations,
          commands::generate_odt_xml,
          commands::execute_odt_install,
          commands::execute_activation,
      ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
  ```
- **`src-tauri/src/commands/mod.rs`**:
  Contains all `#[tauri::command]` functions exposed across the IPC boundary.
  - Asynchronous handlers return `Result<T, AppError>` (e.g. lines 79, 123, 147, 175, 186, 218).
  - Operations requiring live status updates accept `app: tauri::AppHandle` as a parameter (e.g. `execute_optimizations` line 144, `execute_odt_install` line 187, `execute_activation` line 219).
- **`src-tauri/src/error.rs:5-23`**:
  Defines `AppError` enum using `thiserror::Error` with variants `Execution(String)`, `InvalidConfig(String)`, `Io(String)`, `System(String)`. `AppError` implements custom `Serialize` converting errors to standard string format for JSON IPC responses.

### 1.2 Runner Implementation & Dry-Run Mechanism
Direct inspection of `src-tauri/src/runner/mod.rs` revealed:

- **`CommandRunner` Trait (`src-tauri/src/runner/mod.rs:36-45`)**:
  ```rust
  pub trait CommandRunner: Send + Sync {
      fn run_powershell(&self, script: &str) -> Result<CommandOutput, String>;
      fn run_cmd(&self, command: &str) -> Result<CommandOutput, String>;
      fn is_dry_run(&self) -> bool;
  }
  ```
- **`RealRunner` (`src-tauri/src/runner/mod.rs:48-158`)**:
  - Executes real process commands via `std::process::Command::new("powershell.exe")` or `cmd.exe`.
  - Configures `cmd.creation_flags(0x08000000)` (`CREATE_NO_WINDOW`) on Windows targets (lines 65 & 117) to prevent terminal popup windows.
  - Spawns PowerShell with flags `["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]`.
- **`DryRunRunner` (`src-tauri/src/runner/mod.rs:170-228`)**:
  - Uses `Arc<Mutex<Vec<RecordedCommand>>>` to record commands in memory without touching host operating system state.
  - Returns simulated `CommandOutput { exit_code: 0, stdout: "[DRY-RUN] Simulated...", stderr: "" }`.
- **Task Progress Emission (`src-tauri/src/optimization/mod.rs:281-289`)**:
  - Emits real-time IPC events via `app_handle.emit("task-progress", &payload)`.
  - Payload structure (`TaskProgressPayload`, lines 7-12):
    ```rust
    pub struct TaskProgressPayload {
        pub current_step: usize,
        pub total_steps: usize,
        pub message: String,
        pub is_error: bool,
    }
    ```
    Serializes to camelCase JSON (`currentStep`, `totalSteps`, `message`, `isError`).
- **Data Transfer Objects (`src-tauri/src/runner/mod.rs:8-33`)**:
  - `CommandOutput`: `{ exit_code: i32, stdout: String, stderr: String }`
  - `ExecutedAction`: `{ id: String, name: String, command: String, output: CommandOutput, skipped: bool }`
  - `ExecutionSummary`: `{ success: bool, executed_actions: Vec<ExecutedAction>, total_duration_ms: u64, is_dry_run: bool }`

### 1.3 System & PowerShell Script Execution
Inspection of script execution across modules (`src-tauri/src/optimization/mod.rs`, `src-tauri/src/mas.rs`, `src-tauri/src/odt/mod.rs`):

- **PowerShell Invocation Pattern**:
  PowerShell script blocks are constructed as string literals or dynamically interpolated parameters and passed to `runner.run_powershell(...)`.
- **String Escaping Utility (`src-tauri/src/odt/mod.rs:134-136`)**:
  ```rust
  pub fn escape_powershell_literal(input: &str) -> String {
      format!("'{}'", input.replace('\'', "''"))
  }
  ```
  Prevents PowerShell script injection by escaping single quotes into `''` within single-quoted literal strings `'...'`.
- **Executed Operations**:
  - Service management: `Stop-Service -Name DiagTrack; Set-Service -Name DiagTrack -StartupType Disabled`
  - AppX packages: `Get-AppxPackage -AllUsers *XboxApp* | Remove-AppxPackage -ErrorAction SilentlyContinue`
  - Registry modifications: `Set-ItemProperty -Path 'HKLM:\...' -Name '...' -Value ... -Type DWord -Force`
  - External web/download scripts: `Invoke-RestMethod https://get.activated.win` (MAS), `Invoke-WebRequest -Uri 'https://config.office.com/api/odt/download'` (ODT).

---

## 2. Logic Chain

1. **Observation**: `wiscripts_windows_lib::run()` in `lib.rs` registers commands using `tauri::generate_handler![]`.
   **Inference**: Adding new IPC commands for features R1 through R5 requires creating `#[tauri::command]` functions in `src-tauri/src/commands/mod.rs` (or submodules exported into `commands/mod.rs`) and including them in `tauri::generate_handler![]` inside `lib.rs`.

2. **Observation**: All long-running or system-modifying functions (`execute_optimizations`, `execute_odt_install`, `execute_activation`) accept `app: tauri::AppHandle`, `dry_run: bool`, and delegate to `CommandRunner` (`RealRunner` vs `DryRunRunner`).
   **Inference**: For new features R1 (Diagnostics), R2 (Packages/UWP), R3 (Profiles), R4 (DNS/Context Menu), and R5 (Driver Backup), every execution function should accept `app: Option<&tauri::AppHandle>` (or `tauri::AppHandle`) and `runner: &dyn CommandRunner` (or `dry_run: bool` which selects `DryRunRunner` or `RealRunner`). This maintains host safety, dry-run support, progress emission, and testability.

3. **Observation**: `TaskProgressPayload` emits step updates on the `task-progress` event channel with `currentStep`, `totalSteps`, `message`, and `isError`.
   **Inference**: R1, R2, R3, R4, and R5 execution tasks can seamlessly publish live progress updates to the React frontend using the existing `task-progress` event name without requiring new event listeners on the frontend.

4. **Observation**: Current code has 3 engine modules (`optimization`, `odt`, `mas`).
   **Inference**: Adding features R1 to R5 can be organized into modular domain modules in `src-tauri/src/`:
   - `diagnostics/mod.rs` (R1)
   - `packages/mod.rs` (R2 - Winget & UWP)
   - `profiles/mod.rs` (R3)
   - `dns_context/mod.rs` (R4)
   - `driver_backup/mod.rs` (R5)

---

## 3. Proposed Module Architecture & IPC Command Definitions

### 3.1 Rust Module Structure
```
src-tauri/src/
├── activation/mod.rs
├── commands/mod.rs         <-- Exposes #[tauri::command] handlers
├── diagnostics/mod.rs      <-- R1: SFC, DISM, Network stack reset
├── dns_context/mod.rs      <-- R4: AdGuard/Cloudflare/Google DNS, Classic Context Menu
├── driver_backup/mod.rs    <-- R5: Export-WindowsDriver wrapper
├── error.rs
├── lib.rs                  <-- Registers handler array
├── logger.rs
├── main.rs
├── mas.rs
├── odt/mod.rs
├── optimization/mod.rs
├── packages/mod.rs         <-- R2: Winget search/install/update & UWP app debloat
├── profiles/mod.rs         <-- R3: Preset optimization profiles ("Gaming", "Privacy", "Work")
└── runner/mod.rs           <-- CommandRunner trait, RealRunner, DryRunRunner
```

### 3.2 Proposed IPC Commands & Types for Milestone 2

#### R1. Advanced Diagnostics & Recovery (`src-tauri/src/diagnostics/mod.rs`)
- **IPC Command**:
  ```rust
  #[tauri::command]
  pub async fn run_diagnostics(
      app: tauri::AppHandle,
      action: String, // "sfc_scannow" | "dism_restorehealth" | "reset_tcpip"
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>
  ```
- **PowerShell / CMD Commands**:
  - `sfc_scannow`: `sfc /scannow`
  - `dism_restorehealth`: `DISM.exe /Online /Cleanup-Image /RestoreHealth`
  - `reset_tcpip`: `netsh int ip reset; netsh winsock reset; ipconfig /flushdns`

#### R2. Package & Bloatware Manager (`src-tauri/src/packages/mod.rs`)
- **Data Structs**:
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct WingetPackage {
      pub id: String,
      pub name: String,
      pub version: String,
      pub source: String,
  }

  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct UwpAppInfo {
      pub name: String,
      pub package_full_name: String,
      pub is_non_removable: bool,
  }
  ```
- **IPC Commands**:
  ```rust
  #[tauri::command]
  pub async fn winget_search(query: String) -> Result<Vec<WingetPackage>, AppError>

  #[tauri::command]
  pub async fn winget_install(
      app: tauri::AppHandle,
      package_id: String,
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>

  #[tauri::command]
  pub async fn winget_update(
      app: tauri::AppHandle,
      package_id: String,
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>

  #[tauri::command]
  pub async fn get_uwp_apps() -> Result<Vec<UwpAppInfo>, AppError>

  #[tauri::command]
  pub async fn remove_uwp_app(
      app: tauri::AppHandle,
      package_full_name: String,
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>
  ```
- **PowerShell Commands**:
  - Winget search: `winget search --query "<query>" --accept-source-agreements`
  - Winget install: `winget install --id "<package_id>" --exact --silent --accept-package-agreements --accept-source-agreements`
  - Winget update: `winget upgrade --id "<package_id>" --exact --silent --accept-package-agreements --accept-source-agreements`
  - UWP query: `Get-AppxPackage -AllUsers | Select-Object Name, PackageFullName, NonRemovable`
  - UWP removal: `Remove-AppxPackage -Package "<package_full_name>" -AllUsers`

#### R3. Optimization Profiles / Presets (`src-tauri/src/profiles/mod.rs`)
- **Data Structs**:
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct OptimizationProfile {
      pub id: String,
      pub name: String,
      pub description: String,
      pub rule_ids: Vec<String>,
  }
  ```
- **IPC Commands**:
  ```rust
  #[tauri::command]
  pub async fn get_optimization_profiles() -> Result<Vec<OptimizationProfile>, AppError>

  #[tauri::command]
  pub async fn apply_optimization_profile(
      app: tauri::AppHandle,
      profile_id: String,
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>
  ```
- **Execution Logic**: Reuses `optimization::execute(Some(&app), runner, &profile.rule_ids)`.

#### R4. DNS & Context Menu Manager (`src-tauri/src/dns_context/mod.rs`)
- **Data Structs**:
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct DnsConfig {
      pub provider: String, // "AdGuard" | "Cloudflare" | "Google" | "DHCP"
      pub primary: String,
      pub secondary: String,
  }
  ```
- **IPC Commands**:
  ```rust
  #[tauri::command]
  pub async fn set_dns_server(
      app: tauri::AppHandle,
      provider: String,
      interface_alias: Option<String>,
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>

  #[tauri::command]
  pub async fn get_classic_context_menu_status() -> Result<bool, AppError>

  #[tauri::command]
  pub async fn toggle_classic_context_menu(
      app: tauri::AppHandle,
      enable: bool,
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>
  ```
- **PowerShell Commands**:
  - DNS set: `Set-DnsClientServerAddress -InterfaceAlias "<alias>" -ServerAddresses ("1.1.1.1", "1.0.0.1")` or `Reset-DnsClientServerAddress`
  - Context menu enable: `New-Item -Path 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32' -Value '' -Force`
  - Context menu disable: `Remove-Item -Path 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse -Force -ErrorAction SilentlyContinue`

#### R5. Driver Backup (`src-tauri/src/driver_backup/mod.rs`)
- **IPC Command**:
  ```rust
  #[tauri::command]
  pub async fn backup_drivers(
      app: tauri::AppHandle,
      output_dir: String,
      dry_run: bool,
  ) -> Result<ExecutionSummary, AppError>
  ```
- **PowerShell Command**:
  - `Export-WindowsDriver -Online -Destination "<escaped_output_dir>"`

---

## 4. Caveats

1. **Elevation Requirement**: Diagnostics (`sfc`, `dism`), driver backup (`Export-WindowsDriver`), and certain UWP removals require elevated administrator privileges. `check_is_elevated()` in `src-tauri/src/commands/mod.rs:21` checks elevation status.
2. **Winget Availability**: `winget` CLI may not be pre-installed on older Windows 10 builds or Windows Server environments.
3. **Execution Environment**: In unit tests, `DryRunRunner` must be passed to prevent mutating the test execution host machine.

---

## 5. Conclusion

The Rust backend in `src-tauri/` is cleanly structured and well-architected. The `CommandRunner` abstraction (`RealRunner` vs `DryRunRunner`) provides complete safety and dry-run guarantees. Long-running tasks publish step progress through `app.emit("task-progress", ...)`. Expanding the backend for Milestone 2 to support features R1 through R5 requires creating 5 domain submodules (`diagnostics`, `packages`, `profiles`, `dns_context`, `driver_backup`), adding `#[tauri::command]` functions in `src-tauri/src/commands/mod.rs`, and registering them in `lib.rs`'s `tauri::generate_handler![]`.

---

## 6. Verification Method

To independently verify these conclusions and backend readiness:

1. **Execute Unit Test Suite**:
   ```powershell
   cd c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri
   cargo test
   ```
   *Verified Result*: Executed `cargo test` in `src-tauri/` — 32 unit tests passed, 0 failed, 0 ignored. Tests verified `DryRunRunner`, `ExecutionSummary` camelCase serialization, `get_system_info`, `optimization::execute`, `odt::execute`, `mas::execute`, path escaping, and logging.

2. **Verify Module & Command Registration**:
   Inspect `src-tauri/src/lib.rs` line 19 (`tauri::generate_handler![]`) and `src-tauri/src/commands/mod.rs` to verify IPC function signatures.

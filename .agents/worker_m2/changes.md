# Changes Log — Worker M2 (Milestone 2 Backend)

## Domain Modules Created
- `src-tauri/src/diagnostics/mod.rs`
  - Implemented `run_diagnostics` function for SFC (`sfc /scannow`), DISM (`DISM.exe /Online /Cleanup-Image /RestoreHealth`), TCP/IP reset (`netsh int ip reset; netsh winsock reset`), and `all` composite action.
  - Emits `"task-progress"` events for real-time modal progress reporting.
  - Added unit tests for all diagnostic actions and dry-run safety.

- `src-tauri/src/packages/mod.rs`
  - Defined `WingetPackage` and `UwpAppInfo` structures with `camelCase` Serde attributes.
  - Implemented `winget_search`, `winget_install`, `winget_update`, `get_uwp_apps`, and `remove_uwp_app`.
  - Parses Winget CLI stdout tables and `Get-AppxPackage` JSON outputs.
  - Added unit tests covering package searches, installations, updates, UWP app retrieval, and debloating.

- `src-tauri/src/profiles/mod.rs`
  - Defined `OptimizationProfile` structure.
  - Implemented `get_optimization_profiles` returning presets: `"gaming"`, `"privacy"`, and `"work"`.
  - Implemented `apply_optimization_profile` mapping profile rule IDs to `optimization::execute`.
  - Added unit tests verifying profile definitions, rule mappings, and dry-run execution.

- `src-tauri/src/dns_context/mod.rs`
  - Implemented `set_dns_server` supporting `"adguard"`, `"cloudflare"`, `"google"`, and `"dhcp"`.
  - Implemented `get_classic_context_menu_status` and `toggle_classic_context_menu` via Windows Registry CLSID key `{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}`.
  - Added unit tests for DNS provider command generation and context menu toggling.

- `src-tauri/src/driver_backup/mod.rs`
  - Implemented `backup_drivers` using PowerShell `Export-WindowsDriver -Online -Destination <output_dir>`.
  - Added unit tests for driver exporting and directory validation.

## Modules & Commands Updated
- `src-tauri/src/commands/mod.rs`
  - Exposed 12 new `#[tauri::command]` handlers delegating to domain engines:
    - `run_diagnostics`
    - `winget_search`
    - `winget_install`
    - `winget_update`
    - `get_uwp_apps`
    - `remove_uwp_app`
    - `get_optimization_profiles`
    - `apply_optimization_profile`
    - `set_dns_server`
    - `get_classic_context_menu_status`
    - `toggle_classic_context_menu`
    - `backup_drivers`
  - Integrated `RealRunner` / `DryRunRunner` execution selection.
  - Added integration unit tests for IPC command handlers.

- `src-tauri/src/lib.rs`
  - Registered all 5 new domain submodules (`pub mod diagnostics`, `pub mod packages`, `pub mod profiles`, `pub mod dns_context`, `pub mod driver_backup`).
  - Registered all 12 new IPC commands in `tauri::generate_handler![]`.

## Verification Results
- `cargo check`: PASS (11.71s)
- `cargo test`: PASS (64/64 tests passed in 1.36s)

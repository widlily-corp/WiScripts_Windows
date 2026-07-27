# Handoff Report: Milestone 1 Backend & Build Configuration Investigation

## 1. Observation

Direct observations from examining the WiScripts Windows codebase:

1. **Tauri Version & Dependencies**:
   - `src-tauri/Cargo.toml` lines 13 & 16:
     ```toml
     [build-dependencies]
     tauri-build = { version = "2.0.0", features = [] }

     [dependencies]
     tauri = { version = "2.0.0", features = [] }
     tauri-plugin-opener = "2.0.0"
     ```
   - `src-tauri/tauri.conf.json` line 2: `"$schema": "https://schema.tauri.app/config/2"`
   - `package.json` lines 13-14 & 21:
     ```json
     "@tauri-apps/api": "^2.0.0",
     "@tauri-apps/plugin-opener": "^2.0.0",
     "@tauri-apps/cli": "^2.0.0"
     ```
   - *Observation*: The project uses **Tauri v2.0.0** on both Rust backend and Node/React frontend.

2. **Auto-Updater Integration Status**:
   - `src-tauri/Cargo.toml`: `tauri-plugin-updater` dependency is **absent**.
   - `src-tauri/src/lib.rs` line 22: Only `tauri_plugin_opener::init()` is registered. `tauri_plugin_updater` is **not registered**.
   - `src-tauri/capabilities/default.json` lines 6-9:
     ```json
     "permissions": [
       "core:default",
       "opener:default"
     ]
     ```
     `updater:default` (or specific updater permissions) is **missing**.
   - `src-tauri/tauri.conf.json`: `"plugins"` object is **missing**; no `"updater"` endpoints or public keys configured. `"bundle.createUpdaterArtifacts"` is missing.
   - `package.json`: `@tauri-apps/plugin-updater` is **missing** from dependencies.

3. **Application Version Consistency & IPC Exposure**:
   - `src-tauri/Cargo.toml` line 3: `version = "0.1.0"`
   - `src-tauri/tauri.conf.json` line 4: `"version": "0.3.0"`
   - `package.json` line 4: `"version": "0.3.0"`
   - `src/components/SettingsView.tsx` line 70: Hardcoded string `<span className="text-text-primary font-semibold">2.0.0</span>`.
   - `src-tauri/src/commands/mod.rs` lines 84-125 (`get_system_info`): Exposes OS name, OS version, OS build, CPU/RAM, telemetry, elevation, but **does not expose application version**.
   - `src-tauri/src/lib.rs` lines 23-44: No `get_app_version` IPC command is registered in `tauri::generate_handler!`.

4. **App Icon Configuration & Root Cause Analysis**:
   - `src-tauri/build.rs` lines 4-29:
     ```rust
     const VALID_ICO_BYTES: &[u8] = &[
         0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
         0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00,
         0x30, 0x00, 0x00, 0x00,
         0x16, 0x00, 0x00, 0x00,
         0x28, 0x00, 0x00, 0x00,
         0x01, 0x00, 0x00, 0x00,
         0x02, 0x00, 0x00, 0x00,
         0x01, 0x00,
         0x20, 0x00,
         0x00, 0x00, 0x00, 0x00,
         0x00, 0x00, 0x00, 0x00,
         0x00, 0x00, 0x00, 0x00,
         0x00, 0x00, 0x00, 0x00,
         0x00, 0x00, 0x00, 0x00,
         0x00, 0x00, 0x00, 0x00,
         0xFF, 0x00, 0x00, 0xFF,
         0x00, 0x00, 0x00, 0x00,
     ];

     fn main() {
         let icons_dir = Path::new("icons");
         if !icons_dir.exists() {
             let _ = fs::create_dir_all(icons_dir);
         }
         let _ = fs::write(icons_dir.join("icon.ico"), VALID_ICO_BYTES);

         tauri_build::build();
     }
     ```
   - `src-tauri/icons/icon.ico`: Currently 82,251 bytes (valid multi-res icon file), BUT whenever `cargo build` / `tauri build` / `tauri dev` executes, `build.rs` runs BEFORE `tauri_build::build()` and **overwrites** `icons/icon.ico` with `VALID_ICO_BYTES` (a 48-byte 1x2 pixel dummy transparent icon).
   - `src-tauri/tauri.conf.json` lines 28-33:
     ```json
     "icon": [
       "icons/32x32.png",
       "icons/128x128.png",
       "icons/128x128@2x.png",
       "icons/icon.icns"
     ]
     ```
     Notice `"icons/icon.ico"` is **missing** from `bundle.icon`.
   - `src-tauri/tauri.conf.json` lines 13-19 (`app.windows[0]`):
     ```json
     {
       "title": "WiScripts Windows",
       "width": 1200,
       "height": 800,
       "resizable": true
     }
     ```
     Notice `"icon"` is **not specified** on the window configuration object.

---

## 2. Logic Chain

1. **Tauri v2 Architecture**:
   - Observations 1.1 & 1.2 demonstrate that the framework is Tauri v2.0.0.
   - In Tauri v2, plugins use the modular `tauri-plugin-*` Rust crates and `@tauri-apps/plugin-*` NPM packages.
   - IPC capabilities in Tauri v2 are strictly guarded by json configuration files in `src-tauri/capabilities/`. Without `"updater:default"` or `"updater:allow-check"` added to `capabilities/default.json`, any frontend attempt to invoke updater APIs will be blocked by security policy.

2. **Auto-Updater Integration Plan**:
   - To integrate `tauri-plugin-updater` under Tauri v2:
     - `src-tauri/Cargo.toml` needs `tauri-plugin-updater = "2.0.0"`.
     - `src-tauri/src/lib.rs` needs `.plugin(tauri_plugin_updater::Builder::new().build())`.
     - `src-tauri/capabilities/default.json` needs `"updater:default"` in `permissions`.
     - `src-tauri/tauri.conf.json` needs `"plugins": { "updater": { "pubkey": "...", "endpoints": [...] } }` and `"bundle": { "createUpdaterArtifacts": true }`.
     - `package.json` needs `"@tauri-apps/plugin-updater": "^2.0.0"`.

3. **Application Version Exposing & Synchronization**:
   - Observation 1.3 shows three different version numbers across `Cargo.toml` (`0.1.0`), `tauri.conf.json` (`0.3.0`), and `SettingsView.tsx` (`2.0.0`).
   - `Cargo.toml` version must be bumped to match `tauri.conf.json` (`0.3.0`).
   - A Rust IPC command `get_app_version` (or inclusion in `get_system_info`) should return `app_handle.package_info().version.to_string()` or `env!("CARGO_PKG_VERSION")`.
   - `SettingsView.tsx` should fetch this version via IPC instead of hardcoding `2.0.0`.

4. **Root Cause Analysis of App Icon Issue**:
   - Observation 1.4 reveals three distinct flaws combining to break the window/taskbar icon:
     - **Root Cause 1 (Primary)**: `build.rs` writes 48 dummy bytes (`VALID_ICO_BYTES`) to `icons/icon.ico` immediately prior to `tauri_build::build()`. `tauri_build` reads this corrupted 1x2 pixel file and embeds it into the PE executable binary (`.exe` resources). Windows OS taskbar and ALT+TAB fail to extract a valid icon from the compiled `.exe` resources.
     - **Root Cause 2**: `tauri.conf.json` `bundle.icon` array omits `"icons/icon.ico"`.
     - **Root Cause 3**: `tauri.conf.json` `app.windows[0]` does not explicitly declare `"icon": "icons/icon.ico"` or `"icons/128x128.png"`.

---

## 3. Caveats

- **Updater Public Key & Release Endpoint**: Minisign public key generation (`tauri signer generate`) and production update endpoint URL (e.g. GitHub Releases URL) require deployment infrastructure setup. Placeholder endpoint and key structure should be configured until release keys are generated.
- **Icon Source File**: `src-tauri/icons/icon.ico` exists (82KB). If clean regenerations are needed, `tauri icon` CLI command (`npx tauri icon ico.png`) can regenerate all sizes from the root `ico.png` file.

---

## 4. Conclusion & Concrete Recommendations

### Recommendations for Backend Files

#### A. Fix `src-tauri/build.rs` (Root Cause Fix for Icon)
Remove the unconditional `fs::write` overwriting `icons/icon.ico`. `build.rs` should simply be:
```rust
fn main() {
    tauri_build::build();
}
```

#### B. Update `src-tauri/Cargo.toml`
1. Align package version: `version = "0.3.0"`.
2. Add `tauri-plugin-updater`:
```toml
[dependencies]
tauri = { version = "2.0.0", features = [] }
tauri-plugin-opener = "2.0.0"
tauri-plugin-updater = "2.0.0"
```

#### C. Update `src-tauri/tauri.conf.json`
1. Fix `bundle.icon` to include `icons/icon.ico`:
```json
"bundle": {
  "active": true,
  "targets": ["nsis"],
  "createUpdaterArtifacts": true,
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
}
```
2. Add explicit icon to `app.windows[0]`:
```json
"windows": [
  {
    "title": "WiScripts Windows",
    "width": 1200,
    "height": 800,
    "resizable": true,
    "icon": "icons/icon.ico"
  }
]
```
3. Add updater plugin configuration:
```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...",
    "endpoints": [
      "https://github.com/WiScripts/wiscripts-windows/releases/latest/download/latest.json"
    ]
  }
}
```

#### D. Update `src-tauri/capabilities/default.json`
Grant updater permissions to default window:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "updater:default"
  ]
}
```

#### E. Update `src-tauri/src/commands/mod.rs` & `src-tauri/src/lib.rs`
1. In `src-tauri/src/commands/mod.rs`, add dynamic app version command:
```rust
#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}
```
2. In `src-tauri/src/lib.rs`, register updater plugin and `get_app_version` command:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
        commands::get_app_version,
        commands::get_system_info,
        ...
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

#### F. Frontend NPM Dependency
In `package.json`, add:
```json
"dependencies": {
  "@tauri-apps/plugin-updater": "^2.0.0"
}
```

---

## 5. Verification Method

To independently verify these recommendations once implemented:

1. **Compilation Check**:
   ```powershell
   cargo check --manifest-path src-tauri/Cargo.toml
   ```
   *Expected result*: Clean compilation without missing plugin or capability syntax errors.

2. **App Icon Verification**:
   - Delete `src-tauri/icons/icon.ico` and regenerate cleanly with `npx tauri icon ico.png` (or restore valid 82KB `icon.ico`).
   - Run `npx tauri build` or `npx tauri dev`.
   - Inspect the generated executable resource and taskbar icon in Windows.
   *Expected result*: Icon size of `src-tauri/icons/icon.ico` remains 82KB (not overwritten to 48 bytes), and window titlebar/taskbar renders the blue WiScripts logo.

3. **IPC Version Check**:
   - Run `npx tauri dev` and check `invoke('get_app_version')` in browser devtools console.
   *Expected result*: Returns `"0.3.0"`.

4. **Updater Plugin Verification**:
   - Run `npx tauri dev` with `@tauri-apps/plugin-updater` called via frontend `check()`.
   *Expected result*: Updater attempts check against configured endpoint without permission errors (`updater:default` capability granted).

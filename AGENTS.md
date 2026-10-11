# WiScripts Windows — Engineering Rules & Invariants

## 1. PowerShell Script File Staging & BOM Encoding Invariant

### The Invariant
Every temporary PowerShell (`.ps1`) script file written to disk for execution (whether standard execution via `execute_custom_script` or elevated via `execute_script_elevated_bridge`) MUST contain **EXACTLY ONE** UTF-8 Byte Order Mark (`0xEF, 0xBB, 0xBF`) at byte offset 0.

### Strict Requirements
1. **Always Strip In-Memory BOM Before Prepending File BOM**:
   In Rust:
   ```rust
   let clean_content = script_content.trim_start_matches('\u{feff}');
   let mut bytes = vec![0xEF, 0xBB, 0xBF];
   bytes.extend_from_slice(clean_content.as_bytes());
   ```
   In TypeScript / Frontend:
   ```typescript
   const cleanContent = rawContent.replace(/^\uFEFF+/, '');
   ```
2. **Sanitize on Read**:
   Any file-reading utility (e.g. `read_library_script` in `src-tauri/src/script_runner/sync.rs`) that decodes bytes into a `String` must sanitize leading `\u{feff}` before returning it to the caller:
   ```rust
   String::from_utf8(bytes)
       .map(|s| s.trim_start_matches('\u{feff}').to_string())
   ```
3. **Never Write Consecutive BOMs**:
   A double BOM (`0xEF 0xBB 0xBF 0xEF 0xBB 0xBF`) causes PowerShell's tokenizer to decode the second BOM as `?` (alias for `Where-Object`), resulting in `?param()` and fatal `ExpectedExpression` parser crashes.

---

## 2. OTA Auto-Updater SemVer & Hotfix Release Invariant

### The Invariant
Whenever a bug fix or modification must reach users who may have already downloaded or updated to a release build, **NEVER** reuse or force-push to the existing release version tag. **ALWAYS** bump the SemVer patch version.

### Strict Requirements
1. **Strict SemVer Trigger**:
   `@tauri-apps/plugin-updater` only triggers an update if `target_version > current_version`. If a user is on `1.6.0`, a release manifest with `version: "1.6.0"` will be treated as `upToDate` and the fix will NOT be delivered.
2. **Synchronize All 7 Version Manifests**:
   When bumping a version (e.g. `1.6.0` -> `1.6.1`), atomically update all 7 locations:
   - `package.json` (`"version"`)
   - `package-lock.json` (`"version"` and `packages[""].version`)
   - `src-tauri/Cargo.toml` (`version = "..."`)
   - `src-tauri/Cargo.lock` (`name = "wiscripts_windows"`)
   - `src-tauri/tauri.conf.json` (`"version"`)
   - `src/store/slices/updaterSlice.ts` (`appVersion: '...'`)
   - `scripts_lib/manifest.json` (`"version"`)
3. **Dedicated Release Notes**:
   Always create `RELEASE_NOTES_<version>.md` before publishing the tag so GitHub Actions (`release.yml`) automatically populates the GitHub Release description.
4. **Synchronize Version Verification Tests**:
   When bumping a version, atomically update the assertion targets in:
   - `tests/test_challenger1_m3_version_verification.cjs`
   - `tests/static_analysis/static_analysis_suite.js` (`report.manifest.version`)

---

## 3. Low-Level Hardware & Storage Telemetry Invariant

### The Invariant
Drive health and diagnostic telemetry must always reflect authentic system state with graceful privilege-level fallbacks and explicit open-source attribution.

### Strict Requirements
1. **Zero-Mock Policy & Graceful Elevation Fallback**:
   Win32 `DeviceIoControl` queries to physical drives (`\\.\PhysicalDriveX`) require Administrator elevation. When non-elevated, **NEVER** inject synthetic mock telemetry (fake temperatures, fabricated health percentages). Gracefully fall back to non-elevated PowerShell (`Get-PhysicalDisk`, `Get-StorageReliabilityCounter`) and display elevation requirement badges (`Требуются права админа для SMART`).
2. **Open-Source Attribution**:
   When adopting low-level hardware telemetry, IOCTL mappings, or reverse-engineered log page structures from external reference implementations (e.g. CrystalDiskInfo), always retain explicit in-app acknowledgments and repository links crediting the original authors (e.g. Noriyuki Miyazaki / hiyohiyo).

---

## 4. Static AST Test Integrity Invariant

### The Invariant
Core UI components and navigation configurations that are actively inspected by static AST test suites must preserve their literal symbol structures and syntax tokens.

### Strict Requirements
1. **Preserve Scanned Literal Symbols**:
   Components validated by static AST test suites (such as `src/components/Navigation.tsx`) must preserve their literal symbol declarations (e.g. `const NAV_ITEMS: NavItem[] = [...]`) and class literal invariants. Never extract scanned constants to external helper modules without updating the static AST test harnesses.

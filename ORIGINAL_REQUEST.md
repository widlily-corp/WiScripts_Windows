# Original User Request

## Initial Request — 2026-08-18T10:44:11Z

Conduct a comprehensive error and vulnerability audit across the entire WiScripts application, specifically focusing on the online scripts system, Tauri IPC/Rust backend, and React/TypeScript frontend, and fix all discovered issues with full verification.

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: development

## Requirements

### R1. Online Scripts System Audit and Hardening
Audit the online scripts lifecycle (manifest fetching, schema validation, download, caching, execution, parameter sanitation, elevation handling, and dry-run simulation). Fix any bugs related to network timeouts, malformed manifests, missing error handling, race conditions, and UI state desynchronization.

### R2. Full Application Codebase Verification & Bug Fixing
Identify and resolve all TypeScript compilation errors, uncaught runtime exceptions, broken or missing i18n keys, memory leaks, invalid state transitions in Zustand slices, and mismatched Tauri IPC command invocations.

### R3. Rust Backend & IPC Consistency
Inspect all Rust commands in `src-tauri` for unhandled `Result`/`Option` panics, unsafe command line invocations, encoding issues, and ensure type alignment with the frontend invoke bindings.

### R4. Automated Verification & Regression Prevention
Ensure all existing automated tests pass, add or update regression tests for any discovered bugs, and confirm clean frontend and backend builds.

## Acceptance Criteria

### Diagnostics & Build
- [ ] Frontend build (`npm run build` / `tsc --noEmit && vite build`) completes with 0 errors and 0 warnings.
- [ ] Backend verification (`cargo check` or `cargo build` in `src-tauri` where toolchain is present) finishes cleanly without unhandled panics or build failures.

### Functional Integrity
- [ ] Online scripts library successfully syncs, filters, loads details, runs safely in both normal and dry-run modes, and recovers gracefully from simulated offline / corrupted network responses.
- [ ] All UI views, tabs, and modals operate without uncaught promise rejections or React render crashes.
- [ ] i18n parity check passes across all supported languages (no missing keys).

### Test Suite
- [ ] Automated test suite (`npm test` / `node tests/e2e/runner.js` and standalone unit/adversarial tests in `tests/`) runs and all tests pass with 0 failures.

## Follow-up — 2026-08-18T10:55:48Z

[USER_INSIGHT_CRITICAL]
The user provided crucial context and architectural root causes for PowerShell script failures in WiScripts:

1. PowerShell 5.1 Encoding / CP1251 Parser Bug:
- Scripts without UTF-8 BOM default to CP1251 on Russian Windows.
- Multibyte UTF-8 characters inside block comments `<# ... #>` can emit bytes matching `#>`, breaking block comments and executing arbitrary text as PowerShell code (e.g. "Unexpected token 'Локальный'").
- Required standard: Scripts must use clean English/ASCII or UTF-8 BOM, avoiding non-ASCII inside `<# ... #>` block comments.

2. `param()` Placement & Backend Header Prepending:
- `param(...)` must be strictly the first statement.
- WiScripts backend must never prepend code (such as `[Console]::OutputEncoding = UTF8`) above `param(...)` when wrapping or running temporary scripts.

3. Localization & CLI tool parsing (`powercfg` etc.):
- Hardcoded string matches like `"GUID: "` break on Russian Windows (`"GUID схемы питания: "`).
- Must use universal aliases (e.g. `SCHEME_CURRENT`) or locale-agnostic parsing.

4. Script Safety & Runner Hangs:
- No hardcoded paths (use `$PSScriptRoot` or dynamically resolved paths).
- No blocking interactive prompts like `Read-Host` in scripts run by the GUI.
- Soft elevation checks (`[Security.Principal.WindowsPrincipal]`) with graceful error returns instead of unhandled `Access Denied` crashes.

Incorporate these exact rules into your audit, automated tests, and fixes across all local scripts, online script runner mechanisms, and backend invocation wrappers.

## Follow-up — 2026-08-24T10:33:03Z

Prepare and deliver a new release of WiScripts Windows (v1.5.1) featuring fixes for the disk analyzer (resolving the 1000+ GB overflow and long-scan black screen crash), fixing the freeze/hang in `optimize_windows_tweaks.ps1` (where Step 3 running DISM/SFC silently blocks indefinitely), conducting a complete static audit and repair of existing scripts in the online library, and adding new high-utility scripts across all categories—with strict safety enforcement prohibiting live script execution on the host machine.

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: development

## Requirements

### R1. Fix Disk Analysis Overflow & Black Screen Crash
- Fix the data overflow / counter reset occurring when analyzed disk size exceeds 1000 GB (1 TB).
- Resolve the long-scan freeze and black screen crash (prevent unbounded memory growth, excessive Tauri IPC payload overhead, and React state/DOM rendering stalls during deep directory traversal).
- Ensure continuous, accurate progress reporting and responsive UI even when scanning multi-terabyte drives with deep directory hierarchies.

### R2. Fix `optimize_windows_tweaks.ps1` Step 3 Freeze & Online Script Library Audit
- In `scripts_lib/performance/optimize_windows_tweaks.ps1`, fix Step 3 ("Restoring System Files (SFC/DISM)") which silently blocks execution for tens of minutes via `Out-Null` with zero feedback: decouple heavy offline DISM/SFC operations or provide non-blocking/granular execution with timeouts/progress rather than silent hanging.
- Perform a thorough static syntax and semantic audit of all scripts in `scripts_lib/` (diagnostics, maintenance, network, performance, security) and `manifest.json`.
- Fix syntax errors, deprecated PowerShell cmdlets, incorrect parameter handling, and unhandled failure branches across all broken scripts.
- Ensure all scripts conform to standard exit codes, output formatting, and metadata contracts.

### R3. Authoring New Production-Ready Scripts
- Add new, well-structured utility scripts across all primary categories:
  - System diagnostics and hardware state monitoring (e.g. detailed battery report, GPU info, disk SMART summary)
  - Advanced network diagnostic and adapter troubleshooting tools (e.g. flush DNS & renew IP, ping/latency diagnostics, network speed/adapter reset)
  - Safe disk and temporary cache cleanup utilities (e.g. clean Windows Update cache, safe browser cache cleaner, Delivery Optimization cache)
  - Windows security, telemetry, and privacy management tweaks (e.g. disable telemetry tasks, configure Windows Defender scan schedule)
  - System performance optimization and resource analysis (e.g. clear RAM standby list, manage visual effects for performance)
- Register all newly created scripts in `scripts_lib/manifest.json` with bilingual localization (RU/EN), descriptions, execution risk levels, and parameter definitions.

### R4. Version v1.5.1 Bump & Release Documentation
- Update version to `1.5.1` across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and related manifests.
- Create `RELEASE_NOTES_1.5.1.md` documenting all bug fixes (disk analyzer, optimize tweaks step 3), performance improvements, repaired scripts, and newly added library utilities.
- Verify clean compilation of both frontend (`npm run build`) and backend (`cargo check` / `cargo test`).

### R5. Strict Safety Constraint (Zero Host Execution)
- Absolutely NO scripts from `scripts_lib` or test payloads may be executed live against the host Windows operating system.
- Verification of scripts must be conducted strictly via static AST parsing (e.g. `[System.Management.Automation.Language.Parser]`), schema validation, and unit tests with mocked environments.

## Acceptance Criteria

### Disk Analyzer Reliability
- [ ] Disk analysis accurately handles partitions > 1000 GB (up to multi-TB mock storage structures) without integer overflow, counter truncation, or data reset.
- [ ] Scanning large directory trees produces no frontend crashes, unhandled promise rejections, IPC payload limits exceeded, or black screen rendering states.

### Script Library Health & New Additions
- [ ] `optimize_windows_tweaks.ps1` no longer hangs indefinitely on Step 3 and provides clear status/safety.
- [ ] 100% of scripts in `scripts_lib/` pass static AST syntax parsing with zero errors.
- [ ] `scripts_lib/manifest.json` is strictly valid, with all script paths existing and all metadata fields (id, name, description, risk, params) consistent.
- [ ] New utility scripts are created, categorized across the 5 target domains, and registered in `manifest.json`.

### Build & Release Integrity
- [ ] Zero destructive or modifying scripts executed on the host environment during the entire lifecycle.
- [ ] Frontend builds cleanly with zero TypeScript errors (`tsc && vite build`).
- [ ] Backend passes Rust compilation and unit tests (`cargo test`).
- [ ] Release notes `RELEASE_NOTES_1.5.1.md` and version `1.5.1` increments are properly documented.

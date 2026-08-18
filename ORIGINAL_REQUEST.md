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

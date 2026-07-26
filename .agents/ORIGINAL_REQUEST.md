# Original User Request

## 2026-07-26T19:31:18Z

Fix all bugs in WiScripts Windows, ensure all backend optimization and tweaking functions execute for real (not just dry-run), and implement UI warnings for functions that require Administrator privileges.

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: development

## Requirements

### R1. Real Execution
Ensure the frontend React application correctly triggers real execution of commands (e.g., passing `dry_run: false` where appropriate or fixing any bugs in `RealRunner`/IPC handlers). All features (diagnostics, package manager, profiles, DNS, driver backup) must work properly.

### R2. Administrator Warnings
Implement clear and informative UI warnings (using existing Tailwind/Lucide design system) for features that require the app to be launched as Administrator. If `is_elevated` is false, warn the user and optionally disable execution buttons for actions that will fail without elevation.

## Acceptance Criteria

### Execution & Build Verification
- [ ] Execution buttons trigger real PowerShell/CMD commands.
- [ ] `cargo check` and `cargo test` pass without errors.
- [ ] `npm run build` succeeds (no TypeScript errors).

### UI / Admin Checks
- [ ] Visual indicators clearly communicate when Admin privileges are missing for system-level operations.
- [ ] No `any` types or "AI-slop" in the new code; strict adherence to the project's coding standards.

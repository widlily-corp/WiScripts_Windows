# Orchestrator Plan — WiScripts Windows Real Execution & Admin Warnings

## Project Goal
Fix all bugs in WiScripts Windows, ensure all backend optimization and tweaking functions execute for real (not just dry-run), implement UI warnings for actions requiring Administrator privileges, and verify all builds and tests pass cleanly.

## Milestones

### Milestone 1: Codebase Analysis & Bug Discovery
- **Objective**: Conduct comprehensive analysis of current Rust backend (IPC handlers, `Runner`, `RealRunner`, dry_run flags) and React frontend (store, components, dry_run parameters, `is_elevated` state).
- **Target Deliverable**: Exploration Handoff Report detailing exact locations where `dry_run` is forced to `true`, bugs in execution handlers, missing elevation checks, and exact changes needed for real execution and admin warnings.
- **Assigned Agents**: 3 Parallel Explorers (`teamwork_preview_explorer`).

### Milestone 2: Real Execution Backend & IPC Fixes
- **Objective**: Implement real execution logic in Rust backend and React frontend. Ensure `dry_run: false` works properly for all features (diagnostics, package manager, profiles, DNS, driver backup) and execution engine executes actual PowerShell/CMD commands when requested.
- **Target Deliverable**: Code changes, passing `cargo check` and `cargo test`.
- **Assigned Agents**: Worker (`teamwork_preview_worker`), Reviewers (`teamwork_preview_reviewer`).

### Milestone 3: Administrator UI Warnings & Elevation Controls
- **Objective**: Check elevation status (`is_elevated`) on backend/frontend. Display clear Tailwind/Lucide admin warnings for features requiring administrator rights when the app is not elevated. Optionally disable or prompt for execution buttons when unelevated.
- **Target Deliverable**: UI component updates, passing `npm run build` and `npx tsc --noEmit`.
- **Assigned Agents**: Worker (`teamwork_preview_worker`), Reviewers (`teamwork_preview_reviewer`).

### Milestone 4: E2E Verification & Forensic Integrity Audit
- **Objective**: Verify full system functionality, clean build outputs, empirical correctness, and integrity audit.
- **Target Deliverable**: Passing `cargo check`, `cargo test`, `npm run build`, Challenger empirical verification, clean Forensic Auditor verdict.
- **Assigned Agents**: Challengers (`teamwork_preview_challenger`), Forensic Auditor (`teamwork_preview_auditor`).

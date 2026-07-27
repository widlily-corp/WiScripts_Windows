# Orchestrator Plan

## Goal
Migrate `.github/workflows/release.yml` to use `tauri-apps/tauri-action@v0`, remove manual `npm run tauri build` and `softprops/action-gh-release@v2`, and configure signing secrets under `env`.

## Steps
1. Initialize orchestrator workspace metadata (`plan.md`, `progress.md`, `context.md`, `BRIEFING.md`, `PROJECT.md`).
2. Start heartbeat cron.
3. Spawn Explorer agent (`teamwork_preview_explorer`) to inspect current `.github/workflows/release.yml` and codebase setup, and provide precise migration recommendations.
4. Spawn Worker agent (`teamwork_preview_worker`) to update `.github/workflows/release.yml` and run any available workflow/syntax/lint validation.
5. Spawn 2 Reviewer agents (`teamwork_preview_reviewer`) to independently review the workflow changes against acceptance criteria.
6. Spawn 2 Challenger agents (`teamwork_preview_challenger`) to stress-test/verify workflow correctness.
7. Spawn Forensic Auditor agent (`teamwork_preview_auditor`) to verify integrity (no hardcoded credentials, genuine action usage, binary veto compliance).
8. Gate evaluation & Victory report to Parent.

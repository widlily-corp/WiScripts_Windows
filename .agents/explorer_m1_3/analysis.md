# Detailed Technical Analysis: Build, Test & Verification Infrastructure

**Explorer ID**: explorer_m1_3  
**Date**: 2026-07-22  
**Target System**: WiScripts Windows (Tauri v2 + React 18 + Rust)

---

## 1. Overview & Build Configuration

The WiScripts Windows application is structured as a Tauri v2 desktop application combining a Rust backend (`src-tauri/`) and a React 18 TypeScript frontend (`src/`).

### Backend Build Configuration (`src-tauri/Cargo.toml`)
- **Package**: `wiscripts_windows` (v0.1.0, Rust edition 2021)
- **Library Crate**: `wiscripts_windows_lib` with `crate-type = ["staticlib", "cdylib", "rlib"]`. The `rlib` output allows integration testing and unit testing of internal modules.
- **Dependencies**:
  - `tauri`: version 2.0.0
  - `tauri-plugin-opener`: 2.0.0
  - `serde` & `serde_json`: 1.0 (with `derive` feature for JSON serialization over IPC)
  - `thiserror`: 1.0 (custom `AppError` type)
  - `sysinfo`: 0.30 (OS stats, CPU/RAM monitoring)
  - `log` (0.4) & `simplelog` (0.12) (structured logging to file & stdout)

### Frontend Build Configuration (`package.json` & `vite.config.ts`)
- **Build Engine**: Vite v5.4.21 with `@vitejs/plugin-react`
- **TypeScript**: TS 5.6.0 with `strict: true` and `noEmit: true` in `tsconfig.json`
- **Dependencies**: `@tauri-apps/api` (v2.0.0), `lucide-react`, `react` (18.3.1), `react-dom`, `zustand` (4.5.5)
- **CSS Stack**: TailwindCSS v3.4.14 with PostCSS & Autoprefixer
- **Scripts in `package.json`**:
  - `npm run dev`: Starts Vite HMR dev server on port 1420
  - `npm run build`: Runs `tsc && vite build` (compiles React + TS into `dist/`)
  - `npm run preview`: Serves production build preview
  - `npm run tauri`: Runs `@tauri-apps/cli`

---

## 2. Existing Verification Commands & Execution Results

### 2.1 Backend Commands
1. **`cargo check`** (in `src-tauri/`):
   - Validates Rust code compilation without linking binaries.
   - Result: **Passed cleanly (0 errors)**.
2. **`cargo test`** (in `src-tauri/`):
   - Executes 25 unit and IPC mock tests across modules:
     - `commands::tests`: `test_get_system_info_ipc`, `test_execute_optimizations_ipc_dry_run`, `test_execute_odt_install_ipc_dry_run`, `test_execute_activation_ipc_dry_run`
     - `logger::tests`: `test_init_logger_creates_debug_log`, `test_reinit_logger_handles_set_logger_error_gracefully`, `test_log_levels_timestamps_and_output_formatting`, `test_command_runner_logging_stdout_stderr`
     - `mas::tests`: `test_activation_script_commands`, `test_execute_activation_dry_run_hwid`, `test_execute_activation_dry_run_kms38`, `test_execute_activation_dry_run_ohook`
     - `odt::tests`: `test_generate_odt_xml_...`, `test_execute_odt_install_...`, `test_escape_powershell_literal`
     - `optimization::tests`: `test_rule_catalog_contains_at_least_15_rules`, `test_rule_catalog_covers_all_6_categories`, `test_preview_optimizations`, `test_execute_optimizations_dry_run_exact_commands`
     - `runner::tests`: `test_dry_run_runner_records_powershell_and_cmd`, `test_execution_summary_camel_case_serialization`
   - Result: **25 passed, 0 failed, completed in 1.08s**.

### 2.2 Frontend Commands
1. **`npm run build`**:
   - Executes `tsc` followed by `vite build`.
   - Result: **Passed cleanly**. 1816 modules transformed into `dist/assets/index-CuH3O7Rh.js` (245 kB) in 2.77s.
2. **`npx tsc --noEmit`**:
   - Performs strict TypeScript type checks on `src/`.
   - Result: **Passed with 0 errors**.

---

## 3. Backend Event Emission Verification Strategy (`optimization::execute`)

### Current State
`optimization::execute` signature:
```rust
pub fn execute(
    runner: &dyn CommandRunner,
    selected_keys: &[String],
) -> Result<ExecutionSummary, AppError>
```
Currently, execution runs synchronously over selected rules using `CommandRunner` (`DryRunRunner` or `RealRunner`) and returns an `ExecutionSummary`.

### Strategy for Event Emission & Headless Testing

#### Approach A: Event Emitter Trait Abstraction (Recommended for Pure Unit Testing)
Decouple event emission from the Tauri `AppHandle` / `WebviewWindow` using a trait:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub current_index: usize,
    pub total_count: usize,
    pub item_id: String,
    pub item_title: String,
    pub status: String, // "running" | "success" | "failed" | "skipped"
    pub duration_ms: u64,
}

pub trait ProgressEmitter: Send + Sync {
    fn emit_progress(&self, event: ProgressEvent) -> Result<(), AppError>;
}
```

1. **Tauri App Handle Implementation**:
   ```rust
   impl ProgressEmitter for tauri::AppHandle {
       fn emit_progress(&self, event: ProgressEvent) -> Result<(), AppError> {
           use tauri::Emitter;
           self.emit("optimization-progress", event)
               .map_err(|e| AppError::Execution(e.to_string()))
       }
   }
   ```
2. **Test Mock Implementation**:
   ```rust
   pub struct MockProgressEmitter {
       pub emitted: Arc<Mutex<Vec<ProgressEvent>>>,
   }
   
   impl ProgressEmitter for MockProgressEmitter {
       fn emit_progress(&self, event: ProgressEvent) -> Result<(), AppError> {
           self.emitted.lock().unwrap().push(event);
           Ok(())
       }
   }
   ```
3. **Verification in Rust Test**:
   ```rust
   #[test]
   fn test_execute_optimizations_emits_progress_events() {
       let runner = DryRunRunner::new();
       let emitter = MockProgressEmitter::new();
       let selected = vec!["telemetry_diagtrack".to_string(), "disk_clean_temp".to_string()];
       
       let summary = execute_with_events(&runner, &selected, Some(&emitter)).unwrap();
       
       let events = emitter.emitted.lock().unwrap();
       assert_eq!(events.len(), 2);
       assert_eq!(events[0].item_id, "telemetry_diagtrack");
       assert_eq!(events[0].status, "success");
       assert_eq!(events[1].current_index, 2);
       assert_eq!(events[1].total_count, 2);
   }
   ```

#### Approach B: Tauri v2 Headless `mock_app` Context
Tauri 2.0 provides native headless testing primitives when enabling `features = ["test"]` in `src-tauri/Cargo.toml`:
```toml
[dependencies]
tauri = { version = "2.0.0", features = ["test"] }
```
In tests:
```rust
#[test]
fn test_ipc_event_emission_with_mock_app() {
    let app = tauri::test::mock_app();
    let handle = app.handle();
    
    let (tx, rx) = std::sync::mpsc::channel();
    handle.listen("optimization-progress", move |event| {
        let payload: ProgressEvent = serde_json::from_str(event.payload()).unwrap();
        tx.send(payload).unwrap();
    });
    
    // Call command or execute with handle
    // Assert rx.recv_timeout(...) receives emitted events
}
```

---

## 4. Frontend Component Testing & Linting Strategy

### 4.1 Lint Infrastructure
Currently, `package.json` lacks an ESLint setup.
**Recommendation**:
- Add `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.
- Create `.eslintrc.cjs` configured for React TS + hooks.
- Add script: `"lint": "eslint src --ext .ts,.tsx --max-warnings 0"`.

### 4.2 Unit & Component Testing Setup (Vitest + React Testing Library)
**Recommended Stack**:
- `vitest`: Ultra-fast Vite-native test runner.
- `@testing-library/react` & `@testing-library/jest-dom`: Component rendering & DOM assertions.
- `jsdom`: Browser DOM environment simulation.

**Configuration in `vite.config.ts`**:
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

**Tauri IPC Mocking (`src/test/setup.ts`)**:
```typescript
import { vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'get_system_info') {
      return {
        osName: 'Windows 11 Pro',
        osVersion: '23H2',
        osBuild: '22631.3880',
        isElevated: true,
        cpuUsagePercent: 15,
        memoryUsedMb: 4096,
        memoryTotalMb: 16384,
        telemetryStatus: 'Active',
      };
    }
    if (cmd === 'execute_optimizations') {
      return {
        success: true,
        executedActions: [],
        totalDurationMs: 150,
        isDryRun: args?.dryRun ?? true,
      };
    }
    return null;
  }),
}));
```

**Example Component Test (`src/components/__tests__/OptimizationView.test.tsx`)**:
- Test category tab selection (`Telemetry`, `Bloatware`, `Services`).
- Test preset button application (`Recommended`, `Telemetry-Only`).
- Test search filtering by keyword.
- Test safety confirmation modal trigger when clicking "Execute Selected".
- Test dry-run mode badge display.

---

## 5. Summary Matrix of Verification Commands

| Scope | Purpose | Command | Status |
|-------|---------|---------|--------|
| Rust Backend | Type check / check | `cargo check` (in `src-tauri`) | ✅ Passing |
| Rust Backend | Unit & Integration Tests | `cargo test` (in `src-tauri`) | ✅ Passing (25/25) |
| React Frontend | TypeScript Type Check | `npx tsc --noEmit` | ✅ Passing (0 errors) |
| React Frontend | Production Bundle Build | `npm run build` | ✅ Passing (2.77s) |
| React Frontend | Component Tests (Proposed) | `npm run test` (`vitest run`) | Recommended setup |
| React Frontend | Linter Check (Proposed) | `npm run lint` (`eslint`) | Recommended setup |

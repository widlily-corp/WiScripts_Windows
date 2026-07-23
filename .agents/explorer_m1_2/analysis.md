# Frontend React UI Modal & Event Listener Analysis Report

## Executive Summary
This report analyzes the Frontend React codebase in `src/` of the **WiScripts_Windows** project. It details the existing UI modal structure, state management, Tauri event listening capabilities, and provides a complete architectural design and code specification for a live execution progress modal (`ExecutionProgressModal`) with real-time `task-progress` event subscriptions, progress bar percentage calculation, highlighted error log streams, and an auto-scrolling log console.

---

## 1. Inventory of Current Modal & Dialog Components

| Component File Path | Component Name | Role & Description | Current Limitations |
|---------------------|----------------|--------------------|---------------------|
| `src/components/SafetyConfirmationModal.tsx` | `SafetyConfirmationModal` | Pre-execution safety check dialog triggered before running potentially risky commands. Features risk badges, dry-run safety toggle, collapsible command preview, and a type-to-confirm "CONFIRM" text input for critical tasks. | Only acts as a pre-execution confirmation prompt. Closes when execution starts (`onConfirmAction()`). Does NOT display real-time execution progress or streaming logs during task execution. |
| `src/App.tsx` (line 73) | `App` Root | Global overlay container mounting `<SafetyConfirmationModal />` at the bottom of the viewport. | Does not currently mount an execution progress modal. |

---

## 2. Current State Management & Execution Flow

### State Definition (`src/store/useAppStore.ts`)
The Zustand store (`useAppStore`) maintains execution-related state:

```typescript
// Relevant slices in AppState (src/store/useAppStore.ts):
isExecuting: boolean;               // Line 60: true while an IPC command execution is active
setIsExecuting: (executing: boolean) => void;
executionProgress: number;          // Line 62: defined as 0, but NOT updated anywhere in views/hooks!
logs: ExecutionLog[];                // Line 63: array of ExecutionLog objects
addLog: (log: Omit<ExecutionLog, 'id' | 'timestamp'>) => void;
clearLogs: () => void;
```

### Execution Flow in Current Views (`OptimizationView.tsx`, `MasView.tsx`, `OdtView.tsx`)
1. User clicks **"Execute Selected"** / **"Activate"** / **"Deploy Office"**.
2. View calls `openSafetyModal(...)` passing `onConfirmAction`.
3. Inside `onConfirmAction`:
   - `setIsExecuting(true)` is set.
   - `invoke<ExecutionSummary>('execute_optimizations' | 'execute_activation' | 'execute_odt_install', ...)` is called.
   - The call **blocks asynchronously** until the backend completely finishes the entire command execution batch.
   - Upon promise resolution, the full batch `ExecutionSummary` is received and batch-appended to `logs`.
   - `setIsExecuting(false)` is set in the `finally` block.
4. **Issue Identified**: While the backend process is running (which can take seconds or minutes for long-running scripts like Office deployment or system debloat), the UI provides no modal feedback, step counts, or real-time streaming output to the user.

---

## 3. Evaluation of `@tauri-apps/api/event` Imports

- **Current Status**: `@tauri-apps/api/event` is **NOT imported anywhere** in `src/`.
- **Installed Version**: `@tauri-apps/api` v2.0.0 (verified in `package.json` line 13).
- **Tauri v2 API Pattern**:
  ```typescript
  import { listen, UnlistenFn } from '@tauri-apps/api/event';
  ```
- **Function Signature**:
  ```typescript
  const unlisten: UnlistenFn = await listen<TPayload>(
    eventName: string,
    handler: (event: Event<TPayload>) => void
  );
  ```

---

## 4. Architectural Design for Live Execution Progress Component

### Target Event Data Interface (`src/types/index.ts`)
```typescript
export interface TaskProgressPayload {
  task_id?: string;
  current_step: number;
  total_steps: number;
  message: string;
  status?: 'info' | 'warn' | 'error' | 'cmd' | 'success';
  is_error?: boolean;
}
```

### Proposed Component: `ExecutionProgressModal.tsx`
File location: `src/components/ExecutionProgressModal.tsx`

#### Key UI Features & Behavior:
1. **Visibility Trigger**: Visible whenever `isExecuting === true` in `useAppStore`.
2. **Event Subscription**: Inside a React `useEffect`, subscribes to the `'task-progress'` Tauri IPC event using `listen()`. Returns the `unlisten()` cleanup callback when `isExecuting` turns false or on unmount.
3. **Progress Calculation**:
   $$\text{Percentage} = \min\left(100, \text{Math.round}\left(\frac{\text{current\_step}}{\text{total\_steps}} \times 100\right)\right)$$
4. **Auto-Scrolling Log Console**: Utilizes a React `useRef<HTMLDivElement>` attached to the log container. Upon every update to the logs array, triggers `scrollTop = scrollHeight`.
5. **Error & Status Highlighting**:
   - **Error (`is_error` or `level === 'error'`)**: Highlighted with `bg-status-dangerSubtle text-status-danger border-status-danger/30` and an `<AlertOctagon />` icon.
   - **Warning (`level === 'warn'`)**: Highlighted with `bg-status-warningSubtle text-status-warning`.
   - **Command (`level === 'cmd'`)**: Highlighted with `bg-brand-subtle text-brand` and a `<Terminal />` icon.
   - **Success / Info (`level === 'info'` or `status === 'success'`)**: Standard code text color `#E5E7EB`.

---

## 5. Recommended Code Implementations

### A. Store Update (`src/store/useAppStore.ts`)
Add `setExecutionProgress` to `AppState` interface and state creator:

```typescript
// In AppState interface:
setExecutionProgress: (progress: number) => void;

// In store creator:
executionProgress: 0,
setExecutionProgress: (progress) => set({ executionProgress: progress }),
```

### B. New Component Implementation (`src/components/ExecutionProgressModal.tsx`)

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { TaskProgressPayload, ExecutionLog } from '../types';
import { Loader2, Terminal, AlertOctagon, CheckCircle2, Shield } from 'lucide-react';

export function ExecutionProgressModal() {
  const isExecuting = useAppStore((s) => s.isExecuting);
  const executionProgress = useAppStore((s) => s.executionProgress);
  const setExecutionProgress = useAppStore((s) => s.setExecutionProgress);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const logs = useAppStore((s) => s.logs);
  const addLog = useAppStore((s) => s.addLog);

  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [activeMessage, setActiveMessage] = useState('Initializing task execution...');
  
  const logConsoleRef = useRef<HTMLDivElement>(null);

  // 1. Subscribe to 'task-progress' event from Tauri backend
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    async function setupTaskListener() {
      try {
        unlisten = await listen<TaskProgressPayload>('task-progress', (event) => {
          const { current_step, total_steps, message, status, is_error } = event.payload;

          setCurrentStep(current_step);
          setTotalSteps(total_steps);
          setActiveMessage(message);

          // Calculate percentage
          const pct = total_steps > 0 ? Math.min(Math.round((current_step / total_steps) * 100), 100) : 0;
          setExecutionProgress(pct);

          // Add to central log stream
          const logLevel = is_error ? 'error' : (status || 'info');
          addLog({
            level: logLevel,
            message: `[Step ${current_step}/${total_steps}] ${message}`,
          });
        });
      } catch (err) {
        console.error('Failed to register task-progress listener:', err);
      }
    }

    if (isExecuting) {
      setExecutionProgress(0);
      setCurrentStep(0);
      setTotalSteps(0);
      setActiveMessage('Task initiated...');
      setupTaskListener();
    }

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [isExecuting, setExecutionProgress, addLog]);

  // 2. Auto-scroll behavior for live log stream
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isExecuting) return null;

  const isCompleted = executionProgress >= 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
    >
      <div className="w-full max-w-xl rounded-[6px] border border-border bg-surface p-6 shadow-2xl animate-scale-in space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-brand-subtle text-brand border border-brand/30">
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-brand" />
              )}
            </div>
            <div>
              <h3 id="progress-modal-title" className="text-base font-semibold text-text-primary">
                {isCompleted ? 'Execution Complete' : 'Executing Task Operations...'}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono text-text-muted">
                  {dryRunMode ? 'Mode: Simulated (Dry-Run)' : 'Mode: Live Execution'}
                </span>
                {dryRunMode && (
                  <span className="rounded bg-brand/10 px-1.5 py-0.2 font-mono text-[9px] uppercase text-brand border border-brand/20">
                    Dry-Run Guard Active
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right font-mono">
            <div className="text-lg font-bold text-brand tabular-nums">{executionProgress}%</div>
            <div className="text-[10px] text-text-muted">
              {totalSteps > 0 ? `Step ${currentStep} of ${totalSteps}` : 'Processing...'}
            </div>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-text-secondary truncate max-w-[80%]">{activeMessage}</span>
            <span className="font-mono text-text-muted tabular-nums">{executionProgress}%</span>
          </div>
          <div className="w-full bg-surface-active h-2.5 rounded-full overflow-hidden border border-border-subtle">
            <div
              className={`h-full transition-all duration-300 ease-out ${
                isCompleted ? 'bg-status-success' : 'bg-brand'
              }`}
              style={{ width: `${executionProgress}%` }}
            />
          </div>
        </div>

        {/* Live Auto-Scrolling Log Console */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-text-muted">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-brand" /> Live Task Console Output
            </span>
            <span>{logs.length} entries</span>
          </div>

          <div
            ref={logConsoleRef}
            className="h-52 overflow-y-auto rounded-[6px] border border-border-subtle bg-surface-subtle p-3 font-mono text-xs space-y-1.5 scroll-smooth"
          >
            {logs.length === 0 ? (
              <div className="text-text-muted italic py-8 text-center text-xs">
                Awaiting task output stream...
              </div>
            ) : (
              logs.map((log) => {
                const isError = log.level === 'error';
                const isWarn = log.level === 'warn';
                const isCmd = log.level === 'cmd';

                return (
                  <div
                    key={log.id}
                    className={`p-1.5 rounded text-xs leading-relaxed flex items-start gap-2 border transition-colors ${
                      isError
                        ? 'bg-status-dangerSubtle text-status-danger border-status-danger/30 font-medium'
                        : isWarn
                        ? 'bg-status-warningSubtle text-status-warning border-status-warning/30'
                        : isCmd
                        ? 'bg-brand-subtle text-brand border-brand/20'
                        : 'bg-surface/50 text-text-code border-border-subtle/50'
                    }`}
                  >
                    {isError ? (
                      <AlertOctagon className="h-3.5 w-3.5 text-status-danger shrink-0 mt-0.5" />
                    ) : (
                      <span className="text-[10px] text-text-muted tabular-nums shrink-0 mt-0.5">
                        [{log.timestamp.slice(11, 19)}]
                      </span>
                    )}
                    <span className="flex-1 break-words">{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### C. Mounting in `App.tsx`
Import and place `<ExecutionProgressModal />` inside `App.tsx`:

```tsx
import { SafetyConfirmationModal } from './components/SafetyConfirmationModal';
import { ExecutionProgressModal } from './components/ExecutionProgressModal';

export function App() {
  // ...
  return (
    <div className="...">
      {/* ... main layout ... */}
      <SafetyConfirmationModal />
      <ExecutionProgressModal />
    </div>
  );
}
```

---

## 6. Summary Checklist of Proposed UI Changes

- [x] Identified all modal locations (`SafetyConfirmationModal.tsx` in `App.tsx`).
- [x] Verified `@tauri-apps/api/event` import strategy for Tauri v2.
- [x] Designed `ExecutionProgressModal` with `listen('task-progress', ...)` inside `useEffect`.
- [x] Formulated progress percentage calculation formula: `(current_step / total_steps) * 100`.
- [x] Provided auto-scrolling log console using React `useRef` and `useEffect`.
- [x] Applied error entry styling using `bg-status-dangerSubtle`, `text-status-danger`, and `AlertOctagon` icon.

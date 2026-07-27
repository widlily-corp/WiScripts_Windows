import React, { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { TaskProgressPayload } from '../types';
import { Loader2, Terminal, AlertOctagon, CheckCircle2, X } from 'lucide-react';

export function ExecutionProgressModal() {
  const isExecuting = useAppStore((s) => s.isExecuting);
  const executionProgress = useAppStore((s) => s.executionProgress);
  const currentStep = useAppStore((s) => s.currentStep);
  const totalSteps = useAppStore((s) => s.totalSteps);
  const setCurrentProgress = useAppStore((s) => s.setCurrentProgress);
  const setExecutionProgress = useAppStore((s) => s.setExecutionProgress);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const logs = useAppStore((s) => s.logs);
  const addLog = useAppStore((s) => s.addLog);
  const setIsExecuting = useAppStore((s) => s.setIsExecuting);

  const logConsoleRef = useRef<HTMLDivElement>(null);

  // Subscribe to 'task-progress' event from Tauri backend
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let isMounted = true;

    async function setupTaskListener() {
      try {
        const unlistenFn = await listen<TaskProgressPayload>('task-progress', (event) => {
          if (!isMounted) return;
          const { currentStep: step, totalSteps: total, message, isError } = event.payload;

          setCurrentProgress(step, total);
          const percent = total > 0 ? (step / total) * 100 : 0;
          const clampedPercent = Math.min(Math.max(percent, 0), 100);
          setExecutionProgress(Math.round(clampedPercent));

          addLog({
            level: isError ? 'error' : 'info',
            message: `[Step ${step}/${total}] ${message}`,
          });
        });

        if (isMounted) {
          unlisten = unlistenFn;
        } else {
          unlistenFn();
        }
      } catch (err) {
        console.error('Failed to register task-progress listener:', err);
      }
    }

    if (isExecuting) {
      setCurrentProgress(0, 0);
      setExecutionProgress(0);
      setupTaskListener();
    }

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [isExecuting, setCurrentProgress, setExecutionProgress, addLog]);

  // Auto-scroll log console on logs update
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isExecuting) return null;

  const isCompleted = executionProgress >= 100 && totalSteps > 0;
  const progressPercent = Math.min(Math.max(executionProgress, 0), 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
    >
      <div className="w-full max-w-xl rounded-[6px] border border-border bg-surface p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4 relative">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-brand-subtle text-brand border border-brand/30 shrink-0">
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
            <div className="text-lg font-bold text-brand tabular-nums">{progressPercent}%</div>
            <div className="text-[10px] text-text-muted">
              {totalSteps > 0 ? `Step ${currentStep} of ${totalSteps}` : 'Processing...'}
            </div>
          </div>
          {isCompleted && (
            <button
              onClick={() => setIsExecuting(false)}
              className="absolute -top-2 -right-2 p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-active rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-text-secondary truncate max-w-[80%]">
              {totalSteps > 0 ? `Executing Step ${currentStep}/${totalSteps}` : 'Initializing task execution...'}
            </span>
            <span className="font-mono text-text-muted tabular-nums">{progressPercent}%</span>
          </div>
          <div className="w-full bg-surface-active h-2.5 rounded-full overflow-hidden border border-border-subtle">
            <div
              className={`h-full transition-all duration-300 ease-out ${
                isCompleted ? 'bg-status-success' : 'bg-brand'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Live Auto-Scrolling Log Viewer Console */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-text-muted">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-brand" /> Live Console Output
            </span>
            <span className="tabular-nums">{logs.length} entries</span>
          </div>

          <div
            ref={logConsoleRef}
            className="h-56 overflow-y-auto rounded-[6px] border border-border-subtle bg-surface-subtle p-3 font-mono text-xs space-y-1.5 scroll-smooth"
          >
            {logs.length === 0 ? (
              <div className="text-text-muted italic py-10 text-center text-xs">
                Awaiting task output stream...
              </div>
            ) : (
              logs.map((log) => {
                const isError = log.level === 'error';
                const isCmd = log.level === 'cmd';
                const isWarn = log.level === 'warn';

                return (
                  <div
                    key={log.id}
                    className={`p-2 rounded text-xs leading-relaxed flex items-start gap-2 border transition-colors ${
                      isError
                        ? 'text-red-400 bg-red-950/40 border border-red-800/40 font-medium'
                        : isWarn
                        ? 'bg-status-warningSubtle text-status-warning border-status-warning/30'
                        : isCmd
                        ? 'bg-brand-subtle text-brand border-brand/20'
                        : 'bg-surface/50 text-text-code border-border-subtle/50'
                    }`}
                  >
                    {isError ? (
                      <AlertOctagon className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <span className="text-[10px] text-text-muted tabular-nums shrink-0 mt-0.5">
                        [{log.timestamp ? log.timestamp.slice(11, 19) : ''}]
                      </span>
                    )}
                    <span className="flex-1 break-words">{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer actions when completed */}
        {isCompleted && (
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setIsExecuting(false)}
              className="px-4 py-2 bg-brand text-brand-contrast rounded-[6px] text-sm font-medium hover:bg-brand/90 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

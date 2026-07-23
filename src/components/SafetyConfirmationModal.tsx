import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { AlertTriangle, Terminal, X, ShieldAlert } from 'lucide-react';

export function SafetyConfirmationModal() {
  const modal = useAppStore((s) => s.pendingSafetyModal);
  const closeModal = useAppStore((s) => s.closeSafetyModal);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const setDryRunMode = useAppStore((s) => s.setDryRunMode);

  const [confirmInput, setConfirmInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setConfirmInput('');
    setShowCommands(false);
  }, [modal?.isOpen]);

  if (!modal || !modal.isOpen) return null;

  const isCritical = modal.riskLevel === 'critical';
  const isInputValid = !isCritical || dryRunMode || confirmInput.trim().toUpperCase() === 'CONFIRM';

  const handleConfirm = async () => {
    if (!isInputValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await modal.onConfirmAction();
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-lg rounded-[6px] border border-border bg-surface p-6 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-[6px] ${
                isCritical
                  ? 'bg-status-dangerSubtle text-status-danger'
                  : 'bg-status-warningSubtle text-status-warning'
              }`}
            >
              {isCritical ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <h3 id="modal-title" className="text-base font-semibold text-text-primary">
                {modal.title}
              </h3>
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                Risk Level:{' '}
                <span className={isCritical ? 'text-status-danger font-bold' : 'text-status-warning font-bold'}>
                  {modal.riskLevel}
                </span>
              </span>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="rounded-[6px] p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 space-y-4">
          <p className="text-sm text-text-secondary">{modal.description}</p>

          {/* Dry Run Toggle Card */}
          <div className="flex items-center justify-between rounded-[6px] border border-border-subtle bg-surface-subtle p-3">
            <div>
              <div className="text-xs font-medium text-text-primary">Safety Mode (Dry-Run)</div>
              <div className="text-[11px] text-text-muted">Simulate execution without applying real system changes</div>
            </div>
            <input
              type="checkbox"
              checked={dryRunMode}
              onChange={(e) => setDryRunMode(e.target.checked)}
              className="h-4 w-4 rounded-[4px] border-border bg-surface text-brand focus:ring-brand"
            />
          </div>

          {/* Commands Disclosure */}
          <div>
            <button
              onClick={() => setShowCommands(!showCommands)}
              className="flex items-center gap-2 text-xs font-mono text-brand hover:underline"
            >
              <Terminal className="h-3.5 w-3.5" />
              {showCommands ? 'Hide exact commands' : `Inspect commands (${modal.commandsToRun.length})`}
            </button>
            {showCommands && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-[6px] border border-border-subtle bg-surface-subtle p-3 font-mono text-[11px] text-text-code">
                {modal.commandsToRun.map((cmd, idx) => (
                  <div key={idx} className="mb-1 last:mb-0">
                    <span className="text-text-muted">$</span> {cmd}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Type to Confirm Input */}
          {isCritical && !dryRunMode && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Type <span className="font-mono text-status-danger font-bold">CONFIRM</span> to proceed:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="CONFIRM"
                className="w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-status-danger focus:outline-none font-mono"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            onClick={closeModal}
            className="rounded-[6px] border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isInputValid || isSubmitting}
            className={`rounded-[6px] px-4 py-2 text-xs font-medium transition-opacity ${
              dryRunMode
                ? 'bg-brand text-white hover:bg-brand-hover'
                : 'bg-status-danger text-white hover:opacity-90'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {isSubmitting
              ? 'Processing...'
              : dryRunMode
              ? 'Simulate in Dry-Run'
              : 'Execute Live Action'}
          </button>
        </div>
      </div>
    </div>
  );
}

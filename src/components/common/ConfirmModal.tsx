import React, { useId } from 'react';
import { AlertTriangle, ShieldAlert, X, Loader2 } from 'lucide-react';
import { useAccessibleModal } from './useAccessibleModal';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: 'danger' | 'warning' | 'brand';
  isConfirming?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  isConfirming = false,
  onConfirm,
  onClose,
}) => {
  const titleId = useId();
  const descId = useId();
  const modalRef = useAccessibleModal({ isOpen, onClose, disabled: isConfirming });

  if (!isOpen) return null;

  const badgeStyle =
    variant === 'danger'
      ? 'bg-status-dangerSubtle text-status-danger border-status-danger/30'
      : variant === 'warning'
      ? 'bg-status-warningSubtle text-status-warning border-status-warning/30'
      : 'bg-brand-subtle text-brand border-brand/30';

  const buttonStyle =
    variant === 'danger'
      ? 'bg-status-danger hover:bg-status-danger/90 text-white'
      : variant === 'warning'
      ? 'bg-status-warning hover:bg-status-warning/90 text-white'
      : 'bg-brand hover:bg-brand-hover text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-[8px] border border-border bg-surface p-5 shadow-2xl animate-scale-in focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border ${badgeStyle}`}>
              {variant === 'danger' ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </div>
            <h3 id={titleId} className="text-sm font-semibold text-text-primary">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            aria-label={cancelLabel}
            className="rounded-[6px] p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p id={descId} className="mt-4 text-xs text-text-secondary leading-relaxed">
          {description}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="rounded-[6px] border border-border px-3.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            data-autofocus="true"
            className={`inline-flex items-center gap-1.5 rounded-[6px] px-4 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50 ${buttonStyle}`}
          >
            {isConfirming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

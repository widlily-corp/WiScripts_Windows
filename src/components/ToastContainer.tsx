import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ToastNotification } from '../types';
import { Info, CheckCircle2, AlertTriangle, AlertOctagon, X } from 'lucide-react';

function ToastItem({ toast }: { toast: ToastNotification }) {
  const dismissToast = useAppStore((s) => s.dismissToast);

  useEffect(() => {
    const duration = toast.durationMs ?? 5000;
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      dismissToast(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismissToast]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-status-success shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />;
      case 'error':
        return <AlertOctagon className="h-4 w-4 text-status-danger shrink-0 mt-0.5" />;
      case 'info':
      default:
        return <Info className="h-4 w-4 text-brand shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="pointer-events-auto bg-surface/95 backdrop-blur border border-border rounded-[6px] p-3.5 shadow-lg flex items-start gap-3 text-xs w-80 max-w-full animate-fade-in transition-all">
      {getIcon()}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-text-primary leading-tight">{toast.title}</div>
        {toast.message && (
          <p className="text-text-secondary text-[11px] mt-1 leading-relaxed break-words">
            {toast.message}
          </p>
        )}
        {toast.actionLabel && toast.onAction && (
          <button
            onClick={() => {
              toast.onAction?.();
              dismissToast(toast.id);
            }}
            className="mt-2 text-[11px] font-medium text-brand hover:text-brand-hover underline"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
        aria-label="Close notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

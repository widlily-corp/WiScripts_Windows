import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Copy,
  Check,
  Download,
  X,
  RotateCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Code2,
} from 'lucide-react';
import type { ScriptExecutionRecord } from '../store/slices/scriptRunnerSlice';
import { downloadScriptLogFile, generateStructuredLogText } from '../utils/scriptLogExporter';
import { useAccessibleModal } from './common/useAccessibleModal';
import { PaginationBar, usePagination } from './common/VirtualList';

export interface ExecutionLogModalProps {
  isOpen: boolean;
  record: ScriptExecutionRecord | null;
  onClose: () => void;
  onRerun?: (record: ScriptExecutionRecord) => void;
}

export const ExecutionLogModal: React.FC<ExecutionLogModalProps> = ({
  isOpen,
  record,
  onClose,
  onRerun,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modalRef = useAccessibleModal({
    isOpen: isOpen && Boolean(record),
    onClose,
  });

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const filteredLogs = (record?.logLines ?? []).filter(
    (l) => !logFilter || l.line.toLowerCase().includes(logFilter.toLowerCase())
  );

  const { page, totalPages, pageSize, totalItems, pagedItems, setPage } = usePagination(filteredLogs, 150);

  if (!isOpen || !record) return null;

  const handleCopyLogs = async () => {
    setCopyError(null);
    try {
      const fullText = generateStructuredLogText(record);
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownload = () => {
    downloadScriptLogFile(record);
  };

  const durationSec = (record.durationMs / 1000).toFixed(2);

  const statusBadge = () => {
    if (record.status === 'success') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          {t('script_runner.history_status_success', 'Success')} (0)
        </span>
      );
    }
    if (record.status === 'cancelled') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
          {t('script_runner.history_status_cancelled', 'Cancelled')} ({record.exitCode})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
        {t('script_runner.history_status_failed', 'Failed')} ({record.exitCode})
      </span>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exec-log-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-surface border border-border rounded-[8px] shadow-2xl overflow-hidden focus:outline-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface-subtle/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-[6px] bg-brand/10 border border-brand/20 text-brand">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  id="exec-log-modal-title"
                  className="text-sm font-semibold text-text-primary truncate"
                >
                  {t('script_runner.history_modal_title', 'Execution Log Viewer')}
                </h3>
                {statusBadge()}
              </div>
              <p className="text-xs text-text-secondary truncate mt-0.5 font-mono">
                {record.scriptName} • {record.timestamp}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary rounded-[6px] hover:bg-surface-hover transition-colors"
            aria-label={t('script_runner.history_modal_close', 'Close')}
            title={t('script_runner.history_modal_close', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Telemetry Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-surface-subtle/20 border-b border-border text-xs">
          <div className="flex flex-wrap items-center gap-4 text-text-muted font-mono">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-brand" />
              <span>{durationSec}s</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-brand" />
              <span>{record.scriptType.toUpperCase()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              {record.elevated ? (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>UAC / Admin</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Standard User</span>
                </span>
              )}
            </span>
            {record.isDryRun && (
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[10px]">
                DRY-RUN
              </span>
            )}
          </div>

          {/* Search inside logs */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              placeholder={t('script_runner.search_output_placeholder', 'Search output...')}
              className="w-full pl-8 pr-3 py-1 text-xs bg-surface border border-border rounded-[6px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* Log Viewer Content Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0A0D14] font-mono text-xs text-text-code select-text">
          {pagedItems.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-text-muted">
              <p>{t('script_runner.history_modal_no_logs', 'No log lines were captured during this execution.')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {pagedItems.map((log, idx) => {
                const lineNum = (page - 1) * pageSize + idx + 1;
                return (
                  <div
                    key={log.id || lineNum}
                    className={`flex items-start gap-3 px-2 py-0.5 rounded hover:bg-white/5 ${
                      log.stream === 'stderr' ? 'text-rose-400' : 'text-text-code'
                    }`}
                  >
                    <span className="text-[11px] text-text-muted/60 select-none w-8 text-right shrink-0">
                      {lineNum}
                    </span>
                    <span className="text-[10px] text-text-muted/70 select-none shrink-0">
                      [{log.timestamp}]
                    </span>
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-semibold select-none shrink-0 ${
                        log.stream === 'stderr'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-blue-500/20 text-blue-300'
                      }`}
                    >
                      {log.stream.toUpperCase()}
                    </span>
                    <span className="break-all whitespace-pre-wrap">{log.line}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface-subtle/40">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted font-mono">
              {filteredLogs.length} / {record.logLines.length} lines
            </span>
            {copyError && (
              <span className="text-xs text-status-danger font-mono">{copyError}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-subtle hover:bg-surface-hover border border-border rounded-[6px] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{t('script_runner.history_modal_copied', 'Copied!')}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>{t('script_runner.history_modal_copy', 'Copy Logs')}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-subtle hover:bg-surface-hover border border-border rounded-[6px] transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t('script_runner.history_modal_download', 'Download .log')}</span>
            </button>
            {onRerun && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRerun(record);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-hover rounded-[6px] transition-colors"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>{t('script_runner.history_rerun', 'Re-run')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-[6px] transition-colors"
            >
              {t('script_runner.history_modal_close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, ShieldAlert, Timer, Square, ArrowDown, Download, Trash2 } from 'lucide-react';
import { PaginationBar, usePagination } from '../common/VirtualList';

export interface ScriptOutputLine {
  id: string;
  timestamp: string;
  stream: string;
  line: string;
}

interface OutputTerminalPanelProps {
  outputLogs: ScriptOutputLine[];
  isExecutingScript: boolean;
  isElevatedRunning: boolean;
  isCancellingScript: boolean;
  formattedElapsed: string;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  onCancelScript: () => void;
  onDownloadLog: () => void;
  onClearLogs: () => void;
}

export function OutputTerminalPanel({
  outputLogs,
  isExecutingScript,
  isElevatedRunning,
  isCancellingScript,
  formattedElapsed,
  autoScroll,
  onToggleAutoScroll,
  onCancelScript,
  onDownloadLog,
  onClearLogs,
}: OutputTerminalPanelProps) {
  const { t } = useTranslation();
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const pagination = usePagination(outputLogs, 150);
  const prevLenRef = useRef(outputLogs.length);

  useEffect(() => {
    if (outputLogs.length > prevLenRef.current && autoScroll) {
      pagination.setPage(pagination.totalPages);
    }
    prevLenRef.current = outputLogs.length;
  }, [autoScroll, outputLogs.length, pagination.totalPages, pagination.setPage]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLogs, autoScroll, pagination.page]);

  return (
    <div className="flex flex-col rounded-[6px] border border-border bg-surface p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold text-text-primary">
            {t('script_runner.terminal_title', 'Execution Output Console')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isExecutingScript && (
            <div className="flex items-center gap-1.5 mr-1">
              {isElevatedRunning && (
                <span
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-status-warning bg-status-warning/15 px-2 py-0.5 rounded border border-status-warning/30 font-semibold"
                  title={t('script_runner.elevated_running_tooltip', 'Running with elevated Administrator privileges')}
                >
                  <ShieldAlert className="h-3 w-3 animate-pulse" />
                  <span>{t('script_runner.elevated_badge', 'ELEVATED')}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-brand bg-brand/10 px-2 py-0.5 rounded border border-brand/30">
                <Timer className="h-3 w-3 animate-pulse" />
                <span>{formattedElapsed}</span>
              </span>
              <button
                type="button"
                onClick={onCancelScript}
                disabled={isCancellingScript}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] font-mono text-[11px] bg-status-dangerSubtle hover:bg-status-danger/20 text-status-danger border border-status-danger/40 transition-colors disabled:opacity-50"
                title={t('script_runner.cancel_execution', 'Cancel Execution')}
              >
                <Square className="h-3 w-3 fill-current" />
                <span>
                  {isCancellingScript
                    ? t('script_runner.cancelling', 'Cancelling...')
                    : t('script_runner.cancel', 'Cancel')}
                </span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleAutoScroll}
            aria-pressed={autoScroll}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-[4px] font-mono text-[11px] border transition-colors ${
              autoScroll
                ? 'bg-brand/10 border-brand/40 text-brand'
                : 'bg-surface-subtle border-border text-text-secondary'
            }`}
            title={t('script_runner.toggle_autoscroll', 'Toggle Auto-scroll')}
          >
            <ArrowDown className="h-3 w-3" />
            <span>{t('script_runner.autoscroll_label', 'Auto-scroll')}</span>
          </button>

          <button
            type="button"
            onClick={onDownloadLog}
            disabled={outputLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border transition-colors disabled:opacity-50"
            title={t('script_runner.download_log', 'Download Output Log')}
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('script_runner.download_log', 'Download Log')}</span>
          </button>

          <button
            type="button"
            onClick={onClearLogs}
            disabled={outputLogs.length === 0 || isExecutingScript}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-status-danger border border-border transition-colors disabled:opacity-50"
            title={t('script_runner.clear_terminal', 'Clear Log Console')}
            aria-label={t('script_runner.clear_terminal', 'Clear Log Console')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 bg-surface-subtle border border-border rounded-[6px] overflow-hidden flex flex-col">
        <div className="p-3 font-mono text-xs text-text-code h-80 overflow-y-auto space-y-1 select-text">
          {outputLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-secondary text-center p-4 space-y-2 select-none">
              <Terminal className="h-8 w-8 text-text-secondary/40" />
              <p className="text-xs">
                {t(
                  'script_runner.no_output',
                  'Console idle. Run a script to view live stdout/stderr stream.'
                )}
              </p>
            </div>
          ) : (
            pagination.pageItems.map((item) => (
              <div
                key={item.id}
                className={`leading-relaxed whitespace-pre-wrap break-all ${
                  item.stream === 'stderr' ? 'text-status-danger font-medium' : 'text-text-primary'
                }`}
              >
                <span className="text-text-secondary/50 text-[10px] select-none mr-2">
                  [{item.timestamp}]
                </span>
                <span>{item.line}</span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
        {outputLogs.length > 150 && (
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.setPage}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
        <span className="font-mono tabular-nums">
          {outputLogs.length} {t('script_runner.log_lines', 'output entries')}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isExecutingScript ? 'bg-brand animate-ping' : 'bg-status-success'
            }`}
          />
          <span className="font-mono text-[11px]">
            {isExecutingScript
              ? t('script_runner.status_executing', 'STREAMING')
              : t('script_runner.status_idle', 'READY')}
          </span>
        </div>
      </div>
    </div>
  );
}

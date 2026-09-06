import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  History,
  Search,
  Trash2,
  RotateCw,
  Eye,
  Download,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  Code2,
  Clock,
  FileText,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { MAX_HISTORY_ENTRIES, ScriptExecutionRecord, ExecutionStatus } from '../store/slices/scriptRunnerSlice';
import { ExecutionLogModal } from './ExecutionLogModal';
import { downloadScriptLogFile } from '../utils/scriptLogExporter';

export const ScriptExecutionHistoryView: React.FC = () => {
  const { t } = useTranslation();
  const {
    executionHistory,
    clearHistory,
    deleteHistoryEntry,
    rerunHistoryEntry,
    setActiveRunnerTab,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ExecutionStatus>('all');
  const [selectedRecordForLog, setSelectedRecordForLog] = useState<ScriptExecutionRecord | null>(null);

  const historyList = executionHistory || [];

  const filteredHistory = historyList.filter((record) => {
    if (statusFilter !== 'all' && record.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        record.scriptName.toLowerCase().includes(q) ||
        (record.scriptId && record.scriptId.toLowerCase().includes(q)) ||
        record.scriptType.toLowerCase().includes(q) ||
        record.timestamp.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleClearHistory = () => {
    if (window.confirm(t('script_runner.history_clear_confirm', 'Are you sure you want to clear all execution history records?'))) {
      clearHistory();
    }
  };

  const renderStatusBadge = (status: ExecutionStatus, exitCode: number) => {
    if (status === 'success') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3" />
          <span>{t('script_runner.history_status_success', 'Success')} (0)</span>
        </span>
      );
    }
    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <AlertCircle className="h-3 w-3" />
          <span>{t('script_runner.history_status_cancelled', 'Cancelled')} ({exitCode})</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
        <XCircle className="h-3 w-3" />
        <span>{t('script_runner.history_status_failed', 'Failed')} ({exitCode})</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-card border border-border rounded-[8px]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('script_runner.history_search_placeholder', 'Filter history by script name or ID...')}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-subtle/50 border border-border rounded-[6px] text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-brand"
            />
          </div>

          {/* Status Filter Chips */}
          <div className="flex items-center gap-1 bg-surface-subtle/40 p-0.5 rounded-[6px] border border-border text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-[4px] font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-brand text-brand-foreground'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('script_runner.history_filter_all', 'All Runs')}
            </button>
            <button
              onClick={() => setStatusFilter('success')}
              className={`px-2.5 py-1 rounded-[4px] font-medium transition-colors ${
                statusFilter === 'success'
                  ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('script_runner.history_filter_success', 'Success')}
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-2.5 py-1 rounded-[4px] font-medium transition-colors ${
                statusFilter === 'failed'
                  ? 'bg-rose-500/20 text-rose-400 font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('script_runner.history_filter_failed', 'Failed')}
            </button>
            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`px-2.5 py-1 rounded-[4px] font-medium transition-colors ${
                statusFilter === 'cancelled'
                  ? 'bg-amber-500/20 text-amber-400 font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('script_runner.history_filter_cancelled', 'Cancelled')}
            </button>
          </div>
        </div>

        {/* Counter Badge & Clear History CTA */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted font-mono">
            {t('script_runner.history_records_badge', {
              count: historyList.length,
              max: MAX_HISTORY_ENTRIES,
              defaultValue: `${historyList.length} / ${MAX_HISTORY_ENTRIES} entries`,
            })}
          </span>
          {historyList.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 rounded-[6px] transition-colors"
              title={t('script_runner.history_clear_tooltip', 'Permanently delete all execution history records')}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('script_runner.history_clear', 'Clear History')}</span>
            </button>
          )}
        </div>
      </div>

      {/* History Content Area */}
      {filteredHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-12 bg-surface-card border border-border rounded-[8px] text-center">
          <div className="p-3 rounded-full bg-surface-subtle/50 text-text-muted mb-3 border border-border">
            <History className="h-8 w-8" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">
            {t('script_runner.history_empty_title', 'No Execution History Yet')}
          </h3>
          <p className="text-xs text-text-muted max-w-sm mt-1 mb-4">
            {t('script_runner.history_empty_desc', 'Scripts executed from the editor or library will automatically be recorded here.')}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveRunnerTab('editor')}
              className="px-3 py-1.5 text-xs font-medium text-brand-foreground bg-brand hover:bg-brand/90 rounded-[6px] transition-colors"
            >
              {t('script_runner.history_empty_cta_editor', 'Open Script Editor')}
            </button>
            <button
              onClick={() => setActiveRunnerTab('library')}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-elevated border border-border rounded-[6px] transition-colors"
            >
              {t('script_runner.history_empty_cta_library', 'Browse Online Library')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-surface-card border border-border rounded-[8px] overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-subtle/40 border-b border-border text-text-muted font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">{t('script_runner.history_col_status', 'Status')}</th>
                  <th className="py-2.5 px-4">{t('script_runner.history_col_script', 'Script')}</th>
                  <th className="py-2.5 px-4">{t('script_runner.history_col_privilege', 'Privilege')}</th>
                  <th className="py-2.5 px-4">{t('script_runner.history_col_timestamp', 'Executed At')}</th>
                  <th className="py-2.5 px-4">{t('script_runner.history_col_duration', 'Duration')}</th>
                  <th className="py-2.5 px-4">{t('script_runner.history_col_lines', 'Output Lines')}</th>
                  <th className="py-2.5 px-4 text-right">{t('script_runner.history_col_actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredHistory.map((record) => {
                  const durationSec = (record.durationMs / 1000).toFixed(2);
                  const formattedDate = new Date(record.timestamp).toLocaleString();

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-surface-subtle/30 transition-colors group"
                    >
                      {/* Status */}
                      <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                        {renderStatusBadge(record.status, record.exitCode)}
                      </td>

                      {/* Script */}
                      <td className="py-2.5 px-4 align-middle min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary truncate max-w-xs">
                            {record.scriptName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface-subtle border border-border text-text-muted">
                            {record.scriptType.toUpperCase()}
                          </span>
                          {record.isDryRun && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                              DRY-RUN
                            </span>
                          )}
                        </div>
                        {record.scriptId && (
                          <p className="text-[11px] text-text-muted font-mono truncate mt-0.5">
                            {record.scriptId}
                          </p>
                        )}
                      </td>

                      {/* Privilege */}
                      <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                        {record.elevated ? (
                          <span className="inline-flex items-center gap-1 text-amber-400 text-[11px] font-mono">
                            <ShieldAlert className="h-3 w-3" />
                            <span>Administrator (UAC)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-text-muted text-[11px] font-mono">
                            <ShieldCheck className="h-3 w-3" />
                            <span>Standard User</span>
                          </span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="py-2.5 px-4 align-middle whitespace-nowrap text-text-secondary font-mono text-[11px]">
                        {formattedDate}
                      </td>

                      {/* Duration */}
                      <td className="py-2.5 px-4 align-middle whitespace-nowrap text-text-secondary font-mono">
                        {durationSec}s
                      </td>

                      {/* Lines */}
                      <td className="py-2.5 px-4 align-middle whitespace-nowrap text-text-secondary font-mono">
                        {record.logLines.length}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Re-run */}
                          <button
                            onClick={() => rerunHistoryEntry(record)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand bg-brand/10 hover:bg-brand/20 border border-brand/20 rounded-[4px] transition-colors"
                            title={t('script_runner.history_rerun_tooltip', 'Re-run this script with identical code and elevation')}
                          >
                            <RotateCw className="h-3 w-3" />
                            <span>{t('script_runner.history_rerun', 'Re-run')}</span>
                          </button>

                          {/* View Log */}
                          <button
                            onClick={() => setSelectedRecordForLog(record)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-elevated hover:bg-surface-elevated/80 border border-border rounded-[4px] transition-colors"
                            title={t('script_runner.history_view_log_tooltip', 'Inspect captured output stream and exit code')}
                          >
                            <Eye className="h-3 w-3" />
                            <span>{t('script_runner.history_view_log', 'View Log')}</span>
                          </button>

                          {/* Download .log */}
                          <button
                            onClick={() => downloadScriptLogFile(record)}
                            className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-surface-elevated transition-colors"
                            title={t('script_runner.history_export_log_tooltip', 'Download output log as a .log file')}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete Entry */}
                          <button
                            onClick={() => deleteHistoryEntry(record.id)}
                            className="p-1 text-text-muted hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors"
                            title={t('script_runner.history_delete_entry_tooltip', 'Remove this execution entry')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Execution Log Viewer Modal */}
      <ExecutionLogModal
        isOpen={Boolean(selectedRecordForLog)}
        record={selectedRecordForLog}
        onClose={() => setSelectedRecordForLog(null)}
        onRerun={(rec) => rerunHistoryEntry(rec)}
      />
    </div>
  );
};

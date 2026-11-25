import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Search, RefreshCw } from 'lucide-react';
import { ManagedProcessInfo } from '../../types/governor';
import { PaginationBar, usePagination } from '../../components/common/VirtualList';
import { PRIORITIES } from './governorUtils';

interface GovernorProcessTableProps {
  processes: ManagedProcessInfo[];
  activeRuleNames: Set<string>;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  trimmingPid: number | null;
  onQuickPriorityChange: (proc: ManagedProcessInfo, priority: string) => void;
  onTrimRam: (pid: number, name: string) => void;
  onOpenConfigModal: (name: string) => void;
}

export function GovernorProcessTable({
  processes,
  activeRuleNames,
  loading,
  searchQuery,
  onSearchChange,
  trimmingPid,
  onQuickPriorityChange,
  onTrimRam,
  onOpenConfigModal,
}: GovernorProcessTableProps) {
  const { t } = useTranslation();
  const pagination = usePagination(processes, 25);

  return (
    <div className="rounded-[6px] bg-surface border border-border p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 text-text-primary">
            <Activity className="h-4 w-4 text-brand" />
            {t('governor.running_processes', 'Active Process Governor Monitor')}
            <span className="text-xs font-normal text-text-muted">
              ({processes.length} {t('governor.processesUnit', 'processes')})
            </span>
          </h3>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('governor.search_process', 'Filter processes...')}
            aria-label={t('governor.search_process', 'Filter processes...')}
            className="w-full bg-background border border-border rounded-[6px] pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-text-muted text-xs flex flex-col items-center gap-2">
          <RefreshCw className="h-5 w-5 animate-spin text-brand" />
          <span>{t('governor.scanningProcesses', 'Scanning running processes & governor status...')}</span>
        </div>
      ) : processes.length === 0 ? (
        <div className="py-10 text-center text-text-muted text-xs">
          {t('governor.noMatchingProcesses', 'No running processes match the current filter.')}
        </div>
      ) : (
        <div className="rounded-[6px] border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-b border-border text-text-muted font-mono uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">PID</th>
                  <th className="py-2.5 px-3">{t('governor.process_name', 'Process Name')}</th>
                  <th className="py-2.5 px-3">{t('governor.cpu_usage', 'CPU %')}</th>
                  <th className="py-2.5 px-3">{t('governor.priority', 'Priority')}</th>
                  <th className="py-2.5 px-3">{t('governor.assigned_cores', 'Assigned Cores')}</th>
                  <th className="py-2.5 px-3 text-right">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {pagination.pageItems.map((proc) => {
                  const hasRule = activeRuleNames.has(proc.name.toLowerCase());
                  return (
                    <tr key={proc.pid} className="hover:bg-surface-hover/50">
                      <td className="py-2.5 px-3 font-mono text-text-muted">{proc.pid}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-text-primary flex items-center gap-2">
                        {proc.name}
                        {hasRule && (
                          <span className="px-1.5 py-0.5 text-[9px] rounded font-mono bg-brand/20 text-brand border border-brand/30">
                            {t('governor.ruleBadge', 'RULE')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={`font-semibold ${
                            proc.cpuUsage > 25
                              ? 'text-rose-400'
                              : proc.cpuUsage > 10
                              ? 'text-amber-400'
                              : 'text-text-secondary'
                          }`}
                        >
                          {proc.cpuUsage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={proc.currentPriority}
                          aria-label={`${t('governor.priority', 'Priority')} - ${proc.name}`}
                          onChange={(e) => onQuickPriorityChange(proc, e.target.value)}
                          className="bg-background border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-brand"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p.id} value={p.id}>
                              {t(p.labelKey, p.defaultLabel)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-text-muted">{proc.assignedCores}</td>
                      <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onTrimRam(proc.pid, proc.name)}
                          disabled={trimmingPid === proc.pid}
                          className="px-2 py-1 text-[11px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          {trimmingPid === proc.pid
                            ? t('governor.trimming', 'Trimming...')
                            : t('governor.trimRamBtn', 'Trim RAM')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenConfigModal(proc.name)}
                          className="px-2 py-1 text-[11px] font-medium rounded bg-surface-subtle text-text-secondary border border-border hover:text-text-primary transition-colors"
                        >
                          {t('governor.configRuleBtn', 'Config Rule')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.setPage}
          />
        </div>
      )}
    </div>
  );
}

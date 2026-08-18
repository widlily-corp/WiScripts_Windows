import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { ScheduledTaskItem } from '../types';
import {
  Clock,
  RefreshCw,
  Search,
  Play,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Filter,
  Layers,
  AlertTriangle,
} from 'lucide-react';

export function SchedulerView() {
  const { t } = useTranslation();
  const scheduledTasks = useAppStore((s) => s.scheduledTasks);
  const isSchedulerLoading = useAppStore((s) => s.isSchedulerLoading);
  const fetchScheduledTasks = useAppStore((s) => s.fetchScheduledTasks);
  const toggleScheduledTask = useAppStore((s) => s.toggleScheduledTask);
  const runScheduledTask = useAppStore((s) => s.runScheduledTask);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [telemetryOnlyFilter, setTelemetryOnlyFilter] = useState(false);

  useEffect(() => {
    fetchScheduledTasks();
  }, [fetchScheduledTasks]);

  const filteredTasks = scheduledTasks.filter((task) => {
    const matchesSearch =
      task.taskName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.taskPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.actionSummary.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesState =
      stateFilter === 'all' ||
      task.state.toLowerCase() === stateFilter.toLowerCase();

    const isTelemetryTask =
      task.taskName.toLowerCase().includes(
        'telemetry'
      ) ||
      task.taskName.toLowerCase().includes('consolidator') ||
      task.taskName.toLowerCase().includes('ceip') ||
      task.taskName.toLowerCase().includes('sqm') ||
      task.taskName.toLowerCase().includes('compat');

    const matchesTelemetry = !telemetryOnlyFilter || isTelemetryTask;

    return matchesSearch && matchesState && matchesTelemetry;
  });

  const totalCount = scheduledTasks.length;
  const readyCount = scheduledTasks.filter((t) => t.state === 'Ready').length;
  const disabledCount = scheduledTasks.filter((t) => !t.enabled || t.state === 'Disabled').length;
  const runningCount = scheduledTasks.filter((t) => t.state === 'Running').length;

  const getStatusBadge = (task: ScheduledTaskItem) => {
    if (!task.enabled || task.state === 'Disabled') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-[4px] bg-surface-subtle text-text-muted border border-border-subtle font-bold">
          <PauseCircle className="h-3 w-3 text-text-muted" />
          {t('schedulerView.disabled')}
        </span>
      );
    }
    if (task.state === 'Running') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-[4px] bg-brand/10 text-brand border border-brand/30 font-bold">
          <PlayCircle className="h-3 w-3 text-brand animate-pulse" />
          {t('schedulerView.running')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-[4px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
        {t('schedulerView.ready')}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      <AdminElevationBanner featureName={t('schedulerView.title')} />

      {/* Header */}
      <div className="rounded-[6px] border border-border bg-surface p-5 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">
              {t('schedulerView.title')}
            </h2>
            {dryRunMode && (
              <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-[4px] font-bold">
                {t('schedulerView.dryRunPreview')}
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            {t('schedulerView.description')}
          </p>
        </div>

        <button
          onClick={() => fetchScheduledTasks()}
          disabled={isSchedulerLoading}
          className="flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-brand ${isSchedulerLoading ? 'animate-spin' : ''}`} />
          <span>{t('schedulerView.refresh')}</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('schedulerView.totalTasks')}</div>
            <div className="text-2xl font-bold font-mono text-text-primary mt-1">{totalCount}</div>
          </div>
          <Layers className="h-6 w-6 text-brand opacity-60" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('schedulerView.ready')}</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{readyCount}</div>
          </div>
          <CheckCircle2 className="h-6 w-6 text-emerald-400 opacity-60" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('schedulerView.disabled')}</div>
            <div className="text-2xl font-bold font-mono text-text-muted mt-1">{disabledCount}</div>
          </div>
          <PauseCircle className="h-6 w-6 text-text-muted opacity-60" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('schedulerView.running')}</div>
            <div className="text-2xl font-bold font-mono text-brand mt-1">{runningCount}</div>
          </div>
          <PlayCircle className="h-6 w-6 text-brand opacity-60" />
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('schedulerView.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-[6px] text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTelemetryOnlyFilter(!telemetryOnlyFilter)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-xs font-mono border transition-colors ${
              telemetryOnlyFilter
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold'
                : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>{t('schedulerView.telemetryOnly')}</span>
          </button>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-surface border border-border rounded-[6px] px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-brand"
          >
            <option value="all">{t('schedulerView.allStates')}</option>
            <option value="ready">{t('schedulerView.ready')}</option>
            <option value="running">{t('schedulerView.running')}</option>
            <option value="disabled">{t('schedulerView.disabled')}</option>
          </select>
        </div>
      </div>

      {/* Task Table */}
      <div className="rounded-[6px] border border-border bg-surface overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center text-text-muted space-y-2">
            <AlertTriangle className="h-8 w-8 text-text-muted mx-auto" />
            <div className="text-sm font-medium">{t('schedulerView.noScheduledTasks')}</div>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-subtle text-text-muted font-mono uppercase text-[10px] border-b border-border-subtle">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('schedulerView.enable')}</th>
                <th className="py-3 px-4 font-semibold">{t('schedulerView.taskNameAndPath')}</th>
                <th className="py-3 px-4 font-semibold">{t('schedulerView.author')}</th>
                <th className="py-3 px-4 font-semibold">{t('schedulerView.state')}</th>
                <th className="py-3 px-4 font-semibold">{t('schedulerView.actionCommand')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('schedulerView.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredTasks.map((task) => (
                <tr key={`${task.taskPath}_${task.taskName}`} className="hover:bg-surface-hover/50 transition-colors">
                  {/* Enable Switch */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <button
                      onClick={() =>
                        toggleScheduledTask(task.taskName, task.taskPath, !task.enabled)
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        task.enabled ? 'bg-brand' : 'bg-surface-subtle border-border-subtle'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          task.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>

                  {/* Task Name & Path */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-text-primary">{task.taskName}</div>
                    <div className="text-[10px] font-mono text-text-muted truncate max-w-xs">
                      {task.taskPath}
                    </div>
                  </td>

                  {/* Author */}
                  <td className="py-3 px-4 text-text-secondary whitespace-nowrap">
                    {task.author}
                  </td>

                  {/* State */}
                  <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(task)}</td>

                  {/* Action Summary */}
                  <td className="py-3 px-4 max-w-xs truncate font-mono text-[11px] text-text-secondary">
                    {task.actionSummary}
                  </td>

                  {/* Run Action */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => runScheduledTask(task.taskName, task.taskPath)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 transition-colors font-mono text-[11px] font-semibold"
                      title={t('schedulerView.runTaskNowTooltip')}
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>{t('schedulerView.run')}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

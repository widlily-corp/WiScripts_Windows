import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Sparkles,
  Trash2,
  Sliders,
  Settings,
  Plus,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AutoTrimmerConfig } from '../types/smartRam';

export function SmartRamView() {
  const { t } = useTranslation();

  const memoryBreakdown = useAppStore((s) => s.memoryBreakdown);
  const autoTrimmerConfig = useAppStore((s) => s.autoTrimmerConfig);
  const lastPurgeResult = useAppStore((s) => s.lastPurgeResult);
  const isMemoryLoading = useAppStore((s) => s.isMemoryLoading);
  const memoryError = useAppStore((s) => s.memoryError);

  const fetchMemoryBreakdown = useAppStore((s) => s.fetchMemoryBreakdown);
  const purgeStandbyMemory = useAppStore((s) => s.purgeStandbyMemory);
  const purgeWorkingSets = useAppStore((s) => s.purgeWorkingSets);
  const fetchAutoTrimmerConfig = useAppStore((s) => s.fetchAutoTrimmerConfig);
  const saveAutoTrimmerConfig = useAppStore((s) => s.saveAutoTrimmerConfig);

  const [newExclusion, setNewExclusion] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [localTrimmerConfig, setLocalTrimmerConfig] = useState<AutoTrimmerConfig | null>(null);

  useEffect(() => {
    fetchMemoryBreakdown();
    fetchAutoTrimmerConfig();
  }, [fetchMemoryBreakdown, fetchAutoTrimmerConfig]);

  useEffect(() => {
    if (autoTrimmerConfig) {
      setLocalTrimmerConfig(autoTrimmerConfig);
    }
  }, [autoTrimmerConfig]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMemoryBreakdown();
    }, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMemoryBreakdown]);

  // Memory calculations
  const totalGb = useMemo(() => {
    if (!memoryBreakdown) return 16;
    return (memoryBreakdown.totalPhysicalBytes / (1024 * 1024 * 1024)).toFixed(1);
  }, [memoryBreakdown]);

  const inUseMb = useMemo(() => {
    if (!memoryBreakdown) return 0;
    return Math.round(memoryBreakdown.usedBytes / (1024 * 1024));
  }, [memoryBreakdown]);

  const standbyMb = useMemo(() => {
    if (!memoryBreakdown) return 0;
    return Math.round(memoryBreakdown.standbyBytes / (1024 * 1024));
  }, [memoryBreakdown]);

  const modifiedMb = useMemo(() => {
    if (!memoryBreakdown) return 0;
    return Math.round(memoryBreakdown.modifiedBytes / (1024 * 1024));
  }, [memoryBreakdown]);

  const freeMb = useMemo(() => {
    if (!memoryBreakdown) return 0;
    return Math.round(memoryBreakdown.freeBytes / (1024 * 1024));
  }, [memoryBreakdown]);

  const totalMb = useMemo(() => {
    if (!memoryBreakdown || memoryBreakdown.totalPhysicalBytes === 0) return 16384;
    return Math.round(memoryBreakdown.totalPhysicalBytes / (1024 * 1024));
  }, [memoryBreakdown]);

  const inUsePercent = Math.max(0, Math.min(100, (inUseMb / totalMb) * 100));
  const standbyPercent = Math.max(0, Math.min(100, (standbyMb / totalMb) * 100));
  const modifiedPercent = Math.max(0, Math.min(100, (modifiedMb / totalMb) * 100));
  const freePercent = Math.max(0, Math.min(100, 100 - inUsePercent - standbyPercent - modifiedPercent));

  const handlePurgeStandby = async () => {
    await purgeStandbyMemory('all');
  };

  const handlePurgeWorkingSets = async () => {
    await purgeWorkingSets([]);
  };

  const handlePurgeAll = async () => {
    await purgeWorkingSets([]);
    await purgeStandbyMemory('all');
  };

  const handleAddExclusion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExclusion.trim() || !localTrimmerConfig) return;
    const cleanName = newExclusion.trim().toLowerCase();
    if (!localTrimmerConfig.excludedProcessNames.includes(cleanName)) {
      setLocalTrimmerConfig({
        ...localTrimmerConfig,
        excludedProcessNames: [...localTrimmerConfig.excludedProcessNames, cleanName],
      });
    }
    setNewExclusion('');
  };

  const handleRemoveExclusion = (name: string) => {
    if (!localTrimmerConfig) return;
    setLocalTrimmerConfig({
      ...localTrimmerConfig,
      excludedProcessNames: localTrimmerConfig.excludedProcessNames.filter((n) => n !== name),
    });
  };

  const handleSaveTrimmer = async () => {
    if (!localTrimmerConfig) return;
    await saveAutoTrimmerConfig(localTrimmerConfig);
  };

  return (
    <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto select-none" role="region" aria-label={t('smartRam.title')}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-[6px] bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">
              {t('smartRam.title')}
            </h1>
            <p className="text-xs text-text-secondary">
              {t('smartRam.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-mono border transition-colors ${
              autoRefresh
                ? 'bg-surface-active text-brand border-brand/30'
                : 'bg-surface text-text-muted border-border hover:text-text-primary'
            }`}
            aria-label={autoRefresh ? 'Pause Auto Refresh' : 'Resume Auto Refresh'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            <span>{autoRefresh ? '2s Polling' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {memoryError && (
        <div className="p-3 rounded-[6px] bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{memoryError}</span>
        </div>
      )}

      {/* Memory Breakdown Gauge Bar Card */}
      <div className="p-5 rounded-[6px] bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t('smartRam.distribution.title')}
            </h2>
          </div>
          <span className="text-xs font-mono text-text-secondary">
            {t('smartRam.distribution.total', { total: totalGb })}
          </span>
        </div>

        {/* Multi-Segmented RAM Bar */}
        <div className="h-6 w-full rounded-[4px] bg-surface-subtle overflow-hidden flex border border-border-subtle p-0.5 gap-0.5">
          <div
            style={{ width: `${inUsePercent}%` }}
            className="h-full bg-brand rounded-l-[3px] transition-all duration-500"
            title={`In-Use: ${inUseMb} MB (${inUsePercent.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${standbyPercent}%` }}
            className="h-full bg-purple-500 transition-all duration-500"
            title={`Standby Cache: ${standbyMb} MB (${standbyPercent.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${modifiedPercent}%` }}
            className="h-full bg-amber-500 transition-all duration-500"
            title={`Modified: ${modifiedMb} MB (${modifiedPercent.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${freePercent}%` }}
            className="h-full bg-emerald-500 rounded-r-[3px] transition-all duration-500"
            title={`Free: ${freeMb} MB (${freePercent.toFixed(1)}%)`}
          />
        </div>

        {/* Breakdown Legend & Numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              <span>{t('smartRam.distribution.in_use')}</span>
            </div>
            <div className="mt-2 text-lg font-mono font-semibold text-text-primary tabular-nums">
              {inUseMb.toLocaleString()}{' '}
              <span className="text-xs font-normal text-text-muted">MB ({inUsePercent.toFixed(0)}%)</span>
            </div>
          </div>

          <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>{t('smartRam.distribution.standby')}</span>
            </div>
            <div className="mt-2 text-lg font-mono font-semibold text-purple-400 tabular-nums">
              {standbyMb.toLocaleString()}{' '}
              <span className="text-xs font-normal text-text-muted">MB ({standbyPercent.toFixed(0)}%)</span>
            </div>
          </div>

          <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>{t('smartRam.distribution.modified')}</span>
            </div>
            <div className="mt-2 text-lg font-mono font-semibold text-amber-400 tabular-nums">
              {modifiedMb.toLocaleString()}{' '}
              <span className="text-xs font-normal text-text-muted">MB ({modifiedPercent.toFixed(0)}%)</span>
            </div>
          </div>

          <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>{t('smartRam.distribution.free')}</span>
            </div>
            <div className="mt-2 text-lg font-mono font-semibold text-emerald-400 tabular-nums">
              {freeMb.toLocaleString()}{' '}
              <span className="text-xs font-normal text-text-muted">MB ({freePercent.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

        {/* Kernel Pool Readout Sub-bar */}
        {memoryBreakdown && (
          <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between text-[11px] font-mono text-text-muted gap-2">
            <span>{t('smartRam.distribution.paged_pool', { mb: Math.round(memoryBreakdown.pagedPoolBytes / (1024 * 1024)) })}</span>
            <span>{t('smartRam.distribution.non_paged_pool', { mb: Math.round(memoryBreakdown.nonPagedPoolBytes / (1024 * 1024)) })}</span>
            <span>{t('smartRam.distribution.system_cache', { mb: Math.round(memoryBreakdown.systemCacheBytes / (1024 * 1024)) })}</span>
          </div>
        )}
      </div>

      {/* 1-Click Purge Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Purge Standby */}
        <div className="p-5 rounded-[6px] bg-surface border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('smartRam.actions.purge_standby_title')}
              </h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('smartRam.actions.purge_standby_desc')}
            </p>
          </div>

          <button
            onClick={handlePurgeStandby}
            disabled={isMemoryLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] bg-purple-600 hover:bg-purple-600/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('smartRam.actions.purge_standby_btn')}</span>
          </button>
        </div>

        {/* Purge Working Sets */}
        <div className="p-5 rounded-[6px] bg-surface border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('smartRam.actions.purge_working_sets_title')}
              </h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('smartRam.actions.purge_working_sets_desc')}
            </p>
          </div>

          <button
            onClick={handlePurgeWorkingSets}
            disabled={isMemoryLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] bg-brand hover:bg-brand/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('smartRam.actions.purge_working_sets_btn')}</span>
          </button>
        </div>

        {/* Master Clean (All) */}
        <div className="p-5 rounded-[6px] bg-surface border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('smartRam.actions.purge_all_title')}
              </h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('smartRam.actions.purge_all_desc')}
            </p>
          </div>

          <button
            onClick={handlePurgeAll}
            disabled={isMemoryLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] bg-emerald-600 hover:bg-emerald-600/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('smartRam.actions.purge_all_btn')}</span>
          </button>
        </div>
      </div>

      {/* Auto-Trimmer Configuration Card */}
      {localTrimmerConfig && (
        <div className="p-5 rounded-[6px] bg-surface border border-border space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand" />
                <h2 className="text-sm font-semibold text-text-primary">
                  {t('smartRam.auto_trimmer.title')}
                </h2>
              </div>
              <p className="text-xs text-text-secondary">
                {t('smartRam.auto_trimmer.description')}
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={localTrimmerConfig.enabled}
                onChange={(e) =>
                  setLocalTrimmerConfig({ ...localTrimmerConfig, enabled: e.target.checked })
                }
                className="rounded border-border bg-surface-subtle text-brand focus:ring-brand"
              />
              <span className="text-xs font-medium text-text-primary">
                {t('smartRam.auto_trimmer.enable_toggle')}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Slider: RAM Threshold */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-text-secondary">
                  {t('smartRam.auto_trimmer.threshold_label', { percent: localTrimmerConfig.thresholdPercent })}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={localTrimmerConfig.thresholdPercent}
                onChange={(e) =>
                  setLocalTrimmerConfig({
                    ...localTrimmerConfig,
                    thresholdPercent: parseFloat(e.target.value),
                  })
                }
                className="w-full h-1.5 bg-surface-subtle rounded-lg appearance-none cursor-pointer accent-brand"
              />
            </div>

            {/* Slider: Interval Seconds */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-text-secondary">
                  {t('smartRam.auto_trimmer.interval_label', { seconds: localTrimmerConfig.intervalSeconds })}
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="600"
                step="30"
                value={localTrimmerConfig.intervalSeconds}
                onChange={(e) =>
                  setLocalTrimmerConfig({
                    ...localTrimmerConfig,
                    intervalSeconds: parseInt(e.target.value, 10),
                  })
                }
                className="w-full h-1.5 bg-surface-subtle rounded-lg appearance-none cursor-pointer accent-brand"
              />
            </div>
          </div>

          {/* Excluded / Protected Processes */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-medium text-text-primary">
              {t('smartRam.auto_trimmer.excluded_processes')}
            </h4>

            <div className="flex flex-wrap gap-1.5">
              {localTrimmerConfig.excludedProcessNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-surface-subtle border border-border text-xs font-mono text-text-secondary"
                >
                  <span>{name}</span>
                  <button
                    onClick={() => handleRemoveExclusion(name)}
                    className="hover:text-status-danger transition-colors ml-0.5"
                    aria-label={`Remove ${name} exclusion`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddExclusion} className="flex gap-2 max-w-md pt-1">
              <input
                type="text"
                placeholder={t('smartRam.auto_trimmer.excluded_placeholder')}
                value={newExclusion}
                onChange={(e) => setNewExclusion(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-[6px] bg-surface-subtle border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-brand"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-[6px] bg-surface-subtle hover:bg-surface-hover border border-border text-text-primary text-xs font-medium flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('smartRam.auto_trimmer.add_exclusion')}</span>
              </button>
            </form>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveTrimmer}
              disabled={isMemoryLoading}
              className="px-4 py-2 rounded-[6px] bg-brand hover:bg-brand/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {t('smartRam.auto_trimmer.save_config')}
            </button>
          </div>
        </div>
      )}

      {/* Purge Result Notification Banner */}
      {lastPurgeResult && (
        <div className="p-4 rounded-[6px] bg-surface border border-status-success/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-status-success font-mono">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {t('smartRam.history.last_freed', {
                mb: lastPurgeResult.mbFreed.toFixed(1),
                count: lastPurgeResult.processesTrimmed,
              })}
            </span>
          </div>
          <span className="text-[11px] text-text-muted font-mono">{lastPurgeResult.message}</span>
        </div>
      )}
    </div>
  );
}

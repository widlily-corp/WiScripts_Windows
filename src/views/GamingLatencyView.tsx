import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  Activity,
  Clock,
  Sliders,
  Play,
  Square,
  RefreshCw,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SparklineAreaGraph } from '../components/SparklineAreaGraph';

export function GamingLatencyView() {
  const { t } = useTranslation();

  const latencyMetrics = useAppStore((s) => s.latencyMetrics);
  const timerResolution = useAppStore((s) => s.timerResolution);
  const gameBoostStatus = useAppStore((s) => s.gameBoostStatus);
  const latencyHistory = useAppStore((s) => s.latencyHistory);
  const isGamingLoading = useAppStore((s) => s.isGamingLoading);
  const gamingError = useAppStore((s) => s.gamingError);

  const fetchLatencyMetrics = useAppStore((s) => s.fetchLatencyMetrics);
  const setTimerResolution = useAppStore((s) => s.setTimerResolution);
  const toggleGameBoost = useAppStore((s) => s.toggleGameBoost);
  const fetchGameBoostStatus = useAppStore((s) => s.fetchGameBoostStatus);

  const [customPid, setCustomPid] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  useEffect(() => {
    fetchLatencyMetrics();
    fetchGameBoostStatus();
  }, [fetchLatencyMetrics, fetchGameBoostStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLatencyMetrics();
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLatencyMetrics]);

  const currentTimerMs = latencyMetrics
    ? (latencyMetrics.timerResolution100ns / 10000).toFixed(3)
    : '15.625';

  const latencyStatusColor = useMemo(() => {
    if (!latencyMetrics) return 'text-text-muted';
    if (latencyMetrics.currentLatencyUs < 500) return 'text-status-success';
    if (latencyMetrics.currentLatencyUs <= 1000) return 'text-status-warning';
    return 'text-status-danger';
  }, [latencyMetrics]);

  const latencyStatusBadge = useMemo(() => {
    if (!latencyMetrics) return null;
    if (latencyMetrics.currentLatencyUs < 500) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase tracking-wider bg-status-success/10 text-status-success border border-status-success/20">
          <CheckCircle2 className="w-3 h-3" /> {t('gamingLatency.status.optimal')}
        </span>
      );
    }
    if (latencyMetrics.currentLatencyUs <= 1000) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase tracking-wider bg-status-warning/10 text-status-warning border border-status-warning/20">
          <AlertTriangle className="w-3 h-3" /> {t('gamingLatency.status.moderate')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase tracking-wider bg-status-danger/10 text-status-danger border border-status-danger/20">
        <Flame className="w-3 h-3" /> {t('gamingLatency.status.high')}
      </span>
    );
  }, [latencyMetrics, t]);

  const handleSet05ms = () => {
    setTimerResolution(5000); // 0.5ms in 100ns units
  };

  const handleSet10ms = () => {
    setTimerResolution(10000); // 1.0ms in 100ns units
  };

  const handleSetDefaultTimer = () => {
    setTimerResolution(156250); // 15.625ms in 100ns units
  };

  const handleToggleGameBoost = () => {
    const isCurrentlyActive = gameBoostStatus?.enabled ?? false;
    const targetPidNum = customPid ? parseInt(customPid, 10) : null;
    toggleGameBoost(targetPidNum, !isCurrentlyActive);
  };

  return (
    <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto select-none" role="region" aria-label={t('gamingLatency.title')}>
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[6px] bg-brand/10 border border-brand/20 text-brand">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-text-primary">
                {t('gamingLatency.title')}
              </h1>
              <p className="text-xs text-text-secondary">
                {t('gamingLatency.subtitle')}
              </p>
            </div>
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
            <span>{autoRefresh ? '1s Live Feed' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {gamingError && (
        <div className="p-3 rounded-[6px] bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{gamingError}</span>
        </div>
      )}

      {/* Metrics Cards 4-Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Latency */}
        <div className="p-4 rounded-[6px] bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('gamingLatency.metrics.current_dpc')}</span>
            <Activity className="w-4 h-4 text-text-muted" />
          </div>
          <div className="my-3">
            <span className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${latencyStatusColor}`}>
              {latencyMetrics ? latencyMetrics.currentLatencyUs.toFixed(1) : '--'}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">µs</span>
          </div>
          <div>{latencyStatusBadge}</div>
        </div>

        {/* Avg & Max Spike */}
        <div className="p-4 rounded-[6px] bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('gamingLatency.metrics.max_dpc')}</span>
            <Flame className="w-4 h-4 text-status-warning" />
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-text-primary">
              {latencyMetrics ? latencyMetrics.maxLatencyUs.toFixed(1) : '--'}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">µs</span>
          </div>
          <div className="text-[11px] font-mono text-text-muted">
            {t('gamingLatency.metrics.avg_dpc')}: <span className="text-text-primary tabular-nums">{latencyMetrics ? latencyMetrics.averageLatencyUs.toFixed(1) : '--'} µs</span>
          </div>
        </div>

        {/* DPC & ISR Rate */}
        <div className="p-4 rounded-[6px] bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('gamingLatency.metrics.dpc_rate')}</span>
            <Layers className="w-4 h-4 text-brand" />
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-text-primary">
              {latencyMetrics ? latencyMetrics.dpcRatePerSec.toLocaleString() : '--'}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">/s</span>
          </div>
          <div className="text-[11px] font-mono text-text-muted">
            {t('gamingLatency.metrics.isr_rate')}: <span className="text-text-primary tabular-nums">{latencyMetrics ? latencyMetrics.isrRatePerSec.toLocaleString() : '--'} /s</span>
          </div>
        </div>

        {/* Timer Resolution */}
        <div className="p-4 rounded-[6px] bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('gamingLatency.metrics.timer_resolution')}</span>
            <Clock className="w-4 h-4 text-status-info" />
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-status-info">
              {currentTimerMs}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">ms</span>
          </div>
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {latencyMetrics ? latencyMetrics.status : 'Normal'}
          </div>
        </div>
      </div>

      {/* Latency History Sparkline */}
      <div className="p-5 rounded-[6px] bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand" />
            <h2 className="text-xs font-medium text-text-primary uppercase tracking-wider font-mono">
              {t('gamingLatency.sparkline.title')}
            </h2>
          </div>
          <span className="text-[11px] font-mono text-text-muted">
            {t('gamingLatency.sparkline.threshold')}
          </span>
        </div>

        <div className="pt-2">
          <SparklineAreaGraph
            data={latencyHistory.length > 0 ? latencyHistory : [120, 140, 110, 130, 95, 105, 120]}
            gradientId="gamingLatencyGradient"
            colorHex={latencyMetrics && latencyMetrics.currentLatencyUs > 1000 ? '#EF4444' : '#3B82F6'}
            height={90}
            maxValOverride={1200}
            valueFormatter={(val) => `${val.toFixed(1)} µs`}
          />
        </div>
      </div>

      {/* Control Panels: Timer Resolution & Game Boost */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timer Resolution Panel */}
        <div className="p-5 rounded-[6px] bg-surface border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-status-info" />
              <h2 className="text-sm font-semibold text-text-primary">
                {t('gamingLatency.timer_resolution_card.title')}
              </h2>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('gamingLatency.timer_resolution_card.description')}
            </p>
          </div>

          <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle flex items-center justify-between text-xs font-mono">
            <span className="text-text-muted">
              {t('gamingLatency.timer_resolution_card.current', { resolution: currentTimerMs })}
            </span>
            <span className="text-text-muted text-[10px]">
              {t('gamingLatency.timer_resolution_card.min_max', { min: '0.500', max: '15.625' })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
            <button
              onClick={handleSet05ms}
              disabled={isGamingLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-[6px] bg-brand text-white text-xs font-medium hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>0.500 ms</span>
            </button>

            <button
              onClick={handleSet10ms}
              disabled={isGamingLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-[6px] bg-surface-subtle border border-border text-text-primary text-xs font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <span>1.000 ms</span>
            </button>

            <button
              onClick={handleSetDefaultTimer}
              disabled={isGamingLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-[6px] bg-surface-subtle border border-border text-text-secondary text-xs font-medium hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <span>15.625 ms</span>
            </button>
          </div>
        </div>

        {/* Game Boost Panel */}
        <div className="p-5 rounded-[6px] bg-surface border border-border flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <h2 className="text-sm font-semibold text-text-primary">
                  {t('gamingLatency.game_boost.title')}
                </h2>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('gamingLatency.game_boost.description')}
              </p>
            </div>

            <span
              className={`px-2.5 py-1 rounded-[4px] text-[10px] font-mono uppercase tracking-wider border shrink-0 ${
                gameBoostStatus?.enabled
                  ? 'bg-status-success/10 text-status-success border-status-success/30'
                  : 'bg-surface-subtle text-text-muted border-border'
              }`}
            >
              {gameBoostStatus?.enabled
                ? t('gamingLatency.game_boost.status_active')
                : t('gamingLatency.game_boost.status_inactive')}
            </span>
          </div>

          {/* Process Picker / PID Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary flex items-center justify-between">
              <span>{t('gamingLatency.game_boost.target_process')}</span>
              <span className="text-[10px] text-text-muted font-mono">{t('gamingLatency.game_boost.auto_detect')}</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 12480 or leave empty for active window"
              value={customPid}
              onChange={(e) => setCustomPid(e.target.value)}
              className="w-full px-3 py-2 rounded-[6px] bg-surface-subtle border border-border text-text-primary text-xs font-mono focus:outline-none focus:border-brand"
            />
          </div>

          {/* Suspended Services List */}
          {gameBoostStatus?.enabled && gameBoostStatus.suspendedServices.length > 0 && (
            <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1.5">
              <div className="text-[11px] font-mono text-text-muted">
                {t('gamingLatency.game_boost.suspended_services', { count: gameBoostStatus.suspendedServices.length })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {gameBoostStatus.suspendedServices.map((svc) => (
                  <span
                    key={svc}
                    className="px-2 py-0.5 rounded-[4px] bg-surface border border-border text-[10px] font-mono text-text-secondary"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Toggle Action */}
          <div className="pt-2">
            <button
              onClick={handleToggleGameBoost}
              disabled={isGamingLoading}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[6px] text-xs font-medium transition-colors ${
                gameBoostStatus?.enabled
                  ? 'bg-status-danger text-white hover:bg-status-danger/90'
                  : 'bg-orange-500 text-white hover:bg-orange-500/90'
              } disabled:opacity-50`}
            >
              {gameBoostStatus?.enabled ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>{t('gamingLatency.game_boost.disable')}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t('gamingLatency.game_boost.enable')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

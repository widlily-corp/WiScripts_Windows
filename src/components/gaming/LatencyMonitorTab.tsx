import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Clock, Flame, Layers, Zap } from 'lucide-react';
import { LatencyMetrics } from '../../types';
import { SparklineAreaGraph } from '../SparklineAreaGraph';

interface LatencyMonitorTabProps {
  latencyMetrics: LatencyMetrics | null;
  latencyHistory: number[];
  latencyStatusColor: string;
  latencyStatusBadge: React.ReactNode;
  currentTimerMs: string;
  isGamingLoading: boolean;
  onSetTimer: (resolution100ns: number) => void;
}

export const LatencyMonitorTab: React.FC<LatencyMonitorTabProps> = ({
  latencyMetrics,
  latencyHistory,
  latencyStatusColor,
  latencyStatusBadge,
  currentTimerMs,
  isGamingLoading,
  onSetTimer,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metrics Cards 4-Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{t('gamingLatency.metrics.current_dpc', 'Current DPC Latency')}</span>
            <Activity className="w-4 h-4 text-text-muted" />
          </div>
          <div className="my-3">
            <span className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${latencyStatusColor}`}>
              {latencyMetrics ? latencyMetrics.currentLatencyUs.toFixed(1) : '—'}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">µs</span>
          </div>
          <div>{latencyStatusBadge}</div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{t('gamingLatency.metrics.max_dpc', 'Max Peak')}</span>
            <Flame className="w-4 h-4 text-status-warning" />
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-text-primary">
              {latencyMetrics ? latencyMetrics.maxLatencyUs.toFixed(1) : '—'}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">µs</span>
          </div>
          <div className="text-[11px] font-mono text-text-muted">
            {t('gamingLatency.metrics.avg_dpc', 'Average')}:{' '}
            <span className="text-text-primary tabular-nums">
              {latencyMetrics ? latencyMetrics.averageLatencyUs.toFixed(1) : '—'} µs
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{t('gamingLatency.metrics.dpc_rate', 'DPC Rate')}</span>
            <Layers className="w-4 h-4 text-brand" />
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-text-primary">
              {latencyMetrics ? latencyMetrics.dpcRatePerSec.toLocaleString() : '—'}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">/s</span>
          </div>
          <div className="text-[11px] font-mono text-text-muted">
            {t('gamingLatency.metrics.isr_rate', 'ISR Rate')}:{' '}
            <span className="text-text-primary tabular-nums">
              {latencyMetrics ? latencyMetrics.isrRatePerSec.toLocaleString() : '—'} /s
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{t('gamingLatency.metrics.timer_resolution', 'Timer Resolution')}</span>
            <Clock className="w-4 h-4 text-status-info" />
          </div>
          <div className="my-3">
            <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-status-info">
              {currentTimerMs}
            </span>
            <span className="ml-1.5 text-xs font-mono text-text-muted">ms</span>
          </div>
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {latencyMetrics ? latencyMetrics.status : t('gamingLatency.status.awaiting', 'Awaiting Telemetry')}
          </div>
        </div>
      </div>

      {/* Latency History Sparkline */}
      <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand" />
            <h2 className="text-xs font-medium text-text-primary uppercase tracking-wider font-mono">
              {t('gamingLatency.sparkline.title', 'Real-Time DPC Latency')}
            </h2>
          </div>
          <span className="text-[11px] font-mono text-text-muted">
            {t('gamingLatency.sparkline.threshold', 'Threshold: < 500 µs optimal')}
          </span>
        </div>

        <div className="pt-2">
          {latencyHistory.length > 0 ? (
            <SparklineAreaGraph
              data={latencyHistory}
              gradientId="gamingLatencyGradient"
              colorHex={
                latencyMetrics && latencyMetrics.currentLatencyUs > 1000
                  ? '#EF4444'
                  : '#3B82F6'
              }
              height={90}
              maxValOverride={1200}
              valueFormatter={(val) => `${val.toFixed(1)} µs`}
            />
          ) : (
            <div className="h-[90px] flex items-center justify-center rounded-[6px] border border-dashed border-border bg-surface-subtle text-xs font-mono text-text-muted">
              {t('gamingLatency.sparkline.awaitingData', 'Collecting DPC latency samples...')}
            </div>
          )}
        </div>
      </div>

      {/* Manual Timer Resolution Controls */}
      <div className="p-5 rounded-xl bg-surface border border-border flex flex-col justify-between space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-status-info" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t('gamingLatency.timer_resolution_card.title', 'Windows Timer Resolution')}
            </h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            {t('gamingLatency.timer_resolution_card.description', 'Lower timer quantum reduces input polling jitter.')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => onSetTimer(5000)}
            disabled={isGamingLoading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{t('gamingLatency.timer_resolution_card.esportsPreset', '0.500 ms (Esports)')}</span>
          </button>

          <button
            type="button"
            onClick={() => onSetTimer(10000)}
            disabled={isGamingLoading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-subtle border border-border text-text-primary text-xs font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <span>1.000 ms</span>
          </button>

          <button
            type="button"
            onClick={() => onSetTimer(156250)}
            disabled={isGamingLoading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-subtle border border-border text-text-muted text-xs font-medium hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <span>{t('gamingLatency.timer_resolution_card.defaultPreset', '15.625 ms (Default)')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

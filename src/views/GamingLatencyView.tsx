import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  Activity,
  RefreshCw,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Gamepad2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ProcessSelectorModal } from '../components/gaming/ProcessSelectorModal';
import { ShaderNukerCard } from '../components/gaming/ShaderNukerCard';
import { SmartDaemonTab } from '../components/gaming/SmartDaemonTab';
import { LatencyMonitorTab } from '../components/gaming/LatencyMonitorTab';

type GamingSubTab = 'daemon' | 'shader_nuker' | 'latency_monitor';

export function GamingLatencyView() {
  const { t } = useTranslation();

  const [activeSubTab, setActiveSubTab] = useState<GamingSubTab>('daemon');
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);

  const latencyMetrics = useAppStore((s) => s.latencyMetrics);
  const daemonStatus = useAppStore((s) => s.daemonStatus);
  const latencyHistory = useAppStore((s) => s.latencyHistory);
  const isGamingLoading = useAppStore((s) => s.isGamingLoading);
  const gamingError = useAppStore((s) => s.gamingError);

  const fetchLatencyMetrics = useAppStore((s) => s.fetchLatencyMetrics);
  const setTimerResolution = useAppStore((s) => s.setTimerResolution);
  const fetchGameBoostStatus = useAppStore((s) => s.fetchGameBoostStatus);
  const fetchDaemonStatus = useAppStore((s) => s.fetchDaemonStatus);
  const setDaemonAutoDetect = useAppStore((s) => s.setDaemonAutoDetect);
  const restoreGameProcess = useAppStore((s) => s.restoreGameProcess);

  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  useEffect(() => {
    fetchLatencyMetrics();
    fetchGameBoostStatus();
    fetchDaemonStatus();
  }, [fetchLatencyMetrics, fetchGameBoostStatus, fetchDaemonStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLatencyMetrics();
      fetchDaemonStatus();
    }, 1500);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLatencyMetrics, fetchDaemonStatus]);

  const currentTimerMs = latencyMetrics
    ? (latencyMetrics.timerResolution100ns / 10000).toFixed(3)
    : '—';

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
          <CheckCircle2 className="w-3 h-3" /> {t('gamingLatency.status.optimal', 'Optimal')}
        </span>
      );
    }
    if (latencyMetrics.currentLatencyUs <= 1000) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase tracking-wider bg-status-warning/10 text-status-warning border border-status-warning/20">
          <AlertTriangle className="w-3 h-3" /> {t('gamingLatency.status.moderate', 'Moderate')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase tracking-wider bg-status-danger/10 text-status-danger border border-status-danger/20">
        <Flame className="w-3 h-3" /> {t('gamingLatency.status.high', 'Jitter')}
      </span>
    );
  }, [latencyMetrics, t]);

  const isBoostActive = daemonStatus?.boostedPid != null;

  return (
    <div
      className="flex-1 p-6 space-y-6 max-w-7xl mx-auto select-none"
      role="region"
      aria-label={t('gamingLatency.title', 'Gaming & Latency')}
    >
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand/10 border border-brand/20 text-brand">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">
              {t('gamingLatency.title', 'Gaming Center & Smart Daemon')}
            </h1>
            <p className="text-xs text-text-muted">
              {t('gamingLatency.subtitle', 'Automatic game optimization, shader cache cleaner, and DPC latency monitor')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
              autoRefresh
                ? 'bg-brand/10 text-brand border-brand/30'
                : 'bg-surface-subtle text-text-muted border-border hover:text-text-primary'
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`}
              style={{ animationDuration: '3s' }}
            />
            <span>
              {autoRefresh
                ? t('gamingLatency.liveTelemetry', '1.5s Live Telemetry')
                : t('gamingLatency.paused', 'Paused')}
            </span>
          </button>
        </div>
      </div>

      {gamingError && (
        <div className="p-3 rounded-lg bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{gamingError}</span>
        </div>
      )}

      {/* Segmented Sub-Tab Navigation Bar */}
      <div className="flex items-center p-1 rounded-xl bg-surface-subtle border border-border text-xs gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('daemon')}
          className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'daemon'
              ? 'bg-surface text-brand shadow-sm font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>{t('gamingLatency.tabs.daemon', 'Smart Game Daemon')}</span>
          {isBoostActive && (
            <span className="w-2 h-2 rounded-full bg-status-success animate-ping ml-1" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('shader_nuker')}
          className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'shader_nuker'
              ? 'bg-surface text-brand shadow-sm font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{t('gamingLatency.tabs.shaderNuker', 'Shader Cache Nuker')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('latency_monitor')}
          className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'latency_monitor'
              ? 'bg-surface text-brand shadow-sm font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>{t('gamingLatency.tabs.latency', 'DPC Latency & Timer')}</span>
        </button>
      </div>

      {activeSubTab === 'daemon' && (
        <SmartDaemonTab
          daemonStatus={daemonStatus}
          isBoostActive={isBoostActive}
          isGamingLoading={isGamingLoading}
          onOpenProcessModal={() => setIsProcessModalOpen(true)}
          onRestoreGameProcess={() => restoreGameProcess()}
          onToggleAutoDetect={(enabled) => setDaemonAutoDetect(enabled)}
        />
      )}

      {activeSubTab === 'shader_nuker' && <ShaderNukerCard />}

      {activeSubTab === 'latency_monitor' && (
        <LatencyMonitorTab
          latencyMetrics={latencyMetrics}
          latencyHistory={latencyHistory}
          latencyStatusColor={latencyStatusColor}
          latencyStatusBadge={latencyStatusBadge}
          currentTimerMs={currentTimerMs}
          isGamingLoading={isGamingLoading}
          onSetTimer={setTimerResolution}
        />
      )}

      <ProcessSelectorModal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
      />
    </div>
  );
}

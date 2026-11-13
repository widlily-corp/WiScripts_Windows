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
  Sparkles,
  Gamepad2,
  Cpu,
  Shield,
  Search,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SparklineAreaGraph } from '../components/SparklineAreaGraph';
import { ProcessSelectorModal } from '../components/gaming/ProcessSelectorModal';
import { ShaderNukerCard } from '../components/gaming/ShaderNukerCard';

type GamingSubTab = 'daemon' | 'shader_nuker' | 'latency_monitor';

export function GamingLatencyView() {
  const { t } = useTranslation();

  const [activeSubTab, setActiveSubTab] = useState<GamingSubTab>('daemon');
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);

  const latencyMetrics = useAppStore((s) => s.latencyMetrics);
  const timerResolution = useAppStore((s) => s.timerResolution);
  const gameBoostStatus = useAppStore((s) => s.gameBoostStatus);
  const daemonStatus = useAppStore((s) => s.daemonStatus);
  const latencyHistory = useAppStore((s) => s.latencyHistory);
  const isGamingLoading = useAppStore((s) => s.isGamingLoading);
  const gamingError = useAppStore((s) => s.gamingError);

  const fetchLatencyMetrics = useAppStore((s) => s.fetchLatencyMetrics);
  const setTimerResolution = useAppStore((s) => s.setTimerResolution);
  const toggleGameBoost = useAppStore((s) => s.toggleGameBoost);
  const fetchGameBoostStatus = useAppStore((s) => s.fetchGameBoostStatus);
  const fetchDaemonStatus = useAppStore((s) => s.fetchDaemonStatus);
  const setDaemonAutoDetect = useAppStore((s) => s.setDaemonAutoDetect);
  const restoreGameProcess = useAppStore((s) => s.restoreGameProcess);

  const [customPid, setCustomPid] = useState<string>('');
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
          <CheckCircle2 className="w-3 h-3" /> {t('gamingLatency.status.optimal', 'Оптимально')}
        </span>
      );
    }
    if (latencyMetrics.currentLatencyUs <= 1000) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase tracking-wider bg-status-warning/10 text-status-warning border border-status-warning/20">
          <AlertTriangle className="w-3 h-3" /> {t('gamingLatency.status.moderate', 'Умеренно')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase tracking-wider bg-status-danger/10 text-status-danger border border-status-danger/20">
        <Flame className="w-3 h-3" /> {t('gamingLatency.status.high', 'Джиттер')}
      </span>
    );
  }, [latencyMetrics, t]);

  const handleSet05ms = () => {
    setTimerResolution(5000);
  };

  const handleSet10ms = () => {
    setTimerResolution(10000);
  };

  const handleSetDefaultTimer = () => {
    setTimerResolution(156250);
  };

  const handleToggleGameBoost = () => {
    const isCurrentlyActive = gameBoostStatus?.enabled ?? false;
    const targetPidNum = customPid ? parseInt(customPid, 10) : null;
    toggleGameBoost(targetPidNum, !isCurrentlyActive);
  };

  const isBoostActive = daemonStatus?.boostedPid != null;

  return (
    <div
      className="flex-1 p-6 space-y-6 max-w-7xl mx-auto select-none"
      role="region"
      aria-label={t('gamingLatency.title', 'Игровой режим и задержка')}
    >
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand/10 border border-brand/20 text-brand">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">
              {t('gamingLatency.title', 'Игровой Центр & Smart Daemon')}
            </h1>
            <p className="text-xs text-text-muted">
              {t(
                'gamingLatency.subtitle',
                'Автоматическая оптимизация процессов игр, очистка кэшей шейдеров и мониторинг DPC-задержек'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
              autoRefresh
                ? 'bg-brand/10 text-brand border-brand/30'
                : 'bg-surface-subtle text-text-muted border-surface-border hover:text-text-primary'
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`}
              style={{ animationDuration: '3s' }}
            />
            <span>{autoRefresh ? '1.5s Live Telemetry' : 'Paused'}</span>
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
      <div className="flex items-center p-1 rounded-xl bg-surface-subtle border border-surface-border text-xs gap-1">
        <button
          onClick={() => setActiveSubTab('daemon')}
          className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'daemon'
              ? 'bg-surface-base text-brand shadow-sm font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>{t('gamingLatency.tabs.daemon', '⚡ Smart Game Daemon & Процессы')}</span>
          {isBoostActive && (
            <span className="w-2 h-2 rounded-full bg-status-success animate-ping ml-1" />
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('shader_nuker')}
          className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'shader_nuker'
              ? 'bg-surface-base text-brand shadow-sm font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{t('gamingLatency.tabs.shaderNuker', '🧹 Shader Cache Nuker (Ликвидатор статтеров)')}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('latency_monitor')}
          className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'latency_monitor'
              ? 'bg-surface-base text-brand shadow-sm font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>{t('gamingLatency.tabs.latency', '📊 DPC Latency & Таймер')}</span>
        </button>
      </div>

      {/* TAB 1: SMART GAME DAEMON & PROCESS OPTIMIZER */}
      {activeSubTab === 'daemon' && (
        <div className="space-y-6 animate-fade-in">
          {/* Active Boost Banner (if active) */}
          {isBoostActive ? (
            <div className="p-5 rounded-xl border border-status-success/30 bg-status-success/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-3 rounded-xl bg-status-success text-white">
                    <Gamepad2 className="w-6 h-6" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-status-success ring-4 ring-surface-base animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold uppercase text-status-success tracking-wider">
                      ● Game Boost Active
                    </span>
                    <span className="text-xs text-text-muted font-mono">
                      PID: {daemonStatus?.boostedPid}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-text-primary mt-0.5">
                    {daemonStatus?.boostedName || 'Game Process'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-base border border-surface-border text-brand">
                      ⚡ 0.500 ms Timer Locked
                    </span>
                    {daemonStatus?.physicalAffinityApplied && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-base border border-surface-border text-status-success">
                        🎯 P-Cores Affinity Pinned
                      </span>
                    )}
                    {daemonStatus?.suspendedServices && daemonStatus.suspendedServices.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-base border border-surface-border text-text-muted">
                        🛡️ {daemonStatus.suspendedServices.length} Services Suspended
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => restoreGameProcess()}
                  disabled={isGamingLoading}
                  className="px-4 py-2.5 bg-status-danger hover:bg-status-danger/90 text-white font-semibold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-status-danger/20 transition-all"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>{t('gamingDaemon.stopBoost', 'Завершить ускорение')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl border border-surface-border bg-surface-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-brand/10 text-brand shrink-0">
                  <Gamepad2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                    {t('gamingDaemon.heroTitle', 'Smart Game Daemon готов к ускорению')}
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-highlight text-text-muted">
                      IDLE
                    </span>
                  </h3>
                  <p className="text-xs text-text-muted mt-1 max-w-xl">
                    {t(
                      'gamingDaemon.heroDesc',
                      'Выберите процесс вручную из списка запущенных окон или включите фоновое автоопределение. При запуске игры WiScripts привяжет потоки к P-ядрам, зафиксирует таймер на 0.5 мс и сбросит Standby RAM.'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setIsProcessModalOpen(true)}
                  className="px-4 py-2.5 bg-brand hover:bg-brand-hover text-brand-text font-semibold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-brand/20 transition-all"
                >
                  <Search className="w-4 h-4" />
                  <span>{t('gamingDaemon.selectProcessBtn', 'Выбрать процесс для ускорения')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Daemon Heuristics & Auto-Detect Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Auto-Detect Toggle */}
            <div className="p-4 rounded-xl border border-surface-border bg-surface-base flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-brand" />
                    {t('gamingDaemon.autoDetectTitle', 'Автодетект 3D-игр')}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={daemonStatus?.autoDetect ?? false}
                      onChange={(e) => setDaemonAutoDetect(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-surface-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
                  </label>
                </div>
                <p className="text-[11px] text-text-muted mt-2">
                  {t(
                    'gamingDaemon.autoDetectDesc',
                    'Мониторинг активного окна каждые 1.5 сек. Автоматический вход в Game Boost при запуске CS2, Valorant, Dota 2, Cyberpunk и других.'
                  )}
                </p>
              </div>
              <div className="pt-1 text-[10px] font-mono text-text-muted">
                Статус: {daemonStatus?.autoDetect ? 'Активен (1.5s scan)' : 'Выключен'}
              </div>
            </div>

            {/* Card 2: PID-Bound Latch Protection */}
            <div className="p-4 rounded-xl border border-surface-border bg-surface-base flex flex-col justify-between space-y-3">
              <div>
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-status-success" />
                  {t('gamingDaemon.altTabTitle', 'PID-Bound Latch (Без Alt-Tab фризов)')}
                </span>
                <p className="text-[11px] text-text-muted mt-2">
                  {t(
                    'gamingDaemon.altTabDesc',
                    'Настройки привязаны к жизни процесса. Переключение по Alt-Tab в браузер или Discord не дергает службы и не создает фреймтайм-спайков.'
                  )}
                </p>
              </div>
              <div className="pt-1 text-[10px] font-mono text-status-success flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Zero Alt-Tab Thrashing
              </div>
            </div>

            {/* Card 3: Watchdog Crash Safety */}
            <div className="p-4 rounded-xl border border-surface-border bg-surface-base flex flex-col justify-between space-y-3">
              <div>
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-status-info" />
                  {t('gamingDaemon.watchdogTitle', 'Watchdog Crash Protection')}
                </span>
                <p className="text-[11px] text-text-muted mt-2">
                  {t(
                    'gamingDaemon.watchdogDesc',
                    'Даже при аварийном завершении игры или Windows сессионный журнал восстановит службы и 15.6 мс таймер на следующем старте.'
                  )}
                </p>
              </div>
              <div className="pt-1 text-[10px] font-mono text-status-info flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Auto-Recovery Armed
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SHADER CACHE NUKER */}
      {activeSubTab === 'shader_nuker' && <ShaderNukerCard />}

      {/* TAB 3: DPC LATENCY & TIMER MONITOR */}
      {activeSubTab === 'latency_monitor' && (
        <div className="space-y-6 animate-fade-in">
          {/* Metrics Cards 4-Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Current Latency */}
            <div className="p-4 rounded-xl bg-surface-base border border-surface-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>{t('gamingLatency.metrics.current_dpc', 'Текущая DPC задержка')}</span>
                <Activity className="w-4 h-4 text-text-muted" />
              </div>
              <div className="my-3">
                <span
                  className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${latencyStatusColor}`}
                >
                  {latencyMetrics ? latencyMetrics.currentLatencyUs.toFixed(1) : '--'}
                </span>
                <span className="ml-1.5 text-xs font-mono text-text-muted">µs</span>
              </div>
              <div>{latencyStatusBadge}</div>
            </div>

            {/* Avg & Max Spike */}
            <div className="p-4 rounded-xl bg-surface-base border border-surface-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>{t('gamingLatency.metrics.max_dpc', 'Максимальный пик')}</span>
                <Flame className="w-4 h-4 text-status-warning" />
              </div>
              <div className="my-3">
                <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-text-primary">
                  {latencyMetrics ? latencyMetrics.maxLatencyUs.toFixed(1) : '--'}
                </span>
                <span className="ml-1.5 text-xs font-mono text-text-muted">µs</span>
              </div>
              <div className="text-[11px] font-mono text-text-muted">
                {t('gamingLatency.metrics.avg_dpc', 'Средняя')}:{' '}
                <span className="text-text-primary tabular-nums">
                  {latencyMetrics ? latencyMetrics.averageLatencyUs.toFixed(1) : '--'} µs
                </span>
              </div>
            </div>

            {/* DPC & ISR Rate */}
            <div className="p-4 rounded-xl bg-surface-base border border-surface-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>{t('gamingLatency.metrics.dpc_rate', 'Частота DPC')}</span>
                <Layers className="w-4 h-4 text-brand" />
              </div>
              <div className="my-3">
                <span className="text-2xl font-mono font-semibold tabular-nums tracking-tight text-text-primary">
                  {latencyMetrics ? latencyMetrics.dpcRatePerSec.toLocaleString() : '--'}
                </span>
                <span className="ml-1.5 text-xs font-mono text-text-muted">/s</span>
              </div>
              <div className="text-[11px] font-mono text-text-muted">
                {t('gamingLatency.metrics.isr_rate', 'Частота ISR')}:{' '}
                <span className="text-text-primary tabular-nums">
                  {latencyMetrics ? latencyMetrics.isrRatePerSec.toLocaleString() : '--'} /s
                </span>
              </div>
            </div>

            {/* Timer Resolution */}
            <div className="p-4 rounded-xl bg-surface-base border border-surface-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>{t('gamingLatency.metrics.timer_resolution', 'Квант таймера')}</span>
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
          <div className="p-5 rounded-xl bg-surface-base border border-surface-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                <h2 className="text-xs font-medium text-text-primary uppercase tracking-wider font-mono">
                  {t('gamingLatency.sparkline.title', 'График DPC Latency в реальном времени')}
                </h2>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {t('gamingLatency.sparkline.threshold', 'Порог: < 500 µs оптимально для киберспорта')}
              </span>
            </div>

            <div className="pt-2">
              <SparklineAreaGraph
                data={latencyHistory.length > 0 ? latencyHistory : [120, 140, 110, 130, 95, 105, 120]}
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
            </div>
          </div>

          {/* Manual Timer Resolution Controls */}
          <div className="p-5 rounded-xl bg-surface-base border border-surface-border flex flex-col justify-between space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-status-info" />
                <h2 className="text-sm font-semibold text-text-primary">
                  {t('gamingLatency.timer_resolution_card.title', 'Ручная настройка таймера Windows')}
                </h2>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                {t(
                  'gamingLatency.timer_resolution_card.description',
                  'По умолчанию Windows использует квант 15.625 мс. Уменьшение до 0.500 мс снижает задержку опроса мыши и клавиатуры в соревновательных играх.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                onClick={handleSet05ms}
                disabled={isGamingLoading}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-brand-text text-xs font-medium hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>0.500 ms (Киберспорт)</span>
              </button>

              <button
                onClick={handleSet10ms}
                disabled={isGamingLoading}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-subtle border border-surface-border text-text-primary text-xs font-medium hover:bg-surface-highlight transition-colors disabled:opacity-50"
              >
                <span>1.000 ms</span>
              </button>

              <button
                onClick={handleSetDefaultTimer}
                disabled={isGamingLoading}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-subtle border border-surface-border text-text-muted text-xs font-medium hover:bg-surface-highlight hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <span>15.625 ms (По умолчанию)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Process Selector Modal */}
      <ProcessSelectorModal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
      />
    </div>
  );
}

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useMetricsPoller } from '../hooks/useMetricsPoller';
import { SparklineAreaGraph } from './SparklineAreaGraph';
import { TemperatureSensorWidget } from './TemperatureSensorWidget';
import {
  ShieldCheck,
  Activity,
  Cpu,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Pause,
  Play,
  RefreshCw,
  Gauge,
  Wifi,
  Disc,
} from 'lucide-react';

function formatBytesPerSec(bytes: number): string {
  if (!bytes || bytes <= 0) return '0.0 B/s';
  if (bytes < 1024) return `${bytes.toFixed(0)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function Dashboard() {
  const { t } = useTranslation();
  useMetricsPoller();

  const systemInfo = useAppStore((s) => s.systemInfo);
  const optimizations = useAppStore((s) => s.optimizations);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const selectRecommendedOptimizations = useAppStore(
    (s) => s.selectRecommendedOptimizations
  );
  const fetchOptimizationsStatus = useAppStore(
    (s) => s.fetchOptimizationsStatus
  );

  const metricsHistory = useAppStore((s) => s.metricsHistory);
  const currentMetrics = useAppStore((s) => s.currentMetrics);
  const isPollingActive = useAppStore((s) => s.isPollingActive);
  const pollingIntervalMs = useAppStore((s) => s.pollingIntervalMs);
  const togglePollingActive = useAppStore((s) => s.togglePollingActive);
  const setPollingIntervalMs = useAppStore((s) => s.setPollingIntervalMs);
  const fetchLatestMetrics = useAppStore((s) => s.fetchLatestMetrics);
  const sensorItems = useAppStore((s) => s.sensorItems);
  const selectedCpuSensorId = useAppStore((s) => s.selectedCpuSensorId);
  const selectedGpuSensorId = useAppStore((s) => s.selectedGpuSensorId);
  const setSelectedCpuSensorId = useAppStore((s) => s.setSelectedCpuSensorId);
  const setSelectedGpuSensorId = useAppStore((s) => s.setSelectedGpuSensorId);

  const cpuSensors = sensorItems.filter((s) => s.sensorType === 'cpu');
  const gpuSensors = sensorItems.filter((s) => s.sensorType === 'gpu');
  const availableCpuSensors = cpuSensors.length > 0 ? cpuSensors : sensorItems;
  const availableGpuSensors = gpuSensors;

  useEffect(() => {
    fetchOptimizationsStatus();
  }, [fetchOptimizationsStatus]);

  const unappliedCount = optimizations.filter((o) => !o.isApplied).length;
  const isFullyOptimized = unappliedCount === 0;

  const cpuSeries = metricsHistory.map((m) => m.cpuUsagePercent);
  const ramSeries = metricsHistory.map((m) => m.memoryUsagePercent);
  const diskReadSeries = metricsHistory.map((m) => m.diskReadBytesPerSec / (1024 * 1024)); // MB/s
  const netRxSeries = metricsHistory.map((m) => m.networkRxBytesPerSec / 1024); // KB/s

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Top Banner */}
      <div
        className={`rounded-[6px] border p-5 flex items-center justify-between shadow-sm ${
          isFullyOptimized
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-border bg-surface-subtle'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isFullyOptimized ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Sparkles className="h-4 w-4 text-brand" />
            )}
            <h3 className="text-sm font-semibold text-text-primary">
              {isFullyOptimized
                ? t('dashboard.systemFullyOptimized')
                : t('dashboard.readyForOpt', { count: unappliedCount }) || t('dashboard.systemOptimizationReadiness')}
            </h3>
          </div>
          <p className="text-xs text-text-secondary">
            {isFullyOptimized
              ? t('dashboard.systemFullyOptimizedDesc', { build: systemInfo?.osBuild || '22631' })
              : t('dashboard.statusDesc', { build: systemInfo?.osBuild || '22631', count: unappliedCount })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFullyOptimized ? (
            <button
              onClick={() => setActiveTab('optimization')}
              className="flex items-center gap-2 rounded-[6px] border border-emerald-500/30 bg-emerald-500/20 px-3.5 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 transition-colors"
            >
              <span>{t('dashboard.viewOptimizations')}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => {
                selectRecommendedOptimizations();
                setActiveTab('optimization');
              }}
              className="flex items-center gap-2 rounded-[6px] bg-brand px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-hover transition-opacity"
            >
              <span>{t('dashboard.applyRecommendedPresets')}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Real-time Telemetry Controls Bar */}
      <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary font-mono">
            {t('dashboard.realTimeTelemetry')}
          </h4>
          <span
            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-[4px] border font-bold ${
              isPollingActive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            {isPollingActive ? t('dashboard.livePolling') : t('dashboard.paused')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono">{t('dashboard.interval')}</span>
            <select
              value={pollingIntervalMs}
              onChange={(e) => setPollingIntervalMs(Number(e.target.value))}
              className="bg-surface-subtle border border-border-subtle rounded-[4px] px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-brand"
            >
              <option value={1000}>{t('dashboard.sec1')}</option>
              <option value={2000}>{t('dashboard.sec2')}</option>
              <option value={5000}>{t('dashboard.sec5')}</option>
              <option value={10000}>{t('dashboard.sec10')}</option>
            </select>
          </div>

          <button
            onClick={togglePollingActive}
            className="flex items-center gap-1.5 rounded-[4px] border border-border-subtle bg-surface-subtle px-2.5 py-1 text-xs font-mono text-text-secondary hover:bg-surface-hover transition-colors"
          >
            {isPollingActive ? (
              <>
                <Pause className="h-3.5 w-3.5 text-amber-400" />
                <span>{t('dashboard.pause')}</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                <span>{t('dashboard.resume')}</span>
              </>
            )}
          </button>

          <button
            onClick={() => fetchLatestMetrics()}
            className="flex items-center gap-1.5 rounded-[4px] border border-border-subtle bg-surface-subtle px-2 py-1 text-xs font-mono text-text-secondary hover:bg-surface-hover transition-colors"
            title={t('dashboard.pollNow')}
          >
            <RefreshCw className="h-3.5 w-3.5 text-brand" />
          </button>
        </div>
      </div>

      {/* Real-time Metric Sparkline Area Graphs (4-Card Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: {t('dashboard.cpuUsage')} */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3 shadow-sm hover:border-border-focus transition-colors">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('dashboard.cpuUsage')}</span>
            <Cpu className="h-4 w-4 text-brand" />
          </div>
          <div className="text-xl font-bold text-text-primary font-mono tabular-nums">
            {currentMetrics?.cpuUsagePercent !== undefined
              ? `${currentMetrics.cpuUsagePercent.toFixed(1)}%`
              : `${systemInfo?.cpuUsagePercent || 0}%`}
          </div>
          <SparklineAreaGraph
            data={cpuSeries}
            colorHex="#3B82F6"
            gradientId="cpu-grad"
            height={50}
            maxValOverride={100}
            valueFormatter={(v) => `${v.toFixed(1)}%`}
          />
        </div>

        {/* Card 2: Memory Load */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3 shadow-sm hover:border-border-focus transition-colors">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('dashboard.ramUsage')}</span>
            <HardDrive className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-text-primary font-mono tabular-nums">
            {currentMetrics
              ? `${(currentMetrics.memoryUsedMb / 1024).toFixed(1)} / ${(
                  currentMetrics.memoryTotalMb / 1024
                ).toFixed(1)} GB`
              : `${Math.round((systemInfo?.memoryUsedMb || 0) / 1024)} GB`}
          </div>
          <SparklineAreaGraph
            data={ramSeries}
            colorHex="#10B981"
            gradientId="ram-grad"
            height={50}
            maxValOverride={100}
            valueFormatter={(v) => `${v.toFixed(1)}%`}
          />
        </div>

        {/* Card 3: Disk I/O Rate */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3 shadow-sm hover:border-border-focus transition-colors">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('dashboard.diskReadRate')}</span>
            <Disc className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-text-primary font-mono tabular-nums">
            {formatBytesPerSec(currentMetrics?.diskReadBytesPerSec || 0)}
          </div>
          <SparklineAreaGraph
            data={diskReadSeries}
            colorHex="#F59E0B"
            gradientId="disk-grad"
            height={50}
            valueFormatter={(v) => `${v.toFixed(1)} MB/s`}
          />
        </div>

        {/* Card 4: {t('dashboard.networkRx')} Rate */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3 shadow-sm hover:border-border-focus transition-colors">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('dashboard.networkRx')}</span>
            <Wifi className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-text-primary font-mono tabular-nums">
            {formatBytesPerSec(currentMetrics?.networkRxBytesPerSec || 0)}
          </div>
          <SparklineAreaGraph
            data={netRxSeries}
            colorHex="#06B6D4"
            gradientId="net-grad"
            height={50}
            valueFormatter={(v) => `${v.toFixed(1)} KB/s`}
          />
        </div>
      </div>

      {/* Hardware Temperatures Sensor Pipeline Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TemperatureSensorWidget
          title={t('dashboard.cpuSensor')}
          tempC={currentMetrics?.cpuTempC ?? null}
          sensorType="cpu"
          thermalStatus={currentMetrics?.cpuThermalStatus || 'unknown'}
          sensorSource={t('dashboard.cpuSensorSource')}
          availableSensors={availableCpuSensors}
          selectedSensorId={selectedCpuSensorId}
          onSelectSensor={setSelectedCpuSensorId}
        />
        <TemperatureSensorWidget
          title={t('dashboard.gpuSensor')}
          tempC={currentMetrics?.gpuTempC ?? null}
          sensorType="gpu"
          thermalStatus={currentMetrics?.gpuThermalStatus || 'unknown'}
          sensorSource={t('dashboard.gpuSensorSource')}
          availableSensors={availableGpuSensors}
          selectedSensorId={selectedGpuSensorId}
          onSelectSensor={setSelectedGpuSensorId}
        />
      </div>

      {/* Core Specs Grid Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('dashboard.operatingSystem')}</span>
            <Activity className="h-4 w-4 text-brand" />
          </div>
          <div className="text-lg font-semibold text-text-primary">
            {systemInfo?.osName || 'Windows 11'}
          </div>
          <div className="text-xs font-mono text-text-secondary">
            {t('dashboard.build', { build: systemInfo?.osBuild || '22631.3880', version: systemInfo?.osVersion || '23H2' })}
          </div>
        </div>

        {(() => {
          const telemetryStatus = systemInfo?.telemetryStatus || 'Active';
          const statusLower = telemetryStatus.toLowerCase();

          let telemetryColor = 'text-amber-400';
          let TelemetryIcon = AlertTriangle;
          let telemetryLabel = t('dashboard.telemetryActive');
          let telemetryDesc = t('dashboard.diagTrackActive');

          if (statusLower === 'disabled') {
            telemetryColor = 'text-emerald-400';
            TelemetryIcon = ShieldCheck;
            telemetryLabel = t('dashboard.telemetryDisabled');
            telemetryDesc = t('dashboard.diagTrackDisabled');
          } else if (statusLower === 'minimized') {
            telemetryColor = 'text-cyan-400';
            TelemetryIcon = ShieldCheck;
            telemetryLabel = t('dashboard.telemetryMinimized');
            telemetryDesc = t('dashboard.diagTrackMinimized');
          } else if (statusLower === 'blocked') {
            telemetryColor = 'text-red-400';
            TelemetryIcon = AlertTriangle;
            telemetryLabel = t('dashboard.telemetryStatus.blocked');
            telemetryDesc = t('dashboard.telemetryStatusDesc.blocked');
          } else if (statusLower === 'unknown') {
            telemetryColor = 'text-text-muted';
            TelemetryIcon = ShieldCheck;
            telemetryLabel = t('dashboard.telemetryUnknown');
            telemetryDesc = t('dashboard.diagTrackUnknown');
          }

          return (
            <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-[11px] font-mono uppercase tracking-wider">{t('dashboard.telemetryService')}</span>
                <TelemetryIcon className={`h-4 w-4 ${telemetryColor}`} />
              </div>
              <div className={`text-lg font-semibold ${telemetryColor}`}>
                {telemetryLabel}
              </div>
              <div className="text-xs text-text-secondary">
                {telemetryDesc}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Optimization Modules List Preview */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              {t('dashboard.coreOptimizationCatalog')}
            </h4>
            <p className="text-xs text-text-secondary">
              {t('dashboard.coreOptimizationDesc')}
            </p>
          </div>
          <button
            onClick={() => setActiveTab('optimization')}
            className="text-xs text-brand hover:underline font-mono"
          >
            {t('dashboard.viewAllRules', { count: optimizations.length })}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1 pb-2">
          {['telemetry', 'bloatware', 'privacy', 'services', 'ui_tweaks', 'disk_cleanup'].map((cat) => {
            const count = optimizations.filter((o) => o.category === cat).length;
            const selCount = optimizations.filter((o) => o.category === cat && o.isSelected).length;
            return (
              <div
                key={cat}
                onClick={() => {
                  useAppStore.getState().setSelectedCategory(cat);
                  setActiveTab('optimization');
                }}
                className="cursor-pointer rounded-[6px] border border-border-subtle bg-surface-subtle p-2.5 hover:bg-surface-hover transition-colors"
              >
                <div className="text-[10px] font-mono uppercase text-text-muted">{t(`dashboard.categories.${cat}`)}</div>
                <div className="text-xs font-semibold text-text-primary font-mono tabular-nums mt-0.5">
                  {selCount} / {count} <span className="text-[10px] text-text-muted font-normal">{t('dashboard.active')}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="divide-y divide-border-subtle max-h-64 overflow-y-auto">
          {optimizations.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className="py-2.5 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3 min-w-0 pr-4">
                {item.isSelected ? (
                  <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-text-muted shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium text-text-primary truncate">{item.title}</div>
                  <div className="text-text-muted text-[11px] truncate">{item.description}</div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-text-muted uppercase px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border-subtle shrink-0">
                {t(`dashboard.categories.${item.category}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

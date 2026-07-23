import React from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  ShieldCheck,
  Activity,
  Cpu,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export function Dashboard() {
  const systemInfo = useAppStore((s) => s.systemInfo);
  const optimizations = useAppStore((s) => s.optimizations);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const selectRecommendedOptimizations = useAppStore(
    (s) => s.selectRecommendedOptimizations
  );

  const selectedCount = optimizations.filter((o) => o.isSelected).length;

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Top Banner */}
      <div className="rounded-[6px] border border-border bg-surface-subtle p-5 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-text-primary">
              System Optimization Readiness
            </h3>
          </div>
          <p className="text-xs text-text-secondary">
            Windows build {systemInfo?.osBuild || '22631'} detected.{' '}
            {selectedCount} optimizations currently queued.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              selectRecommendedOptimizations();
              setActiveTab('optimization');
            }}
            className="flex items-center gap-2 rounded-[6px] bg-brand px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-hover transition-opacity"
          >
            <span>Apply Recommended Presets</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Grid Specs */}
      <div className="grid grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              OS Version
            </span>
            <Activity className="h-4 w-4 text-brand" />
          </div>
          <div className="text-lg font-semibold text-text-primary">
            {systemInfo?.osName || 'Windows 11'}
          </div>
          <div className="text-xs font-mono text-text-secondary">
            Build {systemInfo?.osBuild || '22631.3880'} ({systemInfo?.osVersion || '23H2'})
          </div>
        </div>

        {/* Metric 2 */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              CPU Utilization
            </span>
            <Cpu className="h-4 w-4 text-brand" />
          </div>
          <div className="text-lg font-semibold text-text-primary font-mono tabular-nums">
            {systemInfo?.cpuUsagePercent || 0}%
          </div>
          <div className="w-full bg-surface-active h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-brand h-full transition-all duration-300"
              style={{ width: `${systemInfo?.cpuUsagePercent || 0}%` }}
            />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Memory Usage
            </span>
            <HardDrive className="h-4 w-4 text-brand" />
          </div>
          <div className="text-lg font-semibold text-text-primary font-mono tabular-nums">
            {Math.round((systemInfo?.memoryUsedMb || 0) / 1024)} GB /{' '}
            {Math.round((systemInfo?.memoryTotalMb || 0) / 1024)} GB
          </div>
          <div className="w-full bg-surface-active h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-brand h-full transition-all duration-300"
              style={{
                width: `${
                  ((systemInfo?.memoryUsedMb || 0) /
                    (systemInfo?.memoryTotalMb || 1)) *
                  100
                }%`,
              }}
            />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Telemetry Status
            </span>
            <ShieldCheck className="h-4 w-4 text-status-success" />
          </div>
          <div className="text-lg font-semibold text-status-success">
            {systemInfo?.telemetryStatus || 'Active'}
          </div>
          <div className="text-xs text-text-secondary">
            DiagTrack service active
          </div>
        </div>
      </div>

      {/* Optimization Modules List Preview */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              Core Optimization Catalog Preview
            </h4>
            <p className="text-xs text-text-secondary">
              Telemetry removal, bloatware cleanup, privacy hardening, and service optimization
            </p>
          </div>
          <button
            onClick={() => setActiveTab('optimization')}
            className="text-xs text-brand hover:underline font-mono"
          >
            View All Rules ({optimizations.length}) &rarr;
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
                <div className="text-[10px] font-mono uppercase text-text-muted">{cat}</div>
                <div className="text-xs font-semibold text-text-primary font-mono tabular-nums mt-0.5">
                  {selCount} / {count} <span className="text-[10px] text-text-muted font-normal">active</span>
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
                {item.category}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

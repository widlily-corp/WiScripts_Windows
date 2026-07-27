import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { ExecutionLog } from '../types';
import {
  Terminal,
  Cpu,
  HardDrive,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Search,
  Download,
  Trash2,
  Filter,
  CheckCircle2,
  AlertOctagon,
  Info,
  Command,
  Wrench,
  Wifi,
  FileCheck,
  Loader2,
  Play,
} from 'lucide-react';

export function DiagnosticsView() {
  const { t } = useTranslation();
  const systemInfo = useAppStore((s) => s.systemInfo);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const logs = useAppStore((s) => s.logs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const runDiagnostics = useAppStore((s) => s.runDiagnostics);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'all' | 'info' | 'warn' | 'error' | 'cmd'>('all');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const handleRunDiagnostic = async (action: string) => {
    if (isExecuting || (!isElevated && !dryRunMode)) return;
    setActiveAction(action);
    try {
      await runDiagnostics(action);
    } finally {
      setActiveAction(null);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesLevel = selectedLevel === 'all' || log.level === selectedLevel;
      const matchesSearch =
        !searchQuery.trim() ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.commandExecuted && log.commandExecuted.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesLevel && matchesSearch;
    });
  }, [logs, selectedLevel, searchQuery]);

  const handleExportLogs = () => {
    if (logs.length === 0) return;
    const logText = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${l.commandExecuted ? ` (cmd: ${l.commandExecuted})` : ''}`)
      .join('\n');
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wiscripts-diagnostics-${new Date().toISOString().slice(0, 10)}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyLogs = () => {
    if (logs.length === 0) return;
    const logText = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(logText);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const isButtonDisabled = isExecuting || (!isElevated && !dryRunMode);

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">{t('diagnostics.title')}</h2>
          </div>
          <p className="text-xs text-text-secondary">
            {t('diagnostics.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {copiedLogs ? t('diagnostics.copiedBtn') : t('diagnostics.copyBtn')}
          </button>
          <button
            onClick={handleExportLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('diagnostics.exportBtn')}</span>
          </button>
        </div>
      </div>

      {/* Admin Elevation Warning Banner */}
      <AdminElevationBanner featureName={t('diagnostics.title')} />

      {/* R1 Repair & Diagnostics Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* SFC Card */}
        <div className="rounded-[6px] border border-border bg-surface p-4 flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-brand flex items-center gap-1.5">
                <FileCheck className="h-3.5 w-3.5" /> SFC Scannow
              </span>
              {dryRunMode && (
                <span className="text-[10px] bg-status-successSubtle text-status-success px-1.5 py-0.5 rounded border border-status-success/30 font-mono">
                  {t('diagnostics.dryRun')}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-text-primary">{t('diagnostics.sfcTitle')}</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('diagnostics.sfcDescription')}
            </p>
          </div>
          <button
            onClick={() => handleRunDiagnostic('sfc_scannow')}
            disabled={isButtonDisabled}
            title={!isElevated && !dryRunMode ? t('diagnostics.adminRequiredTitle') : ''}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm"
          >
            {activeAction === 'sfc_scannow' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('diagnostics.sfcRunning')}</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{t('diagnostics.sfcStart')}</span>
              </>
            )}
          </button>
        </div>

        {/* DISM Card */}
        <div className="rounded-[6px] border border-border bg-surface p-4 flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-brand flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" /> DISM RestoreHealth
              </span>
              {dryRunMode && (
                <span className="text-[10px] bg-status-successSubtle text-status-success px-1.5 py-0.5 rounded border border-status-success/30 font-mono">
                  {t('diagnostics.dryRun')}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-text-primary">{t('diagnostics.dismTitle')}</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('diagnostics.dismDescription')}
            </p>
          </div>
          <button
            onClick={() => handleRunDiagnostic('dism_restorehealth')}
            disabled={isButtonDisabled}
            title={!isElevated && !dryRunMode ? t('diagnostics.adminRequiredTitle') : ''}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm"
          >
            {activeAction === 'dism_restorehealth' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('diagnostics.dismRunning')}</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{t('diagnostics.dismStart')}</span>
              </>
            )}
          </button>
        </div>

        {/* Network Reset Card */}
        <div className="rounded-[6px] border border-border bg-surface p-4 flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-brand flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5" /> Network Stack
              </span>
              {dryRunMode && (
                <span className="text-[10px] bg-status-successSubtle text-status-success px-1.5 py-0.5 rounded border border-status-success/30 font-mono">
                  {t('diagnostics.dryRun')}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-text-primary">{t('diagnostics.netTitle')}</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('diagnostics.netDescription')}
            </p>
          </div>
          <button
            onClick={() => handleRunDiagnostic('reset_tcpip')}
            disabled={isButtonDisabled}
            title={!isElevated && !dryRunMode ? t('diagnostics.adminRequiredTitle') : ''}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm"
          >
            {activeAction === 'reset_tcpip' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('diagnostics.netRunning')}</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{t('diagnostics.netStart')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Live CPU */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('diagnostics.cpuLabel')}</span>
            <Cpu className="h-4 w-4 text-brand" />
          </div>
          <div className="text-xl font-semibold text-text-primary font-mono tabular-nums">
            {systemInfo?.cpuUsagePercent ?? 0}%
          </div>
          <div className="w-full bg-surface-active h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-brand h-full transition-all duration-300"
              style={{ width: `${systemInfo?.cpuUsagePercent ?? 0}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Live Memory */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('diagnostics.memLabel')}</span>
            <HardDrive className="h-4 w-4 text-brand" />
          </div>
          <div className="text-xl font-semibold text-text-primary font-mono tabular-nums">
            {Math.round((systemInfo?.memoryUsedMb ?? 0) / 1024)} GB / {Math.round((systemInfo?.memoryTotalMb ?? 0) / 1024)} GB
          </div>
          <div className="w-full bg-surface-active h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-brand h-full transition-all duration-300"
              style={{
                width: `${((systemInfo?.memoryUsedMb ?? 0) / Math.max(systemInfo?.memoryTotalMb ?? 1, 1)) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Metric 3: Admin Elevation Badge */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('diagnostics.privilegeLabel')}</span>
            {systemInfo?.isElevated ? (
              <ShieldCheck className="h-4 w-4 text-status-success" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-status-warning" />
            )}
          </div>
          <div className={`text-base font-semibold ${systemInfo?.isElevated ? 'text-status-success' : 'text-status-warning'}`}>
            {systemInfo?.isElevated ? t('diagnostics.privilegeElevated') : t('diagnostics.privilegeStandard')}
          </div>
          <div className="text-[11px] text-text-muted truncate">
            {systemInfo?.isElevated ? t('diagnostics.privilegeElevatedDesc') : t('diagnostics.privilegeStandardDesc')}
          </div>
        </div>

        {/* Metric 4: DiagTrack Status */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-mono uppercase tracking-wider">{t('diagnostics.telemetryLabel')}</span>
            <Activity className="h-4 w-4 text-status-info" />
          </div>
          <div className="text-base font-semibold text-text-primary">
            {systemInfo?.telemetryStatus || t('diagnostics.telemetryActive')}
          </div>
          <div className="text-[11px] text-text-muted truncate">
            {t('diagnostics.osBuild', { build: systemInfo?.osBuild || '22631.3880' })}
          </div>
        </div>
      </div>

      {/* Log Console Container */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        {/* Console Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" />
              <input
                type="text"
                placeholder={t('diagnostics.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-[6px] border border-border bg-surface-subtle pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-[6px] border border-border-subtle">
              {(['all', 'info', 'warn', 'error', 'cmd'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`px-2.5 py-1 rounded-[4px] text-[10px] font-mono uppercase transition-colors ${
                    selectedLevel === lvl
                      ? 'bg-brand text-white font-medium'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {t(`diagnosticsLog.${lvl}`)}
                </button>
              ))}
            </div>

            <button
              onClick={clearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs text-status-danger hover:bg-status-dangerSubtle transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('diagnostics.clearBtn')}</span>
            </button>
          </div>
        </div>

        {/* Console Stream Output Box */}
        <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-4 font-mono text-xs max-h-[400px] overflow-y-auto space-y-1.5">
          {filteredLogs.length === 0 ? (
            <div className="text-text-muted italic py-6 text-center text-xs">
              {logs.length === 0 ? t('diagnostics.noLogsYet') : t('diagnostics.noLogsMatch')}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="text-text-code leading-relaxed border-b border-border-subtle/40 pb-1 last:border-0">
                <div className="flex items-start gap-2">
                  <span className="text-text-muted text-[11px] tabular-nums shrink-0">
                    [{log.timestamp.slice(11, 19)}]
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.2 rounded shrink-0 uppercase ${
                      log.level === 'error'
                        ? 'bg-status-dangerSubtle text-status-danger border border-status-danger/30'
                        : log.level === 'warn'
                        ? 'bg-status-warningSubtle text-status-warning border border-status-warning/30'
                        : log.level === 'cmd'
                        ? 'bg-brand-subtle text-brand border border-brand/30'
                        : 'bg-status-successSubtle text-status-success border border-status-success/30'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="flex-1 text-text-primary">{log.message}</span>
                </div>
                {log.commandExecuted && (
                  <div className="ml-24 mt-1 text-[11px] text-text-muted bg-surface/60 p-1.5 rounded border border-border-subtle/60">
                    <span className="text-brand">$</span> {log.commandExecuted}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-text-muted pt-1">
          <span>{t('diagnostics.showingEntries', { filtered: filteredLogs.length, total: logs.length })}</span>
          <span>{t('diagnostics.logStreamActive')}</span>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import {
  HardDrive,
  Folder,
  Play,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Info,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';

const PRESET_PATHS = [
  'C:\\DriverBackup',
  'D:\\DriverBackup',
  'C:\\Users\\Public\\Documents\\DriverBackup',
];

export function DriverBackupView() {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportResult, setLastExportResult] = useState<string | null>(null);

  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const driverBackupPath = useAppStore((s) => s.driverBackupPath);
  const setDriverBackupPath = useAppStore((s) => s.setDriverBackupPath);
  const backupDrivers = useAppStore((s) => s.backupDrivers);

  const isButtonDisabled = isExecuting || isExporting || !driverBackupPath.trim() || (!isElevated && !dryRunMode);

  const handleStartBackup = async () => {
    if (!driverBackupPath.trim() || isExecuting || (!isElevated && !dryRunMode)) return;
    setIsExporting(true);
    setLastExportResult(null);
    try {
      const summary = await backupDrivers(driverBackupPath.trim());
      if (summary?.success) {
        setLastExportResult(
          t('driverBackup.successMessage', { path: driverBackupPath.trim(), duration: summary.totalDurationMs })
        );
      } else if (summary) {
        setLastExportResult(t('driverBackup.errorMessage'));
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">{t('driverBackup.title')}</h2>
          </div>
          <p className="text-xs text-text-secondary">
            {t('driverBackup.description')}
          </p>
        </div>

        {dryRunMode && (
          <span className="text-xs bg-status-successSubtle text-status-success px-3 py-1 rounded-[6px] border border-status-success/30 font-mono">
            {t('driverBackup.dryRunActive')}
          </span>
        )}
      </div>

      {/* Admin Elevation Warning Banner */}
      <AdminElevationBanner featureName={t('driverBackup.title')} />

      {/* Main Backup Form Card */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-5">
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider font-mono">
            {t('driverBackup.targetPathLabel')}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <FolderOpen className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                value={driverBackupPath}
                onChange={(e) => setDriverBackupPath(e.target.value)}
                placeholder={t('driverBackup.targetPathPlaceholder')}
                className="w-full rounded-[6px] border border-border bg-surface-subtle pl-9 pr-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
            </div>
            <button
              onClick={handleStartBackup}
              disabled={isButtonDisabled}
              title={!isElevated && !dryRunMode ? t('driverBackup.adminRequiredTitle') : ''}
              className="flex items-center gap-2 px-5 py-2 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('driverBackup.exportingBtn')}</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>{t('driverBackup.startBtn')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Folder Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle">
          <span className="text-[11px] text-text-muted font-mono uppercase">{t('driverBackup.quickPresets')}</span>
          {PRESET_PATHS.map((preset) => (
            <button
              key={preset}
              onClick={() => setDriverBackupPath(preset)}
              className="px-2.5 py-1 rounded-[4px] border border-border-subtle bg-surface-subtle text-[11px] font-mono text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Driver Export Guidance & Details Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: How it Works */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2 text-brand">
            <Info className="h-4 w-4" />
            <h3 className="text-xs font-semibold uppercase tracking-wider font-mono">{t('driverBackup.howItWorksTitle')}</h3>
          </div>
          <ul className="text-xs text-text-secondary space-y-2 list-disc list-inside leading-relaxed">
            <li>
              {t('driverBackup.howItWorksItem1')}
            </li>
            <li>
              {t('driverBackup.howItWorksItem2')}
            </li>
            <li>
              {t('driverBackup.howItWorksItem3')}<code className="font-mono text-brand">pnputil /add-driver *.inf /subdirs /install</code>.
            </li>
          </ul>
        </div>

        {/* Card 2: Elevation & Dry-Run Status */}
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-text-primary">
              {systemInfo?.isElevated ? (
                <ShieldCheck className="h-4 w-4 text-status-success" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-status-warning" />
              )}
              <h3 className="text-xs font-semibold uppercase tracking-wider font-mono">
                {t('driverBackup.statusTitle')}
              </h3>
            </div>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                systemInfo?.isElevated
                  ? 'bg-status-successSubtle text-status-success border-status-success/30'
                  : 'bg-status-warningSubtle text-status-warning border-status-warning/30'
              }`}
            >
              {systemInfo?.isElevated ? t('driverBackup.statusElevated') : t('driverBackup.statusStandard')}
            </span>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed">
            {t('driverBackup.statusDescription')}
          </p>

          {lastExportResult && (
            <div className="p-3 rounded-[6px] bg-status-successSubtle border border-status-success/30 text-status-success text-xs font-mono">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> {t('driverBackup.exportComplete')}
              </div>
              <p className="mt-1 text-[11px] text-text-primary">{lastExportResult}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

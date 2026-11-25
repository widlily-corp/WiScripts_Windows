import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, FolderSearch, RefreshCw, Sparkles, Play, Zap } from 'lucide-react';
import { DiskDriveInfo } from '../../types';
import { formatBytes } from '../../utils';

interface DiskTargetSelectorProps {
  drives: DiskDriveInfo[];
  selectedDrive: string | null;
  customPath: string;
  isScanning: boolean;
  isDrivesLoading: boolean;
  fastMode?: boolean;
  onToggleFastMode?: (fast: boolean) => void;
  onSelectDrive: (mountPoint: string) => void;
  onChangeCustomPath: (path: string) => void;
  onStartScan: (targetPath?: string) => void;
  onRefreshDrives: () => void;
}

export const DiskTargetSelector: React.FC<DiskTargetSelectorProps> = ({
  drives,
  selectedDrive,
  customPath,
  isScanning,
  isDrivesLoading,
  fastMode = true,
  onToggleFastMode,
  onSelectDrive,
  onChangeCustomPath,
  onStartScan,
  onRefreshDrives,
}) => {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [resolvedDirs, setResolvedDirs] = useState<{
    home?: string;
    downloads?: string;
    appData?: string;
  }>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const pathApi = await import('@tauri-apps/api/path');
        const [home, downloads, localData] = await Promise.all([
          pathApi.homeDir().catch(() => undefined),
          pathApi.downloadDir().catch(() => undefined),
          pathApi.localDataDir().catch(() => undefined),
        ]);
        if (!active) return;
        const clean = (p?: string) => (p ? p.replace(/[\\/]+$/, '') : undefined);
        const homeClean = clean(home);
        const appDataParent = clean(localData)?.replace(/[\\/]Local$/i, '') || (homeClean ? `${homeClean}\\AppData` : undefined);
        setResolvedDirs({
          home: homeClean,
          downloads: clean(downloads),
          appData: appDataParent,
        });
      } catch {
        // Non-Tauri environment fallback uses system-level directories below
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const presetPaths = useMemo(() => {
    const items = [
      { label: t('diskAnalyzer.presetUsers', 'User Profile'), path: resolvedDirs.home || 'C:\\Users' },
    ];
    if (resolvedDirs.downloads) {
      items.push({ label: t('diskAnalyzer.presetDownloads', 'Downloads'), path: resolvedDirs.downloads });
    }
    if (resolvedDirs.appData) {
      items.push({ label: 'AppData', path: resolvedDirs.appData });
    }
    items.push(
      { label: t('diskAnalyzer.presetTemp', 'Temp Cache'), path: 'C:\\Windows\\Temp' },
      { label: 'Program Files', path: 'C:\\Program Files' }
    );
    return items;
  }, [resolvedDirs, t]);

  const handlePresetClick = (presetPath: string, label: string) => {
    setActivePreset(label);
    onChangeCustomPath(presetPath);
  };

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-brand" />
            {t('diskAnalyzer.targetDrives', 'Select Target Drive')}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {t('diskAnalyzer.selectDriveToScan', 'Select a storage drive or choose a custom folder to scan.')}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshDrives}
          disabled={isDrivesLoading || isScanning}
          className="px-2.5 py-1.5 rounded-[6px] text-xs font-medium text-text-muted hover:text-text-primary bg-surface-subtle hover:bg-surface-hover border border-border flex items-center gap-1.5 transition-colors disabled:opacity-50"
          title={t('diskAnalyzer.refreshDrivesTooltip', 'Refresh logical drives list')}
        >
          <RefreshCw className={'w-3.5 h-3.5 ' + (isDrivesLoading ? 'animate-spin' : '')} />
          {t('common.refresh', 'Refresh')}
        </button>
      </div>

      {/* Logical Drives Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {drives.map((drive) => {
          const isSelected = selectedDrive === drive.mountPoint && !customPath;
          const usagePct = drive.usagePercentage || (drive.totalBytes > 0 ? (drive.usedBytes / drive.totalBytes) * 100 : 0);

          let usageColor = 'bg-brand';
          if (usagePct > 90) usageColor = 'bg-status-danger';
          else if (usagePct > 75) usageColor = 'bg-status-warning';

          return (
            <div
              key={drive.mountPoint}
              className={'relative p-3.5 rounded-[6px] border transition-all ' +
                (isSelected
                  ? 'bg-surface-active border-brand shadow-sm shadow-brand/10'
                  : 'bg-surface-subtle border-border hover:border-border-focus hover:bg-surface-hover')}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onChangeCustomPath('');
                    onSelectDrive(drive.mountPoint);
                  }}
                  className="flex items-center gap-2.5 text-left flex-1 min-w-0 focus:outline-none"
                >
                  <div className={'p-2 rounded-[6px] shrink-0 ' + (isSelected ? 'bg-brand/20 text-brand' : 'bg-surface text-text-muted')}>
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-text-primary truncate">{drive.name || drive.mountPoint}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
                        {drive.mountPoint}
                      </span>
                      {drive.isSystemDrive && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand/15 text-brand border border-brand/30">
                          OS
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted font-mono mt-0.5">
                      {drive.fileSystem} · {formatBytes(drive.availableBytes)} free
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onChangeCustomPath('');
                    onSelectDrive(drive.mountPoint);
                    onStartScan(drive.mountPoint);
                  }}
                  disabled={isScanning}
                  aria-label={`Scan ${drive.mountPoint}`}
                  className="p-1.5 rounded-[4px] bg-brand/10 hover:bg-brand text-brand hover:text-white transition-colors disabled:opacity-50 shrink-0"
                  title={'Scan ' + drive.mountPoint}
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Capacity Bar */}
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-text-muted">
                  <span>{formatBytes(drive.usedBytes)} used</span>
                  <span>{usagePct.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden border border-border-subtle">
                  <div
                    className={'h-full rounded-full transition-all duration-300 ' + usageColor}
                    style={{ width: Math.min(100, Math.max(0, usagePct)) + '%' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Path Section */}
      <div className="pt-2 border-t border-border-subtle space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
            <FolderSearch className="w-3.5 h-3.5 text-brand" />
            {t('diskAnalyzer.customDirectory', 'Custom Folder Path')}
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-status-warning" />
              {t('diskAnalyzer.presets', 'Presets')}:
            </span>
            {presetPaths.map((preset) => (
              <button
                type="button"
                key={preset.label}
                onClick={() => handlePresetClick(preset.path, preset.label)}
                disabled={isScanning}
                className={'px-2 py-0.5 rounded-[4px] text-[11px] font-medium border transition-colors ' +
                  (activePreset === preset.label && customPath === preset.path
                    ? 'bg-brand/20 border-brand text-brand'
                    : 'bg-surface-subtle border-border text-text-muted hover:text-text-primary hover:bg-surface-hover')}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Turbo Drill-Down Switch */}
        {onToggleFastMode && (
          <button
            type="button"
            onClick={() => !isScanning && onToggleFastMode(!fastMode)}
            disabled={isScanning}
            className={`w-full text-left p-3 rounded-[6px] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all select-none ${
              fastMode
                ? 'bg-status-success/10 border-status-success/40 hover:bg-status-success/15'
                : 'bg-surface-subtle border-border hover:bg-surface-hover hover:border-border-focus'
            } ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            role="switch"
            aria-checked={fastMode}
            title={t('diskAnalyzer.turboDrilldownTooltip', 'Drill-Down Engine: skips system files and locates large folders')}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-[6px] transition-colors ${
                  fastMode ? 'bg-status-success/20 text-status-success' : 'bg-surface text-text-muted'
                }`}
              >
                <Zap className={`w-4 h-4 ${fastMode ? 'fill-current' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-primary">
                    {fastMode
                      ? t('diskAnalyzer.turboDrilldownOn', 'ON: Turbo Drill-Down Mode (Fast Scan)')
                      : t('diskAnalyzer.turboDrilldownOff', 'OFF: Full Deep Scan (All Files)')}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      fastMode
                        ? 'bg-status-success text-white'
                        : 'bg-surface border border-border text-text-muted'
                    }`}
                  >
                    {fastMode
                      ? t('diskAnalyzer.turboDrilldownBadgeOn', 'ON')
                      : t('diskAnalyzer.turboDrilldownBadgeOff', 'OFF')}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {fastMode
                    ? t('diskAnalyzer.turboDrilldownDescOn', 'Skips protected OS folders for fast results.')
                    : t('diskAnalyzer.turboDrilldownDescOff', 'Scans every file on the target path.')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
              <div
                className={`relative inline-flex h-5 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  fastMode ? 'bg-status-success' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    fastMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
          </button>
        )}

        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={customPath}
              onChange={(e) => {
                setActivePreset(null);
                onChangeCustomPath(e.target.value);
              }}
              placeholder="C:\Users\... or D:\Projects"
              disabled={isScanning}
              className="w-full bg-surface-subtle border border-border rounded-[6px] px-3 py-2 text-xs font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={() => onStartScan(customPath || selectedDrive || undefined)}
            disabled={isScanning}
            className="px-5 py-2 rounded-[6px] bg-brand hover:bg-brand-hover text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {t('diskAnalyzer.scanning', 'Scanning Filesystem...')}
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                {customPath ? t('diskAnalyzer.scanCustom', 'Scan Custom Path') : t('diskAnalyzer.scanDrive', 'Scan Selected Drive')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

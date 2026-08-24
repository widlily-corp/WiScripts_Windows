import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, FolderSearch, RefreshCw, Sparkles, Folder, Play } from 'lucide-react';
import { DiskDriveInfo } from '../../types';
import { formatBytes } from '../../utils';

interface DiskTargetSelectorProps {
  drives: DiskDriveInfo[];
  selectedDrive: string | null;
  customPath: string;
  isScanning: boolean;
  isDrivesLoading: boolean;
  onSelectDrive: (mountPoint: string) => void;
  onChangeCustomPath: (path: string) => void;
  onStartScan: (targetPath?: string) => void;
  onRefreshDrives: () => void;
}

const PRESET_PATHS = [
  { label: 'User Profile', path: 'C:\\Users' },
  { label: 'Downloads', path: 'C:\\Users\\Default\\Downloads' },
  { label: 'AppData', path: 'C:\\Users\\Default\\AppData' },
  { label: 'Temp Cache', path: 'C:\\Windows\\Temp' },
  { label: 'Program Files', path: 'C:\\Program Files' },
];

export const DiskTargetSelector: React.FC<DiskTargetSelectorProps> = ({
  drives,
  selectedDrive,
  customPath,
  isScanning,
  isDrivesLoading,
  onSelectDrive,
  onChangeCustomPath,
  onStartScan,
  onRefreshDrives,
}) => {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const handlePresetClick = (presetPath: string, label: string) => {
    setActivePreset(label);
    onChangeCustomPath(presetPath);
  };

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-brand" />
            {t('diskAnalyzer.targetDrives', 'Select Target Drive')}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {t('diskAnalyzer.selectDriveToScan', 'Select a storage drive or choose a custom folder to scan.')}
          </p>
        </div>
        <button
          onClick={onRefreshDrives}
          disabled={isDrivesLoading || isScanning}
          className="px-2.5 py-1.5 rounded-[6px] text-xs font-medium text-text-muted hover:text-text bg-surface-subtle hover:bg-surface-hover border border-border flex items-center gap-1.5 transition-colors disabled:opacity-50"
          title="Refresh logical drives list"
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
              onClick={() => {
                onChangeCustomPath('');
                onSelectDrive(drive.mountPoint);
              }}
              className={'relative p-3.5 rounded-[6px] border cursor-pointer transition-all ' +
                (isSelected
                  ? 'bg-surface-active border-brand shadow-sm shadow-brand/10'
                  : 'bg-surface-subtle border-border hover:border-border-focus hover:bg-surface-hover')}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={'p-2 rounded-[6px] ' + (isSelected ? 'bg-brand/20 text-brand' : 'bg-surface text-text-muted')}>
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-text">{drive.name || drive.mountPoint}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
                        {drive.mountPoint}
                      </span>
                      {drive.isSystemDrive && (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-brand/15 text-brand border border-brand/30">
                          OS
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted font-mono mt-0.5">
                      {drive.fileSystem} · {formatBytes(drive.availableBytes)} free
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeCustomPath('');
                    onSelectDrive(drive.mountPoint);
                    onStartScan(drive.mountPoint);
                  }}
                  disabled={isScanning}
                  className="p-1.5 rounded-[4px] bg-brand/10 hover:bg-brand text-brand hover:text-white transition-colors disabled:opacity-50"
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
          <label className="text-xs font-semibold text-text flex items-center gap-1.5">
            <FolderSearch className="w-3.5 h-3.5 text-brand" />
            {t('diskAnalyzer.customDirectory', 'Custom Folder Path')}
          </label>
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-status-warning" />
              {t('diskAnalyzer.presets', 'Presets')}:
            </span>
            {PRESET_PATHS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePresetClick(preset.path, preset.label)}
                disabled={isScanning}
                className={'px-2 py-0.5 rounded-[4px] text-[11px] font-medium border transition-colors ' +
                  (activePreset === preset.label && customPath === preset.path
                    ? 'bg-brand/20 border-brand text-brand'
                    : 'bg-surface-subtle border-border text-text-muted hover:text-text hover:bg-surface-hover')}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

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
              className="w-full bg-surface-subtle border border-border rounded-[6px] px-3 py-2 text-xs font-mono text-text placeholder-text-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            />
          </div>

          <button
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

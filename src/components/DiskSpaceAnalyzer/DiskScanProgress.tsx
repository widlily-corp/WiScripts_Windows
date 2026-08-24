import React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, XCircle, HardDrive, Files, FolderTree, Clock, Gauge } from 'lucide-react';
import { DiskScanProgressPayload } from '../../types';
import { formatBytes } from '../../utils';

interface DiskScanProgressProps {
  progress: DiskScanProgressPayload | null;
  onCancel: () => void;
}

export const DiskScanProgress: React.FC<DiskScanProgressProps> = ({ progress, onCancel }) => {
  const { t } = useTranslation();

  const filesCount = progress?.filesScanned || 0;
  const dirsCount = progress?.directoriesScanned || 0;
  const bytesScanned = progress?.totalBytesScanned || progress?.bytesProcessed || 0;
  const elapsedMs = progress?.elapsedMs || 0;
  const elapsedSec = elapsedMs / 1000;
  const itemsPerSec = progress?.itemsPerSecond || (elapsedSec > 0 ? Math.round((filesCount + dirsCount) / elapsedSec) : 0);

  return (
    <div className="bg-surface border border-brand/40 rounded-[8px] p-4 shadow-sm relative overflow-hidden animate-pulse-subtle">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left: Indicator & Path */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2.5 rounded-[8px] bg-brand/15 text-brand border border-brand/30 flex-shrink-0 animate-spin">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand">
                {t('diskAnalyzer.scanning', 'Scanning Filesystem...')}
              </span>
              <span className="text-[11px] font-mono text-text-muted">
                {elapsedSec.toFixed(1)}s elapsed
              </span>
            </div>
            <p className="text-xs font-mono text-text-muted truncate mt-0.5" title={progress?.currentPath || ''}>
              {progress?.currentPath ? progress.currentPath : 'Traversing directory trees...'}
            </p>
          </div>
        </div>

        {/* Middle: Live Telemetry Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-2.5 py-1 rounded-[6px] bg-surface-subtle border border-border flex items-center gap-1.5 text-xs font-mono">
            <Files className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-text font-medium">{filesCount.toLocaleString()}</span>
            <span className="text-text-muted text-[10px]">files</span>
          </div>

          <div className="px-2.5 py-1 rounded-[6px] bg-surface-subtle border border-border flex items-center gap-1.5 text-xs font-mono">
            <FolderTree className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-text font-medium">{dirsCount.toLocaleString()}</span>
            <span className="text-text-muted text-[10px]">dirs</span>
          </div>

          <div className="px-2.5 py-1 rounded-[6px] bg-surface-subtle border border-border flex items-center gap-1.5 text-xs font-mono">
            <HardDrive className="w-3.5 h-3.5 text-brand" />
            <span className="text-text font-medium">{formatBytes(bytesScanned)}</span>
          </div>

          {itemsPerSec > 0 && (
            <div className="px-2.5 py-1 rounded-[6px] bg-surface-subtle border border-border flex items-center gap-1.5 text-xs font-mono">
              <Gauge className="w-3.5 h-3.5 text-status-warning" />
              <span className="text-text font-medium">{itemsPerSec.toLocaleString()}</span>
              <span className="text-text-muted text-[10px]">items/s</span>
            </div>
          )}
        </div>

        {/* Right: Cancel Button */}
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-[6px] bg-status-danger/10 hover:bg-status-danger text-status-danger hover:text-white border border-status-danger/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          {t('diskAnalyzer.cancelScan', 'Cancel Scan')}
        </button>
      </div>
    </div>
  );
};

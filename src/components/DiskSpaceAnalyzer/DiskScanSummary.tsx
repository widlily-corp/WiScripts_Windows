import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Files, FolderTree, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { DiskScanResult } from '../../types';
import { formatBytes, formatTabularBytes } from '../../utils';

interface DiskScanSummaryProps {
  result: DiskScanResult;
}

export const DiskScanSummary: React.FC<DiskScanSummaryProps> = ({ result }) => {
  const { t } = useTranslation();

  const totalFolders = result.totalDirs || result.totalFolders || 0;
  const durationSec = (result.scanDurationMs / 1000).toFixed(2);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Metric 1: Total Scanned Size */}
      <div className="bg-surface border border-border rounded-[8px] p-3.5 shadow-sm space-y-1">
        <div className="flex items-center justify-between text-text-muted">
          <span className="text-xs font-medium">{t('diskAnalyzer.totalScanned', 'Total Scanned Size')}</span>
          <HardDrive className="w-4 h-4 text-brand" />
        </div>
        <div className="text-lg font-bold text-text font-mono">
          {formatBytes(result.totalBytes)}
        </div>
        <div className="text-[10px] text-text-muted font-mono truncate">
          {formatTabularBytes(result.totalBytes)}
        </div>
      </div>

      {/* Metric 2: Files Analyzed */}
      <div className="bg-surface border border-border rounded-[8px] p-3.5 shadow-sm space-y-1">
        <div className="flex items-center justify-between text-text-muted">
          <span className="text-xs font-medium">{t('diskAnalyzer.totalFiles', 'Files Analyzed')}</span>
          <Files className="w-4 h-4 text-brand" />
        </div>
        <div className="text-lg font-bold text-text font-mono">
          {result.totalFiles.toLocaleString()}
        </div>
        <div className="text-[10px] text-text-muted">
          Across all scanned folders
        </div>
      </div>

      {/* Metric 3: Directories Analyzed */}
      <div className="bg-surface border border-border rounded-[8px] p-3.5 shadow-sm space-y-1">
        <div className="flex items-center justify-between text-text-muted">
          <span className="text-xs font-medium">{t('diskAnalyzer.totalDirs', 'Directories Analyzed')}</span>
          <FolderTree className="w-4 h-4 text-brand" />
        </div>
        <div className="text-lg font-bold text-text font-mono">
          {totalFolders.toLocaleString()}
        </div>
        <div className="text-[10px] text-text-muted">
          Hierarchical directory nodes
        </div>
      </div>

      {/* Metric 4: Scan Speed & Status */}
      <div className="bg-surface border border-border rounded-[8px] p-3.5 shadow-sm space-y-1">
        <div className="flex items-center justify-between text-text-muted">
          <span className="text-xs font-medium">{t('diskAnalyzer.elapsedTime', 'Scan Duration')}</span>
          {result.isCancelled || result.isPartial ? (
            <AlertCircle className="w-4 h-4 text-status-warning" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-status-success" />
          )}
        </div>
        <div className="text-lg font-bold text-text font-mono">
          {durationSec}s
        </div>
        <div className="text-[10px] text-text-muted flex items-center gap-1">
          {result.isCancelled || result.isPartial ? (
            <span className="text-status-warning">Partial scan (cancelled)</span>
          ) : (
            <span className="text-status-success">100% complete</span>
          )}
        </div>
      </div>
    </div>
  );
};

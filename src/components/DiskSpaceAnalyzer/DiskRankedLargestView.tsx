import React from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, File, ExternalLink, Copy, Trash2, CornerDownRight, Lock } from 'lucide-react';
import { RankedFsItem, FsTreeNode } from '../../types';
import { formatBytes, formatTabularBytes, isSystemProtectedPath } from '../../utils';

interface DiskRankedLargestViewProps {
  type: 'folders' | 'files';
  items: RankedFsItem[];
  totalScannedBytes: number;
  onNavigate: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
  onCopyPath: (path: string) => void;
  onOpenDeleteModal: (item: RankedFsItem) => void;
}

export const DiskRankedLargestView: React.FC<DiskRankedLargestViewProps> = ({
  type,
  items,
  totalScannedBytes,
  onNavigate,
  onOpenInExplorer,
  onCopyPath,
  onOpenDeleteModal,
}) => {
  const { t } = useTranslation();

  if (!items || items.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-[8px] p-12 text-center text-text-muted">
        {type === 'folders'
          ? t('diskAnalyzer.noFoldersFound', 'No largest folders recorded.')
          : t('diskAnalyzer.noFilesFound', 'No largest files recorded.')}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-[8px] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-subtle border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider">
        <div className="flex items-center gap-3">
          <span className="w-8 text-center">{t('diskAnalyzer.rank', 'Rank')}</span>
          <span>{t('diskAnalyzer.columnName', 'Name & Path')}</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="w-32 text-right hidden sm:block">{t('diskAnalyzer.columnUsage', 'Share of Total')}</span>
          <span className="w-24 text-right">{t('diskAnalyzer.columnSize', 'Size')}</span>
          <span className="w-24 text-right pr-2">{t('diskAnalyzer.columnActions', 'Actions')}</span>
        </div>
      </div>

      {/* Items List */}
      <div className="divide-y divide-border-subtle max-h-[600px] overflow-y-auto">
        {items.map((item, idx) => {
          const rank = item.rank || idx + 1;
          const isDir = item.isDir || item.isDirectory || type === 'folders';
          const isProtected = item.isSystemProtected || isSystemProtectedPath(item.path);
          const sizeBytes = item.sizeBytes || item.totalBytes || 0;
          const sharePct = totalScannedBytes > 0 ? (sizeBytes / totalScannedBytes) * 100 : item.percentageOfTotal || 0;

          let rankBadge = 'bg-surface text-text-muted border-border';
          if (rank === 1) rankBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold';
          else if (rank === 2) rankBadge = 'bg-slate-300/20 text-slate-300 border-slate-400/40 font-bold';
          else if (rank === 3) rankBadge = 'bg-amber-700/20 text-amber-600 border-amber-700/40 font-bold';

          return (
            <div
              key={item.path}
              className="group flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors text-xs"
            >
              {/* Left: Rank, Icon, Path info */}
              <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                <span className={'w-7 h-6 rounded flex items-center justify-center text-xs font-mono border ' + rankBadge}>
                  #{rank}
                </span>

                <div className="flex-shrink-0">
                  {isProtected ? (
                    <Lock className="w-4 h-4 text-status-danger" />
                  ) : isDir ? (
                    <Folder className="w-4 h-4 text-brand" />
                  ) : (
                    <File className="w-4 h-4 text-text-muted" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      onClick={() => isDir && onNavigate(item.path)}
                      className={'font-semibold text-text truncate ' + (isDir ? 'cursor-pointer hover:text-brand hover:underline' : '')}
                      title={item.path}
                    >
                      {item.name}
                    </span>
                    {isProtected && (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-status-danger/15 text-status-danger border border-status-danger/30 flex-shrink-0">
                        {t('diskAnalyzer.systemProtected', 'Protected')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-text-muted truncate mt-0.5" title={item.path}>
                    {item.path}
                  </p>
                </div>
              </div>

              {/* Middle: Usage Bar & Size */}
              <div className="flex items-center gap-6 flex-shrink-0">
                {/* Proportional Bar */}
                <div className="w-32 hidden sm:flex flex-col gap-1 items-end">
                  <div className="w-full h-1.5 bg-surface-subtle rounded-full overflow-hidden border border-border-subtle">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-300"
                      style={{ width: Math.min(100, Math.max(0, sharePct)) + '%' }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-text-muted">
                    {sharePct.toFixed(1)}% of total
                  </span>
                </div>

                {/* Size */}
                <div className="text-right w-24">
                  <div className="font-bold font-mono text-text">
                    {formatBytes(sizeBytes)}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted truncate">
                    {formatTabularBytes(sizeBytes)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 w-24 justify-end opacity-80 group-hover:opacity-100 transition-opacity">
                  {isDir && (
                    <button
                      onClick={() => onNavigate(item.path)}
                      className="p-1 rounded text-text-muted hover:text-brand hover:bg-surface transition-colors"
                      title={t('diskAnalyzer.drillDown', 'Drill Down into Folder')}
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => onOpenInExplorer(item.path)}
                    className="p-1 rounded text-text-muted hover:text-brand hover:bg-surface transition-colors"
                    title={t('diskAnalyzer.openInExplorer', 'Open in File Explorer')}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onCopyPath(item.path)}
                    className="p-1 rounded text-text-muted hover:text-brand hover:bg-surface transition-colors"
                    title={t('diskAnalyzer.copyPath', 'Copy Path')}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onOpenDeleteModal(item)}
                    disabled={isProtected}
                    className={'p-1 rounded transition-colors ' +
                      (isProtected
                        ? 'text-text-muted/30 cursor-not-allowed'
                        : 'text-text-muted hover:text-status-danger hover:bg-status-danger/10')}
                    title={isProtected ? t('diskAnalyzer.systemProtectedTooltip', 'Protected Directory') : t('diskAnalyzer.delete', 'Delete Item')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

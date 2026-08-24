import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  Lock,
  ExternalLink,
  Copy,
  Trash2,
  CornerDownRight,
} from 'lucide-react';
import { FsTreeNode } from '../../types';
import { formatBytes, formatTabularBytes, isSystemProtectedPath } from '../../utils';

interface DiskTreeNodeRowProps {
  node: FsTreeNode;
  depth: number;
  isExpanded: boolean;
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
  onCopyPath: (path: string) => void;
  onOpenDeleteModal: (node: FsTreeNode) => void;
  searchQuery?: string;
}

export const DiskTreeNodeRow: React.FC<DiskTreeNodeRowProps> = ({
  node,
  depth,
  isExpanded,
  onToggle,
  onNavigate,
  onOpenInExplorer,
  onCopyPath,
  onOpenDeleteModal,
  searchQuery,
}) => {
  const { t } = useTranslation();
  const isDirectory = node.isDir || node.isDirectory || (node.children && node.children.length > 0);
  const isProtected = node.isSystemProtected || isSystemProtectedPath(node.path);

  const percentage = node.percentageOfParent !== undefined ? node.percentageOfParent : (node.percentageOfRoot || 0);

  let barColor = 'bg-brand';
  if (percentage > 50) barColor = 'bg-status-danger';
  else if (percentage > 20) barColor = 'bg-status-warning';
  else if (percentage < 5) barColor = 'bg-slate-600';

  const ext = node.extension || (node.name.includes('.') ? node.name.split('.').pop() : '');

  return (
    <div
      className="group flex items-center justify-between px-3 py-2 hover:bg-surface-hover border-b border-border-subtle text-xs transition-colors font-sans"
      style={{ paddingLeft: (depth * 20 + 12) + 'px' }}
    >
      {/* Left: Expand, Icon, Name, Protected Badge */}
      <div className="flex items-center gap-2 min-w-0 flex-1 pr-4">
        {isDirectory ? (
          <button
            onClick={() => onToggle(node.path)}
            className="p-0.5 rounded hover:bg-surface text-text-muted hover:text-text transition-colors flex-shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}

        {/* Icon */}
        <div className="flex-shrink-0" title={isProtected ? t('diskAnalyzer.systemProtectedTooltip', 'Critical Windows OS directory') : undefined}>
          {isProtected ? (
            <Lock className="w-4 h-4 text-status-danger" />
          ) : isDirectory ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-brand" />
            ) : (
              <Folder className="w-4 h-4 text-brand" />
            )
          ) : (
            <File className="w-4 h-4 text-text-muted" />
          )}
        </div>

        {/* Name */}
        <div className="min-w-0 flex items-center gap-1.5 truncate">
          <span
            onClick={() => isDirectory && onNavigate(node.path)}
            className={'font-medium truncate ' + (isDirectory ? 'cursor-pointer hover:text-brand hover:underline text-text' : 'text-text')}
            title={node.path}
          >
            {node.name}
          </span>

          {ext && !isDirectory && (
            <span className="text-[10px] font-mono uppercase px-1 py-0.2 rounded bg-surface-subtle border border-border text-text-muted flex-shrink-0">
              .{ext}
            </span>
          )}

          {isProtected && (
            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-status-danger/15 text-status-danger border border-status-danger/30 flex-shrink-0">
              {t('diskAnalyzer.systemProtected', 'Protected')}
            </span>
          )}
        </div>
      </div>

      {/* Middle: Proportional Bar & Size */}
      <div className="flex items-center gap-4 flex-shrink-0 w-64 md:w-80 justify-end">
        {/* Proportional Bar */}
        <div className="w-28 hidden sm:flex flex-col gap-1">
          <div className="w-full h-1.5 bg-surface-subtle rounded-full overflow-hidden border border-border-subtle">
            <div
              className={'h-full rounded-full transition-all duration-300 ' + barColor}
              style={{ width: Math.min(100, Math.max(0, percentage)) + '%' }}
            />
          </div>
          <div className="text-[10px] font-mono text-text-muted text-right">
            {percentage.toFixed(1)}%
          </div>
        </div>

        {/* Size */}
        <div className="text-right w-24">
          <div className="font-bold font-mono text-text">
            {formatBytes(node.sizeBytes)}
          </div>
          <div className="text-[10px] font-mono text-text-muted truncate">
            {formatTabularBytes(node.sizeBytes)}
          </div>
        </div>

        {/* Item Counts (Directories only) */}
        <div className="text-[11px] font-mono text-text-muted w-20 text-right hidden lg:block">
          {isDirectory ? (
            <span>{(node.fileCount || 0).toLocaleString()} files</span>
          ) : (
            <span>-</span>
          )}
        </div>
      </div>

      {/* Right: Quick Actions */}
      <div className="flex items-center gap-1 pl-3 opacity-80 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {isDirectory && (
          <button
            onClick={() => onNavigate(node.path)}
            className="p-1 rounded text-text-muted hover:text-brand hover:bg-surface transition-colors"
            title={t('diskAnalyzer.drillDown', 'Drill Down into Folder')}
          >
            <CornerDownRight className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => onOpenInExplorer(node.path)}
          className="p-1 rounded text-text-muted hover:text-brand hover:bg-surface transition-colors"
          title={t('diskAnalyzer.openInExplorer', 'Open in File Explorer')}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onCopyPath(node.path)}
          className="p-1 rounded text-text-muted hover:text-brand hover:bg-surface transition-colors"
          title={t('diskAnalyzer.copyPath', 'Copy Path')}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onOpenDeleteModal(node)}
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
  );
};

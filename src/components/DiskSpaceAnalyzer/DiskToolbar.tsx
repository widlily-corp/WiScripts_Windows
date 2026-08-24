import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderTree,
  Folder,
  FileText,
  Search,
  X,
  Filter,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { ViewMode } from '../../types';

interface DiskToolbarProps {
  viewMode: ViewMode;
  searchQuery: string;
  sizeFilterThreshold: number;
  onViewModeChange: (mode: ViewMode) => void;
  onSearchChange: (q: string) => void;
  onSizeFilterChange: (bytes: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRescan: () => void;
  isScanning: boolean;
}

const SIZE_FILTER_OPTIONS = [
  { label: 'All Sizes', bytes: 0 },
  { label: '> 100 MB', bytes: 100 * 1024 * 1024 },
  { label: '> 500 MB', bytes: 500 * 1024 * 1024 },
  { label: '> 1 GB', bytes: 1024 * 1024 * 1024 },
  { label: '> 5 GB', bytes: 5 * 1024 * 1024 * 1024 },
];

export const DiskToolbar: React.FC<DiskToolbarProps> = ({
  viewMode,
  searchQuery,
  sizeFilterThreshold,
  onViewModeChange,
  onSearchChange,
  onSizeFilterChange,
  onExpandAll,
  onCollapseAll,
  onRescan,
  isScanning,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-surface border border-border rounded-[8px]">
      {/* Left: View Mode Switcher */}
      <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-[6px] border border-border">
        <button
          onClick={() => onViewModeChange('tree')}
          className={'px-3 py-1.5 rounded-[4px] text-xs font-medium flex items-center gap-1.5 transition-colors ' +
            (viewMode === 'tree'
              ? 'bg-brand text-white shadow-sm'
              : 'text-text-muted hover:text-text')}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>{t('diskAnalyzer.viewTree', 'Hierarchy Tree')}</span>
        </button>

        <button
          onClick={() => onViewModeChange('ranked_folders')}
          className={'px-3 py-1.5 rounded-[4px] text-xs font-medium flex items-center gap-1.5 transition-colors ' +
            (viewMode === 'ranked_folders'
              ? 'bg-brand text-white shadow-sm'
              : 'text-text-muted hover:text-text')}
        >
          <Folder className="w-3.5 h-3.5" />
          <span>{t('diskAnalyzer.viewTopFolders', 'Top 20 Folders')}</span>
        </button>

        <button
          onClick={() => onViewModeChange('ranked_files')}
          className={'px-3 py-1.5 rounded-[4px] text-xs font-medium flex items-center gap-1.5 transition-colors ' +
            (viewMode === 'ranked_files'
              ? 'bg-brand text-white shadow-sm'
              : 'text-text-muted hover:text-text')}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('diskAnalyzer.viewTopFiles', 'Top 20 Files')}</span>
        </button>
      </div>

      {/* Right: Search, Filter, Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-1 sm:w-64">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('diskAnalyzer.searchPlaceholder', 'Filter by name or ext (.log, .zip)...')}
            className="w-full bg-surface-subtle border border-border rounded-[6px] pl-8 pr-7 py-1.5 text-xs text-text placeholder-text-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Min Size Filter Dropdown */}
        <div className="flex items-center gap-1.5 bg-surface-subtle border border-border rounded-[6px] px-2.5 py-1 text-xs">
          <Filter className="w-3 h-3 text-text-muted" />
          <select
            value={sizeFilterThreshold}
            onChange={(e) => onSizeFilterChange(Number(e.target.value))}
            className="bg-transparent text-xs text-text focus:outline-none cursor-pointer font-mono"
          >
            {SIZE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.bytes} value={opt.bytes} className="bg-surface text-text">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tree Expand/Collapse Controls */}
        {viewMode === 'tree' && (
          <div className="flex items-center gap-1">
            <button
              onClick={onExpandAll}
              className="p-1.5 rounded-[6px] bg-surface-subtle hover:bg-surface-hover border border-border text-text-muted hover:text-text transition-colors"
              title={t('diskAnalyzer.expandAll', 'Expand All')}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCollapseAll}
              className="p-1.5 rounded-[6px] bg-surface-subtle hover:bg-surface-hover border border-border text-text-muted hover:text-text transition-colors"
              title={t('diskAnalyzer.collapseAll', 'Collapse All')}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Rescan Button */}
        <button
          onClick={onRescan}
          disabled={isScanning}
          className="p-1.5 rounded-[6px] bg-surface-subtle hover:bg-surface-hover border border-border text-text-muted hover:text-text transition-colors disabled:opacity-50"
          title="Rescan current target"
        >
          <RefreshCw className={'w-3.5 h-3.5 ' + (isScanning ? 'animate-spin' : '')} />
        </button>
      </div>
    </div>
  );
};

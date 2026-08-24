import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderSearch } from 'lucide-react';
import { FsTreeNode } from '../../types';
import { DiskTreeNodeRow } from './DiskTreeNodeRow';
import { filterFsTree } from '../../utils';

interface DiskTreeViewProps {
  rootNode: FsTreeNode | null;
  expandedNodePaths: Set<string>;
  searchQuery: string;
  sizeFilterThreshold: number;
  onToggleNode: (path: string) => void;
  onNavigate: (path: string) => void;
  onOpenInExplorer: (path: string) => void;
  onCopyPath: (path: string) => void;
  onOpenDeleteModal: (node: FsTreeNode) => void;
}

interface VisibleTreeRow {
  node: FsTreeNode;
  depth: number;
  isExpanded: boolean;
}

const ROW_HEIGHT = 44;
const CONTAINER_HEIGHT = 600;
const OVERSCAN = 10;

export const DiskTreeView: React.FC<DiskTreeViewProps> = ({
  rootNode,
  expandedNodePaths,
  searchQuery,
  sizeFilterThreshold,
  onToggleNode,
  onNavigate,
  onOpenInExplorer,
  onCopyPath,
  onOpenDeleteModal,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Memoized filter calculation
  const displayedTree = useMemo(() => {
    if (!rootNode) return null;
    if (!searchQuery && sizeFilterThreshold === 0) return rootNode;

    return filterFsTree(rootNode, {
      query: searchQuery,
      minBytes: sizeFilterThreshold,
    });
  }, [rootNode, searchQuery, sizeFilterThreshold]);

  // Flatten the visible (expanded) hierarchy into a linear array for virtualization
  const visibleRows = useMemo<VisibleTreeRow[]>(() => {
    if (!displayedTree) return [];
    const rows: VisibleTreeRow[] = [];

    const traverse = (node: FsTreeNode, depth: number) => {
      const isExpanded = expandedNodePaths.has(node.path);
      const hasChildren = Boolean(node.children && node.children.length > 0);

      rows.push({ node, depth, isExpanded });

      if (isExpanded && hasChildren && node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }
    };

    traverse(displayedTree, 0);
    return rows;
  }, [displayedTree, expandedNodePaths]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  if (!displayedTree || visibleRows.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-[8px] p-12 text-center space-y-3">
        <FolderSearch className="w-8 h-8 text-text-muted mx-auto" />
        <p className="text-sm font-semibold text-text">
          {t('diskAnalyzer.noResults', 'No items match your search or filter criteria.')}
        </p>
        <p className="text-xs text-text-muted">
          Try clearing your search query or lowering the minimum size threshold.
        </p>
      </div>
    );
  }

  // Virtual window slice calculations
  const totalCount = visibleRows.length;
  const isVirtualized = totalCount > 40;

  const startIndex = isVirtualized
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const endIndex = isVirtualized
    ? Math.min(totalCount, Math.ceil((scrollTop + CONTAINER_HEIGHT) / ROW_HEIGHT) + OVERSCAN)
    : totalCount;

  const topSpacerHeight = isVirtualized ? startIndex * ROW_HEIGHT : 0;
  const bottomSpacerHeight = isVirtualized ? Math.max(0, (totalCount - endIndex) * ROW_HEIGHT) : 0;

  const renderedRows = visibleRows.slice(startIndex, endIndex);

  return (
    <div className="bg-surface border border-border rounded-[8px] overflow-hidden shadow-sm">
      {/* Table Column Headers */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-subtle border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider">
        <div className="flex-1">
          {t('diskAnalyzer.columnName', 'Name & Path')}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 w-64 md:w-80 justify-end">
          <div className="w-28 text-right hidden sm:block">
            {t('diskAnalyzer.columnUsage', 'Share %')}
          </div>
          <div className="w-24 text-right">
            {t('diskAnalyzer.columnSize', 'Size')}
          </div>
          <div className="w-20 text-right hidden lg:block">
            {t('diskAnalyzer.columnItems', 'Files')}
          </div>
        </div>
        <div className="w-24 text-right pr-2">
          {t('diskAnalyzer.columnActions', 'Actions')}
        </div>
      </div>

      {/* Virtualized Tree Content Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="divide-y divide-border-subtle max-h-[600px] overflow-y-auto"
      >
        {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}
        {renderedRows.map((row) => (
          <DiskTreeNodeRow
            key={row.node.path}
            node={row.node}
            depth={row.depth}
            isExpanded={row.isExpanded}
            onToggle={onToggleNode}
            onNavigate={onNavigate}
            onOpenInExplorer={onOpenInExplorer}
            onCopyPath={onCopyPath}
            onOpenDeleteModal={onOpenDeleteModal}
            searchQuery={searchQuery}
          />
        ))}
        {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}
      </div>
    </div>
  );
};

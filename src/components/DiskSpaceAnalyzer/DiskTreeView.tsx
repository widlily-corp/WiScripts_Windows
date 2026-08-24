import React, { useMemo } from 'react';
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

  // Memoized filter calculation
  const displayedTree = useMemo(() => {
    if (!rootNode) return null;
    if (!searchQuery && sizeFilterThreshold === 0) return rootNode;

    return filterFsTree(rootNode, {
      query: searchQuery,
      minBytes: sizeFilterThreshold,
    });
  }, [rootNode, searchQuery, sizeFilterThreshold]);

  if (!displayedTree) {
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

  // Recursive tree renderer
  const renderNodeAndChildren = (node: FsTreeNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodePaths.has(node.path);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <React.Fragment key={node.path}>
        <DiskTreeNodeRow
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          onToggle={onToggleNode}
          onNavigate={onNavigate}
          onOpenInExplorer={onOpenInExplorer}
          onCopyPath={onCopyPath}
          onOpenDeleteModal={onOpenDeleteModal}
          searchQuery={searchQuery}
        />
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderNodeAndChildren(child, depth + 1))}
          </div>
        )}
      </React.Fragment>
    );
  };

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

      {/* Tree Content */}
      <div className="divide-y divide-border-subtle max-h-[600px] overflow-y-auto">
        {renderNodeAndChildren(displayedTree, 0)}
      </div>
    </div>
  );
};

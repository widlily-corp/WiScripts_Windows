import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

import { DiskTargetSelector } from './DiskTargetSelector';
import { DiskScanProgress } from './DiskScanProgress';
import { DiskScanSummary } from './DiskScanSummary';
import { DiskBreadcrumbs } from './DiskBreadcrumbs';
import { DiskToolbar } from './DiskToolbar';
import { DiskTreeView } from './DiskTreeView';
import { DiskRankedLargestView } from './DiskRankedLargestView';
import { DiskDeleteModal } from './DiskDeleteModal';

export const DiskSpaceAnalyzerView: React.FC = () => {
  const { t } = useTranslation();

  const {
    drives,
    selectedDrive,
    customPath,
    isDrivesLoading,
    scanResult,
    isScanning,
    scanProgress,
    scanError,
    viewMode,
    currentRootPath,
    searchQuery,
    sizeFilterThreshold,
    expandedNodePaths,
    isDeleteModalOpen,
    itemToDelete,
    isDeleting,
    deleteError,
    dryRunMode,

    fetchDrives,
    setSelectedDrive,
    setCustomPath,
    startScan,
    cancelScan,
    deleteItem,
    navigateTo,
    navigateUp,
    toggleNode,
    expandAllNodes,
    collapseAllNodes,
    setSearchQuery,
    setSizeFilter,
    setViewMode,
    openDeleteModal,
    closeDeleteModal,
    openInExplorer,
    copyPathToClipboard,
  } = useAppStore();

  useEffect(() => {
    if (drives.length === 0) {
      fetchDrives();
    }
  }, [fetchDrives, drives.length]);

  return (
    <div className="space-y-5 animate-fade-in text-text">
      {/* Target Drives & Custom Folder Selector */}
      <DiskTargetSelector
        drives={drives}
        selectedDrive={selectedDrive}
        customPath={customPath}
        isScanning={isScanning}
        isDrivesLoading={isDrivesLoading}
        onSelectDrive={setSelectedDrive}
        onChangeCustomPath={setCustomPath}
        onStartScan={(target) => startScan(target)}
        onRefreshDrives={fetchDrives}
      />

      {/* Live Scan Progress Telemetry */}
      {isScanning && (
        <DiskScanProgress
          progress={scanProgress}
          onCancel={cancelScan}
        />
      )}

      {/* Scan Error Banner */}
      {scanError && !isScanning && (
        <div className="bg-status-danger/15 border border-status-danger/40 rounded-[8px] p-4 flex items-start gap-3 text-xs text-status-danger">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Scan Error</span>
            <p className="text-text-muted mt-0.5">{scanError}</p>
          </div>
        </div>
      )}

      {/* Scan Results & Exploration Container */}
      {scanResult && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <DiskScanSummary result={scanResult} />

          {/* Breadcrumb Trail */}
          <DiskBreadcrumbs
            currentPath={currentRootPath || scanResult.rootPath || 'C:\\'}
            baseRootPath={scanResult.rootPath || 'C:\\'}
            onNavigate={navigateTo}
            onNavigateUp={navigateUp}
            onCopyPath={copyPathToClipboard}
          />

          {/* Toolbar Controls */}
          <DiskToolbar
            viewMode={viewMode}
            searchQuery={searchQuery}
            sizeFilterThreshold={sizeFilterThreshold}
            onViewModeChange={setViewMode}
            onSearchChange={setSearchQuery}
            onSizeFilterChange={setSizeFilter}
            onExpandAll={expandAllNodes}
            onCollapseAll={collapseAllNodes}
            onRescan={() => startScan(currentRootPath || scanResult.rootPath)}
            isScanning={isScanning}
          />

          {/* View Modes */}
          {viewMode === 'tree' && (
            <DiskTreeView
              rootNode={scanResult.tree || scanResult.rootNode}
              expandedNodePaths={expandedNodePaths}
              searchQuery={searchQuery}
              sizeFilterThreshold={sizeFilterThreshold}
              onToggleNode={toggleNode}
              onNavigate={navigateTo}
              onOpenInExplorer={openInExplorer}
              onCopyPath={copyPathToClipboard}
              onOpenDeleteModal={openDeleteModal}
            />
          )}

          {viewMode === 'ranked_folders' && (
            <DiskRankedLargestView
              type="folders"
              items={scanResult.topFolders || scanResult.largestFolders || []}
              totalScannedBytes={scanResult.totalBytes}
              onNavigate={navigateTo}
              onOpenInExplorer={openInExplorer}
              onCopyPath={copyPathToClipboard}
              onOpenDeleteModal={openDeleteModal}
            />
          )}

          {viewMode === 'ranked_files' && (
            <DiskRankedLargestView
              type="files"
              items={scanResult.topFiles || scanResult.largestFiles || []}
              totalScannedBytes={scanResult.totalBytes}
              onNavigate={navigateTo}
              onOpenInExplorer={openInExplorer}
              onCopyPath={copyPathToClipboard}
              onOpenDeleteModal={openDeleteModal}
            />
          )}
        </div>
      )}

      {/* Safe Deletion Confirmation Modal */}
      <DiskDeleteModal
        item={itemToDelete}
        isOpen={isDeleteModalOpen}
        isDeleting={isDeleting}
        deleteError={deleteError}
        dryRunMode={dryRunMode}
        onClose={closeDeleteModal}
        onConfirmDelete={(path, permanent) => deleteItem(path, permanent)}
      />
    </div>
  );
};

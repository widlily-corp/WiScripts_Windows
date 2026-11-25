import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
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
  const drives = useAppStore((s) => s.drives);
  const selectedDrive = useAppStore((s) => s.selectedDrive);
  const customPath = useAppStore((s) => s.customPath);
  const isDrivesLoading = useAppStore((s) => s.isDrivesLoading);
  const fastMode = useAppStore((s) => s.fastMode);
  const scanResult = useAppStore((s) => s.scanResult);
  const isScanning = useAppStore((s) => s.isScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);
  const scanError = useAppStore((s) => s.scanError);
  const viewMode = useAppStore((s) => s.viewMode);
  const currentRootPath = useAppStore((s) => s.currentRootPath);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const sizeFilterThreshold = useAppStore((s) => s.sizeFilterThreshold);
  const expandedNodePaths = useAppStore((s) => s.expandedNodePaths);
  const isDeleteModalOpen = useAppStore((s) => s.isDeleteModalOpen);
  const itemToDelete = useAppStore((s) => s.itemToDelete);
  const isDeleting = useAppStore((s) => s.isDeleting);
  const deleteError = useAppStore((s) => s.deleteError);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const fetchDrives = useAppStore((s) => s.fetchDrives);
  const setSelectedDrive = useAppStore((s) => s.setSelectedDrive);
  const setCustomPath = useAppStore((s) => s.setCustomPath);
  const setFastMode = useAppStore((s) => s.setFastMode);
  const startScan = useAppStore((s) => s.startScan);
  const cancelScan = useAppStore((s) => s.cancelScan);
  const deleteItem = useAppStore((s) => s.deleteItem);
  const navigateTo = useAppStore((s) => s.navigateTo);
  const navigateUp = useAppStore((s) => s.navigateUp);
  const toggleNode = useAppStore((s) => s.toggleNode);
  const expandAllNodes = useAppStore((s) => s.expandAllNodes);
  const collapseAllNodes = useAppStore((s) => s.collapseAllNodes);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setSizeFilter = useAppStore((s) => s.setSizeFilter);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const openDeleteModal = useAppStore((s) => s.openDeleteModal);
  const closeDeleteModal = useAppStore((s) => s.closeDeleteModal);
  const openInExplorer = useAppStore((s) => s.openInExplorer);
  const copyPathToClipboard = useAppStore((s) => s.copyPathToClipboard);

  useEffect(() => {
    if (drives.length === 0) {
      fetchDrives();
    }
  }, [fetchDrives, drives.length]);

  return (
    <div className="space-y-5 animate-fade-in text-text-primary">
      {/* Target Drives & Custom Folder Selector */}
      <DiskTargetSelector
        drives={drives}
        selectedDrive={selectedDrive}
        customPath={customPath}
        isScanning={isScanning}
        isDrivesLoading={isDrivesLoading}
        fastMode={fastMode}
        onToggleFastMode={setFastMode}
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

import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AppState } from '../useAppStore';
import {
  DiskDriveInfo,
  FsTreeNode,
  RankedFsItem,
  DiskScanResult,
  DiskScanProgressPayload,
  DeletionResult,
  PathProtectionStatus,
  ViewMode,
} from '../../types';
import { getErrorMessage, formatBytes, syncTreeAfterDeletion, isSystemProtectedPath } from '../../utils';

export interface DiskAnalyzerSlice {
  // Drives & Target
  drives: DiskDriveInfo[];
  selectedDrive: string | null;
  customPath: string;
  isDrivesLoading: boolean;

  // Scan State
  scanResult: DiskScanResult | null;
  isScanning: boolean;
  activeScanId: string | null;
  scanProgress: DiskScanProgressPayload | null;
  scanError: string | null;
  error: string | null;
  unlistenScanProgress: UnlistenFn | null;

  // Navigation & Tree Interaction
  viewMode: ViewMode;
  currentRootPath: string;
  searchQuery: string;
  sizeFilterThreshold: number;
  expandedNodePaths: Set<string>;
  selectedItem: FsTreeNode | RankedFsItem | null;

  // Deletion State
  isDeleteModalOpen: boolean;
  itemToDelete: FsTreeNode | RankedFsItem | null;
  isDeleting: boolean;
  deleteError: string | null;
  lastDeletionResult: DeletionResult | null;

  // Actions
  fetchDrives: () => Promise<DiskDriveInfo[]>;
  setSelectedDrive: (drive: string | null) => void;
  setCustomPath: (path: string) => void;
  startScan: (targetPath?: string) => Promise<DiskScanResult | null>;
  cancelScan: () => Promise<void>;
  setupScanProgressListener: () => Promise<UnlistenFn>;
  cleanupScanProgressListener: () => void;

  deleteItem: (path: string, permanent: boolean) => Promise<DeletionResult | null>;
  navigateTo: (path: string) => void;
  navigateUp: () => void;
  toggleNode: (path: string) => void;
  expandAllNodes: () => void;
  collapseAllNodes: () => void;
  setSearchQuery: (q: string) => void;
  setSizeFilter: (bytes: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedItem: (item: FsTreeNode | RankedFsItem | null) => void;

  openDeleteModal: (item: FsTreeNode | RankedFsItem) => void;
  closeDeleteModal: () => void;
  syncTreeAfterDeletion: (deletedPath: string, freedBytes: number, itemsCount?: number) => void;

  openInExplorer: (path: string) => Promise<void>;
  copyPathToClipboard: (path: string) => Promise<void>;
  checkPathProtection: (path: string) => Promise<PathProtectionStatus>;
}

export const createDiskAnalyzerSlice: StateCreator<AppState, [], [], DiskAnalyzerSlice> = (set, get) => ({
  drives: [],
  selectedDrive: null,
  customPath: '',
  isDrivesLoading: false,

  scanResult: null,
  isScanning: false,
  activeScanId: null,
  scanProgress: null,
  scanError: null,
  error: null,
  unlistenScanProgress: null,

  viewMode: 'tree',
  currentRootPath: '',
  searchQuery: '',
  sizeFilterThreshold: 0,
  expandedNodePaths: new Set<string>(),
  selectedItem: null,

  isDeleteModalOpen: false,
  itemToDelete: null,
  isDeleting: false,
  deleteError: null,
  lastDeletionResult: null,

  fetchDrives: async () => {
    set({ isDrivesLoading: true, error: null });
    try {
      const drives = await invoke<DiskDriveInfo[]>('get_disk_drives');
      const normalizedDrives = drives.map((d) => ({
        ...d,
        id: d.id || (d.mountPoint ? d.mountPoint.replace(/[^a-zA-Z0-9]/g, '') : ''),
        freeBytes: d.freeBytes !== undefined ? d.freeBytes : d.availableBytes,
      }));
      set({ drives: normalizedDrives, isDrivesLoading: false });
      if (!get().selectedDrive && normalizedDrives.length > 0) {
        const sysDrive = normalizedDrives.find((d) => d.isSystemDrive) || normalizedDrives[0];
        set({ selectedDrive: sysDrive.mountPoint });
      }
      return normalizedDrives;
    } catch (err) {
      const msg = getErrorMessage(err);
      set({ isDrivesLoading: false, error: msg });
      get().addToast({
        type: 'error',
        title: 'Drive Discovery Error',
        message: msg,
      });
      return [];
    }
  },

  setSelectedDrive: (drive: string | null) => set({ selectedDrive: drive }),
  setCustomPath: (path: string) => set({ customPath: path }),

  setupScanProgressListener: async () => {
    const existing = get().unlistenScanProgress;
    if (existing) {
      existing();
      set({ unlistenScanProgress: null });
    }

    try {
      const unlisten = await listen<DiskScanProgressPayload>('disk-scan-progress', (event) => {
        const payload = event.payload;
        set({ scanProgress: payload });
      });
      set({ unlistenScanProgress: unlisten });
      return unlisten;
    } catch {
      const dummyUnlisten: UnlistenFn = () => {};
      return dummyUnlisten;
    }
  },

  cleanupScanProgressListener: () => {
    const unlisten = get().unlistenScanProgress;
    if (unlisten) {
      unlisten();
      set({ unlistenScanProgress: null });
    }
  },

  startScan: async (targetPath?: string) => {
    const { addLog, addToast } = get();
    const target = targetPath || get().customPath || get().selectedDrive || 'C:\\';
    const scanId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    set({
      isScanning: true,
      activeScanId: scanId,
      scanError: null,
      error: null,
      scanProgress: null,
    });

    await get().setupScanProgressListener();

    addLog({
      level: 'cmd',
      message: 'Starting disk space analysis on \'' + target + '\' (scanId: ' + scanId + ')...',
    });

    try {
      const result = await invoke<DiskScanResult>('scan_disk_space', {
        path: target,
        scanId,
        scan_id: scanId,
      });

      const normalizedResult: DiskScanResult = {
        ...result,
        rootNode: result.rootNode || result.tree,
        largestFolders: result.largestFolders || result.topFolders,
        largestFiles: result.largestFiles || result.topFiles,
        totalFolders: result.totalFolders !== undefined ? result.totalFolders : result.totalDirs,
      };

      const initialExpanded = new Set<string>();
      if (normalizedResult.tree && normalizedResult.tree.path) {
        initialExpanded.add(normalizedResult.tree.path);
      }
      if (normalizedResult.rootNode && normalizedResult.rootNode.path) {
        initialExpanded.add(normalizedResult.rootNode.path);
      }

      set({
        scanResult: normalizedResult,
        isScanning: false,
        activeScanId: null,
        currentRootPath: normalizedResult.rootPath || target,
        expandedNodePaths: initialExpanded,
      });

      addLog({
        level: 'info',
        message: 'Disk analysis completed for \'' + target + '\': ' + formatBytes(normalizedResult.totalBytes) + ' across ' + normalizedResult.totalFiles + ' files and ' + normalizedResult.totalDirs + ' directories in ' + normalizedResult.scanDurationMs + 'ms.',
      });

      addToast({
        type: 'success',
        title: 'Disk Scan Completed',
        message: 'Scanned ' + formatBytes(normalizedResult.totalBytes) + ' across ' + normalizedResult.totalFiles + ' files in ' + (normalizedResult.scanDurationMs / 1000).toFixed(1) + 's.',
      });

      return normalizedResult;
    } catch (err) {
      const msg = getErrorMessage(err);
      set({
        isScanning: false,
        activeScanId: null,
        scanError: msg,
        error: msg,
      });

      addLog({
        level: 'error',
        message: 'Disk space analysis failed for \'' + target + '\': ' + msg,
      });

      addToast({
        type: 'error',
        title: 'Disk Scan Failed',
        message: msg,
      });

      return null;
    } finally {
      get().cleanupScanProgressListener();
    }
  },

  cancelScan: async () => {
    const { addLog, addToast, activeScanId } = get();
    addLog({
      level: 'cmd',
      message: 'Cancelling active disk scan (scanId: ' + (activeScanId || 'current') + ')...',
    });

    try {
      await invoke('cancel_disk_scan', {
        scanId: activeScanId || null,
        scan_id: activeScanId || null,
      });
      set({ isScanning: false, activeScanId: null });
      addLog({
        level: 'info',
        message: 'Disk scan cancelled by user.',
      });
      addToast({
        type: 'info',
        title: 'Scan Cancelled',
        message: 'Disk space analysis was cancelled.',
      });
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: 'Failed to cancel disk scan: ' + msg,
      });
    } finally {
      get().cleanupScanProgressListener();
    }
  },

  deleteItem: async (path: string, permanent: boolean) => {
    const { addLog, addToast, dryRunMode } = get();

    if (isSystemProtectedPath(path)) {
      const msg = 'Security Violation: Path \'' + path + '\' is protected by Windows OS directory guardrails and cannot be deleted.';
      set({ deleteError: msg });
      addLog({ level: 'error', message: msg });
      addToast({
        type: 'error',
        title: 'Protected System Directory',
        message: 'Cannot delete critical Windows OS files or directories.',
      });
      return null;
    }

    set({ isDeleting: true, deleteError: null });

    if (dryRunMode) {
      addLog({
        level: 'cmd',
        message: '[Safety Dry-Run Preview] Simulating ' + (permanent ? 'permanent' : 'recycle bin') + ' deletion of \'' + path + '\'...',
      });

      let simulatedFreedBytes = 104857600;
      if (get().scanResult?.tree) {
        const findNodeSize = (node: FsTreeNode): number => {
          if (node.path.toLowerCase() === path.toLowerCase()) return node.sizeBytes;
          if (node.children) {
            for (const child of node.children) {
              const res = findNodeSize(child);
              if (res > 0) return res;
            }
          }
          return 0;
        };
        const found = findNodeSize(get().scanResult!.tree);
        if (found > 0) simulatedFreedBytes = found;
      }

      const simulatedResult: DeletionResult = {
        itemsDeleted: 1,
        bytesFreed: simulatedFreedBytes,
        errors: [],
        itemReports: [{ path, success: true, bytesFreed: simulatedFreedBytes }],
        permanent,
        success: true,
        isDryRun: true,
        movedToRecycleBin: !permanent,
      };

      set({
        isDeleting: false,
        isDeleteModalOpen: false,
        itemToDelete: null,
        lastDeletionResult: simulatedResult,
      });

      addLog({
        level: 'info',
        message: '[Safety Dry-Run Preview] Simulated deletion of \'' + path + '\': Would free ' + formatBytes(simulatedFreedBytes) + '.',
      });

      addToast({
        type: 'info',
        title: 'Dry-Run Simulation Complete',
        message: 'Simulated deletion of \'' + path + '\'. No files were modified on disk.',
      });

      return simulatedResult;
    }

    addLog({
      level: 'cmd',
      message: 'Executing ' + (permanent ? 'permanent' : 'recycle bin') + ' deletion for \'' + path + '\'...',
    });

    try {
      const result = await invoke<DeletionResult>('delete_filesystem_items', {
        paths: [path],
        permanent,
      });

      if (result.errors && result.errors.length > 0 && result.itemsDeleted === 0) {
        throw new Error(result.errors.join('; '));
      }

      get().syncTreeAfterDeletion(path, result.bytesFreed, result.itemsDeleted);

      set({
        isDeleting: false,
        isDeleteModalOpen: false,
        itemToDelete: null,
        lastDeletionResult: result,
      });

      addLog({
        level: 'info',
        message: 'Deleted \'' + path + '\' successfully (' + (permanent ? 'permanent' : 'moved to Recycle Bin') + '). Freed ' + formatBytes(result.bytesFreed) + ' across ' + result.itemsDeleted + ' items.',
      });

      addToast({
        type: 'success',
        title: permanent ? 'Permanently Deleted' : 'Moved to Recycle Bin',
        message: 'Freed ' + formatBytes(result.bytesFreed) + ' across ' + result.itemsDeleted + ' items.',
      });

      return result;
    } catch (err) {
      const msg = getErrorMessage(err);
      set({ isDeleting: false, deleteError: msg });
      addLog({
        level: 'error',
        message: 'Deletion failed for \'' + path + '\': ' + msg,
      });
      addToast({
        type: 'error',
        title: 'Deletion Failed',
        message: msg,
      });
      return null;
    }
  },

  syncTreeAfterDeletion: (deletedPath: string, freedBytes: number, itemsCount = 1) => {
    const currentResult = get().scanResult;
    if (!currentResult || !currentResult.tree) return;

    const updatedTree = syncTreeAfterDeletion(currentResult.tree, deletedPath, freedBytes, itemsCount);
    const targetNorm = deletedPath.replace(/\//g, '\\').toLowerCase();

    const updatedTopFolders = (currentResult.topFolders || currentResult.largestFolders || []).filter(
      (f) => f.path.replace(/\//g, '\\').toLowerCase() !== targetNorm
    );
    const updatedTopFiles = (currentResult.topFiles || currentResult.largestFiles || []).filter(
      (f) => f.path.replace(/\//g, '\\').toLowerCase() !== targetNorm
    );

    const updatedResult: DiskScanResult = {
      ...currentResult,
      tree: updatedTree,
      rootNode: updatedTree,
      totalBytes: Math.max(0, currentResult.totalBytes - freedBytes),
      totalFiles: Math.max(0, currentResult.totalFiles - itemsCount),
      topFolders: updatedTopFolders,
      largestFolders: updatedTopFolders,
      topFiles: updatedTopFiles,
      largestFiles: updatedTopFiles,
    };

    set({ scanResult: updatedResult });
  },

  navigateTo: (path: string) => {
    const expanded = new Set(get().expandedNodePaths);
    expanded.add(path);
    set({ currentRootPath: path, expandedNodePaths: expanded });
  },

  navigateUp: () => {
    const { currentRootPath, scanResult } = get();
    if (!currentRootPath || !scanResult) return;

    const baseRoot = scanResult.rootPath || scanResult.tree?.path || '';
    const normCurrent = currentRootPath.replace(/[\\\/]+$/g, '');
    const normBase = baseRoot.replace(/[\\\/]+$/g, '');

    if (normCurrent.toLowerCase() === normBase.toLowerCase()) return;

    const parts = normCurrent.split(/[\\\/]/);
    if (parts.length > 1) {
      parts.pop();
      let parentPath = parts.join('\\');
      if (parentPath.length === 2 && parentPath.endsWith(':')) {
        parentPath += '\\';
      }
      set({ currentRootPath: parentPath });
    }
  },

  toggleNode: (path: string) => {
    const expanded = new Set(get().expandedNodePaths);
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    set({ expandedNodePaths: expanded });
  },

  expandAllNodes: () => {
    const { scanResult } = get();
    if (!scanResult || !scanResult.tree) return;

    const allPaths = new Set<string>();
    const MAX_DEPTH = 5;
    const MAX_EXPANDED_NODES = 1000;

    const collectPaths = (node: FsTreeNode, currentDepth: number = 0) => {
      if (allPaths.size >= MAX_EXPANDED_NODES || currentDepth > MAX_DEPTH) return;
      const isDirectory = node.isDir || node.isDirectory || (node.children && node.children.length > 0);
      if (isDirectory) {
        allPaths.add(node.path);
        if (node.children) {
          for (const child of node.children) {
            collectPaths(child, currentDepth + 1);
          }
        }
      }
    };
    collectPaths(scanResult.tree, 0);
    set({ expandedNodePaths: allPaths });
  },

  collapseAllNodes: () => {
    const { scanResult } = get();
    const rootPath = scanResult?.rootPath || scanResult?.tree?.path;
    const initial = new Set<string>();
    if (rootPath) initial.add(rootPath);
    set({ expandedNodePaths: initial });
  },

  setSearchQuery: (q: string) => set({ searchQuery: q }),
  setSizeFilter: (bytes: number) => set({ sizeFilterThreshold: bytes }),
  setViewMode: (mode: ViewMode) => set({ viewMode: mode }),
  setSelectedItem: (item: FsTreeNode | RankedFsItem | null) => set({ selectedItem: item }),

  openDeleteModal: (item: FsTreeNode | RankedFsItem) => {
    set({
      isDeleteModalOpen: true,
      itemToDelete: item,
      deleteError: null,
    });
  },

  closeDeleteModal: () => {
    set({
      isDeleteModalOpen: false,
      itemToDelete: null,
      deleteError: null,
    });
  },

  openInExplorer: async (path: string) => {
    const { addLog } = get();
    addLog({
      level: 'cmd',
      message: 'Opening Windows File Explorer for \'' + path + '\'...',
    });
    try {
      await invoke('open_in_file_explorer', { path });
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: 'Failed to open explorer for \'' + path + '\': ' + msg,
      });
    }
  },

  copyPathToClipboard: async (path: string) => {
    const { addToast } = get();
    try {
      await navigator.clipboard.writeText(path);
      addToast({
        type: 'success',
        title: 'Path Copied',
        message: 'Path copied to clipboard.',
      });
    } catch {
      addToast({
        type: 'info',
        title: 'Path Copied',
        message: path,
      });
    }
  },

  checkPathProtection: async (path: string) => {
    try {
      return await invoke<PathProtectionStatus>('check_path_protection', { path });
    } catch {
      return {
        path,
        isProtected: isSystemProtectedPath(path),
        protectionLevel: isSystemProtectedPath(path) ? 'Locked' : 'Safe',
        reason: isSystemProtectedPath(path) ? 'Windows System Path' : null,
      };
    }
  },
});

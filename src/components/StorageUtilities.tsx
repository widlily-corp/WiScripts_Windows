import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import {
  DuplicateGroup,
  LargeFileItem,
  StorageDeleteResult,
} from '../types';
import {
  FolderSearch,
  Copy,
  HardDrive,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  File,
  CheckSquare,
  Square,
  ShieldAlert,
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(tsSec: number, t: any): string {
  if (!tsSec) return t('storageUtilities.unknown');
  const date = new Date(tsSec * 1000);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function StorageUtilities() {
  const { t } = useTranslation();
  const addLog = useAppStore((s) => s.addLog);
  const addToast = useAppStore((s) => s.addToast);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const [activeTab, setActiveTab] = useState<'duplicates' | 'large'>('duplicates');

  // State for Duplicates
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[] | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // State for Large Files
  const [largeFiles, setLargeFiles] = useState<LargeFileItem[] | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Scan Duplicates
  const handleScanDuplicates = async () => {
    setIsScanning(true);
    addLog({ level: 'info', message: t('storageUtilities.startingDuplicateScan') });
    try {
      const res = await invoke<DuplicateGroup[]>('scan_duplicate_files', {});
      setDuplicateGroups(res);
      // Auto expand top groups
      const topHashes = new Set(res.slice(0, 5).map((g) => g.hash));
      setExpandedGroups(topHashes);
      setSelectedPaths(new Set());

      addLog({
        level: 'info',
        message: t('storageUtilities.duplicateScanFinished', { count: res.length }),
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: t('storageUtilities.duplicateScanFailed', { error: String(err) }),
      });
      addToast({
        type: 'error',
        title: t('storageUtilities.scanError'),
        message: String(err),
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Scan Large Files
  const handleScanLargeFiles = async () => {
    setIsScanning(true);
    addLog({ level: 'info', message: t('storageUtilities.startingLargeFilesScan') });
    try {
      const res = await invoke<LargeFileItem[]>('scan_large_files', { limit: 50 });
      setLargeFiles(res);
      setSelectedPaths(new Set());

      addLog({
        level: 'info',
        message: t('storageUtilities.largeFilesScanFinished', { count: res.length }),
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: t('storageUtilities.largeFilesScanFailed', { error: String(err) }),
      });
      addToast({
        type: 'error',
        title: t('storageUtilities.scanError'),
        message: String(err),
      });
    } finally {
      setIsScanning(false);
    }
  };

  const toggleGroupExpand = (hash: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  };

  const togglePathSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const selectDuplicatesExceptFirst = (group: DuplicateGroup) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      // Skip the first file in group, select all others
      group.files.slice(1).forEach((f) => next.add(f.path));
      return next;
    });
  };

  const calculateSelectedBytes = (): number => {
    let bytes = 0;
    if (activeTab === 'duplicates' && duplicateGroups) {
      for (const grp of duplicateGroups) {
        for (const f of grp.files) {
          if (selectedPaths.has(f.path)) {
            bytes += f.sizeBytes;
          }
        }
      }
    } else if (activeTab === 'large' && largeFiles) {
      for (const f of largeFiles) {
        if (selectedPaths.has(f.path)) {
          bytes += f.sizeBytes;
        }
      }
    }
    return bytes;
  };

  const handleExecuteDelete = async () => {
    setShowConfirmModal(false);
    setIsDeleting(true);
    const pathsArray = Array.from(selectedPaths);
    const selectedBytes = calculateSelectedBytes();

    addLog({
      level: 'info',
      message: t('storageUtilities.executingDeletion', { count: pathsArray.length, dryRunMode: String(dryRunMode) }),
    });

    try {
      if (dryRunMode) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        addLog({
          level: 'cmd',
          message: `[DRY-RUN] ${t('storageUtilities.simulatedDeletion', { count: pathsArray.length, size: formatBytes(selectedBytes) })}`,
        });
        addToast({
          type: 'info',
          title: t('storageUtilities.dryRunDeletionCompleted'),
          message: t('storageUtilities.simulatedDeletion', { count: pathsArray.length, size: formatBytes(selectedBytes) }),
        });
      } else {
        const res = await invoke<StorageDeleteResult>('delete_files', { paths: pathsArray });
        addLog({
          level: 'info',
          message: t('storageUtilities.deleteFinished', { filesDeleted: res.filesDeleted, bytesFreed: formatBytes(res.bytesFreed) }),
        });

        addToast({
          type: 'success',
          title: t('storageUtilities.filesDeleted'),
          message: t('storageUtilities.successfullyDeleted', { filesDeleted: res.filesDeleted, bytesFreed: formatBytes(res.bytesFreed) }),
        });

        // Re-scan current active view
        if (activeTab === 'duplicates') {
          await handleScanDuplicates();
        } else {
          await handleScanLargeFiles();
        }
      }
    } catch (err) {
      addLog({
        level: 'error',
        message: t('storageUtilities.deletionFailed', { error: String(err) }),
      });
      addToast({
        type: 'error',
        title: t('storageUtilities.deleteFailed'),
        message: String(err),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Mode Selector Card */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[6px] bg-brand/10 text-brand border border-brand/20">
              <FolderSearch className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-text-primary">{t('storageUtilities.title')}</h2>
                <div className="px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border text-[10px] font-mono text-text-muted flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-status-success" />
                  <span>{t('storageUtilities.userProfileOnly')}</span>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                {t('storageUtilities.description')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'duplicates' ? (
              <button
                type="button"
                onClick={handleScanDuplicates}
                disabled={isScanning || isDeleting}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? t('storageUtilities.scanning') : t('storageUtilities.scanForDuplicates')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleScanLargeFiles}
                disabled={isScanning || isDeleting}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? t('storageUtilities.scanning') : t('storageUtilities.scanLargeFiles')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={selectedPaths.size === 0 || isScanning || isDeleting}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-status-error text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>
                {isDeleting
                  ? t('storageUtilities.deleting')
                  : t('storageUtilities.deleteSelected', { count: selectedPaths.size })}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('duplicates');
              setSelectedPaths(new Set());
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
              activeTab === 'duplicates'
                ? 'bg-surface-active text-brand border border-border-focus/40'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Copy className="h-4 w-4" />
            <span>{t('storageUtilities.duplicateFilesTab')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('large');
              setSelectedPaths(new Set());
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
              activeTab === 'large'
                ? 'bg-surface-active text-brand border border-border-focus/40'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <HardDrive className="h-4 w-4" />
            <span>{t('storageUtilities.largeFilesFinderTab')}</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {activeTab === 'duplicates' ? (
        <div className="space-y-4">
          {duplicateGroups ? (
            duplicateGroups.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{t('storageUtilities.foundDuplicateGroups', { count: duplicateGroups.length })}</span>
                  {selectedPaths.size > 0 && (
                    <span className="font-mono tabular-nums text-brand">
                      {t('storageUtilities.selectedFiles', { count: selectedPaths.size, size: formatBytes(calculateSelectedBytes()) })}
                    </span>
                  )}
                </div>

                {duplicateGroups.map((group, gIdx) => {
                  const isExpanded = expandedGroups.has(group.hash);
                  const potentialSavings = group.sizeBytes * (group.files.length - 1);

                  return (
                    <div
                      key={group.hash + gIdx}
                      className="rounded-[6px] border border-border bg-surface overflow-hidden"
                    >
                      {/* Group Header Bar */}
                      <div className="p-3.5 bg-surface-subtle flex items-center justify-between gap-3 border-b border-border-subtle select-none">
                        <div
                          onClick={() => toggleGroupExpand(group.hash)}
                          className="flex items-center gap-2.5 cursor-pointer min-w-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-text-primary truncate">
                                {t('storageUtilities.hash', { hash: group.hash.substring(0, 16) })}
                              </span>
                              <span className="px-2 py-0.5 rounded-[4px] bg-brand/10 text-brand text-[10px] font-mono">
                                {t('storageUtilities.duplicatesCount', { count: group.files.length })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-mono tabular-nums font-semibold text-text-primary">
                              {formatBytes(group.sizeBytes)} {t('storageUtilities.each')}
                            </div>
                            <div className="text-[10px] font-mono tabular-nums text-status-success">
                              {t('storageUtilities.save', { size: formatBytes(potentialSavings) })}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => selectDuplicatesExceptFirst(group)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                          >
                            {t('storageUtilities.selectDuplicates')}
                          </button>
                        </div>
                      </div>

                      {/* Group File List */}
                      {isExpanded && (
                        <div className="divide-y divide-border-subtle/40 bg-surface">
                          {group.files.map((file, fIdx) => {
                            const isSelected = selectedPaths.has(file.path);
                            return (
                              <div
                                key={file.path + fIdx}
                                onClick={() => togglePathSelect(file.path)}
                                className={`p-3 flex items-center justify-between gap-3 transition-colors cursor-pointer text-xs select-none ${
                                  isSelected ? 'bg-brand/5' : 'hover:bg-surface-hover'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="text-brand shrink-0">
                                    {isSelected ? (
                                      <CheckSquare className="h-4 w-4" />
                                    ) : (
                                      <Square className="h-4 w-4 text-text-muted" />
                                    )}
                                  </div>
                                  <File className="h-4 w-4 text-text-muted shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-mono text-text-primary truncate" title={file.path}>
                                      {file.path}
                                    </div>
                                    <div className="text-[10px] text-text-muted">
                                      {t('storageUtilities.modified', { date: formatDate(file.modifiedTimestamp, t) })}
                                      {fIdx === 0 && (
                                        <span className="ml-2 text-status-info font-medium">
                                          {t('storageUtilities.originalCandidate')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right font-mono tabular-nums text-text-secondary shrink-0">
                                  {formatBytes(file.sizeBytes)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-2">
                <Copy className="h-8 w-8 text-text-muted mx-auto opacity-50" />
                <div className="text-sm font-medium text-text-primary">{t('storageUtilities.noDuplicateFiles')}</div>
                <p className="text-xs text-text-muted">{t('storageUtilities.allScannedFilesUnique')}</p>
              </div>
            )
          ) : (
            <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-3">
              <Copy className="h-10 w-10 text-text-muted mx-auto opacity-50" />
              <div className="text-sm font-medium text-text-primary">{t('storageUtilities.duplicateFileScanner')}</div>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                {t('storageUtilities.scanDescription')}
              </p>
              <button
                type="button"
                onClick={handleScanDuplicates}
                disabled={isScanning}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{t('storageUtilities.startDuplicateScan')}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Large Files View */
        <div className="space-y-4">
          {largeFiles ? (
            largeFiles.length > 0 ? (
              <div className="rounded-[6px] border border-border bg-surface overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle border-b border-border-subtle text-text-muted font-medium uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3 w-10">{t('storageUtilities.selectColumn')}</th>
                      <th className="p-3">{t('storageUtilities.fileNameAndDetails')}</th>
                      <th className="p-3">{t('storageUtilities.extension')}</th>
                      <th className="p-3 font-mono text-right">{t('storageUtilities.size')}</th>
                      <th className="p-3 text-right">{t('storageUtilities.lastModified')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50">
                    {largeFiles.map((file, idx) => {
                      const isSelected = selectedPaths.has(file.path);
                      return (
                        <tr
                          key={file.path + idx}
                          onClick={() => togglePathSelect(file.path)}
                          className={`cursor-pointer transition-colors select-none ${
                            isSelected ? 'bg-brand/5' : 'hover:bg-surface-hover'
                          }`}
                        >
                          <td className="p-3">
                            <div className="text-brand">
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : (
                                <Square className="h-4 w-4 text-text-muted" />
                              )}
                            </div>
                          </td>
                          <td className="p-3 max-w-md">
                            <div className="font-medium text-text-primary truncate">{file.name}</div>
                            <div className="text-[11px] font-mono text-text-muted truncate" title={file.path}>
                              {file.path}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border text-[10px] font-mono uppercase text-text-secondary">
                              .{file.extension || 'file'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-semibold text-brand">
                            {formatBytes(file.sizeBytes)}
                          </td>
                          <td className="p-3 text-right text-text-muted font-mono tabular-nums text-[11px]">
                            {formatDate(file.modifiedTimestamp, t)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-2">
                <HardDrive className="h-8 w-8 text-text-muted mx-auto opacity-50" />
                <div className="text-sm font-medium text-text-primary">{t('storageUtilities.noLargeFiles')}</div>
                <p className="text-xs text-text-muted">{t('storageUtilities.noSpaceConsuming')}</p>
              </div>
            )
          ) : (
            <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-3">
              <HardDrive className="h-10 w-10 text-text-muted mx-auto opacity-50" />
              <div className="text-sm font-medium text-text-primary">{t('storageUtilities.largeFileFinder')}</div>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                {t('storageUtilities.scanLargeDescription')}
              </p>
              <button
                type="button"
                onClick={handleScanLargeFiles}
                disabled={isScanning}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{t('storageUtilities.startLargeFilesScan')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Deletion Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-[6px] p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[6px] bg-status-error/10 text-status-error border border-status-error/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t('storageUtilities.confirmFileDeletion')}</h3>
                <p className="text-xs text-text-muted">{t('storageUtilities.deletePermanently')}</p>
              </div>
            </div>

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">{t('storageUtilities.selectedFilesLabel')}</span>
                <span className="font-semibold text-text-primary">{selectedPaths.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t('storageUtilities.totalSpaceToFree')}</span>
                <span className="font-semibold font-mono tabular-nums text-status-error">
                  {formatBytes(calculateSelectedBytes())}
                </span>
              </div>
            </div>

            {dryRunMode && (
              <div className="p-2.5 rounded-[6px] bg-status-info/10 border border-status-info/20 text-xs text-status-info flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{t('storageUtilities.safetyDryRun')}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-[6px] border border-border bg-surface-subtle text-text-primary hover:bg-surface-hover"
              >
                {t('storageUtilities.cancel')}
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-1.5 text-xs font-medium rounded-[6px] bg-status-error text-white hover:opacity-90"
              >
                {t('storageUtilities.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

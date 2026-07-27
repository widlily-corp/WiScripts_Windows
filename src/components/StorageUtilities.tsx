import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

function formatDate(tsSec: number): string {
  if (!tsSec) return 'Unknown';
  const date = new Date(tsSec * 1000);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function StorageUtilities() {
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
    addLog({ level: 'info', message: 'Starting duplicate file scan in %USERPROFILE%...' });
    try {
      const res = await invoke<DuplicateGroup[]>('scan_duplicate_files', {});
      setDuplicateGroups(res);
      // Auto expand top groups
      const topHashes = new Set(res.slice(0, 5).map((g) => g.hash));
      setExpandedGroups(topHashes);
      setSelectedPaths(new Set());

      addLog({
        level: 'info',
        message: `Duplicate file scan finished: Found ${res.length} duplicate groups`,
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: `Duplicate scan failed: ${String(err)}`,
      });
      addToast({
        type: 'error',
        title: 'Scan Error',
        message: String(err),
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Scan Large Files
  const handleScanLargeFiles = async () => {
    setIsScanning(true);
    addLog({ level: 'info', message: 'Scanning for large files in %USERPROFILE%...' });
    try {
      const res = await invoke<LargeFileItem[]>('scan_large_files', { limit: 50 });
      setLargeFiles(res);
      setSelectedPaths(new Set());

      addLog({
        level: 'info',
        message: `Large files scan finished: Located top ${res.length} files`,
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: `Large files scan failed: ${String(err)}`,
      });
      addToast({
        type: 'error',
        title: 'Scan Error',
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
      message: `Executing deletion for ${pathsArray.length} files (Dry-Run: ${dryRunMode})...`,
    });

    try {
      if (dryRunMode) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        addLog({
          level: 'cmd',
          message: `[DRY-RUN] Simulated deletion of ${pathsArray.length} files (${formatBytes(selectedBytes)}).`,
        });
        addToast({
          type: 'info',
          title: 'Dry-Run Deletion Completed',
          message: `Simulated deletion of ${pathsArray.length} files (${formatBytes(selectedBytes)}).`,
        });
      } else {
        const res = await invoke<StorageDeleteResult>('delete_files', { paths: pathsArray });
        addLog({
          level: 'info',
          message: `Delete finished: Deleted ${res.filesDeleted} files, freed ${formatBytes(res.bytesFreed)}.`,
        });

        addToast({
          type: 'success',
          title: 'Files Deleted',
          message: `Successfully deleted ${res.filesDeleted} files freeing ${formatBytes(res.bytesFreed)}.`,
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
        message: `Deletion failed: ${String(err)}`,
      });
      addToast({
        type: 'error',
        title: 'Delete Failed',
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
                <h2 className="text-base font-semibold text-text-primary">Storage Utilities & File Analyzer</h2>
                <div className="px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border text-[10px] font-mono text-text-muted flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-status-success" />
                  <span>%USERPROFILE% Only</span>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                Scan for byte-level duplicate files (SHA-256) and top space-consuming large files.
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
                <span>{isScanning ? 'Scanning...' : 'Scan for Duplicates'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleScanLargeFiles}
                disabled={isScanning || isDeleting}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Scanning...' : 'Scan Large Files'}</span>
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
                  ? 'Deleting...'
                  : `Delete Selected (${selectedPaths.size})`}
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
            <span>Duplicate Files</span>
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
            <span>Large Files Finder</span>
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
                  <span>Found {duplicateGroups.length} duplicate file groups</span>
                  {selectedPaths.size > 0 && (
                    <span className="font-mono tabular-nums text-brand">
                      Selected: {selectedPaths.size} files ({formatBytes(calculateSelectedBytes())})
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
                                Hash: {group.hash.substring(0, 16)}...
                              </span>
                              <span className="px-2 py-0.5 rounded-[4px] bg-brand/10 text-brand text-[10px] font-mono">
                                {group.files.length} Duplicates
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-mono tabular-nums font-semibold text-text-primary">
                              {formatBytes(group.sizeBytes)} each
                            </div>
                            <div className="text-[10px] font-mono tabular-nums text-status-success">
                              Save {formatBytes(potentialSavings)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => selectDuplicatesExceptFirst(group)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                          >
                            Select Duplicates
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
                                      Modified: {formatDate(file.modifiedTimestamp)}
                                      {fIdx === 0 && (
                                        <span className="ml-2 text-status-info font-medium">
                                          (Original Candidate)
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
                <div className="text-sm font-medium text-text-primary">No duplicate files found</div>
                <p className="text-xs text-text-muted">All scanned files in %USERPROFILE% have unique SHA-256 contents.</p>
              </div>
            )
          ) : (
            <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-3">
              <Copy className="h-10 w-10 text-text-muted mx-auto opacity-50" />
              <div className="text-sm font-medium text-text-primary">Duplicate File Scanner</div>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                Scan your user profile directory for identical files using a 2-phase size collision and SHA-256 hashing algorithm.
              </p>
              <button
                type="button"
                onClick={handleScanDuplicates}
                disabled={isScanning}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>Start Duplicate Scan</span>
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
                      <th className="p-3 w-10">Select</th>
                      <th className="p-3">File Name & Details</th>
                      <th className="p-3">Extension</th>
                      <th className="p-3 font-mono text-right">Size</th>
                      <th className="p-3 text-right">Last Modified</th>
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
                            {formatDate(file.modifiedTimestamp)}
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
                <div className="text-sm font-medium text-text-primary">No large files found</div>
                <p className="text-xs text-text-muted">No space-consuming files located in %USERPROFILE%.</p>
              </div>
            )
          ) : (
            <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-3">
              <HardDrive className="h-10 w-10 text-text-muted mx-auto opacity-50" />
              <div className="text-sm font-medium text-text-primary">Large File Finder</div>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                Scan your user profile directory to locate top 50 largest files sorted descending by byte size.
              </p>
              <button
                type="button"
                onClick={handleScanLargeFiles}
                disabled={isScanning}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>Start Large Files Scan</span>
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
                <h3 className="text-sm font-semibold text-text-primary">Confirm File Deletion</h3>
                <p className="text-xs text-text-muted">Delete selected files permanently or to Recycle Bin.</p>
              </div>
            </div>

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Selected Files:</span>
                <span className="font-semibold text-text-primary">{selectedPaths.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Total Space to Free:</span>
                <span className="font-semibold font-mono tabular-nums text-status-error">
                  {formatBytes(calculateSelectedBytes())}
                </span>
              </div>
            </div>

            {dryRunMode && (
              <div className="p-2.5 rounded-[6px] bg-status-info/10 border border-status-info/20 text-xs text-status-info flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Safety Dry-Run Mode is ACTIVE. Deletion will be simulated without altering disk files.</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-[6px] border border-border bg-surface-subtle text-text-primary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-1.5 text-xs font-medium rounded-[6px] bg-status-error text-white hover:opacity-90"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { DuplicateGroup, LargeFileItem, StorageDeleteResult } from '../types';
import {
  FolderSearch,
  Copy,
  HardDrive,
  RefreshCw,
  Trash2,
  ShieldCheck,
  PieChart,
  Sparkles,
} from 'lucide-react';
import { DiskSpaceAnalyzerView } from './DiskSpaceAnalyzer/DiskSpaceAnalyzerView';
import { SystemCleanerContent } from './SystemCleaner';
import { getErrorMessage, formatBytes } from '../utils';
import { DuplicateFilesTab } from './StorageUtilities/DuplicateFilesTab';
import { LargeFilesTab } from './StorageUtilities/LargeFilesTab';
import { StorageDeleteConfirmModal } from './StorageUtilities/StorageDeleteConfirmModal';

export type StorageTabType = 'cleaner' | 'analyzer' | 'duplicates' | 'large';

export interface StorageUtilitiesProps {
  initialTab?: StorageTabType;
}

export function StorageUtilities({ initialTab = 'analyzer' }: StorageUtilitiesProps = {}) {
  const { t } = useTranslation();
  const addLog = useAppStore((s) => s.addLog);
  const addToast = useAppStore((s) => s.addToast);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const drives = useAppStore((s) => s.drives);
  const fetchDrives = useAppStore((s) => s.fetchDrives);
  const setSelectedDrive = useAppStore((s) => s.setSelectedDrive);

  const [activeTab, setActiveTab] = useState<StorageTabType>(initialTab);
  const dryRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (drives.length === 0) {
      fetchDrives();
    }
  }, [drives.length, fetchDrives]);

  useEffect(() => {
    return () => {
      if (dryRunTimerRef.current) clearTimeout(dryRunTimerRef.current);
    };
  }, []);

  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[] | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [largeFiles, setLargeFiles] = useState<LargeFileItem[] | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleScanDuplicates = async () => {
    setIsScanning(true);
    addLog({ level: 'info', message: t('storageUtilities.startingDuplicateScan') });
    try {
      const res = await invoke<DuplicateGroup[]>('scan_duplicate_files', {});
      setDuplicateGroups(res);
      setExpandedGroups(new Set(res.slice(0, 5).map((g) => g.hash)));
      setSelectedPaths(new Set());
      addLog({
        level: 'info',
        message: t('storageUtilities.duplicateScanFinished', { count: res.length }),
      });
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: t('storageUtilities.duplicateScanFailed', { error: msg }),
      });
      addToast({ type: 'error', title: t('storageUtilities.scanError'), message: msg });
    } finally {
      setIsScanning(false);
    }
  };

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
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: t('storageUtilities.largeFilesScanFailed', { error: msg }),
      });
      addToast({ type: 'error', title: t('storageUtilities.scanError'), message: msg });
    } finally {
      setIsScanning(false);
    }
  };

  const toggleGroupExpand = (hash: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const togglePathSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectDuplicatesExceptFirst = (group: DuplicateGroup) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      group.files.slice(1).forEach((f) => next.add(f.path));
      return next;
    });
  };

  const calculateSelectedBytes = (): number => {
    let bytes = 0;
    if (activeTab === 'duplicates' && duplicateGroups) {
      for (const grp of duplicateGroups) {
        for (const f of grp.files) {
          if (selectedPaths.has(f.path)) bytes += f.sizeBytes;
        }
      }
    } else if (activeTab === 'large' && largeFiles) {
      for (const f of largeFiles) {
        if (selectedPaths.has(f.path)) bytes += f.sizeBytes;
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
      message: t('storageUtilities.executingDeletion', {
        count: pathsArray.length,
        dryRunMode: String(dryRunMode),
      }),
    });

    try {
      if (dryRunMode) {
        await new Promise<void>((resolve) => {
          dryRunTimerRef.current = setTimeout(() => {
            dryRunTimerRef.current = null;
            resolve();
          }, 800);
        });
        addLog({
          level: 'cmd',
          message: `[DRY-RUN] ${t('storageUtilities.simulatedDeletion', {
            count: pathsArray.length,
            size: formatBytes(selectedBytes),
          })}`,
        });
        addToast({
          type: 'info',
          title: t('storageUtilities.dryRunDeletionCompleted'),
          message: t('storageUtilities.simulatedDeletion', {
            count: pathsArray.length,
            size: formatBytes(selectedBytes),
          }),
        });
      } else {
        const res = await invoke<StorageDeleteResult>('delete_files', { paths: pathsArray });
        addLog({
          level: 'info',
          message: t('storageUtilities.deleteFinished', {
            filesDeleted: res.filesDeleted,
            bytesFreed: formatBytes(res.bytesFreed),
          }),
        });
        addToast({
          type: 'success',
          title: t('storageUtilities.filesDeleted'),
          message: t('storageUtilities.successfullyDeleted', {
            filesDeleted: res.filesDeleted,
            bytesFreed: formatBytes(res.bytesFreed),
          }),
        });

        if (activeTab === 'duplicates') {
          await handleScanDuplicates();
        } else {
          await handleScanLargeFiles();
        }
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: t('storageUtilities.deletionFailed', { error: msg }),
      });
      addToast({ type: 'error', title: t('storageUtilities.deleteFailed'), message: msg });
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedBytes = calculateSelectedBytes();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {drives.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {drives.map((d) => {
            const usagePct = d.usagePercentage || (d.totalBytes > 0 ? (d.usedBytes / d.totalBytes) * 100 : 0);
            let barColor = 'bg-brand';
            if (usagePct > 90) barColor = 'bg-status-danger';
            else if (usagePct > 75) barColor = 'bg-status-warning';

            return (
              <button
                key={d.mountPoint}
                type="button"
                onClick={() => {
                  setSelectedDrive(d.mountPoint);
                  setActiveTab('analyzer');
                }}
                className="w-full text-left p-2.5 rounded-[6px] bg-surface border border-border hover:border-brand/50 transition-all flex items-center justify-between gap-2 shadow-xs"
                title={`${d.mountPoint} · ${formatBytes(d.availableBytes)} free of ${formatBytes(d.totalBytes)}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-[4px] bg-surface-subtle text-text-muted">
                    <HardDrive className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {d.name || d.mountPoint}
                      </span>
                      <span className="text-[10px] font-mono px-1 rounded bg-surface-subtle border border-border text-text-muted">
                        {d.mountPoint}
                      </span>
                    </div>
                    <div className="text-[10px] text-text-muted font-mono truncate">
                      {formatBytes(d.availableBytes)} {t('storageUtilities.freeUnit', 'free')}
                    </div>
                  </div>
                </div>

                <div className="w-14 flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] font-mono text-text-muted">{usagePct.toFixed(0)}%</span>
                  <div className="w-full h-1 bg-surface-subtle rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, usagePct)}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[6px] bg-brand/10 text-brand border border-brand/20">
              <FolderSearch className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-text-primary">{t('storageUtilities.title')}</h2>
                <div className="px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border text-[10px] font-mono text-text-muted flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-status-success" />
                  <span>{t('storageUtilities.userProfileOnly')}</span>
                </div>
              </div>
              <p className="text-xs text-text-muted">{t('storageUtilities.description')}</p>
            </div>
          </div>

          {activeTab !== 'analyzer' && activeTab !== 'cleaner' && (
            <div className="flex items-center gap-2 flex-wrap">
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
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-status-danger text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {isDeleting
                    ? t('storageUtilities.deleting')
                    : t('storageUtilities.deleteSelected', { count: selectedPaths.size })}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('cleaner');
              setSelectedPaths(new Set());
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
              activeTab === 'cleaner'
                ? 'bg-surface-active text-brand border border-border-focus/40 shadow-xs'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>{t('storageUtilities.cleanerTab', 'Express Clean')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('analyzer');
              setSelectedPaths(new Set());
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
              activeTab === 'analyzer'
                ? 'bg-surface-active text-brand border border-border-focus/40 shadow-xs'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <PieChart className="h-4 w-4" />
            <span>{t('diskAnalyzer.tabTitle')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('duplicates');
              setSelectedPaths(new Set());
            }}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors ${
              activeTab === 'duplicates'
                ? 'bg-surface-active text-brand border border-border-focus/40 shadow-xs'
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
                ? 'bg-surface-active text-brand border border-border-focus/40 shadow-xs'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <HardDrive className="h-4 w-4" />
            <span>{t('storageUtilities.largeFilesFinderTab')}</span>
          </button>
        </div>
      </div>

      {activeTab === 'cleaner' ? (
        <SystemCleanerContent onNavigateToAnalyzer={() => setActiveTab('analyzer')} />
      ) : activeTab === 'analyzer' ? (
        <DiskSpaceAnalyzerView />
      ) : activeTab === 'duplicates' ? (
        <DuplicateFilesTab
          duplicateGroups={duplicateGroups}
          expandedGroups={expandedGroups}
          selectedPaths={selectedPaths}
          selectedBytes={selectedBytes}
          isScanning={isScanning}
          onScanDuplicates={handleScanDuplicates}
          onToggleGroupExpand={toggleGroupExpand}
          onTogglePathSelect={togglePathSelect}
          onSelectDuplicatesExceptFirst={selectDuplicatesExceptFirst}
        />
      ) : (
        <LargeFilesTab
          largeFiles={largeFiles}
          selectedPaths={selectedPaths}
          isScanning={isScanning}
          onScanLargeFiles={handleScanLargeFiles}
          onTogglePathSelect={togglePathSelect}
        />
      )}

      <StorageDeleteConfirmModal
        isOpen={showConfirmModal}
        selectedCount={selectedPaths.size}
        selectedBytes={selectedBytes}
        dryRunMode={dryRunMode}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={handleExecuteDelete}
      />
    </div>
  );
}

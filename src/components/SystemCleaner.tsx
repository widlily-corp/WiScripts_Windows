import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import { CleanerScanResult, CleanerCleanResult, CleanerCategoryItem } from '../types';
import {
  Sparkles,
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  Folder,
  HardDrive,
  FileText,
  ShieldAlert,
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function SystemCleaner() {
  const { t } = useTranslation();
  const addLog = useAppStore((s) => s.addLog);
  const addToast = useAppStore((s) => s.addToast);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const [scanResult, setScanResult] = useState<CleanerScanResult | null>(null);
  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    addLog({ level: 'info', message: 'Starting system junk and cache scan...' });
    try {
      const res = await invoke<CleanerScanResult>('scan_system_cleaner');
      setScanResult(res);
      // Select all non-empty categories by default
      const initialSelected = new Set(
        res.categories.filter((c) => c.totalSizeBytes > 0).map((c) => c.id)
      );
      setSelectedCatIds(initialSelected);
      addLog({
        level: 'info',
        message: `System scan complete: ${res.totalFiles} files (${formatBytes(res.totalBytes)}) across ${res.categories.length} categories`,
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: `Failed to scan system cleaner: ${String(err)}`,
      });
      addToast({
        type: 'error',
        title: t('systemCleaner.scanErrorTitle'),
        message: String(err),
      });
    } finally {
      setIsScanning(false);
    }
  };

  const toggleCategory = (id: string) => {
    setSelectedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!scanResult) return;
    setSelectedCatIds(new Set(scanResult.categories.map((c) => c.id)));
  };

  const deselectAll = () => {
    setSelectedCatIds(new Set());
  };

  const totalSelectedBytes =
    scanResult?.categories
      .filter((c) => selectedCatIds.has(c.id))
      .reduce((acc, c) => acc + c.totalSizeBytes, 0) ?? 0;

  const totalSelectedFiles =
    scanResult?.categories
      .filter((c) => selectedCatIds.has(c.id))
      .reduce((acc, c) => acc + c.fileCount, 0) ?? 0;

  const handleExecuteClean = async () => {
    setShowConfirmModal(false);
    setIsCleaning(true);
    const catArray = Array.from(selectedCatIds);
    addLog({
      level: 'info',
      message: `Executing cleanup for ${catArray.length} categories (Dry-Run: ${dryRunMode})...`,
    });

    try {
      if (dryRunMode) {
        // Simulate cleanup in dry-run mode
        await new Promise((resolve) => setTimeout(resolve, 800));
        addLog({
          level: 'cmd',
          message: `[DRY-RUN] Simulated cleanup of ${catArray.length} categories (${formatBytes(totalSelectedBytes)}). No files modified.`,
        });
        addToast({
          type: 'info',
          title: t('systemCleaner.dryRunTitle'),
          message: t('systemCleaner.dryRunMsg', { bytes: formatBytes(totalSelectedBytes), files: totalSelectedFiles }),
        });
      } else {
        const res = await invoke<CleanerCleanResult>('clean_system_items', {
          categoryIds: catArray,
        });

        addLog({
          level: 'info',
          message: `Cleanup finished: Freed ${formatBytes(res.bytesFreed)}, removed ${res.filesRemoved} files, skipped ${res.skippedFilesCount} locked files.`,
        });

        addToast({
          type: 'success',
          title: t('systemCleaner.successTitle'),
          message: t('systemCleaner.successMsg', { bytes: formatBytes(res.bytesFreed), files: res.filesRemoved, skipped: res.skippedFilesCount }),
        });

        // Re-scan to update state
        await handleScan();
      }
    } catch (err) {
      addLog({
        level: 'error',
        message: `System cleaner failed: ${String(err)}`,
      });
      addToast({
        type: 'error',
        title: t('systemCleaner.errorTitle'),
        message: String(err),
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls Card */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[6px] bg-brand/10 text-brand border border-brand/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{t('systemCleaner.title')}</h2>
              <p className="text-xs text-text-muted">
                {t('systemCleaner.desc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning || isCleaning}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-surface-subtle border border-border text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? t('systemCleaner.scanning') : t('systemCleaner.scanSystemJunk')}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={selectedCatIds.size === 0 || isScanning || isCleaning}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>
                {isCleaning ? t('systemCleaner.cleaning') : t('systemCleaner.cleanSelected', { count: selectedCatIds.size })}
              </span>
            </button>
          </div>
        </div>

        {/* Stats bar if scan completed */}
        {scanResult && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border-subtle">
            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <HardDrive className="h-4 w-4 text-text-muted" />
                <span className="text-xs text-text-muted">{t('systemCleaner.totalJunkDetected')}</span>
              </div>
              <span className="text-sm font-semibold font-mono tabular-nums text-text-primary">
                {formatBytes(scanResult.totalBytes)}
              </span>
            </div>

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-text-muted" />
                <span className="text-xs text-text-muted">{t('systemCleaner.filesCount')}</span>
              </div>
              <span className="text-sm font-semibold font-mono tabular-nums text-text-primary">
                {scanResult.totalFiles.toLocaleString()}
              </span>
            </div>

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-brand" />
                <span className="text-xs text-text-muted">{t('systemCleaner.selectedForCleanup')}</span>
              </div>
              <span className="text-sm font-semibold font-mono tabular-nums text-brand">
                {formatBytes(totalSelectedBytes)} ({totalSelectedFiles} {t('systemCleaner.files')})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Categories Section */}
      {scanResult ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {t('systemCleaner.categoryBreakdown', { count: scanResult.categories.length })}
            </h3>

            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="text-brand hover:underline"
              >
                Select All
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-text-muted hover:text-text-primary"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scanResult.categories.map((cat) => {
              const isSelected = selectedCatIds.has(cat.id);
              return (
                <div
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`p-4 rounded-[6px] border transition-all cursor-pointer select-none space-y-3 ${
                    isSelected
                      ? 'bg-surface border-brand/50 shadow-sm'
                      : 'bg-surface-subtle border-border-subtle hover:border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-brand">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4 text-text-muted" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-text-primary">{cat.name}</h4>
                        <p className="text-xs text-text-muted mt-0.5">{cat.description}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold font-mono tabular-nums text-text-primary">
                        {formatBytes(cat.totalSizeBytes)}
                      </div>
                      <div className="text-[11px] text-text-muted font-mono tabular-nums">
                        {cat.fileCount} {t('systemCleaner.files')}
                      </div>
                    </div>
                  </div>

                  {/* Targeted Paths preview */}
                  <div className="pt-2 border-t border-border-subtle/50 space-y-1">
                    <div className="text-[10px] uppercase font-mono text-text-muted tracking-wider">
                      {t('systemCleaner.targetPaths')}
                    </div>
                    {cat.paths.map((p, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] font-mono text-text-secondary truncate bg-background px-2 py-0.5 rounded-[4px] border border-border-subtle/40"
                        title={p}
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-3">
          <Sparkles className="h-10 w-10 text-text-muted mx-auto opacity-50" />
          <div className="text-sm font-medium text-text-primary">{t('systemCleaner.noScanResults')}</div>
          <p className="text-xs text-text-muted max-w-md mx-auto">
            {t('systemCleaner.noScanDesc')}
          </p>
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{t('systemCleaner.startScan')}</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-[6px] p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[6px] bg-status-warning/10 text-status-warning border border-status-warning/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t('systemCleaner.confirmTitle')}</h3>
                <p className="text-xs text-text-muted">{t('systemCleaner.confirmDesc')}</p>
              </div>
            </div>

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">{t('systemCleaner.confirmSelectedCat')}</span>
                <span className="font-semibold text-text-primary">{selectedCatIds.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t('systemCleaner.confirmSpaceToFree')}</span>
                <span className="font-semibold font-mono tabular-nums text-brand">
                  {formatBytes(totalSelectedBytes)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t('systemCleaner.confirmFilesAffected')}</span>
                <span className="font-semibold font-mono tabular-nums text-text-primary">
                  {totalSelectedFiles}
                </span>
              </div>
            </div>

            {dryRunMode && (
              <div className="p-2.5 rounded-[6px] bg-status-info/10 border border-status-info/20 text-xs text-status-info flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{t('systemCleaner.safetyDryRunMsg')}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-[6px] border border-border bg-surface-subtle text-text-primary hover:bg-surface-hover"
              >
                {t('systemCleaner.cancel')}
              </button>
              <button
                type="button"
                onClick={handleExecuteClean}
                className="px-4 py-1.5 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover"
              >
                {t('systemCleaner.proceedCleanup')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

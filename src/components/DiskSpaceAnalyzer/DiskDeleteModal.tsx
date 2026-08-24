import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Trash2,
  Recycle,
  ShieldAlert,
  ShieldCheck,
  X,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { FsTreeNode, RankedFsItem } from '../../types';
import { formatBytes, formatTabularBytes, isSystemProtectedPath } from '../../utils';

interface DiskDeleteModalProps {
  item: FsTreeNode | RankedFsItem | null;
  isOpen: boolean;
  isDeleting: boolean;
  deleteError: string | null;
  dryRunMode: boolean;
  onClose: () => void;
  onConfirmDelete: (path: string, permanent: boolean) => Promise<unknown>;
}

export const DiskDeleteModal: React.FC<DiskDeleteModalProps> = ({
  item,
  isOpen,
  isDeleting,
  deleteError,
  dryRunMode,
  onClose,
  onConfirmDelete,
}) => {
  const { t } = useTranslation();
  const [usePermanent, setUsePermanent] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  if (!isOpen || !item) return null;

  const path = item.path;
  const isProtected = item.isSystemProtected || isSystemProtectedPath(path);
  const sizeBytes = item.sizeBytes || ('totalBytes' in item ? (item as RankedFsItem).totalBytes : 0) || 0;
  const isLarge = sizeBytes > 1024 * 1024 * 1024; // > 1 GB

  const requiresTypeConfirm = usePermanent && isLarge;
  const canExecute = !isProtected && (!requiresTypeConfirm || confirmInput.trim().toUpperCase() === 'CONFIRM');

  const handleExecute = async () => {
    if (!canExecute || isDeleting) return;
    await onConfirmDelete(path, usePermanent);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface border border-border rounded-[8px] max-w-lg w-full shadow-2xl overflow-hidden space-y-0 text-text">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-2">
            <div className={'p-2 rounded-[6px] ' + (isProtected ? 'bg-status-danger/20 text-status-danger' : 'bg-status-warning/20 text-status-warning')}>
              {isProtected ? <ShieldAlert className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-text">
                {t('diskAnalyzer.deleteModal.title', 'Safe Deletion Confirmation')}
              </h3>
              <p className="text-xs text-text-muted">
                {t('diskAnalyzer.deleteModal.subtitle', 'Configure deletion mode for selected filesystem item.')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Target Info */}
          <div className="bg-surface-subtle border border-border rounded-[6px] p-3 space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">{t('diskAnalyzer.deleteModal.targetPath', 'Target Path:')}</span>
              <span className="text-text font-bold truncate max-w-xs" title={path}>{path}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">{t('diskAnalyzer.deleteModal.targetSize', 'Total Size:')}</span>
              <span className="text-brand font-bold">{formatBytes(sizeBytes)} ({formatTabularBytes(sizeBytes)})</span>
            </div>
          </div>

          {/* Dry Run Notice */}
          {dryRunMode && (
            <div className="bg-brand/10 border border-brand/30 rounded-[6px] p-3 flex items-start gap-2.5 text-xs text-brand">
              <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Safety Dry-Run Preview Mode</span>
                <p className="text-text-muted mt-0.5">
                  {t('diskAnalyzer.deleteModal.dryRunNotice', 'Dry-Run Simulation Mode is Active. No files will be modified on disk.')}
                </p>
              </div>
            </div>
          )}

          {/* Protected Path Warning */}
          {isProtected ? (
            <div className="bg-status-danger/15 border border-status-danger/40 rounded-[6px] p-3.5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-status-danger flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <span className="font-bold text-status-danger">
                  {t('diskAnalyzer.deleteModal.protectedWarningTitle', 'Protected Windows OS Directory')}
                </span>
                <p className="text-text-muted">
                  {t('diskAnalyzer.deleteModal.protectedWarningDesc', 'This path is recognized as a vital Windows system location. Deletion is strictly blocked to safeguard OS integrity.')}
                </p>
              </div>
            </div>
          ) : (
            /* Mode Selection */
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text block">
                Select Deletion Mode:
              </label>

              {/* Option 1: Recycle Bin (Safe) */}
              <div
                onClick={() => setUsePermanent(false)}
                className={'p-3 rounded-[6px] border cursor-pointer transition-all flex items-start gap-3 ' +
                  (!usePermanent
                    ? 'bg-surface-active border-brand shadow-sm shadow-brand/10'
                    : 'bg-surface-subtle border-border hover:bg-surface-hover')}
              >
                <input
                  type="radio"
                  checked={!usePermanent}
                  onChange={() => setUsePermanent(false)}
                  className="mt-1 text-brand focus:ring-brand"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Recycle className="w-4 h-4 text-status-success" />
                    <span className="font-semibold text-xs text-text">
                      {t('diskAnalyzer.deleteModal.modeRecycleBinTitle', 'Move to Windows Recycle Bin (Safe & Recoverable)')}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {t('diskAnalyzer.deleteModal.modeRecycleBinDesc', 'Items can be restored later from the Windows Recycle Bin if needed.')}
                  </p>
                </div>
              </div>

              {/* Option 2: Permanent Deletion */}
              <div
                onClick={() => setUsePermanent(true)}
                className={'p-3 rounded-[6px] border cursor-pointer transition-all flex items-start gap-3 ' +
                  (usePermanent
                    ? 'bg-surface-active border-status-danger shadow-sm shadow-status-danger/10'
                    : 'bg-surface-subtle border-border hover:bg-surface-hover')}
              >
                <input
                  type="radio"
                  checked={usePermanent}
                  onChange={() => setUsePermanent(true)}
                  className="mt-1 text-status-danger focus:ring-status-danger"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4 text-status-danger" />
                    <span className="font-semibold text-xs text-status-danger">
                      {t('diskAnalyzer.deleteModal.modePermanentTitle', 'Permanent Deletion (Irreversible)')}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {t('diskAnalyzer.deleteModal.modePermanentDesc', 'Recursively deletes the folder and all sub-elements without Recycle Bin. Frees disk space immediately.')}
                  </p>
                </div>
              </div>

              {/* Large item confirmation input */}
              {requiresTypeConfirm && (
                <div className="pt-2 space-y-1.5">
                  <label className="text-[11px] font-semibold text-status-warning block">
                    {t('diskAnalyzer.deleteModal.confirmTypeLabel', 'Type CONFIRM to authorize permanent deletion:')}
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="CONFIRM"
                    className="w-full bg-surface-subtle border border-border focus:border-status-danger rounded-[6px] px-3 py-1.5 text-xs font-mono text-text focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Delete Error Message */}
          {deleteError && (
            <div className="p-3 bg-status-danger/15 border border-status-danger/40 rounded-[6px] text-xs text-status-danger">
              {deleteError}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 p-4 border-t border-border bg-surface-subtle">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-[6px] border border-border hover:bg-surface-hover text-xs font-medium text-text transition-colors disabled:opacity-50"
          >
            {t('common.cancel', 'Cancel')}
          </button>

          <button
            onClick={handleExecute}
            disabled={!canExecute || isDeleting}
            className={'px-4 py-2 rounded-[6px] text-xs font-semibold flex items-center gap-1.5 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
              (usePermanent ? 'bg-status-danger hover:bg-status-danger/90' : 'bg-brand hover:bg-brand-hover')}
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {t('diskAnalyzer.deleteModal.deleting', 'Deleting...')}
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                {t('diskAnalyzer.deleteModal.confirmDelete', 'Execute Deletion')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

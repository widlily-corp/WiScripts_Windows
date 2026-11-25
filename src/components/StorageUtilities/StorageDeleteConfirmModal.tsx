import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { formatBytes } from '../../utils';
import { useAccessibleModal } from '../common/useAccessibleModal';

interface StorageDeleteConfirmModalProps {
  isOpen: boolean;
  selectedCount: number;
  selectedBytes: number;
  dryRunMode: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function StorageDeleteConfirmModal({
  isOpen,
  selectedCount,
  selectedBytes,
  dryRunMode,
  onCancel,
  onConfirm,
}: StorageDeleteConfirmModalProps) {
  const { t } = useTranslation();
  const modalRef = useAccessibleModal({ isOpen, onClose: onCancel });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-delete-modal-title"
        className="w-full max-w-md bg-surface border border-border rounded-[6px] p-5 space-y-4 shadow-xl"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-[6px] bg-status-dangerSubtle text-status-danger border border-status-danger/20">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 id="storage-delete-modal-title" className="text-sm font-semibold text-text-primary">
              {t('storageUtilities.confirmFileDeletion')}
            </h3>
            <p className="text-xs text-text-muted">{t('storageUtilities.deletePermanently')}</p>
          </div>
        </div>

        <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">{t('storageUtilities.selectedFilesLabel')}</span>
            <span className="font-semibold text-text-primary">{selectedCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">{t('storageUtilities.totalSpaceToFree')}</span>
            <span className="font-semibold font-mono tabular-nums text-status-danger">
              {formatBytes(selectedBytes)}
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
            data-autofocus
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-[6px] border border-border bg-surface-subtle text-text-primary hover:bg-surface-hover"
          >
            {t('storageUtilities.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-medium rounded-[6px] bg-status-danger text-white hover:opacity-90"
          >
            {t('storageUtilities.confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  );
}

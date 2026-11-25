import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { AutorunEntry, QuarantineResult } from '../../types/autoruns';
import { useAccessibleModal } from '../../components/common/useAccessibleModal';

interface QuarantineModalProps {
  isOpen: boolean;
  selectedEntry: AutorunEntry | null;
  quarantineResult: QuarantineResult | null;
  isProcessing: boolean;
  onQuarantine: () => void;
  onClose: () => void;
}

export const QuarantineModal: React.FC<QuarantineModalProps> = ({
  isOpen,
  selectedEntry,
  quarantineResult,
  isProcessing,
  onQuarantine,
  onClose,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const modalRef = useAccessibleModal({
    isOpen: isOpen && Boolean(selectedEntry),
    onClose,
    disabled: isProcessing,
  });

  if (!isOpen || !selectedEntry) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-surface border border-border rounded-[8px] max-w-md w-full p-5 space-y-4 shadow-xl focus:outline-none"
      >
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <ShieldAlert className="h-5 w-5 text-status-danger" />
          <h3 id={titleId} className="text-sm font-semibold text-text-primary">
            {t('autoruns.quarantine.modal_title', 'Quarantine Persistence Entry')}
          </h3>
        </div>

        {!quarantineResult ? (
          <>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t(
                'autoruns.quarantine.modal_desc',
                'Quarantining will create a safe registry backup and isolate the binary file in WiScripts Quarantine folder. Are you sure you want to proceed?'
              )}
            </p>

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border text-xs space-y-1 font-mono">
              <div>
                <span className="text-text-muted">{t('autoruns.col.name', 'Name')}:</span>{' '}
                <span className="text-text-primary font-semibold">{selectedEntry.name}</span>
              </div>
              <div>
                <span className="text-text-muted">{t('autoruns.col.path', 'Path')}:</span>{' '}
                <span className="text-text-secondary truncate block">
                  {selectedEntry.imagePath}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-[6px] border border-border hover:bg-surface-hover text-text-secondary text-xs font-medium disabled:opacity-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={onQuarantine}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-[6px] bg-status-danger text-white text-xs font-medium hover:bg-status-danger/90 transition-colors disabled:opacity-50"
              >
                {isProcessing
                  ? t('autoruns.quarantine.processing', 'Quarantining...')
                  : t('autoruns.quarantine.confirm_btn', 'Isolate & Quarantine')}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {quarantineResult.success ? (
              <div className="flex items-start gap-2.5 text-status-success text-xs">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">
                    {t('autoruns.quarantine.success_title', 'Entry Quarantined Successfully')}
                  </div>
                  <div className="text-text-secondary mt-1">
                    {t(
                      'autoruns.quarantine.success_msg',
                      'Binary payload and registry entry isolated to quarantine storage.'
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 text-status-danger text-xs">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">
                    {t('autoruns.quarantine.failed_title', 'Quarantine Operation Error')}
                  </div>
                  <div className="text-text-secondary mt-1">
                    {quarantineResult.error || t('autoruns.quarantine.unknownError', 'Unknown error during quarantine')}
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border text-[11px] font-mono space-y-1.5">
              <div>
                <span className="text-text-muted">{t('autoruns.quarantine.quarantinedPathLabel', 'Quarantined Path:')}</span>
                <div className="text-text-primary truncate">
                  {quarantineResult.quarantinedPath || '—'}
                </div>
              </div>
              <div>
                <span className="text-text-muted">{t('autoruns.quarantine.backupRegistryLabel', 'Backup Registry File:')}</span>
                <div className="text-text-primary truncate">
                  {quarantineResult.backupRegistryKey || '—'}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-[6px] bg-brand text-white text-xs font-medium hover:bg-brand-hover transition-colors"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

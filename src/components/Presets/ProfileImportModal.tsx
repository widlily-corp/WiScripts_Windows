import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  FileCode,
  History,
  Loader2,
  X,
} from 'lucide-react';
import { ProfileImportValidation } from './profileUtils';
import { useAccessibleModal } from '../common/useAccessibleModal';

interface ProfileImportModalProps {
  validation: ProfileImportValidation | null;
  isApplying: boolean;
  isButtonDisabled: boolean;
  onClose: () => void;
  onApply: () => void;
}

export const ProfileImportModal: React.FC<ProfileImportModalProps> = ({
  validation,
  isApplying,
  isButtonDisabled,
  onClose,
  onApply,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const isOpen = Boolean(validation && validation.profile);
  const modalRef = useAccessibleModal({
    isOpen,
    onClose,
    disabled: isApplying,
  });

  if (!validation || !validation.profile) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-[8px] border border-border bg-surface p-6 shadow-2xl space-y-4 animate-scale-in focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-brand" />
            <h3 id={titleId} className="text-base font-semibold text-text-primary">
              {t('presetsView.reviewImportedTitle', 'Review Imported .wiscripts Profile')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            aria-label={t('common.close', 'Close')}
            className="p-1 rounded text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Metadata */}
        <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-3.5 space-y-2 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted font-medium">{t('presetsView.profileNameLabel', 'Profile Name:')}</span>
            <span className="font-semibold text-text-primary text-right">
              {validation.profile.metadata.name}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted font-medium">{t('presetsView.profileAuthorLabel', 'Author / Origin:')}</span>
            <span className="text-text-secondary text-right">
              {validation.profile.metadata.author}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted font-medium">{t('presetsView.profileSchemaLabel', 'Schema Version:')}</span>
            <span className="font-mono text-text-secondary">
              {validation.profile.schemaVersion}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted font-medium">{t('presetsView.validRulesLabel', 'Valid Tweak Rules:')}</span>
            <span className="font-bold text-brand">
              {t('presetsView.rulesCountShort', { count: validation.validRuleIds.length, defaultValue: `${validation.validRuleIds.length} tweaks` })}
            </span>
          </div>
        </div>

        {/* Warnings / Unknown Rules */}
        {validation.warnings.length > 0 && (
          <div className="space-y-1.5 rounded-[6px] border border-status-warning/40 bg-status-warningSubtle p-3 text-xs text-status-warning">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('presetsView.compatibilityWarnings', 'Profile Compatibility Warnings')}</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-text-secondary">
              {validation.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Safety Guarantee Info */}
        <div className="flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface-subtle p-2.5 text-xs text-text-secondary">
          <History className="h-4 w-4 text-brand shrink-0" />
          <span>
            {t('presetsView.preflightGuarantee', 'Pre-Flight Safety verification & snapshot will run before applying this profile.')}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 rounded-[6px] border border-border text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isApplying || isButtonDisabled || validation.validRuleIds.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('presetsView.applyingProfile')}</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>{t('presetsView.applyImportedBtn', 'Apply Imported Profile')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

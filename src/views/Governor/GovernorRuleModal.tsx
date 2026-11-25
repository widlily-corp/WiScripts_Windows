import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sliders, X, Volume2 } from 'lucide-react';
import { useAccessibleModal } from '../../components/common/useAccessibleModal';
import { PRIORITIES, calculateMaskFromCores } from './governorUtils';

interface GovernorRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  coreCount: number;
  editingProcessName: string;
  onProcessNameChange: (val: string) => void;
  selectedPriority: string;
  onPriorityChange: (val: string) => void;
  selectedCores: number[];
  onToggleCore: (idx: number) => void;
  audioEndpoint: string;
  onAudioEndpointChange: (val: string) => void;
  memoryTrimThreshold: string;
  onMemoryTrimThresholdChange: (val: string) => void;
}

export function GovernorRuleModal({
  isOpen,
  onClose,
  onSubmit,
  coreCount,
  editingProcessName,
  onProcessNameChange,
  selectedPriority,
  onPriorityChange,
  selectedCores,
  onToggleCore,
  audioEndpoint,
  onAudioEndpointChange,
  memoryTrimThreshold,
  onMemoryTrimThresholdChange,
}: GovernorRuleModalProps) {
  const { t } = useTranslation();
  const modalRef = useAccessibleModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="governor-rule-modal-title"
        className="bg-surface border border-border rounded-[8px] w-full max-w-lg p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 id="governor-rule-modal-title" className="text-base font-semibold flex items-center gap-2 text-text-primary">
            <Sliders className="h-4 w-4 text-brand" />
            {t('governor.rule_modal_title', 'Configure Process Governor Rule')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="text-text-muted hover:text-text-primary p-1 rounded focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 text-xs">
          <div>
            <label htmlFor="gov-process-name" className="block font-medium text-text-secondary mb-1">
              {t('governor.process_name', 'Process Name')}
            </label>
            <input
              id="gov-process-name"
              data-autofocus
              type="text"
              value={editingProcessName}
              onChange={(e) => onProcessNameChange(e.target.value)}
              placeholder={t('governor.processPlaceholder', 'e.g. chrome.exe, csgo.exe')}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-text-primary focus:outline-none focus:border-brand"
              required
            />
          </div>

          <div>
            <label htmlFor="gov-target-priority" className="block font-medium text-text-secondary mb-1">
              {t('governor.target_priority', 'Target Priority Class')}
            </label>
            <select
              id="gov-target-priority"
              value={selectedPriority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-text-primary focus:outline-none focus:border-brand"
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey, p.defaultLabel)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="font-medium text-text-secondary">
                {t('governor.core_affinity', 'CPU Core Affinity Assignment')} ({coreCount})
              </span>
              <span className="font-mono text-brand text-[11px]">
                {t('governor.maskLabel', 'Mask:')} {calculateMaskFromCores(selectedCores, coreCount)}
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 p-3 bg-background border border-border rounded-[6px]">
              {Array.from({ length: coreCount }).map((_, idx) => {
                const isSelected = selectedCores.includes(idx);
                return (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => onToggleCore(idx)}
                    aria-pressed={isSelected}
                    className={`py-1.5 text-center font-mono text-[11px] rounded transition-colors ${
                      isSelected
                        ? 'bg-brand text-white font-semibold'
                        : 'bg-surface-subtle text-text-muted hover:text-text-primary border border-border/50'
                    }`}
                  >
                    C{idx}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="gov-audio-endpoint" className="flex items-center gap-1.5 font-medium text-text-secondary mb-1">
              <Volume2 className="h-3.5 w-3.5 text-text-muted" />
              <span>{t('governor.audio_endpoint_label', 'Audio Endpoint ID (Optional)')}</span>
            </label>
            <input
              id="gov-audio-endpoint"
              type="text"
              value={audioEndpoint}
              onChange={(e) => onAudioEndpointChange(e.target.value)}
              placeholder={t('governor.audioEndpointPlaceholder', 'e.g. {0.0.0.00000000}.{device-id} or leave empty for default')}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="gov-trim-threshold" className="block font-medium text-text-secondary mb-1">
              {t('governor.auto_trim_threshold_label', 'Auto RAM Trim Threshold (MB, Optional)')}
            </label>
            <input
              id="gov-trim-threshold"
              type="number"
              min={10}
              step={1}
              value={memoryTrimThreshold}
              onChange={(e) => onMemoryTrimThresholdChange(e.target.value)}
              placeholder={t('governor.trimPlaceholder', 'e.g. 1024 (min 10 MB)')}
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-text-primary focus:outline-none focus:border-brand"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-[6px] bg-surface-subtle text-text-secondary hover:text-text-primary border border-border"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover shadow-sm"
            >
              {t('common.save', 'Save Rule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

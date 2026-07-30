import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Sparkles, Download, Clock, X, Calendar, ArrowRight } from 'lucide-react';

export interface ReleaseNotesModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function ReleaseNotesModal({ isOpen: propIsOpen, onClose: propOnClose }: ReleaseNotesModalProps = {}) {
  const { t } = useTranslation();
  const updateStatus = useAppStore((s) => s.updateStatus);
  const updateInfo = useAppStore((s) => s.updateInfo);
  const appVersion = useAppStore((s) => s.appVersion);
  const bannerDismissed = useAppStore((s) => s.bannerDismissed);
  const dismissUpdateBanner = useAppStore((s) => s.dismissUpdateBanner);
  const downloadAndInstallUpdate = useAppStore((s) => s.downloadAndInstallUpdate);

  const isModalVisible =
    propIsOpen !== undefined
      ? propIsOpen
      : updateStatus === 'available' && updateInfo !== null && !bannerDismissed;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalVisible) {
        if (propOnClose) {
          propOnClose();
        } else {
          dismissUpdateBanner();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalVisible, propOnClose, dismissUpdateBanner]);

  if (!isModalVisible || !updateInfo) {
    return null;
  }

  const handleDismiss = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      dismissUpdateBanner();
    }
  };

  const handleInstall = async () => {
    handleDismiss();
    await downloadAndInstallUpdate();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in select-none"
      onClick={handleDismiss}
    >
      <div
        className="max-w-2xl w-full bg-surface border border-border rounded-[8px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand-subtle text-brand flex items-center justify-center shrink-0 border border-brand/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text-primary">{t('update_modal.title', 'New Version Available')}</h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 bg-brand-subtle text-brand border border-brand/30 rounded-full font-medium">
                  v{updateInfo.currentVersion || appVersion} <ArrowRight className="h-3 w-3 inline text-brand" /> v{updateInfo.version}
                </span>
              </div>
              {updateInfo.date && (
                <div className="flex items-center gap-1 text-[11px] text-text-muted mt-0.5 font-mono">
                  <Calendar className="h-3 w-3" />
                  <span>Release Date: {updateInfo.date}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-text-muted hover:text-text-primary p-1.5 rounded-[4px] hover:bg-border transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content - Markdown Release Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-background space-y-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted pb-1 border-b border-border/60">
            Release Notes & Changelog
          </div>
          <MarkdownRenderer content={updateInfo.body || 'No release notes provided for this update.'} />
        </div>

        {/* Modal Actions Footer */}
        <div className="px-6 py-4 bg-surface border-t border-border flex items-center justify-between gap-3">
          <div className="text-[11px] text-text-muted hidden sm:block font-mono">
            WiScripts Utility Release Engine
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={handleDismiss}
              className="flex items-center gap-1.5 px-4 py-2 border border-border hover:bg-border text-text-secondary hover:text-text-primary rounded-[6px] font-medium transition-colors text-xs"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Remind Me Later</span>
            </button>
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-[6px] font-medium transition-colors text-xs shadow-md shadow-brand/20"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install Update Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

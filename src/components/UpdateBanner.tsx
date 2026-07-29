import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { Sparkles, Download, RefreshCw, X, Loader2, FileText } from 'lucide-react';

export function UpdateBanner() {
  const { t } = useTranslation();
  const updateStatus = useAppStore((s) => s.updateStatus);
  const updateInfo = useAppStore((s) => s.updateInfo);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const bannerDismissed = useAppStore((s) => s.bannerDismissed);
  const dismissUpdateBanner = useAppStore((s) => s.dismissUpdateBanner);
  const openReleaseNotesModal = useAppStore((s) => s.openReleaseNotesModal);
  const downloadAndInstallUpdate = useAppStore((s) => s.downloadAndInstallUpdate);

  if (
    bannerDismissed ||
    (updateStatus !== 'available' && updateStatus !== 'downloading' && updateStatus !== 'ready')
  ) {
    return null;
  }

  return (
    <div className="relative bg-surface-subtle border-b border-brand/40 px-4 py-2.5 flex items-center justify-between text-xs animate-fade-in select-none z-30">
      {/* Download progress line indicator at bottom edge */}
      {updateStatus === 'downloading' && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-brand transition-all duration-200"
          style={{ width: `${updateProgress}%` }}
        />
      )}

      <div className="flex items-center gap-3 min-w-0">
        <div className="h-6 w-6 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 truncate">
          <span className="font-semibold text-text-primary">
            {updateStatus === 'ready'
              ? t('update_banner.ready')
              : updateStatus === 'downloading'
              ? t('update_banner.downloading', { version: updateInfo?.version || 'new', progress: updateProgress })
              : t('update_banner.available', { version: updateInfo?.version || 'new' })}
          </span>
          <span className="text-text-muted ml-2 hidden sm:inline">
            {updateStatus === 'ready'
              ? t('update_banner.restart_desc')
              : updateStatus === 'downloading'
              ? t('update_banner.keep_open_desc')
              : t('update_banner.current_version', { currentVersion: updateInfo?.currentVersion || '0.3.0' })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {updateStatus === 'available' && (
          <>
            <button
              onClick={() => openReleaseNotesModal()}
              className="flex items-center gap-1.5 px-3 py-1 bg-surface-hover hover:bg-surface-active border border-border text-text-primary rounded-[6px] font-medium transition-colors text-xs"
            >
              <FileText className="h-3.5 w-3.5 text-brand" />
              <span>Release Notes</span>
            </button>
            <button
              onClick={() => downloadAndInstallUpdate()}
              className="flex items-center gap-1.5 px-3 py-1 bg-brand hover:bg-brand-hover text-white rounded-[6px] font-medium transition-colors text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t('update_banner.update_now')}</span>
            </button>
          </>
        )}

        {updateStatus === 'downloading' && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-active text-text-secondary rounded-[6px] text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            <span>{t('update_banner.downloading_progress', { progress: updateProgress })}</span>
          </div>
        )}

        {updateStatus === 'ready' && (
          <button
            onClick={() => downloadAndInstallUpdate()}
            className="flex items-center gap-1.5 px-3 py-1 bg-status-success hover:opacity-90 text-white rounded-[6px] font-medium transition-colors text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t('update_banner.restart_apply')}</span>
          </button>
        )}

        <button
          onClick={dismissUpdateBanner}
          className="text-text-muted hover:text-text-primary p-1 rounded transition-colors"
          aria-label={t('update_banner.dismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

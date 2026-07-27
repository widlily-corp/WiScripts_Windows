import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Sparkles, Download, RefreshCw, X, Loader2 } from 'lucide-react';

export function UpdateBanner() {
  const updateStatus = useAppStore((s) => s.updateStatus);
  const updateInfo = useAppStore((s) => s.updateInfo);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const bannerDismissed = useAppStore((s) => s.bannerDismissed);
  const dismissUpdateBanner = useAppStore((s) => s.dismissUpdateBanner);
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
              ? 'Update ready to install!'
              : updateStatus === 'downloading'
              ? `Downloading WiScripts v${updateInfo?.version || 'new'} (${updateProgress}%)`
              : `WiScripts v${updateInfo?.version || 'new'} is available`}
          </span>
          <span className="text-text-muted ml-2 hidden sm:inline">
            {updateStatus === 'ready'
              ? 'Restart application to finish updating.'
              : updateStatus === 'downloading'
              ? 'Please keep the application open.'
              : `Current version is v${updateInfo?.currentVersion || '0.3.0'}.`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {updateStatus === 'available' && (
          <button
            onClick={() => downloadAndInstallUpdate()}
            className="flex items-center gap-1.5 px-3 py-1 bg-brand hover:bg-brand-hover text-white rounded-[6px] font-medium transition-colors text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Update Now</span>
          </button>
        )}

        {updateStatus === 'downloading' && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-active text-text-secondary rounded-[6px] text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            <span>Downloading... {updateProgress}%</span>
          </div>
        )}

        {updateStatus === 'ready' && (
          <button
            onClick={() => downloadAndInstallUpdate()}
            className="flex items-center gap-1.5 px-3 py-1 bg-status-success hover:opacity-90 text-white rounded-[6px] font-medium transition-colors text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Restart & Apply</span>
          </button>
        )}

        <button
          onClick={dismissUpdateBanner}
          className="text-text-muted hover:text-text-primary p-1 rounded transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

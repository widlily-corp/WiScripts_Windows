import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Flame,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ConfirmModal } from '../common/ConfirmModal';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function ShaderNukerCard() {
  const { t } = useTranslation();

  const shaderSummary = useAppStore((s) => s.shaderSummary);
  const isScanningShaders = useAppStore((s) => s.isScanningShaders);
  const isNukingShaders = useAppStore((s) => s.isNukingShaders);
  const nukeResult = useAppStore((s) => s.nukeResult);
  const scanShaderCaches = useAppStore((s) => s.scanShaderCaches);
  const nukeShaderCaches = useAppStore((s) => s.nukeShaderCaches);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!shaderSummary) {
      scanShaderCaches();
    }
  }, [shaderSummary, scanShaderCaches]);

  const totalBytes = shaderSummary?.totalBytes ?? 0;
  const totalFiles = shaderSummary?.totalFiles ?? 0;
  const isHighCache = totalBytes > 1024 * 1024 * 1024; // > 1 GB

  const handleConfirmNuke = async () => {
    await nukeShaderCaches();
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-4 animate-fade-in select-none">
      {/* Top Banner Card */}
      <div className="p-4 rounded-xl border border-border bg-surface-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-brand/10 text-brand shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
              {t('shaderNuker.title', 'Shader Cache Nuker')}
              {isHighCache && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-status-warning/20 text-status-warning border border-status-warning/30">
                  <AlertTriangle className="w-3 h-3" /> {t('shaderNuker.heavyCache', 'Large Cache')}
                </span>
              )}
            </h3>
            <p className="text-xs text-text-muted mt-1 max-w-xl">
              {t(
                'shaderNuker.description',
                'Clear stale and fragmented DirectX 12, Vulkan, NVIDIA, AMD, and Unreal Engine shader caches to eliminate stuttering.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => scanShaderCaches()}
            disabled={isScanningShaders || isNukingShaders}
            className="px-3.5 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-xs font-medium text-text-primary flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanningShaders ? 'animate-spin text-brand' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </button>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isScanningShaders || isNukingShaders || totalFiles === 0}
            className="px-4 py-2 bg-status-danger/90 hover:bg-status-danger text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-status-danger/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isNukingShaders ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('shaderNuker.cleaning', 'Cleaning caches...')}
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                {t('shaderNuker.cleanButton', 'Clear Shader Caches')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-surface">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
            {t('shaderNuker.totalSize', 'Total Cache Size')}
          </span>
          <div className="text-lg font-bold text-text-primary mt-1 font-mono">
            {isScanningShaders ? (
              <span className="text-text-muted text-xs animate-pulse">{t('shaderNuker.scanning', 'Scanning...')}</span>
            ) : (
              formatBytes(totalBytes)
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
            {t('shaderNuker.cachedFiles', 'Cached Files')}
          </span>
          <div className="text-lg font-bold text-text-primary mt-1 font-mono">
            {isScanningShaders ? (
              <span className="text-text-muted text-xs animate-pulse">{t('shaderNuker.scanning', 'Scanning...')}</span>
            ) : (
              t('shaderNuker.filesCount', { count: totalFiles, formatted: totalFiles.toLocaleString(), defaultValue: `${totalFiles.toLocaleString()} files` })
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
            {t('shaderNuker.stutterImpact', 'Stutter Impact')}
          </span>
          <div className="text-xs font-semibold mt-1 flex items-center gap-1.5">
            {totalBytes > 1024 * 1024 * 500 ? (
              <span className="text-status-warning flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> {t('shaderNuker.cleanupRecommended', 'Cleanup recommended')}
              </span>
            ) : (
              <span className="text-status-success flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('shaderNuker.optimalState', 'Optimal state')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Result feedback notification */}
      {nukeResult && (
        <div className="p-3.5 rounded-xl bg-status-success/10 border border-status-success/20 text-xs text-text-primary flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block text-status-success">
              {t('shaderNuker.resultTitle', 'Shader caches cleared successfully!')}
            </span>
            <div className="text-text-muted text-[11px]">
              {t('shaderNuker.freedSummary', {
                size: formatBytes(nukeResult.bytesFreed),
                count: nukeResult.filesRemoved,
                defaultValue: `Freed: ${formatBytes(nukeResult.bytesFreed)} (${nukeResult.filesRemoved} files removed).`,
              })}
              {nukeResult.skippedLockedCount > 0 && (
                <span className="ml-1 text-text-muted">
                  • {t('shaderNuker.skippedLocked', {
                    count: nukeResult.skippedLockedCount,
                    defaultValue: `${nukeResult.skippedLockedCount} files locked by active GPU driver and safely skipped.`,
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cache Locations Grid */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          {t('shaderNuker.detectedStorages', 'Detected Shader Storages')}
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {shaderSummary?.entries.map((entry) => (
            <div
              key={entry.id}
              className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                entry.exists && entry.fileCount > 0
                  ? 'bg-surface border-border'
                  : 'bg-surface-subtle/40 border-border/50 opacity-60'
              }`}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-1.5 font-medium text-text-primary">
                  <span className="truncate">{entry.name}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-surface-hover text-text-muted">
                    {entry.vendor}
                  </span>
                </div>
                <div className="text-[10px] text-text-muted truncate mt-0.5 font-mono">
                  {entry.path}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono text-xs font-semibold text-text-primary">
                  {formatBytes(entry.sizeBytes)}
                </div>
                <div className="text-[10px] text-text-muted font-mono">
                  {t('shaderNuker.filesCount', { count: entry.fileCount, formatted: entry.fileCount.toLocaleString(), defaultValue: `${entry.fileCount} files` })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title={t('shaderNuker.confirmTitle', 'Clear Shader Caches?')}
        description={t('shaderNuker.confirmDesc', {
          size: formatBytes(totalBytes),
          count: totalFiles,
          defaultValue: `This will delete ${totalFiles.toLocaleString()} cached shader files (${formatBytes(totalBytes)}). Active GPU driver files in use will be skipped.`,
        })}
        confirmLabel={t('shaderNuker.cleanButton', 'Clear Shader Caches')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        isConfirming={isNukingShaders}
        onConfirm={handleConfirmNuke}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

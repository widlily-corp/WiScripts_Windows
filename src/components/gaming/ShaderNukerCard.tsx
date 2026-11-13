import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HardDrive,
  Info,
  Flame,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

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

  useEffect(() => {
    if (!shaderSummary) {
      scanShaderCaches();
    }
  }, [shaderSummary, scanShaderCaches]);

  const totalBytes = shaderSummary?.totalBytes ?? 0;
  const totalFiles = shaderSummary?.totalFiles ?? 0;
  const isHighCache = totalBytes > 1024 * 1024 * 1024; // > 1 GB

  const handleNukeAll = () => {
    nukeShaderCaches();
  };

  return (
    <div className="space-y-4 animate-fade-in select-none">
      {/* Top Banner Card */}
      <div className="p-4 rounded-xl border border-surface-border bg-surface-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-brand/10 text-brand shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
              {t('shaderNuker.title', 'Shader Cache Nuker — Ликвидатор статтеров')}
              {isHighCache && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-status-warning/20 text-status-warning border border-status-warning/30">
                  <AlertTriangle className="w-3 h-3" /> {t('shaderNuker.heavyCache', 'Большой объём')}
                </span>
              )}
            </h3>
            <p className="text-xs text-text-muted mt-1 max-w-xl">
              {t(
                'shaderNuker.description',
                'Удаление устаревших и фрагментированных кэшей DirectX 12, Vulkan, NVIDIA, AMD и Unreal Engine для устранения фризов и статтеров при загрузке ассетов в играх.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => scanShaderCaches()}
            disabled={isScanningShaders || isNukingShaders}
            className="px-3.5 py-2 bg-surface-base hover:bg-surface-highlight border border-surface-border rounded-lg text-xs font-medium text-text-primary flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanningShaders ? 'animate-spin text-brand' : ''}`} />
            {t('common.refresh', 'Сканировать')}
          </button>

          <button
            onClick={handleNukeAll}
            disabled={isScanningShaders || isNukingShaders || totalFiles === 0}
            className="px-4 py-2 bg-status-danger/90 hover:bg-status-danger text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-status-danger/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isNukingShaders ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('shaderNuker.cleaning', 'Очистка кэшей...')}
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                {t('shaderNuker.cleanButton', 'Очистить кэши шейдеров')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-surface-border bg-surface-base">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
            {t('shaderNuker.totalSize', 'Общий объём кэшей')}
          </span>
          <div className="text-lg font-bold text-text-primary mt-1 font-mono">
            {isScanningShaders ? (
              <span className="text-text-muted text-xs animate-pulse">Сканирование...</span>
            ) : (
              formatBytes(totalBytes)
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-surface-border bg-surface-base">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
            {t('shaderNuker.cachedFiles', 'Файлов кэша')}
          </span>
          <div className="text-lg font-bold text-text-primary mt-1 font-mono">
            {isScanningShaders ? (
              <span className="text-text-muted text-xs animate-pulse">Сканирование...</span>
            ) : (
              `${totalFiles.toLocaleString()} файлов`
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-surface-border bg-surface-base">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider block">
            {t('shaderNuker.stutterImpact', 'Влияние на статтеры')}
          </span>
          <div className="text-xs font-semibold mt-1 flex items-center gap-1.5">
            {totalBytes > 1024 * 1024 * 500 ? (
              <span className="text-status-warning flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> Рекомендуется очистка
              </span>
            ) : (
              <span className="text-status-success flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Оптимальное состояние
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
              {t('shaderNuker.resultTitle', 'Кэши шейдеров успешно очищены!')}
            </span>
            <div className="text-text-muted text-[11px]">
              Освобождено: <span className="font-semibold text-text-primary">{formatBytes(nukeResult.bytesFreed)}</span>{' '}
              ({nukeResult.filesRemoved} файлов удалено).
              {nukeResult.skippedLockedCount > 0 && (
                <span className="ml-1 text-text-muted">
                  • {nukeResult.skippedLockedCount} файлов заняты активным видеодрайвером и безопасно пропущены.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cache Locations Grid */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          {t('shaderNuker.detectedStorages', 'Обнаруженные хранилища шейдеров')}
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {shaderSummary?.entries.map((entry) => (
            <div
              key={entry.id}
              className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                entry.exists && entry.fileCount > 0
                  ? 'bg-surface-base border-surface-border'
                  : 'bg-surface-subtle/40 border-surface-border/50 opacity-60'
              }`}
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-1.5 font-medium text-text-primary">
                  <span className="truncate">{entry.name}</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-surface-highlight text-text-muted">
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
                  {entry.fileCount} файлов
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

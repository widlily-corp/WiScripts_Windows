import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { RestorePoint } from '../types';
import {
  RotateCcw,
  Plus,
  RefreshCw,
  History,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertTriangle,
  Calendar,
  Layers,
} from 'lucide-react';

export function RestorePointsView() {
  const { t } = useTranslation();
  const restorePoints = useAppStore((s) => s.restorePoints);
  const isLoading = useAppStore((s) => s.isLoadingRestorePoints);
  const fetchRestorePoints = useAppStore((s) => s.fetchRestorePoints);
  const createRestorePoint = useAppStore((s) => s.createRestorePoint);
  const restoreSystemToPoint = useAppStore((s) => s.restoreSystemToPoint);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const isExecuting = useAppStore((s) => s.isExecuting);

  const [newDescription, setNewDescription] = useState('');
  const [selectedPointForRollback, setSelectedPointForRollback] = useState<RestorePoint | null>(null);

  useEffect(() => {
    fetchRestorePoints();
  }, [fetchRestorePoints]);

  const isButtonDisabled = isExecuting || (!isElevated && !dryRunMode);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const desc = newDescription.trim();
    if (!desc || isButtonDisabled) return;

    openSafetyModal({
      title: t('restorePoints.modalCreateTitle'),
      description: t('restorePoints.modalCreateDesc', { desc }),
      riskLevel: 'low',
      commandsToRun: [`Checkpoint-Computer -Description '${desc}' -RestorePointType "MODIFY_SETTINGS"`],
      onConfirmAction: async () => {
        const summary = await createRestorePoint(desc);
        if (summary?.success) {
          setNewDescription('');
        }
      },
    });
  };

  const handleRollbackClick = (point: RestorePoint) => {
    if (isButtonDisabled) return;
    setSelectedPointForRollback(point);
  };

  const confirmRollback = async () => {
    if (!selectedPointForRollback) return;
    const point = selectedPointForRollback;
    setSelectedPointForRollback(null);

    openSafetyModal({
      title: t('restorePoints.modalRollbackTitle', { seq: point.sequenceNumber }),
      description: t('restorePoints.modalLiveWarning', { time: point.creationTime, desc: point.description }),
      riskLevel: 'high',
      commandsToRun: [`Restore-Computer -SequenceNumber ${point.sequenceNumber} -Confirm:$false`],
      onConfirmAction: async () => {
        await restoreSystemToPoint(point.sequenceNumber);
      },
    });
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">{t('restorePoints.title')}</h2>
          </div>
          <p className="text-xs text-text-secondary">
            {t('restorePoints.description')}
          </p>
        </div>
        <button
          onClick={() => fetchRestorePoints()}
          disabled={isLoading || isExecuting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('restorePoints.refreshBtn')}</span>
        </button>
      </div>

      {/* Admin Elevation Warning Banner */}
      <AdminElevationBanner featureName={t('restorePoints.title')} />

      {/* Status Card & Create Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Status Card */}
        <div className="lg:col-span-5 rounded-[6px] border border-border bg-surface p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary border-b border-border-subtle pb-2">
            <History className="h-4 w-4 text-brand" />
            <span>{t('restorePoints.statusTitle')}</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{t('restorePoints.activePoints')}</span>
              <span className="font-mono font-semibold text-text-primary">{restorePoints.length}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{t('restorePoints.elevationStatus')}</span>
              <span className={`flex items-center gap-1 font-medium ${isElevated ? 'text-status-success' : 'text-status-warning'}`}>
                {isElevated ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" /> {t('restorePoints.elevated')}
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5" /> {t('restorePoints.standard')}
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{t('restorePoints.executionMode')}</span>
              <span className="font-mono text-xs text-brand font-medium">
                {dryRunMode ? t('restorePoints.dryRunMode') : t('restorePoints.liveMode')}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Create Restore Point Form */}
        <div className="lg:col-span-7 rounded-[6px] border border-border bg-surface p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary border-b border-border-subtle pb-2">
            <Plus className="h-4 w-4 text-brand" />
            <span>{t('restorePoints.createTitle')}</span>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label htmlFor="restore-desc-input" className="text-[11px] font-medium text-text-secondary uppercase font-mono tracking-wider">
                {t('restorePoints.descLabel')}
              </label>
              <input
                id="restore-desc-input"
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder={t('restorePoints.descPlaceholder')}
                disabled={isButtonDisabled}
                className="mt-1.5 w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-xs text-text-primary focus:border-brand focus:outline-none disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={!newDescription.trim() || isButtonDisabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-xs font-medium transition-all shadow-sm ${
                !newDescription.trim() || isButtonDisabled
                  ? 'bg-surface-active text-text-muted cursor-not-allowed border border-border opacity-50'
                  : 'bg-brand text-white hover:bg-brand-hover'
              }`}
            >
              {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>{t('restorePoints.createBtn')}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Restore Points List Table */}
      <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand" />
            <span className="text-xs font-semibold text-text-primary">{t('restorePoints.checkpointsTitle')}</span>
          </div>
          <span className="text-[11px] font-mono text-text-muted">{t('restorePoints.totalPoints', { count: restorePoints.length })}</span>
        </div>

        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-text-muted space-y-2">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            <span className="text-xs">{t('restorePoints.loading')}</span>
          </div>
        ) : restorePoints.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-muted">
            {t('restorePoints.noPoints')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-subtle text-[11px] font-mono uppercase text-text-secondary">
                  <th className="py-2.5 px-3 font-medium">{t('restorePoints.colSeq')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('restorePoints.colDesc')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('restorePoints.colType')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('restorePoints.colTime')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('restorePoints.colAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-mono text-[11px]">
                {restorePoints.map((point) => (
                  <tr key={point.sequenceNumber} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="py-2.5 px-3 text-brand font-semibold tabular-nums">#{point.sequenceNumber}</td>
                    <td className="py-2.5 px-3 text-text-primary font-sans font-medium">{point.description}</td>
                    <td className="py-2.5 px-3 text-text-secondary">
                      <span className="px-2 py-0.5 rounded bg-surface-subtle border border-border-subtle text-[10px]">
                        {point.restorePointType || 'MODIFY_SETTINGS'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-text-muted tabular-nums">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {point.creationTime}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleRollbackClick(point)}
                        disabled={isButtonDisabled}
                        title={!isElevated && !dryRunMode ? t('restorePoints.adminRequiredRollback') : ''}
                        className="px-2.5 py-1 rounded border border-status-warning/40 bg-status-warningSubtle text-status-warning hover:bg-status-warning/20 transition-colors text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('restorePoints.rollbackBtn')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rollback Confirmation Modal */}
      {selectedPointForRollback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[6px] border border-border bg-surface p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5 text-status-warning border-b border-border pb-3">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-sm font-semibold">{t('restorePoints.modalRollbackTitle')}</h3>
            </div>

            <div className="space-y-2 text-xs text-text-secondary">
              <p>
                {t('restorePoints.modalRollbackDesc', { seq: selectedPointForRollback.sequenceNumber })}
              </p>
              <div className="rounded border border-border-subtle bg-surface-subtle p-3 space-y-1 font-mono text-[11px]">
                <div className="text-text-primary font-semibold">{selectedPointForRollback.description}</div>
                <div className="text-text-muted">{t('restorePoints.modalType', { type: selectedPointForRollback.restorePointType })}</div>
                <div className="text-text-muted">{t('restorePoints.modalCreated', { time: selectedPointForRollback.creationTime })}</div>
              </div>
              <p className="text-[11px] text-status-warning font-medium">
                {dryRunMode
                  ? t('restorePoints.modalDryRun')
                  : t('restorePoints.modalLive')}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setSelectedPointForRollback(null)}
                className="px-3 py-1.5 rounded border border-border bg-surface-subtle text-xs text-text-secondary hover:bg-surface-hover transition-colors"
              >
                {t('restorePoints.cancelBtn')}
              </button>
              <button
                onClick={confirmRollback}
                className="px-4 py-1.5 rounded bg-status-warning text-white text-xs font-medium hover:bg-status-warning/90 transition-colors shadow-sm"
              >
                {t('restorePoints.proceedBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

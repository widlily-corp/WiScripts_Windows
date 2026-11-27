import { useTranslation } from 'react-i18next';
import { RotateCcw, Trash2, ChevronDown, ChevronUp, Database, Server } from 'lucide-react';
import { SystemStateSnapshot } from '../../types/stateEngine';

interface SnapshotCardProps {
  snapshot: SystemStateSnapshot;
  isExpanded: boolean;
  isConfirmingRollback: boolean;
  isRollbacking: boolean;
  onToggleExpand: () => void;
  onStartRollbackConfirm: () => void;
  onCancelRollbackConfirm: () => void;
  onConfirmRollback: () => void;
  onRequestDelete: () => void;
}

export function SnapshotCard({
  snapshot,
  isExpanded,
  isConfirmingRollback,
  isRollbacking,
  onToggleExpand,
  onStartRollbackConfirm,
  onCancelRollbackConfirm,
  onConfirmRollback,
  onRequestDelete,
}: SnapshotCardProps) {
  const { t } = useTranslation();

  const formatDate = (timestampSec: number) => new Date(timestampSec * 1000).toLocaleString();

  return (
    <div className="rounded-[6px] border border-border bg-surface hover:border-border-focus/40 transition-colors p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{snapshot.label}</span>
            <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase font-semibold bg-surface-active text-brand border border-border">
              {snapshot.triggerSource}
            </span>
            <span className="text-[11px] font-mono text-text-muted">{snapshot.id}</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-text-muted">
            <span>{formatDate(snapshot.timestamp)}</span>
            <span className="flex items-center gap-1 font-mono">
              <Database className="h-3 w-3 text-text-muted" />
              {snapshot.registryDeltas.length} {t('stateEngine.keysUnit', 'keys')}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Server className="h-3 w-3 text-text-muted" />
              {snapshot.serviceDeltas.length} {t('stateEngine.svcsUnit', 'services')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            aria-label={t('stateEngine.inspectAria', 'Inspect Snapshot Deltas')}
            className="px-2.5 py-1.5 text-xs rounded-[6px] border border-border bg-surface-subtle hover:bg-surface-hover text-text-secondary flex items-center gap-1.5 transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>
              {isExpanded
                ? t('stateEngine.hideDetails', 'Hide Deltas')
                : t('stateEngine.inspectDeltas', 'Inspect Deltas')}
            </span>
          </button>

          {isConfirmingRollback ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onConfirmRollback}
                disabled={isRollbacking}
                aria-label={t('stateEngine.confirmRollbackAria', 'Confirm Rollback Action')}
                className="px-3 py-1.5 text-xs font-semibold rounded-[6px] bg-status-warning text-white hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isRollbacking ? 'animate-spin' : ''}`} />
                <span>
                  {isRollbacking
                    ? t('stateEngine.restoring', 'Restoring...')
                    : t('stateEngine.confirm', 'Confirm Undo')}
                </span>
              </button>
              <button
                type="button"
                onClick={onCancelRollbackConfirm}
                disabled={isRollbacking}
                className="px-2.5 py-1.5 text-xs rounded-[6px] border border-border text-text-muted hover:text-text-primary"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartRollbackConfirm}
              aria-label={t('stateEngine.rollbackAria', 'Trigger Rollback')}
              className="px-3 py-1.5 text-xs font-semibold rounded-[6px] border border-brand/40 text-brand bg-brand/10 hover:bg-brand/20 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t('stateEngine.rollbackBtn', 'Surgical Rollback')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRequestDelete}
            aria-label={t('stateEngine.deleteAria', 'Delete Snapshot')}
            className="p-1.5 text-text-muted hover:text-status-danger hover:bg-surface-hover rounded-[6px] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-4 text-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-text-primary font-semibold text-[11px]">
              <Database className="h-3.5 w-3.5 text-brand" />
              <span>
                {t('stateEngine.registryDeltasTitle', 'Captured Registry Values ({{count}})', {
                  count: snapshot.registryDeltas.length,
                })}
              </span>
            </div>
            <div className="rounded-[6px] border border-border bg-surface-subtle overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-surface text-text-muted text-[10px] uppercase">
                    <th className="p-2 font-medium">{t('stateEngine.colKeyPath', 'Key Path')}</th>
                    <th className="p-2 font-medium">{t('stateEngine.colValueName', 'Value Name')}</th>
                    <th className="p-2 font-medium">{t('stateEngine.colType', 'Type')}</th>
                    <th className="p-2 font-medium">{t('stateEngine.colPreviousData', 'Previous Data')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {snapshot.registryDeltas.map((reg, idx) => (
                    <tr key={idx} className="hover:bg-surface-hover/50">
                      <td className="p-2 text-text-secondary truncate max-w-xs" title={reg.keyPath}>
                        {reg.keyPath}
                      </td>
                      <td className="p-2 text-text-primary font-medium">{reg.valueName}</td>
                      <td className="p-2 text-text-muted">{reg.valueType}</td>
                      <td className="p-2">
                        {reg.previousData !== null ? (
                          <span className="text-status-success">{reg.previousData}</span>
                        ) : (
                          <span className="text-text-muted italic">
                            {t('stateEngine.notSet', '(Not set / Deleted)')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-text-primary font-semibold text-[11px]">
              <Server className="h-3.5 w-3.5 text-brand" />
              <span>
                {t('stateEngine.serviceDeltasTitle', 'Captured Services ({{count}})', {
                  count: snapshot.serviceDeltas.length,
                })}
              </span>
            </div>
            <div className="rounded-[6px] border border-border bg-surface-subtle overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-surface text-text-muted text-[10px] uppercase">
                    <th className="p-2 font-medium">{t('stateEngine.colServiceName', 'Service Name')}</th>
                    <th className="p-2 font-medium">{t('stateEngine.colStartupType', 'Startup Type')}</th>
                    <th className="p-2 font-medium">{t('stateEngine.colStatus', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {snapshot.serviceDeltas.map((svc, idx) => (
                    <tr key={idx} className="hover:bg-surface-hover/50">
                      <td className="p-2 text-text-primary font-medium">{svc.serviceName}</td>
                      <td className="p-2 text-text-secondary">{svc.previousStartupType}</td>
                      <td className="p-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            svc.previousStatus === 'Running'
                              ? 'bg-status-success/15 text-status-success'
                              : 'bg-surface text-text-muted'
                          }`}
                        >
                          {svc.previousStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

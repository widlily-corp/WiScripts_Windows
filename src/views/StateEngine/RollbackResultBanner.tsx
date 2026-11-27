import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { RollbackResult } from '../../types/stateEngine';

interface RollbackResultBannerProps {
  result: RollbackResult;
  onDismiss: () => void;
}

export function RollbackResultBanner({ result, onDismiss }: RollbackResultBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`p-4 rounded-[6px] border text-xs space-y-2 ${
        result.success
          ? 'border-status-success/30 bg-status-success/10 text-text-primary'
          : 'border-status-warning/30 bg-status-warning/10 text-text-primary'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          {result.success ? (
            <CheckCircle2 className="h-4 w-4 text-status-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-status-warning" />
          )}
          <span>
            {result.success
              ? t('stateEngine.rollbackSuccess', 'Surgical Rollback Completed Successfully')
              : t('stateEngine.rollbackPartial', 'Surgical Rollback Completed with Errors')}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-text-muted hover:text-text-primary font-mono px-1"
          aria-label={t('stateEngine.dismissResult', 'Dismiss Rollback Result')}
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-[11px] pt-1">
        <div>
          <span className="text-text-muted">{t('stateEngine.snapshotId', 'Snapshot ID:')}</span>{' '}
          <strong className="text-text-primary">{result.snapshotId}</strong>
        </div>
        <div>
          <span className="text-text-muted">{t('stateEngine.restoredKeys', 'Restored Keys:')}</span>{' '}
          <strong className="text-status-success">{result.restoredKeysCount}</strong>
        </div>
        <div>
          <span className="text-text-muted">{t('stateEngine.restoredSvcs', 'Restored Services:')}</span>{' '}
          <strong className="text-status-success">{result.restoredServicesCount}</strong>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
          <span className="font-semibold text-status-danger">
            {t('stateEngine.errorsCount', 'Encountered {{count}} Errors:', { count: result.errors.length })}
          </span>
          <ul className="list-disc list-inside font-mono text-[10px] text-status-danger space-y-0.5 max-h-24 overflow-y-auto">
            {result.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

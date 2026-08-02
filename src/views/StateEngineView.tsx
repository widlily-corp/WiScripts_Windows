import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import {
  RotateCcw,
  Plus,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Database,
  Server,
  CheckCircle2,
  AlertTriangle,
  History,
  Shield,
  Layers,
} from 'lucide-react';
import {
  SystemStateSnapshot,
  RollbackResult,
  StateSnapshotSource,
  isStateSnapshotSource,
} from '../types/stateEngine';
import { useAppStore } from '../store/useAppStore';
import { getErrorMessage } from '../utils';

export function StateEngineView() {
  const { t } = useTranslation();
  const addLog = useAppStore((s) => s.addLog);
  const addToast = useAppStore((s) => s.addToast);

  const [snapshots, setSnapshots] = useState<SystemStateSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newSource, setNewSource] = useState<StateSnapshotSource>('user_manual');
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);

  const [rollbackResult, setRollbackResult] = useState<RollbackResult | null>(null);
  const [isRollbacking, setIsRollbacking] = useState(false);
  const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null);

  const fetchSnapshots = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<SystemStateSnapshot[]>('list_state_snapshots');
      setSnapshots(data);
      addLog({
        level: 'info',
        message: `Loaded ${data.length} system state snapshots via IPC.`,
      });
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to list state snapshots: ${msg}`,
      });
      addToast({
        type: 'error',
        title: t('stateEngine.toasts.fetchErrorTitle', 'Failed to Fetch Snapshots'),
        message: msg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const handleCreateSnapshot = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsCreating(true);
    try {
      const created = await invoke<SystemStateSnapshot>('create_state_snapshot', {
        label: newLabel.trim() || t('stateEngine.defaultLabel', 'Manual System Snapshot'),
        triggerSource: newSource,
      });
      addLog({
        level: 'info',
        message: `Created snapshot '${created.id}' (${created.label}). Captured ${created.registryDeltas.length} reg keys, ${created.serviceDeltas.length} services.`,
      });
      addToast({
        type: 'success',
        title: t('stateEngine.toasts.createSuccessTitle', 'State Snapshot Captured'),
        message: t('stateEngine.toasts.createSuccessMsg', 'Snapshot {{id}} saved successfully.', { id: created.id }),
      });
      setNewLabel('');
      await fetchSnapshots();
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to create state snapshot: ${msg}`,
      });
      addToast({
        type: 'error',
        title: t('stateEngine.toasts.createErrorTitle', 'Snapshot Creation Failed'),
        message: msg,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRollbackSnapshot = async (snapshotId: string) => {
    setIsRollbacking(true);
    setRollbackResult(null);
    try {
      const res = await invoke<RollbackResult>('rollback_state_snapshot', {
        snapshotId,
      });
      setRollbackResult(res);
      addLog({
        level: res.success ? 'info' : 'warn',
        message: `Surgical rollback completed for '${snapshotId}': Restored ${res.restoredKeysCount} keys, ${res.restoredServicesCount} services. Success=${res.success}`,
      });
      addToast({
        type: res.success ? 'success' : 'warning',
        title: res.success
          ? t('stateEngine.toasts.rollbackSuccessTitle', 'Surgical Rollback Complete')
          : t('stateEngine.toasts.rollbackPartialTitle', 'Rollback Completed with Warnings'),
        message: t('stateEngine.toasts.rollbackMsg', 'Restored {{keys}} registry keys and {{svcs}} services.', {
          keys: res.restoredKeysCount,
          svcs: res.restoredServicesCount,
        }),
      });
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to execute rollback for snapshot ${snapshotId}: ${msg}`,
      });
      addToast({
        type: 'error',
        title: t('stateEngine.toasts.rollbackErrorTitle', 'Rollback Execution Failed'),
        message: msg,
      });
    } finally {
      setIsRollbacking(false);
      setConfirmRollbackId(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    try {
      await invoke<boolean>('delete_state_snapshot', { snapshotId });
      addLog({
        level: 'info',
        message: `Deleted state snapshot '${snapshotId}'.`,
      });
      addToast({
        type: 'info',
        title: t('stateEngine.toasts.deleteSuccessTitle', 'Snapshot Deleted'),
        message: t('stateEngine.toasts.deleteSuccessMsg', 'Snapshot {{id}} removed from disk.', { id: snapshotId }),
      });
      await fetchSnapshots();
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to delete snapshot ${snapshotId}: ${msg}`,
      });
    }
  };

  const formatDate = (timestampSec: number) => {
    return new Date(timestampSec * 1000).toLocaleString();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-text-primary">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <History className="h-6 w-6 text-brand" />
            <h1 className="text-xl font-bold tracking-tight">
              {t('stateEngine.title', 'StateEngine & Surgical Undo Engine')}
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-1 max-w-2xl">
            {t(
              'stateEngine.description',
              'Capture granular system registry & service status checkpoints. Perform surgical undo operations without affecting unrelated system components.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand shrink-0" />
            <span>
              {t('stateEngine.totalSnapshots', 'Snapshots:')}{' '}
              <strong className="font-mono text-text-primary">{snapshots.length}</strong>
            </span>
          </div>
          <button
            onClick={fetchSnapshots}
            disabled={isLoading}
            aria-label={t('stateEngine.refreshAria', 'Refresh Snapshots List')}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-text-muted ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh', 'Refresh')}</span>
          </button>
        </div>
      </div>

      {/* Capture Snapshot Form Card */}
      <div className="rounded-[6px] border border-border bg-surface p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold">
            {t('stateEngine.createCardTitle', 'Capture New System Snapshot')}
          </h2>
        </div>

        <form onSubmit={handleCreateSnapshot} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('stateEngine.labelPlaceholder', 'e.g. Pre-Optimization System Checkpoint')}
            aria-label={t('stateEngine.labelAria', 'Snapshot Label Input')}
            className="flex-1 px-3 py-2 text-xs rounded-[6px] border border-border bg-surface-subtle focus:outline-none focus:border-border-focus text-text-primary placeholder:text-text-muted"
          />

          <select
            value={newSource}
            onChange={(e) => {
              const val = e.target.value;
              if (isStateSnapshotSource(val)) {
                setNewSource(val);
              }
            }}
            aria-label={t('stateEngine.sourceAria', 'Select Trigger Source')}
            className="px-3 py-2 text-xs rounded-[6px] border border-border bg-surface-subtle text-text-primary focus:outline-none focus:border-border-focus"
          >
            <option value="user_manual">{t('stateEngine.sourceManual', 'User Manual')}</option>
            <option value="pre_optimization">{t('stateEngine.sourcePreOpt', 'Pre-Optimization')}</option>
            <option value="scheduled">{t('stateEngine.sourceScheduled', 'Scheduled')}</option>
          </select>

          <button
            type="submit"
            disabled={isCreating}
            aria-label={t('stateEngine.createBtnAria', 'Capture Snapshot Button')}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-[6px] bg-brand text-white hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
          >
            {isCreating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span>{isCreating ? t('stateEngine.capturing', 'Capturing...') : t('stateEngine.captureBtn', 'Capture Snapshot')}</span>
          </button>
        </form>
      </div>

      {/* Rollback Result Banner */}
      {rollbackResult && (
        <div
          className={`p-4 rounded-[6px] border text-xs space-y-2 ${
            rollbackResult.success
              ? 'border-status-success/30 bg-status-success/10 text-text-primary'
              : 'border-status-warning/30 bg-status-warning/10 text-text-primary'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              {rollbackResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-status-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-status-warning" />
              )}
              <span>
                {rollbackResult.success
                  ? t('stateEngine.rollbackSuccess', 'Surgical Rollback Completed Successfully')
                  : t('stateEngine.rollbackPartial', 'Surgical Rollback Completed with Errors')}
              </span>
            </div>
            <button
              onClick={() => setRollbackResult(null)}
              className="text-text-muted hover:text-text-primary font-mono"
              aria-label={t('stateEngine.dismissResult', 'Dismiss Rollback Result')}
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-[11px] pt-1">
            <div>
              <span className="text-text-muted">{t('stateEngine.snapshotId', 'Snapshot ID:')}</span>{' '}
              <strong className="text-text-primary">{rollbackResult.snapshotId}</strong>
            </div>
            <div>
              <span className="text-text-muted">{t('stateEngine.restoredKeys', 'Restored Keys:')}</span>{' '}
              <strong className="text-status-success">{rollbackResult.restoredKeysCount}</strong>
            </div>
            <div>
              <span className="text-text-muted">{t('stateEngine.restoredSvcs', 'Restored Services:')}</span>{' '}
              <strong className="text-status-success">{rollbackResult.restoredServicesCount}</strong>
            </div>
          </div>

          {rollbackResult.errors.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
              <span className="font-semibold text-status-error">{t('stateEngine.errorsCount', 'Encountered {{count}} Errors:', { count: rollbackResult.errors.length })}</span>
              <ul className="list-disc list-inside font-mono text-[10px] text-status-error space-y-0.5 max-h-24 overflow-y-auto">
                {rollbackResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Snapshot List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <History className="h-4 w-4 text-text-muted" />
          <span>{t('stateEngine.availableSnapshots', 'Available State Snapshots')}</span>
        </h2>

        {snapshots.length === 0 ? (
          <div className="rounded-[6px] border border-border bg-surface p-8 text-center space-y-2">
            <History className="h-8 w-8 text-text-muted mx-auto opacity-50" />
            <p className="text-xs text-text-muted">
              {t('stateEngine.noSnapshots', 'No state snapshots captured yet.')}
            </p>
            <p className="text-[11px] text-text-muted">
              {t('stateEngine.noSnapshotsPrompt', 'Use the form above to capture your first system state checkpoint.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snap) => {
              const isExpanded = expandedSnapshotId === snap.id;
              const isConfirming = confirmRollbackId === snap.id;

              return (
                <div
                  key={snap.id}
                  className="rounded-[6px] border border-border bg-surface hover:border-border-focus/40 transition-colors p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-semibold text-text-primary">{snap.label}</span>
                        <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono uppercase font-semibold bg-surface-active text-brand border border-border">
                          {snap.triggerSource}
                        </span>
                        <span className="text-[11px] font-mono text-text-muted">{snap.id}</span>
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-text-muted">
                        <span>{formatDate(snap.timestamp)}</span>
                        <span className="flex items-center gap-1 font-mono">
                          <Database className="h-3 w-3 text-text-muted" />
                          {snap.registryDeltas.length} {t('stateEngine.keysUnit', 'keys')}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Server className="h-3 w-3 text-text-muted" />
                          {snap.serviceDeltas.length} {t('stateEngine.svcsUnit', 'services')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedSnapshotId(isExpanded ? null : snap.id)}
                        aria-label={t('stateEngine.inspectAria', 'Inspect Snapshot Deltas')}
                        className="px-2.5 py-1.5 text-xs rounded-[6px] border border-border bg-surface-subtle hover:bg-surface-hover text-text-secondary flex items-center gap-1.5 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        <span>{isExpanded ? t('stateEngine.hideDetails', 'Hide Deltas') : t('stateEngine.inspectDeltas', 'Inspect Deltas')}</span>
                      </button>

                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRollbackSnapshot(snap.id)}
                            disabled={isRollbacking}
                            aria-label={t('stateEngine.confirmRollbackAria', 'Confirm Rollback Action')}
                            className="px-3 py-1.5 text-xs font-semibold rounded-[6px] bg-status-warning text-white hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <RotateCcw className={`h-3.5 w-3.5 ${isRollbacking ? 'animate-spin' : ''}`} />
                            <span>{isRollbacking ? t('stateEngine.restoring', 'Restoring...') : t('stateEngine.confirm', 'Confirm Undo')}</span>
                          </button>
                          <button
                            onClick={() => setConfirmRollbackId(null)}
                            disabled={isRollbacking}
                            className="px-2.5 py-1.5 text-xs rounded-[6px] border border-border text-text-muted hover:text-text-primary"
                          >
                            {t('common.cancel', 'Cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRollbackId(snap.id)}
                          aria-label={t('stateEngine.rollbackAria', 'Trigger Rollback')}
                          className="px-3 py-1.5 text-xs font-semibold rounded-[6px] border border-brand/40 text-brand bg-brand/10 hover:bg-brand/20 transition-colors flex items-center gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>{t('stateEngine.rollbackBtn', 'Surgical Rollback')}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteSnapshot(snap.id)}
                        aria-label={t('stateEngine.deleteAria', 'Delete Snapshot')}
                        className="p-1.5 text-text-muted hover:text-status-error hover:bg-surface-hover rounded-[6px] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Deltas Detail View */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-4 text-xs">
                      {/* Registry Deltas */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-text-primary font-semibold text-[11px]">
                          <Database className="h-3.5 w-3.5 text-brand" />
                          <span>{t('stateEngine.registryDeltasTitle', 'Captured Registry Values ({{count}})', { count: snap.registryDeltas.length })}</span>
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
                              {snap.registryDeltas.map((reg, idx) => (
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
                                      <span className="text-text-muted italic">{t('stateEngine.notSet', '(Not set / Deleted)')}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Service Deltas */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-text-primary font-semibold text-[11px]">
                          <Server className="h-3.5 w-3.5 text-brand" />
                          <span>{t('stateEngine.serviceDeltasTitle', 'Captured Services ({{count}})', { count: snap.serviceDeltas.length })}</span>
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
                              {snap.serviceDeltas.map((svc, idx) => (
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}

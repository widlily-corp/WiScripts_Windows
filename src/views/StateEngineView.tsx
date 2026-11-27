import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw, History, Shield, Layers } from 'lucide-react';
import {
  SystemStateSnapshot,
  RollbackResult,
  StateSnapshotSource,
  isStateSnapshotSource,
} from '../types/stateEngine';
import { useAppStore } from '../store/useAppStore';
import { getErrorMessage } from '../utils';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { RollbackResultBanner } from './StateEngine/RollbackResultBanner';
import { SnapshotCard } from './StateEngine/SnapshotCard';

export function StateEngineView() {
  const { t } = useTranslation();
  const addLog = useAppStore((s) => s.addLog);
  const addToast = useAppStore((s) => s.addToast);

  const [snapshots, setSnapshots] = useState<SystemStateSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newSource, setNewSource] = useState<StateSnapshotSource>('user_manual');
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);

  const [rollbackResult, setRollbackResult] = useState<RollbackResult | null>(null);
  const [isRollbacking, setIsRollbacking] = useState(false);
  const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null);
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState<SystemStateSnapshot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSnapshots = useCallback(async () => {
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
  }, [addLog, addToast, t]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

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
        message: t('stateEngine.toasts.createSuccessMsg', 'Snapshot {{id}} saved successfully.', {
          id: created.id,
        }),
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
      const res = await invoke<RollbackResult>('rollback_state_snapshot', { snapshotId });
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

  const handleConfirmDeleteSnapshot = async () => {
    if (!pendingDeleteSnapshot) return;
    const snapshotId = pendingDeleteSnapshot.id;
    setIsDeleting(true);
    try {
      await invoke<boolean>('delete_state_snapshot', { snapshotId });
      addLog({
        level: 'info',
        message: `Deleted state snapshot '${snapshotId}'.`,
      });
      addToast({
        type: 'info',
        title: t('stateEngine.toasts.deleteSuccessTitle', 'Snapshot Deleted'),
        message: t('stateEngine.toasts.deleteSuccessMsg', 'Snapshot {{id}} removed from disk.', {
          id: snapshotId,
        }),
      });
      setPendingDeleteSnapshot(null);
      await fetchSnapshots();
    } catch (err) {
      const msg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to delete snapshot ${snapshotId}: ${msg}`,
      });
      addToast({
        type: 'error',
        title: t('stateEngine.toasts.deleteErrorTitle', 'Snapshot Deletion Failed'),
        message: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-text-primary">
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
            type="button"
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
            {isCreating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>
              {isCreating ? t('stateEngine.capturing', 'Capturing...') : t('stateEngine.captureBtn', 'Capture Snapshot')}
            </span>
          </button>
        </form>
      </div>

      {rollbackResult && (
        <RollbackResultBanner result={rollbackResult} onDismiss={() => setRollbackResult(null)} />
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <History className="h-4 w-4 text-text-muted" />
          <span>{t('stateEngine.availableSnapshots', 'Available State Snapshots')}</span>
        </h2>

        {isLoading && snapshots.length === 0 ? (
          <div className="rounded-[6px] border border-border bg-surface p-8 text-center space-y-2">
            <RefreshCw className="h-7 w-7 text-brand mx-auto animate-spin" />
            <p className="text-xs text-text-muted">
              {t('stateEngine.loadingSnapshots', 'Loading system state snapshots...')}
            </p>
          </div>
        ) : snapshots.length === 0 ? (
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
            {snapshots.map((snap) => (
              <SnapshotCard
                key={snap.id}
                snapshot={snap}
                isExpanded={expandedSnapshotId === snap.id}
                isConfirmingRollback={confirmRollbackId === snap.id}
                isRollbacking={isRollbacking}
                onToggleExpand={() => setExpandedSnapshotId(expandedSnapshotId === snap.id ? null : snap.id)}
                onStartRollbackConfirm={() => setConfirmRollbackId(snap.id)}
                onCancelRollbackConfirm={() => setConfirmRollbackId(null)}
                onConfirmRollback={() => handleRollbackSnapshot(snap.id)}
                onRequestDelete={() => setPendingDeleteSnapshot(snap)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={pendingDeleteSnapshot !== null}
        title={t('stateEngine.confirmDeleteTitle', 'Delete State Snapshot?')}
        description={
          pendingDeleteSnapshot
            ? t(
                'stateEngine.confirmDeleteDesc',
                'Permanently delete snapshot "{{label}}" ({{id}})? You will no longer be able to perform surgical rollback to this checkpoint.',
                { label: pendingDeleteSnapshot.label, id: pendingDeleteSnapshot.id }
              )
            : ''
        }
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        isConfirming={isDeleting}
        onConfirm={handleConfirmDeleteSnapshot}
        onClose={() => setPendingDeleteSnapshot(null)}
      />
    </div>
  );
}

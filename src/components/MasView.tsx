import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { MasMethod, ExecutionSummary } from '../types';
import { KeyRound, ShieldCheck, ShieldAlert, Sparkles, CheckCircle2, Info, Lock, Play, Loader2 } from 'lucide-react';

export function MasView() {
  const { t } = useTranslation();
  const selectedMasMethod = useAppStore((s) => s.selectedMasMethod);
  const setSelectedMasMethod = useAppStore((s) => s.setSelectedMasMethod);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const addLog = useAppStore((s) => s.addLog);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const setIsExecuting = useAppStore((s) => s.setIsExecuting);

  const ACTIVATION_METHODS = [
    {
      id: 'HWID' as MasMethod,
      name: t('mas.methodHwidName'),
      badge: t('mas.methodHwidBadge'),
      scope: t('mas.methodHwidScope'),
      description: t('mas.methodHwidDesc'),
      features: [
        t('mas.methodHwidFeat1'),
        t('mas.methodHwidFeat2'),
        t('mas.methodHwidFeat3'),
      ],
      command: 'irm https://get.activated.win | iex /HWID',
    },
    {
      id: 'Ohook' as MasMethod,
      name: t('mas.methodOhookName'),
      badge: t('mas.methodOhookBadge'),
      scope: t('mas.methodOhookScope'),
      description: t('mas.methodOhookDesc'),
      features: [
        t('mas.methodOhookFeat1'),
        t('mas.methodOhookFeat2'),
        t('mas.methodOhookFeat3'),
      ],
      command: 'irm https://get.activated.win | iex /Ohook',
    },
    {
      id: 'KMS38' as MasMethod,
      name: t('mas.methodKms38Name'),
      badge: t('mas.methodKms38Badge'),
      scope: t('mas.methodKms38Scope'),
      description: t('mas.methodKms38Desc'),
      features: [
        t('mas.methodKms38Feat1'),
        t('mas.methodKms38Feat2'),
        t('mas.methodKms38Feat3'),
      ],
      command: 'irm https://get.activated.win | iex /KMS38',
    },
  ];

  const activeMethodDetail = ACTIVATION_METHODS.find((m) => m.id === selectedMasMethod) || ACTIVATION_METHODS[0];

  const isButtonDisabled = isExecuting || (!isElevated && !dryRunMode);

  const handleActivate = () => {
    if (isButtonDisabled) return;

    openSafetyModal({
      title: t('mas.modalTitle', { method: selectedMasMethod }),
      description: t('mas.modalDesc', {
        method: selectedMasMethod,
        scope: activeMethodDetail.scope,
        status: dryRunMode ? 'ACTIVE' : 'DISABLED'
      }),
      riskLevel: 'critical',
      commandsToRun: [activeMethodDetail.command],
      onConfirmAction: async () => {
        setIsExecuting(true);
        const currentDryRun = useAppStore.getState().dryRunMode;
        addLog({
          level: 'cmd',
          message: `Invoking IPC: execute_activation (method: ${selectedMasMethod}, dryRun: ${currentDryRun})`,
          commandExecuted: activeMethodDetail.command,
        });
        try {
          const summary = await invoke<ExecutionSummary>('execute_activation', {
            method: selectedMasMethod,
            dryRun: currentDryRun,
          });

          addLog({
            level: summary.success ? 'info' : 'error',
            message: `MAS Activation Complete. Success=${summary.success}, Duration=${summary.totalDurationMs}ms, DryRun=${summary.isDryRun}`,
          });

          summary.executedActions.forEach((action) => {
            addLog({
              level: action.output.exitCode === 0 ? 'info' : 'error',
              message: `Activation Task [${action.name}]: ${
                action.output.stdout.trim() || action.output.stderr.trim() || 'Method executed'
              }`,
              commandExecuted: action.command,
            });
          });

          if (!summary.success) {
            const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
            const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'MAS activation returned failure status';
            useAppStore.getState().addToast({
              type: 'error',
              title: t('mas.toastFailTitle'),
              message: errMsg,
            });
          } else {
            useAppStore.getState().addToast({
              type: 'success',
              title: t('mas.toastSuccessTitle'),
              message: t('mas.toastSuccessMsg', { method: selectedMasMethod }),
            });
          }
        } catch (err) {
          const errMsg = typeof err === 'string' ? err : String(err);
          addLog({
            level: 'error',
            message: `IPC execute_activation failed: ${errMsg}`,
          });
          useAppStore.getState().addToast({
            type: 'error',
            title: t('mas.toastErrorTitle'),
            message: errMsg,
          });
        } finally {
          setIsExecuting(false);
        }
      },
    });
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">{t('mas.title')}</h2>
          </div>
          <p className="text-xs text-text-secondary">
            {t('mas.description')}
          </p>
        </div>
        <button
          onClick={handleActivate}
          disabled={isButtonDisabled}
          title={!isElevated && !dryRunMode ? t('mas.adminRequiredTitle') : ''}
          className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-xs font-medium text-white transition-opacity shadow-sm ${
            isButtonDisabled
              ? 'bg-surface-active text-text-muted cursor-not-allowed border border-border opacity-50'
              : 'bg-brand hover:bg-brand-hover'
          }`}
        >
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          <span>{isExecuting ? t('mas.activatingBtn', { method: selectedMasMethod }) : t('mas.activateBtn', { method: selectedMasMethod })}</span>
        </button>
      </div>

      {/* Admin Elevation Warning Banner */}
      <AdminElevationBanner featureName={t('mas.title')} />

      {/* Activation Method Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ACTIVATION_METHODS.map((method) => {
          const isSelected = selectedMasMethod === method.id;
          return (
            <div
              key={method.id}
              onClick={() => {
                if (!isExecuting) setSelectedMasMethod(method.id);
              }}
              className={`rounded-[6px] border p-4 space-y-3 transition-colors ${
                isExecuting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              } ${
                isSelected
                  ? 'border-brand/70 bg-brand-subtle'
                  : 'border-border bg-surface hover:bg-surface-hover'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-text-muted">{method.scope}</span>
                <span
                  className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-[4px] border ${
                    isSelected
                      ? 'border-brand/40 bg-brand/20 text-brand'
                      : 'border-border-subtle bg-surface-subtle text-text-secondary'
                  }`}
                >
                  {method.badge}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{method.name}</h3>
                <p className="text-xs text-text-secondary mt-1 line-clamp-2">{method.description}</p>
              </div>
              <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-[11px] font-mono">
                <span className={isSelected ? 'text-brand font-medium' : 'text-text-muted'}>
                  {t('mas.methodPrefix', { id: method.id })}
                </span>
                <input
                  type="radio"
                  name="mas_method"
                  checked={isSelected}
                  disabled={isExecuting}
                  onChange={() => {
                    if (!isExecuting) setSelectedMasMethod(method.id);
                  }}
                  className="h-4 w-4 border-border text-brand focus:ring-brand disabled:cursor-not-allowed"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Method Details Panel */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-text-primary">
              {t('mas.detailsTitle', { name: activeMethodDetail.name })}
            </h3>
          </div>
          <span className="text-xs font-mono text-text-muted">{t('mas.idLabel', { id: activeMethodDetail.id })}</span>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">{activeMethodDetail.description}</p>

        <div className="space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">{t('mas.keyCharacteristics')}</span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {activeMethodDetail.features.map((feat, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface-subtle p-2.5 text-xs text-text-primary">
                <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">{t('mas.commandPreview')}</span>
          <div className="mt-1 rounded-[6px] border border-border-subtle bg-surface-subtle p-3 font-mono text-xs text-text-code">
            {activeMethodDetail.command}
          </div>
        </div>
      </div>

      {/* Safety Indicators Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center gap-2 text-status-success">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs font-semibold text-text-primary">{t('mas.openSourceVerified')}</span>
          </div>
          <p className="text-xs text-text-secondary">
            {t('mas.openSourceDesc')}
          </p>
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center gap-2 text-brand">
            <Lock className="h-4 w-4" />
            <span className="text-xs font-semibold text-text-primary">{t('mas.dryRunGuard')}</span>
          </div>
          <p className="text-xs text-text-secondary">
            {t('mas.dryRunDesc')} <span className="font-mono font-semibold text-brand">{dryRunMode ? t('mas.dryRunEnabled') : t('mas.dryRunDisabled')}</span>. {dryRunMode ? t('mas.dryRunStatusEnabled') : t('mas.dryRunStatusDisabled')}
          </p>
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center gap-2 text-status-info">
            <Info className="h-4 w-4" />
            <span className="text-xs font-semibold text-text-primary">{t('mas.nonDestructive')}</span>
          </div>
          <p className="text-xs text-text-secondary">
            {t('mas.nonDestructiveDesc')}
          </p>
        </div>
      </div>
    </div>
  );
}

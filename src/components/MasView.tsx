import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import { MasMethod, ExecutionSummary } from '../types';
import { KeyRound, ShieldCheck, ShieldAlert, Sparkles, CheckCircle2, Info, Lock, Play, Loader2 } from 'lucide-react';

interface MethodDetail {
  id: MasMethod;
  name: string;
  badge: string;
  scope: string;
  description: string;
  features: string[];
  command: string;
}

const ACTIVATION_METHODS: MethodDetail[] = [
  {
    id: 'HWID',
    name: 'HWID Digital License',
    badge: 'Permanent',
    scope: 'Windows 10 / 11',
    description: 'Generates a genuine Microsoft digital license ticket registered directly with Microsoft activation servers. Ties permanently to motherboard hardware ID.',
    features: [
      'Survives OS format & clean reinstallation',
      'No background services or registry modifications',
      'Fully official digital entitlement status',
    ],
    command: 'irm https://get.activated.win | iex /HWID',
  },
  {
    id: 'Ohook',
    name: 'Ohook Office Activation',
    badge: 'Permanent',
    scope: 'Office 2013 - 2024',
    description: 'Hooks into the Office SPP licensing library to enable genuine permanent activation status for Microsoft 365, Office ProPlus, Visio, and Project.',
    features: [
      'Permanent licensing across all Office suites',
      'Compatible with Microsoft 365 cloud updates',
      'Clean DLL hook method with automatic persistence',
    ],
    command: 'irm https://get.activated.win | iex /Ohook',
  },
  {
    id: 'KMS38',
    name: 'KMS38 Activation',
    badge: 'Until 2038',
    scope: 'Enterprise & Server',
    description: 'Extends Windows KMS activation period to December 19, 2038 (19+ years). Ideal for Windows Enterprise, LTSC, and Windows Server editions.',
    features: [
      'Activation period valid until 2038-12-19',
      'Does not require external KMS server connection',
      'Ideal for offline or Enterprise deployments',
    ],
    command: 'irm https://get.activated.win | iex /KMS38',
  },
];

export function MasView() {
  const selectedMasMethod = useAppStore((s) => s.selectedMasMethod);
  const setSelectedMasMethod = useAppStore((s) => s.setSelectedMasMethod);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const addLog = useAppStore((s) => s.addLog);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const setIsExecuting = useAppStore((s) => s.setIsExecuting);

  const activeMethodDetail = ACTIVATION_METHODS.find((m) => m.id === selectedMasMethod) || ACTIVATION_METHODS[0];

  const handleActivate = () => {
    if (isExecuting) return;

    openSafetyModal({
      title: `Execute Activation via MAS (${selectedMasMethod})`,
      description: `Triggers Microsoft Activation Script method ${selectedMasMethod} (${activeMethodDetail.scope}). Dry-run safety mode is currently ${
        dryRunMode ? 'ACTIVE' : 'DISABLED'
      }.`,
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
        } catch (err) {
          addLog({
            level: 'error',
            message: `IPC execute_activation failed: ${String(err)}`,
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
            <h2 className="text-base font-semibold text-text-primary">Microsoft Activation Scripts (MAS)</h2>
          </div>
          <p className="text-xs text-text-secondary">
            Open-source Windows & Office activation wrapper utilizing digital ticket, Ohook, and KMS38 algorithms.
          </p>
        </div>
        <button
          onClick={handleActivate}
          disabled={isExecuting}
          className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-xs font-medium text-white transition-opacity shadow-sm ${
            isExecuting
              ? 'bg-surface-active text-text-muted cursor-not-allowed border border-border opacity-50'
              : 'bg-brand hover:bg-brand-hover'
          }`}
        >
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          <span>{isExecuting ? `Activating (${selectedMasMethod})...` : `Activate (${selectedMasMethod})`}</span>
        </button>
      </div>

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
                  Method: /{method.id}
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
              Active Selection Details: {activeMethodDetail.name}
            </h3>
          </div>
          <span className="text-xs font-mono text-text-muted">ID: {activeMethodDetail.id}</span>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">{activeMethodDetail.description}</p>

        <div className="space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">Key Characteristics:</span>
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
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">Command Invocation Preview:</span>
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
            <span className="text-xs font-semibold text-text-primary">Open Source Verified</span>
          </div>
          <p className="text-xs text-text-secondary">
            Utilizes Massgrave MAS standard activation scripts without bundled third-party binaries or malware.
          </p>
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center gap-2 text-brand">
            <Lock className="h-4 w-4" />
            <span className="text-xs font-semibold text-text-primary">Dry-Run Guard Active</span>
          </div>
          <p className="text-xs text-text-secondary">
            Current Dry-Run Mode is <span className="font-mono font-semibold text-brand">{dryRunMode ? 'ENABLED' : 'DISABLED'}</span>. {dryRunMode ? 'Simulates execution without modifying licensing stores.' : 'Will apply live licensing modifications.'}
          </p>
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center gap-2 text-status-info">
            <Info className="h-4 w-4" />
            <span className="text-xs font-semibold text-text-primary">Non-Destructive Hooks</span>
          </div>
          <p className="text-xs text-text-secondary">
            Activation keys and SPP licensing hooks can be updated or uninstalled at any time.
          </p>
        </div>
      </div>
    </div>
  );
}

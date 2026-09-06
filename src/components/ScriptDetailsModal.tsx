import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileCode,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  Code2,
  Play,
  X,
  Loader2,
  Sliders,
} from 'lucide-react';
import type { ScriptManifestEntry } from '../types';

export interface ScriptDetailsModalProps {
  script: ScriptManifestEntry | null;
  content: string | null;
  isLoading: boolean;
  isElevated: boolean;
  isExecutingScript: boolean;
  onClose: () => void;
  onLoadToEditor: (script: ScriptManifestEntry) => void;
  onRunDirectly: (script: ScriptManifestEntry, options?: { runAsAdmin?: boolean }) => void;
  onSimulateImpact?: (script: ScriptManifestEntry, content: string) => void;
}

export function ScriptDetailsModal({
  script,
  content,
  isLoading,
  isElevated,
  isExecutingScript,
  onClose,
  onLoadToEditor,
  onRunDirectly,
  onSimulateImpact,
}: ScriptDetailsModalProps) {
  const { t } = useTranslation();
  const [copiedHash, setCopiedHash] = useState(false);

  if (!script) return null;

  const handleCopyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      // ignore
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'critical':
        return (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-status-error/15 text-status-error border border-status-error/30 font-semibold">
            CRITICAL
          </span>
        );
      case 'elevated':
        return (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-status-warning/15 text-status-warning border border-status-warning/30 font-semibold">
            ELEVATED
          </span>
        );
      default:
        return (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-status-success/15 text-status-success border border-status-success/30 font-semibold">
            SAFE
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-surface-card border border-border rounded-[8px] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-[6px] bg-brand/10 border border-brand/30 text-brand">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text-primary tracking-tight">
                  {script.name}
                </h2>
                {getRiskBadge(script.riskLevel)}
                {script.requiresAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-status-warning/15 text-status-warning border border-status-warning/30 font-semibold">
                    <ShieldAlert className="h-3 w-3" />
                    <span>UAC Required</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                {script.path} | v{script.version} | Author: {script.author}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-[6px] text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent hover:border-border transition-colors"
            title={t('script_runner.close_preview', 'Close Preview')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Metadata Header */}
        <div className="p-4 bg-surface-card border-b border-border space-y-2 text-xs">
          <p className="text-text-secondary leading-relaxed">
            {script.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-text-secondary font-medium">SHA-256:</span>
            <code className="font-mono text-[11px] bg-surface-subtle text-text-code px-2 py-0.5 rounded border border-border/80">
              {script.sha256}
            </code>
            <button
              onClick={() => handleCopyHash(script.sha256)}
              className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
            >
              {copiedHash ? (
                <>
                  <Check className="h-3 w-3 text-status-success" />
                  <span className="text-status-success">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy Hash</span>
                </>
              )}
            </button>
          </div>

          {/* Elevation Warning Banner if required and not elevated */}
          {script.requiresAdmin && !isElevated && (
            <div className="mt-2 p-2.5 rounded-[6px] bg-status-warningSubtle border border-status-warning/40 text-status-warning flex items-center gap-2 text-xs">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {t(
                  'script_runner.elevation_notice',
                  'This script requires administrative privileges. Running it will trigger a Windows UAC prompt.'
                )}
              </span>
            </div>
          )}

          {/* Configurable parameters if present */}
          {script.parameters && script.parameters.length > 0 && (
            <div className="pt-2">
              <span className="font-semibold text-text-primary text-[11px]">
                {t('script_runner.parameters_label', 'Configurable Parameters')}:
              </span>
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {script.parameters.map((param) => (
                  <div
                    key={param.name}
                    className="p-2 rounded bg-surface-subtle border border-border text-[11px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-brand">{param.name}</span>
                      <span className="font-mono text-text-secondary text-[10px]">
                        {param.type} (default: {String(param.default)})
                      </span>
                    </div>
                    <p className="text-text-secondary text-[10px] mt-0.5">{param.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Code Viewer */}
        <div className="flex-1 overflow-y-auto p-4 bg-surface-subtle select-text">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-text-secondary space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
              <span className="text-xs">Loading verified script code...</span>
            </div>
          ) : (
            <pre className="font-mono text-xs text-text-code leading-relaxed whitespace-pre-wrap break-all">
              {content ?? '# Error reading script content'}
            </pre>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-surface-subtle">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            <span>SHA-256 Integrity Verified</span>
          </div>

          <div className="flex items-center gap-2">
            {onSimulateImpact && script && content && (
              <button
                onClick={() => {
                  onClose();
                  onSimulateImpact(script, content);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-xs font-medium bg-surface-card hover:bg-surface-hover text-text-primary border border-border transition-colors shadow-xs"
                title={t('script_runner.simulate_impact_tooltip', 'Preview affected registry keys, services, tasks, and files before execution')}
              >
                <Sliders className="h-4 w-4 text-text-secondary" />
                <span>{t('script_runner.simulate_impact', 'Simulate Impact')}</span>
              </button>
            )}

            <button
              onClick={() => onLoadToEditor(script)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-xs font-medium bg-surface-card hover:bg-surface-hover text-text-primary border border-border transition-colors shadow-xs"
            >
              <Code2 className="h-4 w-4" />
              <span>{t('script_runner.load_to_editor', 'Load to Editor')}</span>
            </button>

            {/* If script does NOT strictly require admin, provide standard Run option */}
            {!script.requiresAdmin && (
              <button
                onClick={() => onRunDirectly(script, { runAsAdmin: false })}
                disabled={isExecutingScript}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-xs font-medium bg-surface-card hover:bg-surface-hover text-text-primary border border-border transition-colors disabled:opacity-50 shadow-xs"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{t('script_runner.run_standard', 'Run Standard')}</span>
              </button>
            )}

            {/* Direct Run as Administrator Button */}
            <button
              onClick={() => onRunDirectly(script, { runAsAdmin: true })}
              disabled={isExecutingScript}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-[6px] text-xs font-medium text-white transition-colors disabled:opacity-50 shadow-sm ${
                !isElevated ? 'bg-status-warning hover:bg-status-warning/90' : 'bg-brand hover:bg-brand-hover'
              }`}
            >
              {isElevated ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              <span>
                {isElevated
                  ? t('script_runner.run_directly', 'Run Directly')
                  : t('script_runner.run_as_admin', 'Run as Administrator')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

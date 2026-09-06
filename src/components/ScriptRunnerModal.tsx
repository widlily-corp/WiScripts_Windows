import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sliders, RotateCcw, X, Play, Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { ScriptManifestEntry, ScriptParameterValue } from '../types';

export interface ScriptRunnerModalProps {
  script: ScriptManifestEntry | null;
  initialValues: Record<string, ScriptParameterValue>;
  validationErrors: Record<string, string>;
  isElevated: boolean;
  isExecutingScript: boolean;
  onClose: () => void;
  onExecute: (
    script: ScriptManifestEntry,
    values: Record<string, ScriptParameterValue>,
    options: { runAsAdmin: boolean; dryRun: boolean }
  ) => void;
}

export function ScriptRunnerModal({
  script,
  initialValues,
  validationErrors,
  isElevated,
  isExecutingScript,
  onClose,
  onExecute,
}: ScriptRunnerModalProps) {
  const { t } = useTranslation();

  const [values, setValues] = useState<Record<string, ScriptParameterValue>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>(validationErrors);
  const [runAsAdmin, setRunAsAdmin] = useState<boolean>(false);
  const [dryRun, setDryRun] = useState<boolean>(false);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    setErrors(validationErrors);
  }, [validationErrors]);

  useEffect(() => {
    if (script) {
      // Default to elevated if script requires admin or elevated risk
      const needsElevation = Boolean(
        script.requiresAdmin ||
        script.riskLevel === 'elevated' ||
        script.riskLevel === 'critical'
      );
      setRunAsAdmin(needsElevation);
      setDryRun(false);
    }
  }, [script]);

  if (!script) return null;

  const handleValueChange = (name: string, val: ScriptParameterValue) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleResetDefaults = () => {
    const defaults: Record<string, ScriptParameterValue> = {};
    if (script.parameters) {
      for (const param of script.parameters) {
        if (param.default !== undefined && param.default !== null) {
          defaults[param.name] = param.default as ScriptParameterValue;
        } else if (param.type === 'boolean') {
          defaults[param.name] = false;
        } else if (param.type === 'number') {
          defaults[param.name] = 0;
        } else {
          defaults[param.name] = '';
        }
      }
    }
    setValues(defaults);
    setErrors({});
  };

  const validateAndSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (script.parameters) {
      for (const param of script.parameters) {
        const val = values[param.name];
        if (param.type === 'number') {
          const numVal = Number(val);
          if (val !== undefined && val !== '' && (Number.isNaN(numVal) || !Number.isFinite(numVal))) {
            newErrors[param.name] = t('script_runner.validation_invalid_number', 'Must be a valid finite number');
          }
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onExecute(script, values, { runAsAdmin, dryRun });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col w-full max-w-xl max-h-[90vh] bg-surface-card border border-border rounded-[8px] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-[6px] bg-brand/10 border border-brand/30 text-brand">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">
                {t('script_runner.param_dialog_title', 'Configure Script Parameters')}
              </h2>
              <p className="text-xs text-text-secondary">
                {script.name} (v{script.version})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[6px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body: Parameter Inputs */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {script.parameters?.map((param) => {
            const error = errors[param.name];
            const value = values[param.name];

            return (
              <div
                key={param.name}
                className={`p-3 rounded-[6px] border bg-surface-subtle space-y-1.5 ${
                  error ? 'border-status-error/60' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="font-mono text-xs font-bold text-brand">
                    ${param.name}
                  </label>
                  <span className="text-[10px] text-text-secondary">
                    Default: {String(param.default)}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  {param.description}
                </p>

                {param.type === 'boolean' ? (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleValueChange(param.name, !value)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none border border-transparent ${
                        value ? 'bg-brand' : 'bg-surface-card border-border'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm mt-0.5 ${
                          value ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ) : (
                  <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    value={value !== undefined && value !== null ? String(value) : ''}
                    onChange={(e) =>
                      handleValueChange(
                        param.name,
                        param.type === 'number'
                          ? e.target.value === '' ? '' : Number(e.target.value)
                          : e.target.value
                      )
                    }
                    className="w-full bg-surface-card border border-border rounded-[4px] px-3 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                )}
                {error && <p className="text-[11px] text-status-error">{error}</p>}
              </div>
            );
          })}
        </div>

        {/* Modal Footer: Execution Options & CTAs */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-border bg-surface-subtle">
          {/* Options Toggles */}
          <div className="flex items-center gap-4">
            {/* Run as Administrator Checkbox */}
            <label
              className={`inline-flex items-center gap-1.5 text-xs cursor-pointer select-none transition-colors ${
                isElevated ? 'text-status-success' : 'text-text-secondary hover:text-text-primary'
              }`}
              title={
                isElevated
                  ? t('script_runner.already_elevated_tooltip', 'Process is already running with administrative privileges')
                  : t('script_runner.uac_elevation_tooltip', 'Execute script with elevated administrator privileges via Windows UAC prompt')
              }
            >
              <input
                type="checkbox"
                checked={isElevated || runAsAdmin}
                disabled={isElevated || isExecutingScript}
                onChange={(e) => setRunAsAdmin(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand bg-surface-card h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
              />
              {isElevated ? (
                <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
              ) : (
                <Shield className="h-3.5 w-3.5 text-status-warning" />
              )}
              <span className={runAsAdmin && !isElevated ? 'text-status-warning font-semibold' : 'font-medium'}>
                {t('script_runner.run_as_admin', 'Run as Administrator')}
              </span>
            </label>

            {/* Dry Run Checkbox */}
            <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary cursor-pointer select-none transition-colors">
              <input
                type="checkbox"
                checked={dryRun}
                disabled={isExecutingScript}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand bg-surface-card h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
              />
              <span className="font-medium">{t('script_runner.dry_run', 'Dry Run')}</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-medium bg-surface-card hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t('script_runner.param_dialog_reset', 'Reset to Defaults')}</span>
            </button>

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-[4px] text-xs font-medium bg-surface-card hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('script_runner.cancel', 'Cancel')}
            </button>

            <button
              onClick={validateAndSubmit}
              disabled={isExecutingScript}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[4px] text-xs font-medium text-white transition-colors disabled:opacity-50 shadow-sm ${
                runAsAdmin && !isElevated
                  ? 'bg-status-warning hover:bg-status-warning/90'
                  : 'bg-brand hover:bg-brand-hover'
              }`}
            >
              {runAsAdmin && !isElevated ? (
                <ShieldAlert className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              <span>{t('script_runner.param_dialog_run', 'Run with Parameters')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

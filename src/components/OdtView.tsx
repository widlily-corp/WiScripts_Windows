import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { ExecutionSummary } from '../types';
import { FileCode, Play, Copy, Check, ShieldAlert, Package, Layers, SlidersHorizontal, Loader2 } from 'lucide-react';

const PRODUCT_OPTIONS = [
  { id: 'O365ProPlusRetail' },
  { id: 'O365BusinessRetail' },
  { id: 'VisioPro2021Volume' },
  { id: 'ProjectPro2021Volume' },
];

const EXCLUDABLE_APPS = [
  { id: 'Access' },
  { id: 'Bing' },
  { id: 'Groove' },
  { id: 'Lync' },
  { id: 'OneDrive' },
  { id: 'OneNote' },
  { id: 'Outlook' },
  { id: 'Publisher' },
  { id: 'Teams' },
];

const LANGUAGE_OPTIONS = [
  { code: 'en-us' },
  { code: 'de-de' },
  { code: 'fr-fr' },
  { code: 'es-es' },
  { code: 'ru-ru' },
];

export function OdtView() {
  const { t } = useTranslation();
  const odtConfig = useAppStore((s) => s.odtConfig);
  const updateOdtConfig = useAppStore((s) => s.updateOdtConfig);
  const generatedXml = useAppStore((s) => s.generatedXml);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const addLog = useAppStore((s) => s.addLog);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const setIsExecuting = useAppStore((s) => s.setIsExecuting);

  const [copied, setCopied] = useState(false);

  const handleCopyXml = () => {
    if (!generatedXml) return;
    navigator.clipboard.writeText(generatedXml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleProduct = (productId: string) => {
    const exists = odtConfig.products.includes(productId);
    const updated = exists
      ? odtConfig.products.filter((p) => p !== productId)
      : [...odtConfig.products, productId];
    if (updated.length === 0) return; // Must have at least one product
    updateOdtConfig({ products: updated });
  };

  const toggleExcludedApp = (appId: string) => {
    const exists = odtConfig.excludedApps.includes(appId);
    const updated = exists
      ? odtConfig.excludedApps.filter((a) => a !== appId)
      : [...odtConfig.excludedApps, appId];
    updateOdtConfig({ excludedApps: updated });
  };

  const isButtonDisabled = isExecuting || (!isElevated && !dryRunMode);

  const handleDeploy = () => {
    if (isButtonDisabled) return;

    openSafetyModal({
      title: t('odt.modalDeployTitle'),
      description: t('odt.modalDeployDesc', {
        products: odtConfig.products.join(', '),
        arch: odtConfig.architecture,
        channel: odtConfig.channel,
        status: dryRunMode ? 'ACTIVE' : 'DISABLED'
      }),
      riskLevel: 'high',
      commandsToRun: [
        `Setup.exe /configure configuration.xml`,
        `Products: ${odtConfig.products.join(', ')}`,
        `Architecture: ${odtConfig.architecture} | Channel: ${odtConfig.channel}`,
        `Excluded Apps: ${odtConfig.excludedApps.length > 0 ? odtConfig.excludedApps.join(', ') : 'None'}`,
      ],
      onConfirmAction: async () => {
        setIsExecuting(true);
        const currentDryRun = useAppStore.getState().dryRunMode;
        addLog({
          level: 'cmd',
          message: `Invoking IPC: execute_odt_install (Products: ${odtConfig.products.join(', ')}, DryRun: ${currentDryRun})`,
        });
        try {
          const summary = await invoke<ExecutionSummary>('execute_odt_install', {
            config: odtConfig,
            dryRun: currentDryRun,
          });

          addLog({
            level: summary.success ? 'info' : 'error',
            message: `ODT Deployment Completed. Overall Success=${summary.success}, Duration=${summary.totalDurationMs}ms, DryRun=${summary.isDryRun}`,
          });

          summary.executedActions.forEach((action) => {
            addLog({
              level: action.output.exitCode === 0 ? 'info' : 'error',
              message: `ODT Task [${action.name}]: ${
                action.output.stdout.trim() || action.output.stderr.trim() || 'Executed successfully'
              }`,
              commandExecuted: action.command,
            });
          });

          if (!summary.success) {
            const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
            const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'ODT deployment failed';
            useAppStore.getState().addToast({
              type: 'error',
              title: t('odt.toastDeployFailTitle'),
              message: errMsg,
            });
          } else {
            useAppStore.getState().addToast({
              type: 'success',
              title: t('odt.toastDeploySuccessTitle'),
              message: t('odt.toastDeploySuccessMsg'),
            });
          }
        } catch (err) {
          const errMsg = typeof err === 'string' ? err : String(err);
          addLog({
            level: 'error',
            message: `IPC execute_odt_install failed: ${errMsg}`,
          });
          useAppStore.getState().addToast({
            type: 'error',
            title: t('odt.toastDeployErrorTitle'),
            message: errMsg,
          });
        } finally {
          setIsExecuting(false);
        }
      },
    });
  };

  const handleBypassRegionalLock = () => {
    if (isButtonDisabled) return;

    openSafetyModal({
      title: t('odt.modalBypassTitle'),
      description: t('odt.modalBypassDesc'),
      riskLevel: 'medium',
      commandsToRun: [
        `HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\common\\officeupdate (PreventRegionalBlock = 1)`,
        `HKLM:\\SOFTWARE\\Policies\\Microsoft\\office\\16.0\\common\\officeupdate (EnableAutomaticUpdates = 1)`,
        `HKLM:\\SOFTWARE\\Microsoft\\Office\\16.0\\Common\\ExperimentConfigs\\Ecs (CountryCode = 'US')`,
      ],
      onConfirmAction: async () => {
        setIsExecuting(true);
        const currentDryRun = useAppStore.getState().dryRunMode;
        addLog({
          level: 'cmd',
          message: `Invoking IPC: execute_odt_regional_bypass (DryRun: ${currentDryRun})`,
        });
        try {
          const summary = await invoke<ExecutionSummary>('execute_odt_regional_bypass', {
            dryRun: currentDryRun,
          });

          addLog({
            level: summary.success ? 'info' : 'error',
            message: `ODT Regional Bypass Completed. Overall Success=${summary.success}, Duration=${summary.totalDurationMs}ms, DryRun=${summary.isDryRun}`,
          });

          summary.executedActions.forEach((action) => {
            addLog({
              level: action.output.exitCode === 0 ? 'info' : 'error',
              message: `ODT Regional Bypass [${action.name}]: ${
                action.output.stdout.trim() || action.output.stderr.trim() || 'Executed successfully'
              }`,
              commandExecuted: action.command,
            });
          });

          if (!summary.success) {
            const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
            const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Regional bypass failed';
            useAppStore.getState().addToast({
              type: 'error',
              title: t('odt.toastBypassFailTitle'),
              message: errMsg,
            });
          } else {
            useAppStore.getState().addToast({
              type: 'success',
              title: t('odt.toastBypassSuccessTitle'),
              message: t('odt.toastBypassSuccessMsg'),
            });
          }
        } catch (err) {
          const errMsg = typeof err === 'string' ? err : String(err);
          addLog({
            level: 'error',
            message: `IPC execute_odt_regional_bypass failed: ${errMsg}`,
          });
          useAppStore.getState().addToast({
            type: 'error',
            title: t('odt.toastBypassErrorTitle'),
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
      {/* Top Bar Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">{t('odt.title')}</h2>
          </div>
          <p className="text-xs text-text-secondary">
            {t('odt.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBypassRegionalLock}
            disabled={isButtonDisabled}
            title={!isElevated && !dryRunMode ? t('odt.adminRequiredTitle') : ''}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-[6px] text-xs font-medium transition-all shadow-sm ${
              isButtonDisabled
                ? 'bg-surface-active text-text-muted cursor-not-allowed border border-border opacity-50'
                : 'bg-surface-subtle border border-border text-text-primary hover:bg-surface-hover'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-brand" />
            <span>{t('odt.bypassLockBtn')}</span>
          </button>
          <button
            onClick={handleDeploy}
            disabled={isButtonDisabled}
            title={!isElevated && !dryRunMode ? t('odt.adminRequiredTitle') : ''}
            className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-xs font-medium transition-all shadow-sm ${
              isButtonDisabled
                ? 'bg-surface-active text-text-muted cursor-not-allowed border border-border opacity-50'
                : 'bg-brand text-white hover:bg-brand-hover'
            }`}
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{isExecuting ? t('odt.deployingBtn') : t('odt.deployBtn')}</span>
          </button>
        </div>
      </div>

      {/* Admin Elevation Warning Banner */}
      <AdminElevationBanner featureName={t('odt.title')} />

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Controls */}
        <div className="lg:col-span-7 space-y-5">
          {/* Section 1: Product Selection */}
          <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary border-b border-border-subtle pb-2">
              <Package className="h-4 w-4 text-brand" />
              <span>{t('odt.productSection')}</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {PRODUCT_OPTIONS.map((prod) => {
                const isSelected = odtConfig.products.includes(prod.id);
                return (
                  <div
                    key={prod.id}
                    onClick={() => {
                      if (!isExecuting) toggleProduct(prod.id);
                    }}
                    className={`rounded-[6px] border p-3 flex items-start gap-3 transition-colors ${
                      isExecuting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'border-brand/60 bg-brand-subtle'
                        : 'border-border-subtle bg-surface-subtle hover:bg-surface-hover'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isExecuting}
                      onChange={() => {}}
                      className="mt-0.5 h-4 w-4 rounded border-border bg-surface text-brand disabled:cursor-not-allowed"
                    />
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="text-xs font-medium text-text-primary">{t(`odtProducts.${prod.id}Name`)}</div>
                      <div className="text-[11px] text-text-muted">{t(`odtProducts.${prod.id}Desc`)}</div>
                      <div className="text-[10px] font-mono text-brand/80">{prod.id}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Architecture & Channel */}
          <div className="rounded-[6px] border border-border bg-surface p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary border-b border-border-subtle pb-2">
              <Layers className="h-4 w-4 text-brand" />
              <span>{t('odt.archChannelSection')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-medium text-text-secondary uppercase font-mono tracking-wider">
                  {t('odt.architectureLabel')}
                </label>
                <select
                  value={odtConfig.architecture}
                  disabled={isExecuting}
                  onChange={(e) => updateOdtConfig({ architecture: e.target.value as 'x64' | 'x86' })}
                  className="mt-1.5 w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-xs text-text-primary focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="x64">{t('odtArchs.x64')}</option>
                  <option value="x86">{t('odtArchs.x86')}</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-text-secondary uppercase font-mono tracking-wider">
                  {t('odt.channelLabel')}
                </label>
                <select
                  value={odtConfig.channel}
                  disabled={isExecuting}
                  onChange={(e) =>
                    updateOdtConfig({ channel: e.target.value as 'Current' | 'MonthlyEnterprise' | 'SemiAnnual' })
                  }
                  className="mt-1.5 w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-xs text-text-primary focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="Current">{t('odtChannels.Current')}</option>
                  <option value="MonthlyEnterprise">{t('odtChannels.MonthlyEnterprise')}</option>
                  <option value="SemiAnnual">{t('odtChannels.SemiAnnual')}</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-text-secondary uppercase font-mono tracking-wider">
                  {t('odt.languageLabel')}
                </label>
                <select
                  value={odtConfig.language}
                  disabled={isExecuting}
                  onChange={(e) => updateOdtConfig({ language: e.target.value })}
                  className="mt-1.5 w-full rounded-[6px] border border-border bg-surface-subtle px-3 py-2 text-xs text-text-primary focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {t(`odtLangs.${lang.code}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Excluded Applications */}
          <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                <SlidersHorizontal className="h-4 w-4 text-brand" />
                <span>{t('odt.excludeSection')}</span>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {t('odt.excludedCount', { count: odtConfig.excludedApps.length })}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EXCLUDABLE_APPS.map((app) => {
                const isExcluded = odtConfig.excludedApps.includes(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    disabled={isExecuting}
                    onClick={() => toggleExcludedApp(app.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-[6px] border text-xs font-medium text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isExcluded
                        ? 'border-status-warning/60 bg-status-warningSubtle text-status-warning'
                        : 'border-border-subtle bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isExcluded}
                      disabled={isExecuting}
                      readOnly
                      className="h-3.5 w-3.5 rounded border-border text-status-warning disabled:cursor-not-allowed"
                    />
                    <span className="truncate">{t(`odtApps.${app.id}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Installation Flags */}
          <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-text-primary">{t('odt.removeExistingTitle')}</div>
                <div className="text-[11px] text-text-muted">{t('odt.removeExistingDesc')}</div>
              </div>
              <input
                type="checkbox"
                checked={odtConfig.removeExistingOffice}
                disabled={isExecuting}
                onChange={(e) => updateOdtConfig({ removeExistingOffice: e.target.checked })}
                className="h-4 w-4 rounded border-border bg-surface text-brand focus:ring-brand disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex items-center justify-between border-t border-border-subtle pt-3">
              <div>
                <div className="text-xs font-medium text-text-primary">{t('odt.autoEulaTitle')}</div>
                <div className="text-[11px] text-text-muted">{t('odt.autoEulaDesc')}</div>
              </div>
              <input
                type="checkbox"
                checked={odtConfig.acceptEula}
                disabled={isExecuting}
                onChange={(e) => updateOdtConfig({ acceptEula: e.target.checked })}
                className="h-4 w-4 rounded border-border bg-surface text-brand focus:ring-brand disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Right Column: XML Preview */}
        <div className="lg:col-span-5 flex flex-col space-y-3">
          <div className="rounded-[6px] border border-border bg-surface p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-brand" />
                <span className="text-xs font-semibold text-text-primary">{t('odt.livePreviewTitle')}</span>
              </div>
              <button
                onClick={handleCopyXml}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] border border-border bg-surface-subtle text-[11px] font-mono text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-status-success" />
                    <span className="text-status-success">{t('odt.copiedBtn')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>{t('odt.copyXmlBtn')}</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex-1 rounded-[6px] border border-border-subtle bg-surface-subtle p-3 overflow-auto max-h-[520px]">
              <pre className="font-mono text-[11px] leading-relaxed text-text-code whitespace-pre-wrap select-all">
                {generatedXml || t('odt.generatingXml')}
              </pre>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted font-mono">
              <span>{t('odt.targetFile')}</span>
              <span className="tabular-nums">{t('odt.bytes', { count: generatedXml.length })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

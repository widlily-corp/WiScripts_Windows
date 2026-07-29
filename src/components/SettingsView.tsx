import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import {
  Settings,
  Shield,
  Palette,
  Terminal,
  Heart,
  Layers,
  Cpu,
  Code2,
  RefreshCw,
  Sparkles,
  Loader2,
  Download,
  FileArchive,
} from 'lucide-react';

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const setDryRunMode = useAppStore((s) => s.setDryRunMode);
  const appVersion = useAppStore((s) => s.appVersion);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const updateInfo = useAppStore((s) => s.updateInfo);
  const autoCheckUpdates = useAppStore((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = useAppStore((s) => s.setAutoCheckUpdates);
  const lastUpdateCheckTime = useAppStore((s) => s.lastUpdateCheckTime);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);
  const openReleaseNotesModal = useAppStore((s) => s.openReleaseNotesModal);
  const triggerMockUpdate = useAppStore((s) => s.triggerMockUpdate);
  const updateError = useAppStore((s) => s.updateError);
  const downloadAndInstallUpdate = useAppStore((s) => s.downloadAndInstallUpdate);
  const exportDiagnosticDump = useAppStore((s) => s.exportDiagnosticDump);
  const addToast = useAppStore((s) => s.addToast);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportDump = async () => {
    setIsExporting(true);
    try {
      const path = await exportDiagnosticDump();
      addToast({
        type: 'success',
        title: 'Диагностический отчет создан',
        message: `Архив сохранен на Рабочий стол: ${path}`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast({
        type: 'error',
        title: 'Ошибка экспорта отчета',
        message: errMsg,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">{t('settings.title')}</h2>
          </div>
          <p className="text-xs text-text-secondary">
            {t('settings.desc')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Safety & Execution Defaults */}
        <div className="space-y-6">
          {/* Card 1: Safety Dry-Run Mode */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Shield className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">{t('settings.safetyModeTitle')}</h3>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-text-primary">{t('settings.globalDryRunLabel')}</div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {t('settings.globalDryRunDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={dryRunMode}
                  onChange={(e) => setDryRunMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-surface-active peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
              </label>
            </div>

            <div className={`rounded-[6px] border p-3 text-xs font-mono ${
              dryRunMode
                ? 'border-brand/40 bg-brand-subtle text-brand'
                : 'border-status-warning/40 bg-status-warningSubtle text-status-warning'
            }`}>
              {dryRunMode ? t('settings.safetyStatusActive') : t('settings.safetyStatusDisabled')}
            </div>
          </div>

          {/* Card 2: Software Auto-Updater */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3 justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-text-primary">{t('settings.autoUpdaterTitle')}</h3>
              </div>
              <button
                onClick={() => triggerMockUpdate()}
                className="text-[10px] font-mono px-2 py-0.5 border border-brand/30 bg-brand/10 hover:bg-brand/20 text-brand rounded transition-colors"
                title="Simulate release notes modal & update payload"
              >
                Mock Update (Dev)
              </button>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-text-primary">{t('settings.autoCheckLabel')}</div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {t('settings.autoCheckDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={autoCheckUpdates}
                  onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-surface-active peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
              <div>
                <span className="text-text-muted">{t('settings.lastChecked')} </span>
                <span className="text-text-primary font-mono">{lastUpdateCheckTime || '—'}</span>
              </div>
              <button
                onClick={() => checkForUpdates(false)}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover hover:bg-surface-active border border-border text-text-primary rounded-[6px] font-medium transition-colors disabled:opacity-50"
              >
                {updateStatus === 'checking' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-brand" />
                )}
                <span>{updateStatus === 'checking' ? t('settings.checkingBtn') : t('settings.checkUpdatesBtn')}</span>
              </button>
            </div>

            {updateStatus === 'available' && (
              <div className="rounded-[6px] border border-brand/40 bg-brand-subtle p-3 flex items-center justify-between text-xs text-brand">
                <span>{t('settings.updateAvailable', { ver: updateInfo?.version })}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openReleaseNotesModal()}
                    className="px-2.5 py-1 bg-surface border border-brand/40 text-brand font-medium rounded-[4px] hover:bg-surface-hover transition-colors"
                  >
                    Release Notes
                  </button>
                  <button
                    onClick={() => downloadAndInstallUpdate()}
                    className="px-2.5 py-1 bg-brand text-white font-medium rounded-[4px] hover:bg-brand-hover transition-colors"
                  >
                    {t('settings.downloadInstallBtn')}
                  </button>
                </div>
              </div>
            )}

            {updateStatus === 'error' && updateError && (
              <div className="rounded-[6px] border border-status-danger/40 bg-status-dangerSubtle p-3 text-xs text-status-danger space-y-1">
                <div className="font-semibold">Update Error</div>
                <div className="font-mono text-[11px] text-status-danger/90">{updateError}</div>
              </div>
            )}

            {updateStatus === 'ready' && (
              <div className="rounded-[6px] border border-status-success/40 bg-status-successSubtle p-3 flex items-center justify-between text-xs text-status-success">
                <span>{t('settings.updateReady')}</span>
                <button
                  onClick={() => downloadAndInstallUpdate()}
                  className="px-2.5 py-1 bg-status-success text-white font-medium rounded-[4px] hover:opacity-90 transition-colors"
                >
                  {t('settings.restartNowBtn')}
                </button>
              </div>
            )}
          </div>

          {/* Card 3: Language & Localization */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Sparkles className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">{t('settings.languageTitle')}</h3>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-text-secondary leading-relaxed">
                {t('settings.languageDesc')}
              </div>
              <div className="flex bg-surface-active rounded-[6px] p-1 border border-border">
                <button
                  onClick={() => i18n.changeLanguage('en')}
                  className={`px-3 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                    i18n.language.startsWith('en')
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => i18n.changeLanguage('ru')}
                  className={`px-3 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                    i18n.language.startsWith('ru')
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  RU
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Environment Info */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Cpu className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">{t('settings.runtimeEnvTitle')}</h3>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-muted">{t('settings.appVersion')}</span>
                <span className="text-text-primary font-semibold">{appVersion}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-muted">{t('settings.tauriFramework')}</span>
                <span className="text-text-primary">v2.0 (Rust Desktop IPC)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-muted">{t('settings.uiArch')}</span>
                <span className="text-text-primary">React 18 + Tailwind CSS</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-muted">{t('settings.targetPlatform')}</span>
                <span className="text-text-primary">Windows 10 / 11 x64</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Theme Info & Credits */}
        <div className="space-y-6">
          {/* Card 3: Refined Minimal Theme Specifications */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Palette className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">{t('settings.designSystemTitle')}</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {t('settings.designSystemDesc')}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div className="rounded-[6px] border border-border-subtle bg-[#08090A] p-2.5 space-y-1">
                <div className="text-text-muted">Background</div>
                <div className="text-text-primary font-semibold">#08090A</div>
              </div>
              <div className="rounded-[6px] border border-border-subtle bg-[#121417] p-2.5 space-y-1">
                <div className="text-text-muted">Surface</div>
                <div className="text-text-primary font-semibold">#121417</div>
              </div>
              <div className="rounded-[6px] border border-border-subtle bg-[#22252A] p-2.5 space-y-1">
                <div className="text-text-muted">1px Hairline</div>
                <div className="text-text-primary font-semibold">#22252A</div>
              </div>
              <div className="rounded-[6px] border border-border-subtle bg-brand-subtle p-2.5 space-y-1">
                <div className="text-text-muted">Accent Brand</div>
                <div className="text-brand font-semibold">#3B82F6</div>
              </div>
            </div>
          </div>

          {/* Card 4: Open Source Repository Credits */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <Heart className="h-4 w-4 text-status-danger" />
              <h3 className="text-sm font-semibold text-text-primary">{t('settings.creditsTitle')}</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <Code2 className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">Microsoft Activation Scripts (MAS)</div>
                  <div className="text-text-muted text-[11px]">
                    Open-source activation scripts created by Massgrave project (HWID, Ohook, KMS38).
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Layers className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">Office Deployment Tool (ODT)</div>
                  <div className="text-text-muted text-[11px]">
                    Microsoft official Office Deployment Tool XML configuration engine integration.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Terminal className="h-4 w-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-text-primary">WiScripts Windows Utility</div>
                  <div className="text-text-muted text-[11px]">
                    High-performance native Windows administration & debloating toolkit built with Rust & Tauri.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Diagnostics & Support */}
          <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <FileArchive className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">Диагностика и поддержка</h3>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                Сформируйте диагностический архив (ZIP) со сведениями о системе и журналом debug.log для отладки и решения проблем.
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-text-muted">Архив на Рабочем столе</span>
                <button
                  onClick={handleExportDump}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-[6px] text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>Сгенерировать отчет</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

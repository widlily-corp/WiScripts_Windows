import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import { SystemInfo } from '../types';
import { ShieldCheck, ShieldAlert, RefreshCw, Cpu, HardDrive, Search } from 'lucide-react';

const TAB_TITLES: Record<string, string> = {
  dashboard: 'header.tab_titles.dashboard',
  script_runner: 'header.tab_titles.script_runner',
  audio_manager: 'header.tab_titles.audio_manager',
  governor: 'header.tab_titles.governor',
  optimization: 'header.tab_titles.optimization',
  package_manager: 'header.tab_titles.package_manager',
  app_uninstaller: 'header.tab_titles.app_uninstaller',
  presets: 'header.tab_titles.presets',
  system_cleaner: 'header.tab_titles.system_cleaner',
  storage_utilities: 'header.tab_titles.storage_utilities',
  startup: 'header.tab_titles.startup',
  scheduler: 'header.tab_titles.scheduler',
  autoruns: 'header.tab_titles.autoruns',
  dns_context: 'header.tab_titles.dns_context',
  driver_backup: 'header.tab_titles.driver_backup',
  diagnostics: 'header.tab_titles.diagnostics',
  odt: 'header.tab_titles.odt',
  activation: 'header.tab_titles.activation',
  restore_points: 'header.tab_titles.restore_points',
  state_engine: 'header.tab_titles.state_engine',
  settings: 'header.tab_titles.settings',
};

export function Header() {
  const { t } = useTranslation();
  const activeTab = useAppStore((s) => s.activeTab);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const setDryRunMode = useAppStore((s) => s.setDryRunMode);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const setSystemInfo = useAppStore((s) => s.setSystemInfo);
  const setSystemLoading = useAppStore((s) => s.setSystemLoading);
  const addLog = useAppStore((s) => s.addLog);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshSystemInfo = async () => {
    setIsRefreshing(true);
    setSystemLoading(true);
    try {
      const info = await invoke<SystemInfo>('get_system_info');
      setSystemInfo(info);
      addLog({
        level: 'info',
        message: t('header.logs.refresh_success', { cpu: info.cpuUsagePercent, used: Math.round(info.memoryUsedMb / 1024), total: Math.round(info.memoryTotalMb / 1024) }),
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: t('header.logs.refresh_error', { err: String(err) }),
      });
    } finally {
      setIsRefreshing(false);
      setSystemLoading(false);
    }
  };

  return (
    <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between select-none">
      {/* Title */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary">
          {TAB_TITLES[activeTab] ? t(TAB_TITLES[activeTab]) : 'WiScripts'}
        </h2>
      </div>

      {/* Controls & Quick Stats */}
      <div className="flex items-center gap-4">
        {/* System Quick Stats */}
        {systemInfo && (
          <div className="flex items-center gap-3 bg-surface-subtle border border-border-subtle rounded-[6px] px-3 py-1 text-xs">
            <div className="flex items-center gap-1.5 text-text-secondary font-mono text-[11px] tabular-nums">
              <Cpu className="h-3.5 w-3.5 text-brand" />
              <span>{t('header.stats.cpu', { cpu: systemInfo.cpuUsagePercent })}</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1.5 text-text-secondary font-mono text-[11px] tabular-nums">
              <HardDrive className="h-3.5 w-3.5 text-brand" />
              <span>
                {t('header.stats.ram', { used: Math.round(systemInfo.memoryUsedMb / 1024), total: Math.round(systemInfo.memoryTotalMb / 1024) })}
              </span>
            </div>
          </div>
        )}

        {/* Dry Run Toggle Switch */}
        <div className="flex items-center gap-2 bg-surface-subtle border border-border-subtle rounded-[6px] px-3 py-1">
          {dryRunMode ? (
            <ShieldCheck className="h-4 w-4 text-status-success" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-status-warning" />
          )}
          <span className="text-xs font-medium text-text-secondary">{t('header.safety_dry_run')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={dryRunMode}
            onClick={() => setDryRunMode(!dryRunMode)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              dryRunMode ? 'bg-status-success' : 'bg-surface-active border-status-warning'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                dryRunMode ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Command Palette Search Trigger Button */}
        <button
          onClick={() => useAppStore.getState().setCommandPaletteOpen(true)}
          className="flex items-center gap-2 px-2.5 py-1 rounded-[6px] border border-border bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors text-xs"
          title="Open Command Palette (Ctrl+K)"
          aria-label="Open Command Palette"
        >
          <Search className="h-3.5 w-3.5 text-brand" />
          <span className="hidden sm:inline text-[11px] text-text-muted">Search...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
            Ctrl+K
          </kbd>
        </button>

        {/* Refresh Button */}
        <button
          onClick={handleRefreshSystemInfo}
          disabled={isRefreshing}
          className="p-1.5 rounded-[6px] border border-border bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-opacity disabled:opacity-50"
          title={t('header.refresh_btn_title')}
          aria-label={t('header.refresh_btn_title')}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}

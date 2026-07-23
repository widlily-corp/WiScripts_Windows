import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import { SystemInfo } from '../types';
import { ShieldCheck, ShieldAlert, RefreshCw, Cpu, HardDrive } from 'lucide-react';

const TAB_TITLES: Record<string, string> = {
  dashboard: 'System Overview Dashboard',
  optimization: 'Windows Optimizations & Debloat',
  package_manager: 'Package & Bloatware Manager (Winget / UWP)',
  presets: 'Curated Optimization Profiles & Presets',
  dns_context: 'DNS Server & Win11 Context Menu Manager',
  driver_backup: 'Windows Device Driver Export & Backup',
  diagnostics: 'Advanced Diagnostics & System Health Stream',
  odt: 'Office Deployment Tool (ODT) Configurator',
  activation: 'Microsoft Activation Scripts (MAS)',
  settings: 'Global Configuration & Preferences',
};

export function Header() {
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
        message: `System metrics refreshed: CPU ${info.cpuUsagePercent}%, RAM ${Math.round(info.memoryUsedMb / 1024)}/${Math.round(info.memoryTotalMb / 1024)} GB`,
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: `Failed to refresh system info via IPC: ${String(err)}`,
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
          {TAB_TITLES[activeTab] || 'WiScripts'}
        </h2>
      </div>

      {/* Controls & Quick Stats */}
      <div className="flex items-center gap-4">
        {/* System Quick Stats */}
        {systemInfo && (
          <div className="flex items-center gap-3 bg-surface-subtle border border-border-subtle rounded-[6px] px-3 py-1 text-xs">
            <div className="flex items-center gap-1.5 text-text-secondary font-mono text-[11px] tabular-nums">
              <Cpu className="h-3.5 w-3.5 text-brand" />
              <span>{systemInfo.cpuUsagePercent}% CPU</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1.5 text-text-secondary font-mono text-[11px] tabular-nums">
              <HardDrive className="h-3.5 w-3.5 text-brand" />
              <span>
                {Math.round(systemInfo.memoryUsedMb / 1024)} / {Math.round(systemInfo.memoryTotalMb / 1024)} GB
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
          <span className="text-xs font-medium text-text-secondary">Safety Dry-Run</span>
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

        {/* Refresh Button */}
        <button
          onClick={handleRefreshSystemInfo}
          disabled={isRefreshing}
          className="p-1.5 rounded-[6px] border border-border bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-opacity disabled:opacity-50"
          title="Refresh System Information"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}

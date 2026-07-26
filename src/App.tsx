import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './store/useAppStore';
import { Navigation } from './components/Navigation';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { OptimizationView } from './components/OptimizationView';
import { PackageManagerView } from './components/PackageManagerView';
import { PresetsView } from './components/PresetsView';
import { DnsContextMenuView } from './components/DnsContextMenuView';
import { DriverBackupView } from './components/DriverBackupView';
import { OdtView } from './components/OdtView';
import { MasView } from './components/MasView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { SettingsView } from './components/SettingsView';
import { SafetyConfirmationModal } from './components/SafetyConfirmationModal';
import { ExecutionProgressModal } from './components/ExecutionProgressModal';
import { SystemInfo } from './types';

export function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const odtConfig = useAppStore((s) => s.odtConfig);
  const setGeneratedXml = useAppStore((s) => s.setGeneratedXml);
  const addLog = useAppStore((s) => s.addLog);
  const setSystemInfo = useAppStore((s) => s.setSystemInfo);
  const checkElevation = useAppStore((s) => s.checkElevation);

  // Fetch real system information & check elevation on mount
  useEffect(() => {
    async function fetchSystemInfoOnMount() {
      try {
        await checkElevation();
        const info = await invoke<SystemInfo>('get_system_info');
        setSystemInfo(info);
        addLog({
          level: 'info',
          message: `System metrics loaded: OS=${info.osName} (${info.osBuild}), CPU=${info.cpuUsagePercent}%, RAM=${Math.round(info.memoryUsedMb / 1024)}/${Math.round(info.memoryTotalMb / 1024)}GB (Elevated: ${info.isElevated})`,
        });
      } catch (err) {
        addLog({
          level: 'error',
          message: `Failed to fetch system info on mount: ${String(err)}`,
        });
      }
    }
    fetchSystemInfoOnMount();
  }, [setSystemInfo, checkElevation, addLog]);

  // Generate ODT XML preview when odtConfig changes
  useEffect(() => {
    async function generateXmlPreview() {
      try {
        const xml = await invoke<string>('generate_odt_xml', { config: odtConfig });
        setGeneratedXml(xml);
      } catch (err) {
        // Silently capture XML generation error in dev mode
      }
    }
    generateXmlPreview();
  }, [odtConfig, setGeneratedXml]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-text-primary">
      <Navigation />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'optimization' && <OptimizationView />}
          {activeTab === 'package_manager' && <PackageManagerView />}
          {activeTab === 'presets' && <PresetsView />}
          {activeTab === 'dns_context' && <DnsContextMenuView />}
          {activeTab === 'driver_backup' && <DriverBackupView />}
          {activeTab === 'diagnostics' && <DiagnosticsView />}
          {activeTab === 'odt' && <OdtView />}
          {activeTab === 'activation' && <MasView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      <SafetyConfirmationModal />
      <ExecutionProgressModal />
    </div>
  );
}


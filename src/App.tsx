import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './store/useAppStore';
import { Navigation } from './components/Navigation';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AudioView } from './components/AudioView';
import { GovernorView } from './views/GovernorView';
import { OptimizationView } from './components/OptimizationView';
import { PackageManagerView } from './components/PackageManagerView';
import { UninstallerView } from './views/UninstallerView';
import { PresetsView } from './components/PresetsView';
import { SystemCleaner } from './components/SystemCleaner';
import { StorageUtilities } from './components/StorageUtilities';
import { DnsContextMenuView } from './components/DnsContextMenuView';
import { DriverBackupView } from './components/DriverBackupView';
import { OdtView } from './components/OdtView';
import { MasView } from './components/MasView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { SettingsView } from './components/SettingsView';
import { RestorePointsView } from './components/RestorePointsView';
import { StateEngineView } from './components/StateEngineView';
import { StartupView } from './components/StartupView';
import { SchedulerView } from './components/SchedulerView';
import { AutorunsView } from './views/AutorunsView';
import { SafetyConfirmationModal } from './components/SafetyConfirmationModal';
import { ExecutionProgressModal } from './components/ExecutionProgressModal';
import { ReleaseNotesModal } from './components/ReleaseNotesModal';
import { UpdateBanner } from './components/UpdateBanner';
import { ToastContainer } from './components/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SystemInfo } from './types';

export function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const odtConfig = useAppStore((s) => s.odtConfig);
  const setGeneratedXml = useAppStore((s) => s.setGeneratedXml);
  const addLog = useAppStore((s) => s.addLog);
  const setSystemInfo = useAppStore((s) => s.setSystemInfo);
  const checkElevation = useAppStore((s) => s.checkElevation);
  const fetchAppVersion = useAppStore((s) => s.fetchAppVersion);
  const autoCheckUpdates = useAppStore((s) => s.autoCheckUpdates);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);

  useEffect(() => {
    async function fetchSystemInfoOnMount() {
      try {
        await checkElevation();
        const ver = await fetchAppVersion();
        const info = await invoke<SystemInfo>('get_system_info');
        setSystemInfo(info);
        addLog({
          level: 'info',
          message: `System metrics loaded: OS=${info.osName} (${info.osBuild}), CPU=${info.cpuUsagePercent}%, RAM=${Math.round(info.memoryUsedMb / 1024)}/${Math.round(info.memoryTotalMb / 1024)}GB (Elevated: ${info.isElevated}, App v${ver})`,
        });

        if (autoCheckUpdates) {
          setTimeout(() => {
            checkForUpdates(true);
          }, 3000);
        }
      } catch (err) {
        addLog({
          level: 'error',
          message: `Failed to fetch system info on mount: ${String(err)}`,
        });
      }
    }
    fetchSystemInfoOnMount();
  }, [setSystemInfo, checkElevation, addLog, fetchAppVersion, autoCheckUpdates, checkForUpdates]);

  useEffect(() => {
    async function generateXmlPreview() {
      try {
        const xml = await invoke<string>('generate_odt_xml', { config: odtConfig });
        setGeneratedXml(xml);
      } catch (err) {}
    }
    generateXmlPreview();
  }, [odtConfig, setGeneratedXml]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-text-primary">
      <Navigation />

      <div className="flex flex-1 flex-col overflow-hidden">
        <UpdateBanner />
        <Header />

        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'audio_manager' && <AudioView />}
            {activeTab === 'governor' && <GovernorView />}
            {activeTab === 'optimization' && <OptimizationView />}
            {activeTab === 'package_manager' && <PackageManagerView />}
            {activeTab === 'app_uninstaller' && <UninstallerView />}
            {activeTab === 'presets' && <PresetsView />}
            {activeTab === 'system_cleaner' && <SystemCleaner />}
            {activeTab === 'storage_utilities' && <StorageUtilities />}
            {activeTab === 'startup' && <StartupView />}
            {activeTab === 'scheduler' && <SchedulerView />}
            {activeTab === 'autoruns' && <AutorunsView />}
            {activeTab === 'dns_context' && <DnsContextMenuView />}
            {activeTab === 'driver_backup' && <DriverBackupView />}
            {activeTab === 'diagnostics' && <DiagnosticsView />}
            {activeTab === 'odt' && <OdtView />}
            {activeTab === 'activation' && <MasView />}
            {activeTab === 'restore_points' && <RestorePointsView />}
            {activeTab === 'state_engine' && <StateEngineView />}
            {activeTab === 'settings' && <SettingsView />}
          </ErrorBoundary>
        </main>
      </div>

      <SafetyConfirmationModal />
      <ExecutionProgressModal />
      <ReleaseNotesModal />
      <ToastContainer />
    </div>
  );
}


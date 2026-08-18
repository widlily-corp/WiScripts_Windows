import React, { useEffect, Suspense, lazy } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './store/useAppStore';
import { Navigation } from './components/Navigation';
import { Header } from './components/Header';
import { CommandPalette } from './components/CommandPalette';
import { ViewSkeleton } from './components/ViewSkeleton';
import { SafetyConfirmationModal } from './components/SafetyConfirmationModal';
import { ExecutionProgressModal } from './components/ExecutionProgressModal';
import { ReleaseNotesModal } from './components/ReleaseNotesModal';
import { UpdateBanner } from './components/UpdateBanner';
import { ToastContainer } from './components/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SystemInfo } from './types';

// Route-level code-splitting: Lazy-load heavy views to minimize initial bundle footprint
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const ScriptRunnerView = lazy(() =>
  import('./components/ScriptRunnerView').then((m) => ({ default: m.ScriptRunnerView }))
);
const AudioView = lazy(() =>
  import('./components/AudioView').then((m) => ({ default: m.AudioView }))
);
const GovernorView = lazy(() =>
  import('./views/GovernorView').then((m) => ({ default: m.GovernorView }))
);
const OptimizationView = lazy(() =>
  import('./components/OptimizationView').then((m) => ({ default: m.OptimizationView }))
);
const PackageManagerView = lazy(() =>
  import('./components/PackageManagerView').then((m) => ({ default: m.PackageManagerView }))
);
const UninstallerView = lazy(() =>
  import('./views/UninstallerView').then((m) => ({ default: m.UninstallerView }))
);
const PresetsView = lazy(() =>
  import('./components/PresetsView').then((m) => ({ default: m.PresetsView }))
);
const SystemCleaner = lazy(() =>
  import('./components/SystemCleaner').then((m) => ({ default: m.SystemCleaner }))
);
const StorageUtilities = lazy(() =>
  import('./components/StorageUtilities').then((m) => ({ default: m.StorageUtilities }))
);
const StartupView = lazy(() =>
  import('./components/StartupView').then((m) => ({ default: m.StartupView }))
);
const SchedulerView = lazy(() =>
  import('./components/SchedulerView').then((m) => ({ default: m.SchedulerView }))
);
const AutorunsView = lazy(() =>
  import('./views/AutorunsView').then((m) => ({ default: m.AutorunsView }))
);
const DnsContextMenuView = lazy(() =>
  import('./components/DnsContextMenuView').then((m) => ({ default: m.DnsContextMenuView }))
);
const DriverBackupView = lazy(() =>
  import('./components/DriverBackupView').then((m) => ({ default: m.DriverBackupView }))
);
const DiagnosticsView = lazy(() =>
  import('./components/DiagnosticsView').then((m) => ({ default: m.DiagnosticsView }))
);
const OdtView = lazy(() =>
  import('./components/OdtView').then((m) => ({ default: m.OdtView }))
);
const MasView = lazy(() =>
  import('./components/MasView').then((m) => ({ default: m.MasView }))
);
const RestorePointsView = lazy(() =>
  import('./components/RestorePointsView').then((m) => ({ default: m.RestorePointsView }))
);
const StateEngineView = lazy(() =>
  import('./views/StateEngineView').then((m) => ({ default: m.StateEngineView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);

export function App() {
  const activeTab = useAppStore((s) => s.activeTab);
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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useAppStore.getState().toggleCommandPalette();
        return;
      }

      // '/' key when not focused in an input/textarea/contentEditable
      if (e.key === '/') {
        const activeElem = document.activeElement;
        const isInput =
          activeElem instanceof HTMLInputElement ||
          activeElem instanceof HTMLTextAreaElement ||
          (activeElem as HTMLElement | null)?.isContentEditable;

        if (!isInput) {
          e.preventDefault();
          useAppStore.getState().setCommandPaletteOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-text-primary">
      <Navigation />

      <div className="flex flex-1 flex-col overflow-hidden">
        <UpdateBanner />
        <Header />

        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Suspense fallback={<ViewSkeleton />}>
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'script_runner' && <ScriptRunnerView />}
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
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette />
      <SafetyConfirmationModal />
      <ExecutionProgressModal />
      <ReleaseNotesModal />
      <ToastContainer />
    </div>
  );
}

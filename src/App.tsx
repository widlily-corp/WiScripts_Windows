import { useEffect, Suspense, lazy } from 'react';
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
import { getErrorMessage } from './utils';

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
const GamingLatencyView = lazy(() =>
  import('./views/GamingLatencyView').then((m) => ({ default: m.GamingLatencyView }))
);
const SmartRamView = lazy(() =>
  import('./views/SmartRamView').then((m) => ({ default: m.SmartRamView }))
);
const NetworkShieldView = lazy(() =>
  import('./views/NetworkShieldView').then((m) => ({ default: m.NetworkShieldView }))
);
const HardwareHealthView = lazy(() =>
  import('./views/HardwareHealthView').then((m) => ({ default: m.HardwareHealthView }))
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
  const addLog = useAppStore((s) => s.addLog);
  const checkElevation = useAppStore((s) => s.checkElevation);
  const fetchAppVersion = useAppStore((s) => s.fetchAppVersion);
  const autoCheckUpdates = useAppStore((s) => s.autoCheckUpdates);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);

  useEffect(() => {
    let isMounted = true;
    let updateTimeoutId: ReturnType<typeof setTimeout> | null = null;

    async function fetchSystemInfoOnMount() {
      try {
        const [elevated, ver] = await Promise.all([checkElevation(), fetchAppVersion()]);
        if (!isMounted) return;

        const info = useAppStore.getState().systemInfo;
        if (info) {
          addLog({
            level: 'info',
            message: `System metrics loaded: OS=${info.osName} (${info.osBuild}), CPU=${info.cpuUsagePercent}%, RAM=${Math.round(info.memoryUsedMb / 1024)}/${Math.round(info.memoryTotalMb / 1024)}GB (Elevated: ${elevated}, App v${ver})`,
          });
        }

        if (autoCheckUpdates) {
          updateTimeoutId = setTimeout(() => {
            if (isMounted) {
              void checkForUpdates(true);
            }
          }, 3000);
        }
      } catch (err) {
        addLog({
          level: 'error',
          message: `Failed to fetch system info on mount: ${getErrorMessage(err)}`,
        });
      }
    }

    void fetchSystemInfoOnMount();

    return () => {
      isMounted = false;
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
      }
    };
  }, [checkElevation, addLog, fetchAppVersion, autoCheckUpdates, checkForUpdates]);

  useEffect(() => {
    const hasBlockingModalOpen = () => {
      const state = useAppStore.getState();
      return (
        Boolean(state.pendingSafetyModal?.isOpen) ||
        state.isExecuting ||
        state.isDeleteModalOpen ||
        state.isImpactSimulatorOpen ||
        Boolean(state.parameterDialogScript) ||
        Boolean(state.previewScript)
      );
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const state = useAppStore.getState();
        if (!state.isCommandPaletteOpen && hasBlockingModalOpen()) {
          return;
        }
        e.preventDefault();
        state.toggleCommandPalette();
        return;
      }

      // '/' key when not focused in an input/textarea/select/contentEditable and no modal is open
      if (e.key === '/') {
        const activeElem = document.activeElement;
        const isInput =
          activeElem instanceof HTMLInputElement ||
          activeElem instanceof HTMLTextAreaElement ||
          activeElem instanceof HTMLSelectElement ||
          (activeElem as HTMLElement | null)?.isContentEditable;

        const state = useAppStore.getState();
        if (!isInput && !state.isCommandPaletteOpen && !hasBlockingModalOpen()) {
          e.preventDefault();
          state.setCommandPaletteOpen(true);
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
              {activeTab === 'gaming_latency' && <GamingLatencyView />}
              {activeTab === 'smart_ram' && <SmartRamView />}
              {activeTab === 'network_shield' && <NetworkShieldView />}
              {activeTab === 'hardware_health' && <HardwareHealthView />}
              {activeTab === 'optimization' && <OptimizationView />}
              {activeTab === 'package_manager' && <PackageManagerView />}
              {activeTab === 'app_uninstaller' && <UninstallerView />}
              {activeTab === 'presets' && <PresetsView />}
              {activeTab === 'system_cleaner' && <StorageUtilities initialTab="cleaner" />}
              {activeTab === 'storage_utilities' && <StorageUtilities initialTab="analyzer" />}
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

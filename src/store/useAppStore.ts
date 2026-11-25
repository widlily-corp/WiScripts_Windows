import { create } from 'zustand';
import { devtools, persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { createSystemSlice, SystemSlice } from './slices/systemSlice';
import { createUpdaterSlice, UpdaterSlice } from './slices/updaterSlice';
import { createUiSlice, UiSlice, PendingSafetyModal } from './slices/uiSlice';
import { createOptimizationSlice, OptimizationSlice } from './slices/optimizationSlice';
import { createAudioSlice, AudioSlice } from './slices/audioSlice';
import { createPackageManagerSlice, PackageManagerSlice } from './slices/packageManagerSlice';
import { createSystemToolsSlice, SystemToolsSlice } from './slices/systemToolsSlice';
import { createScriptRunnerSlice, ScriptRunnerSlice } from './slices/scriptRunnerSlice';
import { createGamingSlice, GamingSlice } from './slices/gamingSlice';
import { createSmartRamSlice, SmartRamSlice } from './slices/smartRamSlice';
import { createNetworkShieldSlice, NetworkShieldSlice } from './slices/networkShieldSlice';
import { createHardwareHealthSlice, HardwareHealthSlice } from './slices/hardwareHealthSlice';
import { createDiskAnalyzerSlice, DiskAnalyzerSlice } from './slices/diskAnalyzerSlice';

export type { PendingSafetyModal };

export type AppState = SystemSlice &
  UpdaterSlice &
  UiSlice &
  OptimizationSlice &
  AudioSlice &
  PackageManagerSlice &
  SystemToolsSlice &
  ScriptRunnerSlice &
  GamingSlice &
  SmartRamSlice &
  NetworkShieldSlice &
  HardwareHealthSlice &
  DiskAnalyzerSlice;

const lastPersistedPayloads = new Map<string, string>();

const cachedLocalStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    if (lastPersistedPayloads.get(name) === value) {
      return;
    }
    try {
      window.localStorage.setItem(name, value);
      lastPersistedPayloads.set(name, value);
    } catch (err) {
      console.warn('[Store] Failed to persist preferences to localStorage:', err);
    }
  },
  removeItem: (name) => {
    lastPersistedPayloads.delete(name);
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore storage removal errors
    }
  },
};

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (...a) => ({
        ...createSystemSlice(...a),
        ...createUpdaterSlice(...a),
        ...createUiSlice(...a),
        ...createOptimizationSlice(...a),
        ...createAudioSlice(...a),
        ...createPackageManagerSlice(...a),
        ...createSystemToolsSlice(...a),
        ...createScriptRunnerSlice(...a),
        ...createGamingSlice(...a),
        ...createSmartRamSlice(...a),
        ...createNetworkShieldSlice(...a),
        ...createHardwareHealthSlice(...a),
        ...createDiskAnalyzerSlice(...a),
      }),
      {
        name: 'wiscripts-app-store',
        storage: createJSONStorage(() => cachedLocalStorage),
        partialize: (state) => ({
          dryRunMode: state.dryRunMode,
          autoCheckUpdates: state.autoCheckUpdates,
          odtConfig: state.odtConfig,
          selectedMasMethod: state.selectedMasMethod,
          driverBackupPath: state.driverBackupPath,
          selectedDnsProvider: state.selectedDnsProvider,
          selectedCpuSensorId: state.selectedCpuSensorId,
          selectedGpuSensorId: state.selectedGpuSensorId,
          selectedDrive: state.selectedDrive,
          customPath: state.customPath,
          viewMode: state.viewMode,
        }),
      }
    )
  )
);

if (typeof window !== 'undefined') {
  void useAppStore.getState().hydrateExecutionHistory();
}


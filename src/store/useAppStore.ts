import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
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
  HardwareHealthSlice;

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
      }),
      {
        name: 'wiscripts-app-store',
        partialize: (state) => ({
          dryRunMode: state.dryRunMode,
          autoCheckUpdates: state.autoCheckUpdates,
          odtConfig: state.odtConfig,
          selectedMasMethod: state.selectedMasMethod,
          driverBackupPath: state.driverBackupPath,
          selectedDnsProvider: state.selectedDnsProvider,
          selectedCpuSensorId: state.selectedCpuSensorId,
          selectedGpuSensorId: state.selectedGpuSensorId,
        }),
      }
    )
  )
);

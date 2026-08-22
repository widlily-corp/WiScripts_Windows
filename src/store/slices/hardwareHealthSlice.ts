import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { StorageDeviceHealth, BatteryHealthAnalytics, PowerSchemeInfo } from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface HardwareHealthSlice {
  storageDevices: StorageDeviceHealth[];
  batteryHealth: BatteryHealthAnalytics | null;
  powerSchemes: PowerSchemeInfo[];
  isHardwareLoading: boolean;
  hardwareError: string | null;

  fetchStorageHealth: () => Promise<StorageDeviceHealth[]>;
  fetchBatteryAnalytics: () => Promise<BatteryHealthAnalytics | null>;
  fetchPowerSchemes: () => Promise<PowerSchemeInfo[]>;
  setActivePowerScheme: (schemeGuid: string) => Promise<boolean>;
  enableUltimatePerformance: () => Promise<PowerSchemeInfo | null>;
}

export const createHardwareHealthSlice: StateCreator<AppState, [], [], HardwareHealthSlice> = (set, get) => ({
  storageDevices: [],
  batteryHealth: null,
  powerSchemes: [],
  isHardwareLoading: false,
  hardwareError: null,

  fetchStorageHealth: async () => {
    try {
      const devices = await invoke<StorageDeviceHealth[]>('get_storage_devices_health');
      set({ storageDevices: devices, hardwareError: null });
      return devices;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ hardwareError: errMsg });
      return [];
    }
  },

  fetchBatteryAnalytics: async () => {
    try {
      const analytics = await invoke<BatteryHealthAnalytics>('get_battery_health_analytics');
      set({ batteryHealth: analytics, hardwareError: null });
      return analytics;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ hardwareError: errMsg });
      return null;
    }
  },

  fetchPowerSchemes: async () => {
    try {
      const schemes = await invoke<PowerSchemeInfo[]>('get_power_schemes');
      set({ powerSchemes: schemes, hardwareError: null });
      return schemes;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ hardwareError: errMsg });
      return [];
    }
  },

  setActivePowerScheme: async (schemeGuid: string) => {
    const { addLog, addToast } = get();
    set({ isHardwareLoading: true, hardwareError: null });
    addLog({
      level: 'cmd',
      message: `Setting active Windows power scheme to GUID: ${schemeGuid}...`,
    });
    try {
      await invoke<boolean>('set_active_power_scheme', { schemeGuid });
      set((state) => ({
        powerSchemes: state.powerSchemes.map((s) => ({
          ...s,
          isActive: s.guid.toLowerCase() === schemeGuid.toLowerCase(),
        })),
        isHardwareLoading: false,
      }));
      addLog({
        level: 'info',
        message: `Power scheme ${schemeGuid} is now active.`,
      });
      addToast({
        type: 'success',
        title: 'Power Scheme Activated',
        message: 'Windows power plan updated successfully.',
      });
      await get().fetchPowerSchemes();
      return true;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isHardwareLoading: false, hardwareError: errMsg });
      addLog({ level: 'error', message: `Failed to set power scheme: ${errMsg}` });
      addToast({ type: 'error', title: 'Power Scheme Error', message: errMsg });
      return false;
    }
  },

  enableUltimatePerformance: async () => {
    const { addLog, addToast } = get();
    set({ isHardwareLoading: true, hardwareError: null });
    addLog({
      level: 'cmd',
      message: 'Unlocking and activating Windows Ultimate Performance power scheme via powercfg...',
    });
    try {
      const scheme = await invoke<PowerSchemeInfo>('enable_ultimate_performance_scheme');
      set({ isHardwareLoading: false });
      addLog({
        level: 'info',
        message: `Ultimate Performance scheme enabled and activated (GUID: ${scheme.guid})`,
      });
      addToast({
        type: 'success',
        title: 'Ultimate Performance Enabled',
        message: 'Activated Ultimate Performance power plan for maximum responsiveness.',
      });
      await get().fetchPowerSchemes();
      return scheme;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isHardwareLoading: false, hardwareError: errMsg });
      addLog({ level: 'error', message: `Failed to enable Ultimate Performance scheme: ${errMsg}` });
      addToast({ type: 'error', title: 'Ultimate Performance Error', message: errMsg });
      return null;
    }
  },
});

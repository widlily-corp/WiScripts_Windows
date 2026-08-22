import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { MemoryBreakdown, PurgeResult, AutoTrimmerConfig, StandbyPurgeMode } from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface SmartRamSlice {
  memoryBreakdown: MemoryBreakdown | null;
  autoTrimmerConfig: AutoTrimmerConfig | null;
  lastPurgeResult: PurgeResult | null;
  isMemoryLoading: boolean;
  memoryError: string | null;

  fetchMemoryBreakdown: () => Promise<MemoryBreakdown | null>;
  purgeStandbyMemory: (mode?: StandbyPurgeMode) => Promise<PurgeResult | null>;
  purgeWorkingSets: (excludedPids?: number[]) => Promise<PurgeResult | null>;
  fetchAutoTrimmerConfig: () => Promise<AutoTrimmerConfig | null>;
  saveAutoTrimmerConfig: (config: AutoTrimmerConfig) => Promise<AutoTrimmerConfig | null>;
}

export const createSmartRamSlice: StateCreator<AppState, [], [], SmartRamSlice> = (set, get) => ({
  memoryBreakdown: null,
  autoTrimmerConfig: null,
  lastPurgeResult: null,
  isMemoryLoading: false,
  memoryError: null,

  fetchMemoryBreakdown: async () => {
    try {
      const breakdown = await invoke<MemoryBreakdown>('get_memory_breakdown');
      set({ memoryBreakdown: breakdown, memoryError: null });
      return breakdown;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ memoryError: errMsg });
      return null;
    }
  },

  purgeStandbyMemory: async (mode: StandbyPurgeMode = 'all') => {
    const { addLog, addToast } = get();
    set({ isMemoryLoading: true, memoryError: null });
    addLog({
      level: 'cmd',
      message: `Executing kernel Standby List memory purge (mode: ${mode})...`,
    });
    try {
      const result = await invoke<PurgeResult>('purge_standby_memory', { mode });
      set({ lastPurgeResult: result, isMemoryLoading: false });
      addLog({
        level: 'info',
        message: `Standby list purged successfully: reclaimed ${result.mbFreed.toFixed(1)} MB`,
      });
      addToast({
        type: 'success',
        title: 'Standby List Purged',
        message: `Reclaimed ${result.mbFreed.toFixed(1)} MB of cached standby memory.`,
      });
      await get().fetchMemoryBreakdown();
      return result;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isMemoryLoading: false, memoryError: errMsg });
      addLog({ level: 'error', message: `Standby list purge failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Purge Error', message: errMsg });
      return null;
    }
  },

  purgeWorkingSets: async (excludedPids: number[] = []) => {
    const { addLog, addToast } = get();
    set({ isMemoryLoading: true, memoryError: null });
    addLog({
      level: 'cmd',
      message: `Trimming process working sets across all running processes (excluded: ${excludedPids.length} PIDs)...`,
    });
    try {
      const result = await invoke<PurgeResult>('purge_working_sets', { excludedPids });
      set({ lastPurgeResult: result, isMemoryLoading: false });
      addLog({
        level: 'info',
        message: `Working sets trimmed: ${result.processesTrimmed} processes, reclaimed ${result.mbFreed.toFixed(1)} MB`,
      });
      addToast({
        type: 'success',
        title: 'Working Sets Trimmed',
        message: `Trimmed ${result.processesTrimmed} processes, freed ${result.mbFreed.toFixed(1)} MB.`,
      });
      await get().fetchMemoryBreakdown();
      return result;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isMemoryLoading: false, memoryError: errMsg });
      addLog({ level: 'error', message: `Working sets purge failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Purge Error', message: errMsg });
      return null;
    }
  },

  fetchAutoTrimmerConfig: async () => {
    try {
      const config = await invoke<AutoTrimmerConfig>('get_ram_auto_trimmer_config');
      set({ autoTrimmerConfig: config });
      return config;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ memoryError: errMsg });
      return null;
    }
  },

  saveAutoTrimmerConfig: async (config: AutoTrimmerConfig) => {
    const { addLog, addToast } = get();
    set({ isMemoryLoading: true, memoryError: null });
    addLog({
      level: 'cmd',
      message: `Configuring background RAM auto-trimmer: enabled=${config.enabled}, threshold=${config.thresholdPercent}%, interval=${config.intervalSeconds}s`,
    });
    try {
      const updated = await invoke<AutoTrimmerConfig>('configure_ram_auto_trimmer', { config });
      set({ autoTrimmerConfig: updated, isMemoryLoading: false });
      addLog({
        level: 'info',
        message: `Auto-trimmer configuration saved successfully (active=${updated.enabled})`,
      });
      addToast({
        type: 'success',
        title: 'Auto-Trimmer Updated',
        message: updated.enabled
          ? `Auto-trimmer active at >${updated.thresholdPercent}% RAM threshold.`
          : 'Background memory auto-trimmer disabled.',
      });
      return updated;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isMemoryLoading: false, memoryError: errMsg });
      addLog({ level: 'error', message: `Failed to configure auto-trimmer: ${errMsg}` });
      addToast({ type: 'error', title: 'Auto-Trimmer Error', message: errMsg });
      return null;
    }
  },
});

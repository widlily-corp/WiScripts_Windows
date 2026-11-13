import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  LatencyMetrics,
  TimerResolutionInfo,
  GameBoostStatus,
  DaemonStatus,
  ProcessSelectorItem,
  GameOptimizationConfig,
  ShaderScanSummary,
  ShaderNukeResult,
} from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface GamingSlice {
  latencyMetrics: LatencyMetrics | null;
  timerResolution: TimerResolutionInfo | null;
  gameBoostStatus: GameBoostStatus | null;
  daemonStatus: DaemonStatus | null;
  runningProcesses: ProcessSelectorItem[];
  isProcessesLoading: boolean;
  shaderSummary: ShaderScanSummary | null;
  isScanningShaders: boolean;
  isNukingShaders: boolean;
  nukeResult: ShaderNukeResult | null;
  latencyHistory: number[];
  isGamingLoading: boolean;
  gamingError: string | null;

  fetchLatencyMetrics: () => Promise<LatencyMetrics | null>;
  setTimerResolution: (resolution100ns: number) => Promise<TimerResolutionInfo | null>;
  toggleGameBoost: (targetPid?: number | null, enable?: boolean) => Promise<GameBoostStatus | null>;
  fetchGameBoostStatus: () => Promise<GameBoostStatus | null>;
  fetchDaemonStatus: () => Promise<DaemonStatus | null>;
  setDaemonAutoDetect: (enabled: boolean) => Promise<DaemonStatus | null>;
  fetchRunningProcesses: () => Promise<ProcessSelectorItem[]>;
  optimizeGameProcess: (config: GameOptimizationConfig) => Promise<DaemonStatus | null>;
  restoreGameProcess: () => Promise<DaemonStatus | null>;
  scanShaderCaches: () => Promise<ShaderScanSummary | null>;
  nukeShaderCaches: (selectedIds?: string[]) => Promise<ShaderNukeResult | null>;
}

export const createGamingSlice: StateCreator<AppState, [], [], GamingSlice> = (set, get) => ({
  latencyMetrics: null,
  timerResolution: null,
  gameBoostStatus: null,
  daemonStatus: null,
  runningProcesses: [],
  isProcessesLoading: false,
  shaderSummary: null,
  isScanningShaders: false,
  isNukingShaders: false,
  nukeResult: null,
  latencyHistory: [],
  isGamingLoading: false,
  gamingError: null,

  fetchLatencyMetrics: async () => {
    try {
      const metrics = await invoke<LatencyMetrics>('get_latency_metrics');
      set((state) => {
        const newHistory = [...state.latencyHistory, metrics.currentLatencyUs].slice(-60);
        return {
          latencyMetrics: metrics,
          latencyHistory: newHistory,
          gamingError: null,
        };
      });
      return metrics;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ gamingError: errMsg });
      return null;
    }
  },

  setTimerResolution: async (resolution100ns: number) => {
    const { addLog, addToast } = get();
    set({ isGamingLoading: true, gamingError: null });
    addLog({
      level: 'cmd',
      message: `Adjusting system timer resolution to ${(resolution100ns / 10000).toFixed(3)}ms (${resolution100ns} in 100ns units)...`,
    });
    try {
      const info = await invoke<TimerResolutionInfo>('set_timer_resolution', { resolution100ns });
      set({ timerResolution: info, isGamingLoading: false });
      addLog({
        level: 'info',
        message: `System timer resolution updated: ${(info.currentResolution100ns / 10000).toFixed(3)}ms (custom: ${info.isCustom})`,
      });
      addToast({
        type: 'success',
        title: 'Timer Resolution Adjusted',
        message: `Current resolution: ${(info.currentResolution100ns / 10000).toFixed(3)}ms`,
      });
      return info;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isGamingLoading: false, gamingError: errMsg });
      addLog({ level: 'error', message: `Failed to set timer resolution: ${errMsg}` });
      addToast({ type: 'error', title: 'Timer Resolution Error', message: errMsg });
      return null;
    }
  },

  toggleGameBoost: async (targetPid?: number | null, enable: boolean = true) => {
    const { addLog, addToast } = get();
    set({ isGamingLoading: true, gamingError: null });
    addLog({
      level: 'cmd',
      message: `Toggling Game Boost orchestration: enable=${enable}, targetPid=${targetPid ?? 'auto'}`,
    });
    try {
      const status = await invoke<GameBoostStatus>('toggle_game_boost', {
        targetPid: targetPid ?? null,
        enable,
      });
      set({ gameBoostStatus: status, isGamingLoading: false });
      addLog({
        level: 'info',
        message: `Game Boost is now ${status.enabled ? 'ACTIVE' : 'INACTIVE'} (boosted: ${status.boostedProcessName ?? 'none'}, services suspended: ${status.suspendedServices.length})`,
      });
      addToast({
        type: status.enabled ? 'success' : 'info',
        title: status.enabled ? 'Game Boost Activated' : 'Game Boost Deactivated',
        message: status.enabled
          ? `Boosted ${status.boostedProcessName || 'Process'} with high priority & 0.5ms timer.`
          : 'Services and normal timer resolution restored.',
      });
      return status;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isGamingLoading: false, gamingError: errMsg });
      addLog({ level: 'error', message: `Game Boost toggle failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Game Boost Error', message: errMsg });
      return null;
    }
  },

  fetchGameBoostStatus: async () => {
    try {
      const status = await invoke<GameBoostStatus>('get_game_boost_status');
      set({ gameBoostStatus: status });
      return status;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ gamingError: errMsg });
      return null;
    }
  },

  fetchDaemonStatus: async () => {
    try {
      const status = await invoke<DaemonStatus>('get_daemon_status');
      set({ daemonStatus: status });
      return status;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ gamingError: errMsg });
      return null;
    }
  },

  setDaemonAutoDetect: async (enabled: boolean) => {
    const { addLog, addToast } = get();
    try {
      const status = await invoke<DaemonStatus>('set_daemon_auto_detect', { enabled });
      set({ daemonStatus: status });
      addLog({
        level: 'info',
        message: `Smart Game Daemon auto-detect set to ${enabled ? 'ENABLED' : 'DISABLED'}`,
      });
      addToast({
        type: 'info',
        title: 'Smart Daemon Auto-Detect',
        message: enabled ? 'Daemon is actively monitoring for games.' : 'Auto-detect disabled.',
      });
      return status;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ gamingError: errMsg });
      return null;
    }
  },

  fetchRunningProcesses: async () => {
    set({ isProcessesLoading: true });
    try {
      const procs = await invoke<ProcessSelectorItem[]>('get_running_processes_for_selector');
      set({ runningProcesses: procs, isProcessesLoading: false });
      return procs;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isProcessesLoading: false, gamingError: errMsg });
      return [];
    }
  },

  optimizeGameProcess: async (config: GameOptimizationConfig) => {
    const { addLog, addToast } = get();
    set({ isGamingLoading: true });
    addLog({
      level: 'cmd',
      message: `Optimizing game process '${config.processName}' (PID ${config.targetPid}) with high priority, affinity & timer resolution...`,
    });
    try {
      const status = await invoke<DaemonStatus>('optimize_game_process', { config });
      set({ daemonStatus: status, isGamingLoading: false });
      addLog({
        level: 'info',
        message: `Process '${config.processName}' successfully boosted! High priority: ${config.setHighPriority}, Physical cores: ${config.pinPhysicalCores}, Timer: ${config.setTimerResolution}`,
      });
      addToast({
        type: 'success',
        title: 'Game Process Boosted',
        message: `Optimized '${config.processName}' with high priority and performance scheduling.`,
      });
      return status;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isGamingLoading: false, gamingError: errMsg });
      addLog({ level: 'error', message: `Optimization failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Optimization Failed', message: errMsg });
      return null;
    }
  },

  restoreGameProcess: async () => {
    const { addLog, addToast } = get();
    set({ isGamingLoading: true });
    try {
      const status = await invoke<DaemonStatus>('restore_game_process');
      set({ daemonStatus: status, isGamingLoading: false });
      addLog({
        level: 'info',
        message: 'Game optimization restored: standard services and timer resolution reinstated.',
      });
      addToast({
        type: 'info',
        title: 'Game Boost Restored',
        message: 'System returned to standard power profile.',
      });
      return status;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isGamingLoading: false, gamingError: errMsg });
      return null;
    }
  },

  scanShaderCaches: async () => {
    set({ isScanningShaders: true });
    try {
      const summary = await invoke<ShaderScanSummary>('scan_shader_caches');
      set({ shaderSummary: summary, isScanningShaders: false });
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isScanningShaders: false, gamingError: errMsg });
      return null;
    }
  },

  nukeShaderCaches: async (selectedIds?: string[]) => {
    const { addLog, addToast } = get();
    set({ isNukingShaders: true });
    addLog({
      level: 'cmd',
      message: 'Nuking shader caches (DirectX, NVIDIA, AMD, Unreal Engine)...',
    });
    try {
      const result = await invoke<ShaderNukeResult>('nuke_shader_caches', {
        selectedIds: selectedIds ?? null,
      });
      set({ nukeResult: result, isNukingShaders: false });
      const freedMb = (result.bytesFreed / (1024 * 1024)).toFixed(1);
      addLog({
        level: 'info',
        message: `Shader caches cleaned! Freed ${freedMb} MB across ${result.filesRemoved} files. (Skipped ${result.skippedLockedCount} locked by driver)`,
      });
      addToast({
        type: 'success',
        title: 'Shader Caches Nuked',
        message: `Freed ${freedMb} MB. Stutter sources eliminated!`,
      });
      // Refresh scan after nuke
      get().scanShaderCaches();
      return result;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isNukingShaders: false, gamingError: errMsg });
      addLog({ level: 'error', message: `Failed to nuke shader caches: ${errMsg}` });
      addToast({ type: 'error', title: 'Shader Nuker Error', message: errMsg });
      return null;
    }
  },
});

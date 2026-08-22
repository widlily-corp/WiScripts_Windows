import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { LatencyMetrics, TimerResolutionInfo, GameBoostStatus } from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface GamingSlice {
  latencyMetrics: LatencyMetrics | null;
  timerResolution: TimerResolutionInfo | null;
  gameBoostStatus: GameBoostStatus | null;
  latencyHistory: number[];
  isGamingLoading: boolean;
  gamingError: string | null;

  fetchLatencyMetrics: () => Promise<LatencyMetrics | null>;
  setTimerResolution: (resolution100ns: number) => Promise<TimerResolutionInfo | null>;
  toggleGameBoost: (targetPid?: number | null, enable?: boolean) => Promise<GameBoostStatus | null>;
  fetchGameBoostStatus: () => Promise<GameBoostStatus | null>;
}

export const createGamingSlice: StateCreator<AppState, [], [], GamingSlice> = (set, get) => ({
  latencyMetrics: null,
  timerResolution: null,
  gameBoostStatus: null,
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
});

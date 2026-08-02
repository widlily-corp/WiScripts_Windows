import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { OptimizationItem, OptimizationProfile, ExecutionSummary } from '../../types';
import { DEFAULT_OPTIMIZATIONS } from '../../constants/optimizations';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface OptimizationSlice {
  optimizations: OptimizationItem[];
  selectedCategory: string;
  searchQuery: string;
  setSelectedCategory: (cat: string) => void;
  setSearchQuery: (query: string) => void;
  toggleOptimizationSelected: (id: string) => void;
  selectAllOptimizations: (category?: string) => void;
  deselectAllOptimizations: () => void;
  selectRecommendedOptimizations: () => void;
  selectTelemetryOnlyOptimizations: () => void;
  applyPreset: (preset: 'recommended' | 'telemetry_only' | 'full_debloat') => void;
  setOptimizations: (items: OptimizationItem[]) => void;
  fetchOptimizationsStatus: () => Promise<void>;

  optimizationProfiles: OptimizationProfile[];
  isLoadingProfiles: boolean;
  fetchOptimizationProfiles: () => Promise<OptimizationProfile[]>;
  applyOptimizationProfile: (profileId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
}

export const createOptimizationSlice: StateCreator<AppState, [], [], OptimizationSlice> = (set, get) => ({
  optimizations: DEFAULT_OPTIMIZATIONS,
  selectedCategory: 'all',
  searchQuery: '',
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleOptimizationSelected: (id) =>
    set((state) => ({
      optimizations: state.optimizations.map((item) =>
        item.id === id ? { ...item, isSelected: !item.isSelected } : item
      ),
    })),
  selectAllOptimizations: (category) =>
    set((state) => ({
      optimizations: state.optimizations.map((item) =>
        !category || category === 'all' || item.category === category
          ? { ...item, isSelected: true }
          : item
      ),
    })),
  deselectAllOptimizations: () =>
    set((state) => ({
      optimizations: state.optimizations.map((item) => ({ ...item, isSelected: false })),
    })),
  selectRecommendedOptimizations: () =>
    set((state) => ({
      optimizations: state.optimizations.map((item) => ({
        ...item,
        isSelected: item.isRecommended,
      })),
    })),
  selectTelemetryOnlyOptimizations: () =>
    set((state) => ({
      optimizations: state.optimizations.map((item) => ({
        ...item,
        isSelected: item.category === 'telemetry',
      })),
    })),
  applyPreset: (preset) =>
    set((state) => ({
      optimizations: state.optimizations.map((item) => {
        if (preset === 'recommended') {
          return { ...item, isSelected: item.isRecommended };
        } else if (preset === 'telemetry_only') {
          return { ...item, isSelected: item.category === 'telemetry' };
        } else if (preset === 'full_debloat') {
          return { ...item, isSelected: true };
        }
        return item;
      }),
    })),
  setOptimizations: (items) => set({ optimizations: items }),

  fetchOptimizationsStatus: async () => {
    try {
      const statusMap = await invoke<Record<string, boolean>>('get_optimizations_status');
      set((state) => ({
        optimizations: state.optimizations.map((item) => ({
          ...item,
          isApplied: statusMap[item.id] ?? false,
        })),
      }));
    } catch (err) {
      console.error('Failed to fetch optimizations status:', getErrorMessage(err));
    }
  },

  optimizationProfiles: [],
  isLoadingProfiles: false,

  fetchOptimizationProfiles: async () => {
    set({ isLoadingProfiles: true });
    get().addLog({ level: 'cmd', message: 'Fetching optimization profiles' });
    try {
      const profiles = await invoke<OptimizationProfile[]>('get_optimization_profiles');
      set({ optimizationProfiles: profiles });
      get().addLog({ level: 'info', message: `Loaded ${profiles.length} optimization profiles` });
      return profiles;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      get().addLog({ level: 'error', message: `Fetch profiles failed: ${errMsg}` });
      get().addToast({ type: 'error', title: 'Fetch Profiles Error', message: errMsg });
      set({ optimizationProfiles: [] });
      return [];
    } finally {
      set({ isLoadingProfiles: false });
    }
  },

  applyOptimizationProfile: async (profileId: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Applying optimization profile "${profileId}" (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('apply_optimization_profile', {
        profileId,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Profile ${profileId} applied: ${summary.success ? 'Success' : 'Failed'} (${summary.executedActions.length} actions)`,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || `Failed to apply optimization profile ${profileId}`;
        addToast({ type: 'error', title: 'Profile Application Failed', message: errMsg });
      } else {
        addToast({ type: 'success', title: 'Profile Applied', message: `Applied profile ${profileId} successfully.` });
        await get().fetchOptimizationsStatus();
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Apply profile failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Apply Profile Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },
});

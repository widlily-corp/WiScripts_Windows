import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  WingetPackage,
  UwpAppInfo,
  InstalledApp,
  ExecutionSummary,
} from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface PackageManagerSlice {
  wingetPackages: WingetPackage[];
  isWingetSearching: boolean;
  uwpApps: UwpAppInfo[];
  isUwpLoading: boolean;
  wingetSearch: (query: string) => Promise<WingetPackage[]>;
  wingetInstall: (packageId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  wingetUpdate: (packageId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  fetchUwpApps: () => Promise<UwpAppInfo[]>;
  removeUwpApp: (packageFullName: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  installedApps: InstalledApp[];
  isAppsLoading: boolean;
  appsError: string | null;
  fetchInstalledApps: () => Promise<InstalledApp[]>;
  uninstallApp: (app: InstalledApp, dryRun?: boolean) => Promise<ExecutionSummary | null>;
}

export const createPackageManagerSlice: StateCreator<AppState, [], [], PackageManagerSlice> = (set, get) => ({
  wingetPackages: [],
  isWingetSearching: false,
  uwpApps: [],
  isUwpLoading: false,

  wingetSearch: async (query: string) => {
    set({ isWingetSearching: true });
    get().addLog({ level: 'cmd', message: `Searching Winget packages: "${query}"` });
    try {
      const pkgs = await invoke<WingetPackage[]>('winget_search', { query });
      set({ wingetPackages: pkgs });
      get().addLog({ level: 'info', message: `Found ${pkgs.length} packages for "${query}"` });
      return pkgs;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      get().addLog({ level: 'error', message: `Winget search failed: ${errMsg}` });
      get().addToast({ type: 'error', title: 'Winget Search Error', message: errMsg });
      set({ wingetPackages: [] });
      return [];
    } finally {
      set({ isWingetSearching: false });
    }
  },

  wingetInstall: async (packageId: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Installing Winget package "${packageId}" (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('winget_install', {
        packageId,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Winget install ${packageId} result: ${summary.success ? 'Success' : 'Failed'}`,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || `Failed to install Winget package ${packageId}`;
        addToast({ type: 'error', title: 'Winget Install Failed', message: errMsg });
      } else {
        addToast({ type: 'success', title: 'Package Installed', message: `Package ${packageId} installed successfully.` });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Winget install failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Winget Install Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  wingetUpdate: async (packageId: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Updating Winget package "${packageId}" (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('winget_update', {
        packageId,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Winget update ${packageId} result: ${summary.success ? 'Success' : 'Failed'}`,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || `Failed to update Winget package ${packageId}`;
        addToast({ type: 'error', title: 'Winget Update Failed', message: errMsg });
      } else {
        addToast({ type: 'success', title: 'Package Updated', message: `Package ${packageId} updated successfully.` });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Winget update failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Winget Update Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  fetchUwpApps: async () => {
    set({ isUwpLoading: true });
    get().addLog({ level: 'cmd', message: 'Querying installed UWP AppX packages' });
    try {
      const apps = await invoke<UwpAppInfo[]>('get_uwp_apps');
      set({ uwpApps: apps });
      get().addLog({ level: 'info', message: `Retrieved ${apps.length} UWP packages` });
      return apps;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      get().addLog({ level: 'error', message: `Fetch UWP apps failed: ${errMsg}` });
      get().addToast({ type: 'error', title: 'Fetch UWP Apps Error', message: errMsg });
      set({ uwpApps: [] });
      return [];
    } finally {
      set({ isUwpLoading: false });
    }
  },

  removeUwpApp: async (packageFullName: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Removing UWP App: ${packageFullName} (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('remove_uwp_app', {
        packageFullName,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Remove UWP ${packageFullName} result: ${summary.success ? 'Success' : 'Failed'}`,
      });

      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || `Failed to remove UWP package ${packageFullName}`;
        addToast({ type: 'error', title: 'Remove UWP App Failed', message: errMsg });
        return summary;
      }

      if (!currentDryRun) {
        set((state) => ({
          uwpApps: state.uwpApps.filter((a) => a.packageFullName !== packageFullName),
        }));
        addToast({ type: 'success', title: 'UWP App Removed', message: `Removed AppX package ${packageFullName}` });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Remove UWP app failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Remove UWP Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  installedApps: [],
  isAppsLoading: false,
  appsError: null,

  fetchInstalledApps: async () => {
    set({ isAppsLoading: true, appsError: null });
    get().addLog({ level: 'cmd', message: 'Scanning Windows registry for installed desktop applications...' });
    try {
      const apps = await invoke<InstalledApp[]>('get_installed_apps');
      set({ installedApps: apps });
      get().addLog({ level: 'info', message: `Retrieved ${apps.length} installed applications from host registry.` });
      return apps;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ appsError: errMsg, installedApps: [] });
      get().addLog({ level: 'error', message: `Failed to fetch installed applications: ${errMsg}` });
      get().addToast({ type: 'error', title: 'Scan Error', message: errMsg });
      return [];
    } finally {
      set({ isAppsLoading: false });
    }
  },

  uninstallApp: async (app, dryRun) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({
      level: 'cmd',
      message: `Initiating uninstallation of "${app.name}" (ID: ${app.id}, dryRun: ${currentDryRun})`,
    });
    try {
      const summary = await invoke<ExecutionSummary>('uninstall_app', {
        app,
        dryRun: currentDryRun,
      });

      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg =
          errAction?.output.stderr.trim() ||
          errAction?.output.stdout.trim() ||
          'Uninstall process failed';
        addLog({ level: 'error', message: `Uninstallation of "${app.name}" failed: ${errMsg}` });
        addToast({ type: 'error', title: 'Uninstall Failed', message: errMsg });
        return summary;
      }

      addLog({ level: 'info', message: `Successfully launched uninstaller for "${app.name}"` });
      addToast({
        type: 'success',
        title: 'Uninstaller Triggered',
        message: `Uninstaller for "${app.name}" has been launched.`,
      });
      await get().fetchInstalledApps();
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Uninstall command error: ${errMsg}` });
      addToast({ type: 'error', title: 'Uninstall Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },
});

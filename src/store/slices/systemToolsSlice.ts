import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  ExecutionSummary,
  RestorePoint,
  MetricSnapshot,
  SystemMetricsPayload,
  SystemTemperaturesPayload,
  ThermalStatus,
  StartupItem,
  ScheduledTaskItem,
  OdtConfig,
  MasMethod,
} from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface SystemToolsSlice {
  classicContextMenuEnabled: boolean;
  isContextMenuLoading: boolean;
  selectedDnsProvider: string;
  setSelectedDnsProvider: (provider: string) => void;
  setDnsServer: (provider: string, interfaceAlias?: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  fetchClassicContextMenuStatus: () => Promise<boolean>;
  toggleClassicContextMenu: (enable: boolean, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  driverBackupPath: string;
  isDriverBackupLoading: boolean;
  setDriverBackupPath: (path: string) => void;
  backupDrivers: (outputDir: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  restorePoints: RestorePoint[];
  isLoadingRestorePoints: boolean;
  fetchRestorePoints: () => Promise<RestorePoint[]>;
  createRestorePoint: (description: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  restoreSystemToPoint: (sequenceNumber: number, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  metricsHistory: MetricSnapshot[];
  currentMetrics: MetricSnapshot | null;
  isPollingActive: boolean;
  pollingIntervalMs: number;
  setPollingIntervalMs: (interval: number) => void;
  togglePollingActive: () => void;
  pushMetricSnapshot: (snapshot: MetricSnapshot) => void;
  fetchLatestMetrics: () => Promise<MetricSnapshot | null>;

  startupItems: StartupItem[];
  isStartupLoading: boolean;
  fetchStartupItems: () => Promise<StartupItem[]>;
  toggleStartupItem: (id: string, arg2?: boolean | string, arg3?: string, arg4?: boolean) => Promise<ExecutionSummary | null>;
  removeStartupItem: (id: string, valueName?: string, location?: string) => Promise<ExecutionSummary | null>;

  scheduledTasks: ScheduledTaskItem[];
  isSchedulerLoading: boolean;
  fetchScheduledTasks: () => Promise<ScheduledTaskItem[]>;
  toggleScheduledTask: (taskName: string, taskPath: string, enable: boolean) => Promise<ExecutionSummary | null>;
  runScheduledTask: (taskName: string, taskPath: string) => Promise<ExecutionSummary | null>;

  odtConfig: OdtConfig;
  updateOdtConfig: (patch: Partial<OdtConfig>) => void;
  generatedXml: string;
  setGeneratedXml: (xml: string) => void;

  selectedMasMethod: MasMethod;
  setSelectedMasMethod: (method: MasMethod) => void;
}

export const createSystemToolsSlice: StateCreator<AppState, [], [], SystemToolsSlice> = (set, get) => ({
  classicContextMenuEnabled: false,
  isContextMenuLoading: false,
  selectedDnsProvider: 'adguard',

  setSelectedDnsProvider: (provider: string) => set({ selectedDnsProvider: provider }),

  setDnsServer: async (provider: string, interfaceAlias?: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({
      level: 'cmd',
      message: `Setting DNS provider: ${provider} (interface: ${interfaceAlias || 'All Active'}, dryRun: ${currentDryRun})`,
    });
    try {
      const summary = await invoke<ExecutionSummary>('set_dns_server', {
        provider,
        interfaceAlias: interfaceAlias || null,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Set DNS server (${provider}) completed: ${summary.success ? 'Success' : 'Failed'}`,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || `Set DNS server ${provider} failed`;
        addToast({ type: 'error', title: 'DNS Configuration Failed', message: errMsg });
      } else {
        addToast({ type: 'success', title: 'DNS Server Updated', message: `DNS resolver updated to ${provider}.` });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Set DNS server failed: ${errMsg}` });
      addToast({ type: 'error', title: 'DNS Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  fetchClassicContextMenuStatus: async () => {
    set({ isContextMenuLoading: true });
    try {
      const status = await invoke<boolean>('get_classic_context_menu_status');
      set({ classicContextMenuEnabled: status });
      get().addLog({ level: 'info', message: `Classic context menu active: ${status}` });
      return status;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      get().addLog({ level: 'error', message: `Fetch classic context menu status failed: ${errMsg}` });
      return false;
    } finally {
      set({ isContextMenuLoading: false });
    }
  },

  toggleClassicContextMenu: async (enable: boolean, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Toggling classic context menu: ${enable} (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('toggle_classic_context_menu', {
        enable,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Toggle classic context menu (${enable}) result: ${summary.success ? 'Success' : 'Failed'}`,
      });

      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Context menu modification failed';
        addToast({ type: 'error', title: 'Context Menu Toggle Failed', message: errMsg });
        return summary;
      }

      if (!currentDryRun) {
        set({ classicContextMenuEnabled: enable });
        addToast({ type: 'success', title: 'Context Menu Updated', message: enable ? 'Classic Windows 10 context menu enabled.' : 'Modern Windows 11 context menu restored.' });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Toggle classic context menu failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Context Menu Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  driverBackupPath: 'C:\\DriverBackup',
  isDriverBackupLoading: false,
  setDriverBackupPath: (path: string) => set({ driverBackupPath: path }),

  backupDrivers: async (outputDir: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Exporting drivers to "${outputDir}" (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('backup_drivers', {
        outputDir,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Driver export to "${outputDir}" result: ${summary.success ? 'Success' : 'Failed'}`,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Driver export failed';
        addToast({ type: 'error', title: 'Driver Backup Failed', message: errMsg });
      } else {
        addToast({ type: 'success', title: 'Driver Backup Complete', message: `Exported drivers to "${outputDir}".` });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Backup drivers failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Driver Backup Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  restorePoints: [],
  isLoadingRestorePoints: false,

  fetchRestorePoints: async () => {
    set({ isLoadingRestorePoints: true });
    get().addLog({ level: 'cmd', message: 'Fetching System Restore Points' });
    try {
      const points = await invoke<RestorePoint[]>('get_restore_points');
      set({ restorePoints: points });
      get().addLog({ level: 'info', message: `Retrieved ${points.length} system restore points` });
      return points;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      get().addLog({ level: 'error', message: `Fetch restore points failed: ${errMsg}` });
      get().addToast({ type: 'error', title: 'Fetch Restore Points Error', message: errMsg });
      set({ restorePoints: [] });
      return [];
    } finally {
      set({ isLoadingRestorePoints: false });
    }
  },

  createRestorePoint: async (description: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Creating restore point "${description}" (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('create_restore_point', {
        description,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Create restore point ("${description}") result: ${summary.success ? 'Success' : 'Failed'}`,
      });

      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Create restore point failed';
        addToast({ type: 'error', title: 'Create Restore Point Failed', message: errMsg });
        return summary;
      }

      await get().fetchRestorePoints();
      addToast({ type: 'success', title: 'Restore Point Created', message: `Created restore point "${description}".` });
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Create restore point failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Create Restore Point Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  restoreSystemToPoint: async (sequenceNumber: number, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({ level: 'cmd', message: `Restoring system to point #${sequenceNumber} (dryRun: ${currentDryRun})` });
    try {
      const summary = await invoke<ExecutionSummary>('restore_system_point', {
        sequenceNumber,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `System restore to #${sequenceNumber} result: ${summary.success ? 'Success' : 'Failed'}`,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || `System restore to #${sequenceNumber} failed`;
        addToast({ type: 'error', title: 'System Rollback Failed', message: errMsg });
      } else {
        addToast({ type: 'success', title: 'System Rollback Initiated', message: `System rollback to checkpoint #${sequenceNumber} started.` });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `System restore to #${sequenceNumber} failed: ${errMsg}` });
      addToast({ type: 'error', title: 'System Rollback Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  metricsHistory: [],
  currentMetrics: null,
  isPollingActive: true,
  pollingIntervalMs: 2000,
  setPollingIntervalMs: (interval) => set({ pollingIntervalMs: interval }),
  togglePollingActive: () => set((state) => ({ isPollingActive: !state.isPollingActive })),
  pushMetricSnapshot: (snapshot) =>
    set((state) => ({
      currentMetrics: snapshot,
      metricsHistory: [...state.metricsHistory, snapshot].slice(-30),
    })),
  fetchLatestMetrics: async () => {
    try {
      const metricsPayload = await invoke<SystemMetricsPayload>('get_system_metrics');
      const tempsPayload = await invoke<SystemTemperaturesPayload>('get_system_temperatures');

      const getThermalStatus = (temp: number | null): ThermalStatus => {
        if (temp === null) return 'unknown';
        if (temp > 80) return 'hot';
        if (temp >= 65) return 'warm';
        return 'normal';
      };

      const snapshot: MetricSnapshot = {
        timestamp: metricsPayload.timestampMs || Date.now(),
        cpuUsagePercent: metricsPayload.cpuUsagePercent,
        memoryUsedMb: metricsPayload.memoryUsedMb,
        memoryTotalMb: metricsPayload.memoryTotalMb,
        memoryUsagePercent: metricsPayload.memoryUsagePercent,
        diskReadBytesPerSec: metricsPayload.diskReadBytesPerSec,
        diskWriteBytesPerSec: metricsPayload.diskWriteBytesPerSec,
        networkRxBytesPerSec: metricsPayload.networkRxBytesPerSec,
        networkTxBytesPerSec: metricsPayload.networkTxBytesPerSec,
        cpuTempC: tempsPayload.cpuTempCelsius,
        gpuTempC: tempsPayload.gpuTempCelsius,
        cpuThermalStatus: getThermalStatus(tempsPayload.cpuTempCelsius),
        gpuThermalStatus: getThermalStatus(tempsPayload.gpuTempCelsius),
      };

      get().pushMetricSnapshot(snapshot);
      return snapshot;
    } catch (e) {
      const ramUsed = Math.floor(4000 + Math.random() * 1500);
      const ramTotal = 16384;
      const simSnapshot: MetricSnapshot = {
        timestamp: Date.now(),
        cpuUsagePercent: Math.floor(10 + Math.random() * 25),
        memoryUsedMb: ramUsed,
        memoryTotalMb: ramTotal,
        memoryUsagePercent: (ramUsed / ramTotal) * 100,
        diskReadBytesPerSec: Math.floor(Math.random() * 5000000),
        diskWriteBytesPerSec: Math.floor(Math.random() * 2000000),
        networkRxBytesPerSec: Math.floor(Math.random() * 1000000),
        networkTxBytesPerSec: Math.floor(Math.random() * 300000),
        cpuTempC: Math.floor(45 + Math.random() * 15),
        gpuTempC: Math.floor(40 + Math.random() * 12),
        cpuThermalStatus: 'normal',
        gpuThermalStatus: 'normal',
      };
      get().pushMetricSnapshot(simSnapshot);
      return simSnapshot;
    }
  },

  startupItems: [],
  isStartupLoading: false,
  fetchStartupItems: async () => {
    set({ isStartupLoading: true });
    try {
      const items = await invoke<StartupItem[]>('get_startup_items', {
        dryRun: get().dryRunMode,
      });
      set({ startupItems: items, isStartupLoading: false });
      return items;
    } catch (e) {
      set({ isStartupLoading: false });
      return [];
    }
  },
  toggleStartupItem: async (id, arg2, arg3, arg4) => {
    let enable = false;
    let valueName: string | undefined = undefined;
    let location: string | undefined = undefined;

    if (typeof arg2 === 'boolean') {
      enable = arg2;
      const item = get().startupItems.find((i) => i.id === id);
      if (item) {
        valueName = item.valueName || item.name;
        location = item.location;
      }
    } else {
      valueName = arg2;
      location = arg3;
      enable = arg4 ?? false;
    }

    try {
      const summary = await invoke<ExecutionSummary>('toggle_startup_item', {
        id,
        valueName,
        location,
        enable,
        dryRun: get().dryRunMode,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Toggle startup app failed';
        get().addToast({ type: 'error', title: 'Toggle Startup App Failed', message: errMsg });
      } else {
        get().addToast({ type: 'success', title: 'Startup App Updated', message: `Startup item status updated.` });
      }
      await get().fetchStartupItems();
      return summary;
    } catch (e) {
      get().addToast({ type: 'error', title: 'Toggle Startup App Failed', message: getErrorMessage(e) });
      return null;
    }
  },
  removeStartupItem: async (id, valueNameArg, locationArg) => {
    let valueName = valueNameArg;
    let location = locationArg;

    if (!valueName || !location) {
      const item = get().startupItems.find((i) => i.id === id);
      if (item) {
        valueName = valueName || item.valueName || item.name;
        location = location || item.location;
      }
    }

    try {
      const summary = await invoke<ExecutionSummary>('remove_startup_item', {
        id,
        valueName,
        location,
        dryRun: get().dryRunMode,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Remove startup app failed';
        get().addToast({ type: 'error', title: 'Remove Startup App Failed', message: errMsg });
      } else {
        get().addToast({ type: 'success', title: 'Startup App Removed', message: `Startup item removed.` });
      }
      await get().fetchStartupItems();
      return summary;
    } catch (e) {
      get().addToast({ type: 'error', title: 'Remove Startup App Failed', message: getErrorMessage(e) });
      return null;
    }
  },

  scheduledTasks: [],
  isSchedulerLoading: false,
  fetchScheduledTasks: async () => {
    set({ isSchedulerLoading: true });
    try {
      const tasks = await invoke<ScheduledTaskItem[]>('get_scheduled_tasks', {
        dryRun: get().dryRunMode,
      });
      set({ scheduledTasks: tasks, isSchedulerLoading: false });
      return tasks;
    } catch (e) {
      set({ isSchedulerLoading: false });
      return [];
    }
  },
  toggleScheduledTask: async (taskName, taskPath, enable) => {
    try {
      const summary = await invoke<ExecutionSummary>('toggle_scheduled_task', {
        taskName,
        taskPath,
        enable,
        dryRun: get().dryRunMode,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Toggle scheduled task failed';
        get().addToast({ type: 'error', title: 'Toggle Task Failed', message: errMsg });
      } else {
        get().addToast({ type: 'success', title: 'Scheduled Task Updated', message: `Task '${taskName}' ${enable ? 'enabled' : 'disabled'}.` });
      }
      await get().fetchScheduledTasks();
      return summary;
    } catch (e) {
      get().addToast({ type: 'error', title: 'Toggle Task Failed', message: getErrorMessage(e) });
      return null;
    }
  },
  runScheduledTask: async (taskName, taskPath) => {
    try {
      const summary = await invoke<ExecutionSummary>('run_scheduled_task', {
        taskName,
        taskPath,
        dryRun: get().dryRunMode,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || 'Run scheduled task failed';
        get().addToast({ type: 'error', title: 'Run Task Failed', message: errMsg });
      } else {
        get().addToast({
          type: 'success',
          title: 'Task Execution Triggered',
          message: `Triggered '${taskName}' successfully.`,
        });
      }
      await get().fetchScheduledTasks();
      return summary;
    } catch (e) {
      get().addToast({ type: 'error', title: 'Run Task Failed', message: getErrorMessage(e) });
      return null;
    }
  },

  odtConfig: {
    architecture: 'x64',
    channel: 'Current',
    products: ['O365ProPlusRetail'],
    excludedApps: [],
    language: 'en-us',
    removeExistingOffice: true,
    acceptEula: true,
  },
  updateOdtConfig: (patch) =>
    set((state) => ({ odtConfig: { ...state.odtConfig, ...patch } })),
  generatedXml: '',
  setGeneratedXml: (xml) => set({ generatedXml: xml }),

  selectedMasMethod: 'HWID',
  setSelectedMasMethod: (method) => set({ selectedMasMethod: method }),
});

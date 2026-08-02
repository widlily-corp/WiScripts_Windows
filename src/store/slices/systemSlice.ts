import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  SystemInfo,
  TabType,
  ExecutionSummary,
  GitHubIssuePayload,
  GitHubIssueResult,
} from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface SystemSlice {
  dryRunMode: boolean;
  setDryRunMode: (enabled: boolean) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  systemInfo: SystemInfo | null;
  isElevated: boolean;
  isSystemLoading: boolean;
  checkElevation: () => Promise<boolean>;
  setSystemInfo: (info: SystemInfo) => void;
  setSystemLoading: (loading: boolean) => void;

  runDiagnostics: (action: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  exportDiagnosticDump: () => Promise<string>;
  createGitHubIssue: (payload: GitHubIssuePayload) => Promise<GitHubIssueResult>;
}

export const createSystemSlice: StateCreator<AppState, [], [], SystemSlice> = (set, get) => ({
  dryRunMode: false,
  setDryRunMode: (enabled) => set({ dryRunMode: enabled }),
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),

  systemInfo: {
    osName: 'Windows 11 Pro',
    osVersion: '23H2',
    osBuild: '22631.3880',
    isElevated: true,
    cpuUsagePercent: 12,
    memoryUsedMb: 6144,
    memoryTotalMb: 16384,
    telemetryStatus: 'Active',
  },
  isElevated: true,
  isSystemLoading: false,

  checkElevation: async () => {
    try {
      const info = await invoke<SystemInfo>('get_system_info');
      set({ systemInfo: info, isElevated: info.isElevated });
      return info.isElevated;
    } catch (err) {
      return false;
    }
  },

  setSystemInfo: (info) => set({ systemInfo: info, isElevated: info.isElevated }),
  setSystemLoading: (loading) => set({ isSystemLoading: loading }),

  runDiagnostics: async (action: string, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    addLog({
      level: 'cmd',
      message: `Invoking run_diagnostics: ${action} (dryRun: ${currentDryRun})`,
    });
    try {
      const summary = await invoke<ExecutionSummary>('run_diagnostics', {
        action,
        dryRun: currentDryRun,
      });
      addLog({
        level: summary.success ? 'info' : 'error',
        message: `Diagnostics ${action} finished: ${summary.success ? 'Success' : 'Failed'} (${summary.totalDurationMs}ms)`,
      });
      if (!summary.success) {
        const errAction = summary.executedActions.find((a) => a.output.exitCode !== 0);
        const errMsg = errAction?.output.stderr.trim() || errAction?.output.stdout.trim() || `Diagnostics ${action} returned failure status`;
        addToast({ type: 'error', title: 'Diagnostics Failed', message: errMsg });
      } else {
        addToast({ type: 'success', title: 'Diagnostics Completed', message: `Diagnostics action ${action} completed successfully.` });
      }
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Diagnostics ${action} failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Diagnostics Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  exportDiagnosticDump: async () => {
    const { addLog } = get();
    addLog({
      level: 'cmd',
      message: 'Invoking export_diagnostic_dump',
    });
    try {
      const path = await invoke<string>('export_diagnostic_dump');
      addLog({
        level: 'info',
        message: `Diagnostic dump exported successfully to: ${path}`,
      });
      return path;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Failed to export diagnostic dump: ${errMsg}` });
      throw new Error(errMsg);
    }
  },

  createGitHubIssue: async (payload: GitHubIssuePayload) => {
    const { addLog } = get();
    addLog({
      level: 'cmd',
      message: `Creating GitHub Issue: "${payload.title}" (${payload.category})`,
    });
    try {
      const res = await invoke<GitHubIssueResult>('create_github_issue', { payload });
      if (res.success) {
        addLog({
          level: 'info',
          message: `GitHub Issue submitted successfully via ${res.method}: ${res.issueUrl || ''}`,
        });
      } else {
        addLog({
          level: 'error',
          message: `GitHub Issue submission error: ${res.error || 'Unknown error'}`,
        });
      }
      return res;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Failed to submit GitHub Issue: ${errMsg}` });
      throw new Error(errMsg);
    }
  },
});

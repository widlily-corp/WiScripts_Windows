import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { NetworkConnection, FirewallRuleInfo, FirewallActionResult } from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface NetworkShieldSlice {
  connections: NetworkConnection[];
  firewallRules: FirewallRuleInfo[];
  isNetworkLoading: boolean;
  networkError: string | null;

  fetchActiveConnections: () => Promise<NetworkConnection[]>;
  fetchFirewallRules: () => Promise<FirewallRuleInfo[]>;
  blockProcessFirewall: (processPath: string, ruleName: string) => Promise<FirewallActionResult | null>;
  unblockProcessFirewall: (ruleName: string) => Promise<FirewallActionResult | null>;
}

export const createNetworkShieldSlice: StateCreator<AppState, [], [], NetworkShieldSlice> = (set, get) => ({
  connections: [],
  firewallRules: [],
  isNetworkLoading: false,
  networkError: null,

  fetchActiveConnections: async () => {
    try {
      const connections = await invoke<NetworkConnection[]>('get_active_network_connections');
      set({ connections, networkError: null });
      return connections;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ networkError: errMsg });
      return [];
    }
  },

  fetchFirewallRules: async () => {
    try {
      const rules = await invoke<FirewallRuleInfo[]>('get_firewall_rules');
      set({ firewallRules: rules, networkError: null });
      return rules;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ networkError: errMsg });
      return [];
    }
  },

  blockProcessFirewall: async (processPath: string, ruleName: string) => {
    const { addLog, addToast } = get();
    set({ isNetworkLoading: true, networkError: null });
    addLog({
      level: 'cmd',
      message: `Creating outbound/inbound Windows Firewall block rule "${ruleName}" for: ${processPath}`,
    });
    try {
      const result = await invoke<FirewallActionResult>('block_process_firewall', {
        processPath,
        ruleName,
      });
      set({ isNetworkLoading: false });
      addLog({
        level: 'info',
        message: `Firewall block rule "${result.ruleName}" created successfully`,
      });
      addToast({
        type: 'success',
        title: 'Firewall Rule Created',
        message: `Blocked ${processPath.split('\\').pop() || processPath} in Windows Firewall.`,
      });
      await get().fetchFirewallRules();
      return result;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isNetworkLoading: false, networkError: errMsg });
      addLog({ level: 'error', message: `Failed to create firewall block rule: ${errMsg}` });
      addToast({ type: 'error', title: 'Firewall Block Error', message: errMsg });
      return null;
    }
  },

  unblockProcessFirewall: async (ruleName: string) => {
    const { addLog, addToast } = get();
    set({ isNetworkLoading: true, networkError: null });
    addLog({
      level: 'cmd',
      message: `Removing Windows Firewall rule "${ruleName}"...`,
    });
    try {
      const result = await invoke<FirewallActionResult>('unblock_process_firewall', { ruleName });
      set({ isNetworkLoading: false });
      addLog({
        level: 'info',
        message: `Firewall rule "${result.ruleName}" deleted successfully`,
      });
      addToast({
        type: 'success',
        title: 'Firewall Rule Removed',
        message: `Unblocked rule "${result.ruleName}".`,
      });
      await get().fetchFirewallRules();
      return result;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ isNetworkLoading: false, networkError: errMsg });
      addLog({ level: 'error', message: `Failed to remove firewall rule: ${errMsg}` });
      addToast({ type: 'error', title: 'Firewall Unblock Error', message: errMsg });
      return null;
    }
  },
});

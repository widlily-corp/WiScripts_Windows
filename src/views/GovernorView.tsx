import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Cpu,
  Zap,
  HardDrive,
  Activity,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Sliders,
  Check,
  X,
  Volume2,
  ShieldCheck,
} from 'lucide-react';
import { ResourceGovernorRule, GovernorStatus, ManagedProcessInfo } from '../types/governor';
import { useAppStore } from '../store/useAppStore';

const PRIORITIES = [
  { id: 'IDLE', label: 'Idle (Lowest)', color: 'text-text-muted bg-surface-subtle border-border' },
  { id: 'BELOW_NORMAL', label: 'Below Normal', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { id: 'NORMAL', label: 'Normal', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'ABOVE_NORMAL', label: 'Above Normal', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { id: 'HIGH', label: 'High Priority', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  { id: 'REALTIME', label: 'Realtime (Max)', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
];

export function GovernorView() {
  const { t } = useTranslation();
  const addToast = useAppStore((s) => s.addToast);

  const [status, setStatus] = useState<GovernorStatus | null>(null);
  const [activeRules, setActiveRules] = useState<ResourceGovernorRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [trimmingPid, setTrimmingPid] = useState<number | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProcessName, setEditingProcessName] = useState<string>('');
  const [selectedPriority, setSelectedPriority] = useState<string>('HIGH');
  const [selectedCores, setSelectedCores] = useState<number[]>([0, 1, 2, 3, 4, 5, 6, 7]);
  const [audioEndpoint, setAudioEndpoint] = useState<string>('');
  const [memoryTrimThreshold, setMemoryTrimThreshold] = useState<string>('');

  const fetchGovernorData = async () => {
    try {
      const [newStatus, rules] = await Promise.all([
        invoke<GovernorStatus>('get_governor_status'),
        invoke<ResourceGovernorRule[]>('list_active_rules'),
      ]);
      setStatus(newStatus);
      setActiveRules(rules);
    } catch (err) {
      console.error('Failed to fetch governor status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGovernorData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchGovernorData, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const calculateMaskFromCores = (cores: number[]): string => {
    if (cores.length === 0) return '0x00000001';
    let mask = 0;
    for (const core of cores) {
      mask |= 1 << core;
    }
    return `0x${(mask >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  };

  const handleOpenAddModal = (processName: string = '') => {
    setEditingProcessName(processName);
    setSelectedPriority('HIGH');
    setSelectedCores([0, 1, 2, 3, 4, 5, 6, 7]);
    setAudioEndpoint('');
    setMemoryTrimThreshold('');
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProcessName.trim()) {
      addToast({ type: 'error', title: t('governor.error'), message: 'Process name is required' });
      return;
    }

    const mask = calculateMaskFromCores(selectedCores);
    const rule: ResourceGovernorRule = {
      processName: editingProcessName.trim(),
      targetPriority: selectedPriority,
      coreAffinityMask: mask,
      audioEndpointId: audioEndpoint.trim() ? audioEndpoint.trim() : null,
      autoTrimMemoryMbThreshold: memoryTrimThreshold.trim() ? parseInt(memoryTrimThreshold, 10) : null,
    };

    try {
      await invoke('apply_process_governor_rule', { rule });
      addToast({
        type: 'success',
        title: t('governor.rule_applied', 'Rule Applied'),
        message: `Governor rule configured for ${rule.processName}`,
      });
      setIsModalOpen(false);
      fetchGovernorData();
    } catch (err) {
      addToast({
        type: 'error',
        title: t('governor.error', 'Error'),
        message: String(err),
      });
    }
  };

  const handleDeleteRule = async (processName: string) => {
    try {
      await invoke('delete_governor_rule', { processName });
      addToast({
        type: 'info',
        title: t('governor.rule_deleted', 'Rule Deleted'),
        message: `Removed governor rule for ${processName}`,
      });
      fetchGovernorData();
    } catch (err) {
      addToast({ type: 'error', title: t('governor.error', 'Error'), message: String(err) });
    }
  };

  const handleTrimRam = async (pid: number, processName: string) => {
    setTrimmingPid(pid);
    try {
      const trimmedMb = await invoke<number>('trim_process_working_set', { pid });
      addToast({
        type: 'success',
        title: t('governor.ram_trimmed', 'RAM Trimmed'),
        message: `Trimmed ${trimmedMb} MB working set for ${processName} (PID ${pid})`,
      });
      fetchGovernorData();
    } catch (err) {
      addToast({ type: 'error', title: t('governor.error', 'Error'), message: String(err) });
    } finally {
      setTrimmingPid(null);
    }
  };

  const handleQuickPriorityChange = async (proc: ManagedProcessInfo, newPriority: string) => {
    const existingRule = activeRules.find(
      (r) => r.processName.toLowerCase() === proc.name.toLowerCase()
    );
    const rule: ResourceGovernorRule = {
      processName: proc.name,
      targetPriority: newPriority,
      coreAffinityMask: existingRule ? existingRule.coreAffinityMask : '0x000000FF',
      audioEndpointId: existingRule?.audioEndpointId || null,
      autoTrimMemoryMbThreshold: existingRule?.autoTrimMemoryMbThreshold || null,
    };

    try {
      await invoke('apply_process_governor_rule', { rule });
      addToast({
        type: 'success',
        title: t('governor.priority_updated', 'Priority Updated'),
        message: `Set ${proc.name} priority to ${newPriority}`,
      });
      fetchGovernorData();
    } catch (err) {
      addToast({ type: 'error', title: t('governor.error', 'Error'), message: String(err) });
    }
  };

  const filteredProcesses = useMemo(() => {
    if (!status?.managedProcesses) return [];
    if (!searchQuery.trim()) return status.managedProcesses;
    const q = searchQuery.toLowerCase();
    return status.managedProcesses.filter(
      (p) => p.name.toLowerCase().includes(q) || p.pid.toString().includes(q)
    );
  }, [status, searchQuery]);

  const toggleCore = (coreIndex: number) => {
    if (selectedCores.includes(coreIndex)) {
      if (selectedCores.length === 1) return; // Must keep at least 1 core
      setSelectedCores(selectedCores.filter((c) => c !== coreIndex));
    } else {
      setSelectedCores([...selectedCores, coreIndex].sort((a, b) => a - b));
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Cpu className="h-5 w-5 text-brand" />
            {t('governor.title', 'ProFlow & Dynamic Resource Governor')}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            {t(
              'governor.subtitle',
              'Real-time CPU spike suppression, process priority allocation, core affinity tuning, and working set RAM optimizer.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-xs font-medium rounded-[6px] border transition-colors flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-brand/10 text-brand border-brand/30'
                : 'bg-surface-subtle text-text-muted border-border'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? t('governor.live_monitoring', 'Live Polling ON') : t('governor.paused', 'Paused')}
          </button>
          <button
            onClick={fetchGovernorData}
            className="px-3 py-1.5 text-xs font-medium rounded-[6px] bg-surface-subtle border border-border text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('common.refresh', 'Refresh')}
          </button>
          <button
            onClick={() => handleOpenAddModal()}
            className="px-3 py-1.5 text-xs font-medium rounded-[6px] bg-brand text-black hover:bg-brand-hover transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('governor.add_rule', 'Create Governor Rule')}
          </button>
        </div>
      </div>

      {/* ProBalance Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Active Rules */}
        <div className="rounded-[6px] bg-surface border border-border p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider font-mono">
              {t('governor.active_rules_count', 'Active Rules')}
            </span>
            <div className="text-2xl font-bold mt-1 text-text-primary">
              {status?.activeRulesCount ?? 0}
            </div>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
              <ShieldCheck className="h-3 w-3" />
              {t('governor.rules_enforced', 'Rule Enforcement Active')}
            </span>
          </div>
          <div className="h-10 w-10 rounded-[6px] bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
            <Sliders className="h-5 w-5" />
          </div>
        </div>

        {/* Card 2: ProBalance Events */}
        <div className="rounded-[6px] bg-surface border border-border p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider font-mono">
              {t('governor.pro_balance_events', 'ProBalance Suppressions')}
            </span>
            <div className="text-2xl font-bold mt-1 text-amber-400">
              {status?.proBalanceEventsTriggered ?? 0}
            </div>
            <span className="text-[11px] text-text-muted flex items-center gap-1 mt-1">
              <Zap className="h-3 w-3 text-amber-400" />
              {t('governor.cpu_spikes_mitigated', 'CPU Spikes Prevented')}
            </span>
          </div>
          <div className="h-10 w-10 rounded-[6px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Activity className="h-5 w-5" />
          </div>
        </div>

        {/* Card 3: Memory Trimmed */}
        <div className="rounded-[6px] bg-surface border border-border p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider font-mono">
              {t('governor.total_memory_trimmed', 'Total RAM Reclaimed')}
            </span>
            <div className="text-2xl font-bold mt-1 text-blue-400">
              {status ? `${status.totalMemoryTrimmedMb} MB` : '0 MB'}
            </div>
            <span className="text-[11px] text-text-muted flex items-center gap-1 mt-1">
              <HardDrive className="h-3 w-3 text-blue-400" />
              {t('governor.working_set_trimmed', 'WorkingSet Optimized')}
            </span>
          </div>
          <div className="h-10 w-10 rounded-[6px] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <HardDrive className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Active Rules Table Section */}
      {activeRules.length > 0 && (
        <div className="rounded-[6px] bg-surface border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-text-primary">
            <ShieldCheck className="h-4 w-4 text-brand" />
            {t('governor.active_rules_title', 'Configured Governor Rules')} ({activeRules.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted font-mono uppercase tracking-wider">
                  <th className="py-2 px-3">{t('governor.process_name', 'Process Name')}</th>
                  <th className="py-2 px-3">{t('governor.target_priority', 'Target Priority')}</th>
                  <th className="py-2 px-3">{t('governor.affinity_mask', 'Core Mask')}</th>
                  <th className="py-2 px-3">{t('governor.audio_endpoint', 'Audio Route')}</th>
                  <th className="py-2 px-3">{t('governor.auto_trim_threshold', 'Auto Trim RAM')}</th>
                  <th className="py-2 px-3 text-right">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {activeRules.map((rule) => {
                  const prio = PRIORITIES.find((p) => p.id === rule.targetPriority);
                  return (
                    <tr key={rule.processName} className="hover:bg-surface-hover/50">
                      <td className="py-2.5 px-3 font-mono text-text-primary font-medium">
                        {rule.processName}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${prio?.color || ''}`}>
                          {prio?.label || rule.targetPriority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-text-secondary">
                        {rule.coreAffinityMask}
                      </td>
                      <td className="py-2.5 px-3 text-text-muted">
                        {rule.audioEndpointId ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <Volume2 className="h-3 w-3" />
                            Endpoint Routed
                          </span>
                        ) : (
                          'Default'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-text-muted">
                        {rule.autoTrimMemoryMbThreshold
                          ? `> ${rule.autoTrimMemoryMbThreshold} MB`
                          : 'Disabled'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDeleteRule(rule.processName)}
                          className="p-1.5 text-text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                          title={t('common.delete', 'Delete Rule')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Managed Running Processes List */}
      <div className="rounded-[6px] bg-surface border border-border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand" />
              {t('governor.running_processes', 'Active Process Governor Monitor')}
              <span className="text-xs font-normal text-text-muted">
                ({filteredProcesses.length} processes)
              </span>
            </h3>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('governor.search_process', 'Filter processes...')}
              className="w-full bg-background border border-border rounded-[6px] pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand/50"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-text-muted text-xs flex flex-col items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-brand" />
            <span>Scanning running processes & governor status...</span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface border-b border-border text-text-muted font-mono uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">PID</th>
                  <th className="py-2.5 px-3">{t('governor.process_name', 'Process Name')}</th>
                  <th className="py-2.5 px-3">{t('governor.cpu_usage', 'CPU %')}</th>
                  <th className="py-2.5 px-3">{t('governor.priority', 'Priority')}</th>
                  <th className="py-2.5 px-3">{t('governor.assigned_cores', 'Assigned Cores')}</th>
                  <th className="py-2.5 px-3 text-right">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredProcesses.map((proc) => {
                  const hasRule = activeRules.some(
                    (r) => r.processName.toLowerCase() === proc.name.toLowerCase()
                  );
                  return (
                    <tr key={proc.pid} className="hover:bg-surface-hover/50">
                      <td className="py-2.5 px-3 font-mono text-text-muted">{proc.pid}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-text-primary flex items-center gap-2">
                        {proc.name}
                        {hasRule && (
                          <span className="px-1.5 py-0.2 text-[9px] rounded font-mono bg-brand/20 text-brand border border-brand/30">
                            RULE
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={`font-semibold ${
                            proc.cpuUsage > 25
                              ? 'text-rose-400'
                              : proc.cpuUsage > 10
                              ? 'text-amber-400'
                              : 'text-text-secondary'
                          }`}
                        >
                          {proc.cpuUsage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={proc.currentPriority}
                          onChange={(e) => handleQuickPriorityChange(proc, e.target.value)}
                          className="bg-background border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-brand"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-text-muted">{proc.assignedCores}</td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <button
                          onClick={() => handleTrimRam(proc.pid, proc.name)}
                          disabled={trimmingPid === proc.pid}
                          className="px-2 py-1 text-[11px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          {trimmingPid === proc.pid ? 'Trimming...' : 'Trim RAM'}
                        </button>
                        <button
                          onClick={() => handleOpenAddModal(proc.name)}
                          className="px-2 py-1 text-[11px] font-medium rounded bg-surface-subtle text-text-secondary border border-border hover:text-text-primary transition-colors"
                        >
                          Config Rule
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-[8px] w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Sliders className="h-4 w-4 text-brand" />
                {t('governor.rule_modal_title', 'Configure Process Governor Rule')}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text-primary p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
              {/* Process Name */}
              <div>
                <label className="block font-medium text-text-secondary mb-1">
                  {t('governor.process_name', 'Process Name')}
                </label>
                <input
                  type="text"
                  value={editingProcessName}
                  onChange={(e) => setEditingProcessName(e.target.value)}
                  placeholder="e.g. chrome.exe, csgo.exe"
                  className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-text-primary focus:outline-none focus:border-brand"
                  required
                />
              </div>

              {/* Target Priority */}
              <div>
                <label className="block font-medium text-text-secondary mb-1">
                  {t('governor.target_priority', 'Target Priority Class')}
                </label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-text-primary focus:outline-none focus:border-brand"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* CPU Core Affinity Selector */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="font-medium text-text-secondary">
                    {t('governor.core_affinity', 'CPU Core Affinity Assignment')}
                  </label>
                  <span className="font-mono text-brand text-[11px]">
                    Mask: {calculateMaskFromCores(selectedCores)}
                  </span>
                </div>
                <div className="grid grid-cols-8 gap-1.5 p-3 bg-background border border-border rounded-[6px]">
                  {Array.from({ length: 16 }).map((_, idx) => {
                    const isSelected = selectedCores.includes(idx);
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => toggleCore(idx)}
                        className={`py-1.5 text-center font-mono text-[11px] rounded transition-colors ${
                          isSelected
                            ? 'bg-brand text-black font-semibold'
                            : 'bg-surface-subtle text-text-muted hover:text-text-primary border border-border/50'
                        }`}
                      >
                        C{idx}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Memory Trim Threshold */}
              <div>
                <label className="block font-medium text-text-secondary mb-1">
                  {t('governor.auto_trim_threshold_label', 'Auto RAM Trim Threshold (MB, Optional)')}
                </label>
                <input
                  type="number"
                  value={memoryTrimThreshold}
                  onChange={(e) => setMemoryTrimThreshold(e.target.value)}
                  placeholder="e.g. 1024 to auto-trim RAM when process exceeds 1GB"
                  className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-text-primary focus:outline-none focus:border-brand"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-[6px] bg-surface-subtle text-text-secondary hover:text-text-primary border border-border"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-black hover:bg-brand-hover shadow-sm"
                >
                  {t('common.save', 'Save Rule')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

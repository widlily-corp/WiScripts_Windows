import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Cpu,
  Zap,
  HardDrive,
  Activity,
  Plus,
  RefreshCw,
  Sliders,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { ResourceGovernorRule, GovernorStatus, ManagedProcessInfo } from '../types/governor';
import { useAppStore } from '../store/useAppStore';
import { getErrorMessage } from '../utils';
import { calculateMaskFromCores, getLogicalCoreCount } from './Governor/governorUtils';
import { GovernorRuleModal } from './Governor/GovernorRuleModal';
import { GovernorActiveRulesCard } from './Governor/GovernorActiveRulesCard';
import { GovernorProcessTable } from './Governor/GovernorProcessTable';

export function GovernorView() {
  const { t } = useTranslation();
  const addToast = useAppStore((s) => s.addToast);
  const coreCount = useMemo(() => getLogicalCoreCount(0), []);

  const [status, setStatus] = useState<GovernorStatus | null>(null);
  const [activeRules, setActiveRules] = useState<ResourceGovernorRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [trimmingPid, setTrimmingPid] = useState<number | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProcessName, setEditingProcessName] = useState<string>('');
  const [selectedPriority, setSelectedPriority] = useState<string>('HIGH');
  const [selectedCores, setSelectedCores] = useState<number[]>(() =>
    Array.from({ length: coreCount }, (_, i) => i)
  );
  const [audioEndpoint, setAudioEndpoint] = useState<string>('');
  const [memoryTrimThreshold, setMemoryTrimThreshold] = useState<string>('');

  const fetchGovernorData = useCallback(async (notifyOnError = false) => {
    try {
      const [newStatus, rules] = await Promise.all([
        invoke<GovernorStatus>('get_governor_status'),
        invoke<ResourceGovernorRule[]>('list_active_rules'),
      ]);
      setStatus(newStatus);
      setActiveRules(rules);
      setFetchError(null);
    } catch (err) {
      const msg = getErrorMessage(err);
      setFetchError(msg);
      if (notifyOnError) {
        addToast({
          type: 'error',
          title: t('governor.error', 'Error'),
          message: msg,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    fetchGovernorData(false);
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchGovernorData(false), 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchGovernorData]);

  const handleOpenAddModal = (processName = '') => {
    const existing = processName
      ? activeRules.find((r) => r.processName.toLowerCase() === processName.toLowerCase())
      : undefined;
    setEditingProcessName(processName);
    setSelectedPriority(existing?.targetPriority || 'HIGH');
    setSelectedCores(Array.from({ length: coreCount }, (_, i) => i));
    setAudioEndpoint(existing?.audioEndpointId || '');
    setMemoryTrimThreshold(
      existing?.autoTrimMemoryMbThreshold ? String(existing.autoTrimMemoryMbThreshold) : ''
    );
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProcessName.trim()) {
      addToast({
        type: 'error',
        title: t('governor.error', 'Error'),
        message: t('governor.processRequired', 'Process name is required'),
      });
      return;
    }

    let parsedTrim: number | null = null;
    if (memoryTrimThreshold.trim()) {
      const val = Number(memoryTrimThreshold.trim());
      if (!Number.isFinite(val) || !Number.isInteger(val) || val < 10) {
        addToast({
          type: 'error',
          title: t('governor.error', 'Error'),
          message: t(
            'governor.invalidTrimThreshold',
            'Auto RAM Trim Threshold must be an integer of at least 10 MB'
          ),
        });
        return;
      }
      parsedTrim = val;
    }

    const mask = calculateMaskFromCores(selectedCores, coreCount);
    const rule: ResourceGovernorRule = {
      processName: editingProcessName.trim(),
      targetPriority: selectedPriority,
      coreAffinityMask: mask,
      audioEndpointId: audioEndpoint.trim() ? audioEndpoint.trim() : null,
      autoTrimMemoryMbThreshold: parsedTrim,
    };

    try {
      await invoke('apply_process_governor_rule', { rule });
      addToast({
        type: 'success',
        title: t('governor.rule_applied', 'Rule Applied'),
        message: t('governor.ruleConfiguredMsg', 'Governor rule configured for {{name}}', {
          name: rule.processName,
        }),
      });
      setIsModalOpen(false);
      fetchGovernorData(true);
    } catch (err) {
      addToast({
        type: 'error',
        title: t('governor.error', 'Error'),
        message: getErrorMessage(err),
      });
    }
  };

  const handleDeleteRule = async (processName: string) => {
    try {
      await invoke('delete_governor_rule', { processName });
      addToast({
        type: 'info',
        title: t('governor.rule_deleted', 'Rule Deleted'),
        message: t('governor.ruleDeletedMsg', 'Removed governor rule for {{name}}', {
          name: processName,
        }),
      });
      fetchGovernorData(true);
    } catch (err) {
      addToast({ type: 'error', title: t('governor.error', 'Error'), message: getErrorMessage(err) });
    }
  };

  const handleTrimRam = async (pid: number, processName: string) => {
    setTrimmingPid(pid);
    try {
      const trimmedMb = await invoke<number>('trim_process_working_set', { pid });
      addToast({
        type: 'success',
        title: t('governor.ram_trimmed', 'RAM Trimmed'),
        message: t('governor.ramTrimmedMsg', 'Trimmed {{mb}} MB working set for {{name}} (PID {{pid}})', {
          mb: trimmedMb,
          name: processName,
          pid,
        }),
      });
      fetchGovernorData(false);
    } catch (err) {
      addToast({ type: 'error', title: t('governor.error', 'Error'), message: getErrorMessage(err) });
    } finally {
      setTrimmingPid(null);
    }
  };

  const handleQuickPriorityChange = async (proc: ManagedProcessInfo, newPriority: string) => {
    const existingRule = activeRules.find(
      (r) => r.processName.toLowerCase() === proc.name.toLowerCase()
    );
    const defaultMask = calculateMaskFromCores(
      Array.from({ length: coreCount }, (_, i) => i),
      coreCount
    );
    const rule: ResourceGovernorRule = {
      processName: proc.name,
      targetPriority: newPriority,
      coreAffinityMask: existingRule ? existingRule.coreAffinityMask : defaultMask,
      audioEndpointId: existingRule?.audioEndpointId || null,
      autoTrimMemoryMbThreshold: existingRule?.autoTrimMemoryMbThreshold || null,
    };

    try {
      await invoke('apply_process_governor_rule', { rule });
      addToast({
        type: 'success',
        title: t('governor.priority_updated', 'Priority Updated'),
        message: t('governor.priorityUpdatedMsg', 'Set {{name}} priority to {{priority}}', {
          name: proc.name,
          priority: newPriority,
        }),
      });
      fetchGovernorData(false);
    } catch (err) {
      addToast({ type: 'error', title: t('governor.error', 'Error'), message: getErrorMessage(err) });
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

  const activeRuleNames = useMemo(
    () => new Set(activeRules.map((r) => r.processName.toLowerCase())),
    [activeRules]
  );

  const toggleCore = (coreIndex: number) => {
    if (selectedCores.includes(coreIndex)) {
      if (selectedCores.length === 1) return;
      setSelectedCores(selectedCores.filter((c) => c !== coreIndex));
    } else {
      setSelectedCores([...selectedCores, coreIndex].sort((a, b) => a - b));
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-text-primary">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
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
            type="button"
            onClick={() => fetchGovernorData(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-[6px] bg-surface-subtle border border-border text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('common.refresh', 'Refresh')}
          </button>
          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="px-3 py-1.5 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('governor.add_rule', 'Create Governor Rule')}
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="p-3 rounded-[6px] border border-status-danger/30 bg-status-dangerSubtle text-status-danger text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[6px] bg-surface border border-border p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider font-mono">
              {t('governor.active_rules_count', 'Active Rules')}
            </span>
            <div className="text-2xl font-bold mt-1 text-text-primary">
              {status ? status.activeRulesCount : '—'}
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

        <div className="rounded-[6px] bg-surface border border-border p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider font-mono">
              {t('governor.pro_balance_events', 'ProBalance Suppressions')}
            </span>
            <div className="text-2xl font-bold mt-1 text-amber-400">
              {status ? status.proBalanceEventsTriggered : '—'}
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

        <div className="rounded-[6px] bg-surface border border-border p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider font-mono">
              {t('governor.total_memory_trimmed', 'Total RAM Reclaimed')}
            </span>
            <div className="text-2xl font-bold mt-1 text-blue-400">
              {status ? `${status.totalMemoryTrimmedMb} MB` : '—'}
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

      <GovernorActiveRulesCard activeRules={activeRules} onDeleteRule={handleDeleteRule} />

      <GovernorProcessTable
        processes={filteredProcesses}
        activeRuleNames={activeRuleNames}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        trimmingPid={trimmingPid}
        onQuickPriorityChange={handleQuickPriorityChange}
        onTrimRam={handleTrimRam}
        onOpenConfigModal={(name) => handleOpenAddModal(name)}
      />

      <GovernorRuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSaveRule}
        coreCount={coreCount}
        editingProcessName={editingProcessName}
        onProcessNameChange={setEditingProcessName}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
        selectedCores={selectedCores}
        onToggleCore={toggleCore}
        audioEndpoint={audioEndpoint}
        onAudioEndpointChange={setAudioEndpoint}
        memoryTrimThreshold={memoryTrimThreshold}
        onMemoryTrimThresholdChange={setMemoryTrimThreshold}
      />
    </div>
  );
}

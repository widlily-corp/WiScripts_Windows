import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OptimizationCategory, PresetType, ExecutionSummary } from '../types';
import { invoke } from '@tauri-apps/api/core';
import {
  Sliders,
  CheckSquare,
  Square,
  Search,
  RotateCcw,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  Play,
  Filter,
  Loader2,
} from 'lucide-react';

const CATEGORIES: { id: OptimizationCategory; label: string }[] = [
  { id: 'all', label: 'All Categories' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'bloatware', label: 'Bloatware' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'services', label: 'Services' },
  { id: 'ui_tweaks', label: 'UI Tweaks' },
  { id: 'disk_cleanup', label: 'Disk Cleanup' },
];

export function OptimizationView() {
  const optimizations = useAppStore((s) => s.optimizations);
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSelectedCategory = useAppStore((s) => s.setSelectedCategory);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const toggleOptimizationSelected = useAppStore((s) => s.toggleOptimizationSelected);
  const selectAllOptimizations = useAppStore((s) => s.selectAllOptimizations);
  const deselectAllOptimizations = useAppStore((s) => s.deselectAllOptimizations);
  const applyPreset = useAppStore((s) => s.applyPreset);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const addLog = useAppStore((s) => s.addLog);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const setIsExecuting = useAppStore((s) => s.setIsExecuting);

  const [expandedCommandId, setExpandedCommandId] = useState<string | null>(null);

  // Filter rules by category and search query
  const filteredOptimizations = optimizations.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesQuery =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.powershellCommand.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const selectedRules = optimizations.filter((o) => o.isSelected);
  const selectedCount = selectedRules.length;

  const handleExecuteSelected = () => {
    if (selectedCount === 0 || isExecuting) return;

    const highestRisk = selectedRules.some((r) => r.riskLevel === 'high')
      ? 'high'
      : selectedRules.some((r) => r.riskLevel === 'medium')
      ? 'medium'
      : 'low';

    openSafetyModal({
      title: `Execute ${selectedCount} Selected Optimization Rules`,
      description: `Targeting Windows telemetry, services, and debloat configurations. Dry-run safety mode is currently ${
        dryRunMode ? 'ACTIVE' : 'DISABLED'
      }.`,
      riskLevel: highestRisk,
      commandsToRun: selectedRules.map((r) => r.powershellCommand),
      onConfirmAction: async () => {
        setIsExecuting(true);
        const currentDryRun = useAppStore.getState().dryRunMode;
        addLog({
          level: 'cmd',
          message: `Invoking IPC: execute_optimizations (${selectedCount} rules, dryRun: ${currentDryRun})`,
          commandExecuted: selectedRules.map((r) => r.powershellCommand).join('; '),
        });
        try {
          const summary = await invoke<ExecutionSummary>('execute_optimizations', {
            selectedKeys: selectedRules.map((r) => r.id),
            dryRun: currentDryRun,
          });

          addLog({
            level: summary.success ? 'info' : 'error',
            message: `Optimization execution complete. Overall Success=${summary.success}, Duration=${summary.totalDurationMs}ms, DryRun=${summary.isDryRun}`,
          });

          summary.executedActions.forEach((action) => {
            addLog({
              level: action.output.exitCode === 0 ? 'info' : 'error',
              message: `Rule [${action.id}] (${action.name}): ${
                action.output.stdout.trim() || action.output.stderr.trim() || 'Executed successfully'
              }`,
              commandExecuted: action.command,
            });
          });
        } catch (err) {
          addLog({
            level: 'error',
            message: `IPC execute_optimizations failed: ${String(err)}`,
          });
        } finally {
          setIsExecuting(false);
        }
      },
    });
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold text-status-danger bg-status-danger/10 border border-status-danger/30">
            <ShieldAlert className="h-3 w-3" /> High Risk
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold text-status-warning bg-status-warning/10 border border-status-warning/30">
            <Shield className="h-3 w-3" /> Medium Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold text-status-success bg-status-success/10 border border-status-success/30">
            <ShieldCheck className="h-3 w-3" /> Low Risk
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Stats Banner */}
      <div className="rounded-[6px] border border-border bg-surface-subtle p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-semibold text-text-primary">System Optimization & Debloat Engine</h2>
          </div>
          <p className="text-xs text-text-secondary">
            Sophia-Script inspired rule catalog. Granular telemetry removal, bloatware cleanup, and system service hardening.
          </p>
        </div>

        {/* Quick Stats Pills */}
        <div className="flex items-center gap-3">
          <div className="rounded-[6px] border border-border bg-surface px-3 py-1.5 text-center">
            <div className="text-[10px] font-mono uppercase text-text-muted">Total Catalog</div>
            <div className="text-sm font-semibold text-text-primary font-mono tabular-nums">{optimizations.length}</div>
          </div>
          <div className="rounded-[6px] border border-border bg-surface px-3 py-1.5 text-center">
            <div className="text-[10px] font-mono uppercase text-text-muted">Selected</div>
            <div className="text-sm font-semibold text-brand font-mono tabular-nums">{selectedCount}</div>
          </div>
          <button
            onClick={handleExecuteSelected}
            disabled={selectedCount === 0 || isExecuting}
            className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-xs font-medium transition-all ${
              selectedCount > 0 && !isExecuting
                ? 'bg-brand text-white hover:bg-brand-hover shadow-sm'
                : 'bg-surface-active text-text-muted cursor-not-allowed border border-border'
            }`}
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{isExecuting ? 'Executing Optimizations...' : `Execute Selected (${selectedCount})`}</span>
          </button>
        </div>
      </div>

      {/* Preset Action Bar & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Preset Selector Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-medium text-text-muted flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-brand" /> Presets:
          </span>
          <button
            onClick={() => applyPreset('recommended')}
            disabled={isExecuting}
            className="px-3 py-1.5 rounded-[6px] border border-border bg-surface text-xs text-text-primary hover:bg-surface-hover transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Recommended ({optimizations.filter((o) => o.isRecommended).length})
          </button>
          <button
            onClick={() => applyPreset('telemetry_only')}
            disabled={isExecuting}
            className="px-3 py-1.5 rounded-[6px] border border-border bg-surface text-xs text-text-primary hover:bg-surface-hover transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Telemetry-Only ({optimizations.filter((o) => o.category === 'telemetry').length})
          </button>
          <button
            onClick={() => applyPreset('full_debloat')}
            disabled={isExecuting}
            className="px-3 py-1.5 rounded-[6px] border border-border bg-surface text-xs text-text-primary hover:bg-surface-hover transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Full Debloat ({optimizations.length})
          </button>
          <button
            onClick={deselectAllOptimizations}
            disabled={isExecuting}
            className="px-3 py-1.5 rounded-[6px] border border-border-subtle text-xs text-text-muted hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear Selection
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search rules, commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-[6px] border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          const count =
            cat.id === 'all'
              ? optimizations.length
              : optimizations.filter((o) => o.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              disabled={isExecuting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                  ? 'bg-surface-active text-brand border border-border-focus/40'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <span>{cat.label}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-surface-subtle border border-border-subtle text-text-muted">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Optimization Rules List */}
      <div className="space-y-3">
        {filteredOptimizations.length === 0 ? (
          <div className="rounded-[6px] border border-border bg-surface p-8 text-center space-y-2">
            <Info className="h-6 w-6 text-text-muted mx-auto" />
            <p className="text-sm font-medium text-text-primary">No optimization rules match your filter</p>
            <p className="text-xs text-text-secondary">Try adjusting your search keyword or selected category tab.</p>
          </div>
        ) : (
          filteredOptimizations.map((item) => {
            const isExpanded = expandedCommandId === item.id;
            return (
              <div
                key={item.id}
                className={`rounded-[6px] border transition-all ${
                  item.isSelected
                    ? 'border-brand/40 bg-surface hover:border-brand/60'
                    : 'border-border bg-surface hover:bg-surface-hover/50'
                }`}
              >
                <div className="p-4 flex items-start gap-4">
                  {/* Selection Checkbox */}
                  <button
                    onClick={() => toggleOptimizationSelected(item.id)}
                    disabled={isExecuting}
                    className="mt-0.5 text-brand focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Select rule ${item.title}`}
                  >
                    {item.isSelected ? (
                      <CheckSquare className="h-4 w-4 text-brand fill-brand/10" />
                    ) : (
                      <Square className="h-4 w-4 text-text-muted" />
                    )}
                  </button>

                  {/* Main Info */}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-sm font-semibold text-text-primary truncate">{item.title}</h3>
                        {item.isRecommended && (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase text-brand border border-brand/20">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-surface-subtle px-2 py-0.5 font-mono text-[10px] uppercase text-text-muted border border-border-subtle">
                          {item.category}
                        </span>
                        {getRiskBadge(item.riskLevel)}
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase border ${
                            item.isReversible
                              ? 'bg-surface-subtle text-text-muted border-border-subtle'
                              : 'bg-status-warning/10 text-status-warning border-status-warning/30'
                          }`}
                        >
                          {item.isReversible ? 'Reversible' : 'Non-Reversible'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-text-secondary leading-relaxed">{item.description}</p>

                    {/* Code Snippet Box */}
                    <div className="mt-2 space-y-1">
                      <div className="rounded bg-surface-subtle p-2.5 font-mono text-[11px] text-text-code flex items-center justify-between overflow-x-auto border border-border-subtle">
                        <span className="select-all">$ {item.powershellCommand}</span>
                        <button
                          onClick={() => setExpandedCommandId(isExpanded ? null : item.id)}
                          className="ml-2 flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary shrink-0"
                        >
                          <Terminal className="h-3 w-3" />
                          <span>{isExpanded ? 'Hide Undo' : 'Inspect Undo'}</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Undo Command Drawer */}
                      {isExpanded && (
                        <div className="rounded bg-surface p-2.5 font-mono text-[11px] text-status-warning border border-status-warning/30 space-y-1">
                          <div className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
                            <RotateCcw className="h-3 w-3" /> Undo PowerShell Script:
                          </div>
                          <div className="select-all font-mono text-text-secondary">$ {item.undoCommand}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

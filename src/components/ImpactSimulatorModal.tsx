import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldAlert,
  ShieldCheck,
  Sliders,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal,
  Database,
  Server,
  Calendar,
  Folder,
  Wifi,
  Cpu,
  Lock,
} from 'lucide-react';
import type { ScriptManifestEntry } from '../types';
import {
  analyzeScriptImpact,
  ImpactCategory,
  ImpactActionType,
  ImpactItem,
} from '../utils/scriptImpactAnalyzer';

export interface ImpactSimulatorModalProps {
  script: ScriptManifestEntry | null;
  scriptContent: string;
  isOpen: boolean;
  isElevated: boolean;
  isExecutingScript: boolean;
  onClose: () => void;
  onExecuteDryRun: (
    script: ScriptManifestEntry | null,
    content: string,
    runAsAdmin: boolean
  ) => void;
  onExecuteLive: (
    script: ScriptManifestEntry | null,
    content: string,
    runAsAdmin: boolean
  ) => void;
  onLoadToEditor?: (script: ScriptManifestEntry) => void;
}

export const ImpactSimulatorModal: React.FC<ImpactSimulatorModalProps> = ({
  script,
  scriptContent,
  isOpen,
  isElevated,
  isExecutingScript,
  onClose,
  onExecuteDryRun,
  onExecuteLive,
  onLoadToEditor,
}) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<'all' | ImpactCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [shouldElevate, setShouldElevate] = useState(false);

  const analysis = useMemo(() => {
    return analyzeScriptImpact(
      scriptContent,
      script
        ? {
            requiresAdmin: script.requiresAdmin,
            riskLevel: script.riskLevel,
          }
        : undefined
    );
  }, [scriptContent, script]);

  // Synchronize elevation checkbox with analysis recommendation or parent state
  useEffect(() => {
    if (isOpen) {
      setShouldElevate(analysis.requiresAdmin || isElevated);
    }
  }, [isOpen, analysis.requiresAdmin, isElevated]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredItems = analysis.items.filter((item) => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.target.toLowerCase().includes(q) ||
        (item.detail && item.detail.toLowerCase().includes(q)) ||
        item.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getActionBadge = (action: ImpactActionType) => {
    switch (action) {
      case 'create':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            {t('script_runner.action_create', 'Create')}
          </span>
        );
      case 'modify':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
            {t('script_runner.action_modify', 'Modify')}
          </span>
        );
      case 'delete':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
            {t('script_runner.action_delete', 'Delete')}
          </span>
        );
      case 'stop':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {t('script_runner.action_stop', 'Stop')}
          </span>
        );
      case 'start':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-teal-500/15 text-teal-400 border border-teal-500/30">
            {t('script_runner.action_start', 'Start')}
          </span>
        );
      case 'restart':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            {t('script_runner.action_restart', 'Restart')}
          </span>
        );
      case 'disable':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-purple-500/15 text-purple-400 border border-purple-500/30">
            {t('script_runner.action_disable', 'Disable')}
          </span>
        );
      case 'enable':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            {t('script_runner.action_enable', 'Enable')}
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-neutral-500/15 text-neutral-400 border border-neutral-500/30">
            {action}
          </span>
        );
    }
  };

  const getCategoryIcon = (category: ImpactCategory) => {
    switch (category) {
      case 'registry':
        return <Database className="h-3.5 w-3.5 text-blue-400" />;
      case 'service':
        return <Server className="h-3.5 w-3.5 text-amber-400" />;
      case 'scheduled_task':
        return <Calendar className="h-3.5 w-3.5 text-purple-400" />;
      case 'filesystem':
        return <Folder className="h-3.5 w-3.5 text-emerald-400" />;
      case 'network':
        return <Wifi className="h-3.5 w-3.5 text-cyan-400" />;
      case 'process':
        return <Cpu className="h-3.5 w-3.5 text-rose-400" />;
    }
  };

  const scriptDisplayName = script ? script.name : t('script_runner.custom_script', 'Custom Script');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-simulator-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-surface-card border border-border rounded-[8px] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface-subtle/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-[6px] bg-brand/10 border border-brand/20 text-brand">
              <Sliders className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  id="impact-simulator-modal-title"
                  className="text-sm font-semibold text-text-primary truncate"
                >
                  {t('script_runner.simulator_title', 'Impact Simulator & Dry-Run Preview')}
                </h3>
                {analysis.riskLevel === 'critical' ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    CRITICAL RISK
                  </span>
                ) : analysis.riskLevel === 'elevated' ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    ELEVATED RISK
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    SAFE
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary truncate mt-0.5">
                {scriptDisplayName} •{' '}
                {t('script_runner.total_mutations', {
                  count: analysis.summary.totalItems,
                  defaultValue: `${analysis.summary.totalItems} mutations detected`,
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary rounded-[6px] hover:bg-surface-elevated transition-colors"
            title={t('script_runner.history_modal_close', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Telemetry Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-surface-subtle/20 border-b border-border text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-text-muted font-mono">
              {analysis.requiresAdmin ? (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <Lock className="h-3.5 w-3.5" />
                  <span>{t('script_runner.elevation_required', 'UAC Elevation Required')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{t('script_runner.elevation_not_required', 'User Privileges (No UAC)')}</span>
                </span>
              )}
            </span>
            <span className="text-text-muted/40">•</span>
            <span className="flex items-center gap-1.5">
              {analysis.hasDryRunSupport ? (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {t('script_runner.dryrun_supported', 'Native Dry-Run Supported')}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  {t('script_runner.dryrun_static_only', 'Simulated Preview (Static)')}
                </span>
              )}
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('script_runner.search_impact_placeholder', 'Filter affected targets, keys, services...')}
              className="w-full pl-8 pr-3 py-1 text-xs bg-surface-card border border-border rounded-[6px] text-text-primary placeholder:text-text-muted focus:outline-hidden focus:border-brand"
            />
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 px-5 py-2 border-b border-border bg-surface-subtle/10 overflow-x-auto text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-brand text-brand-foreground'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
            }`}
          >
            {t('script_runner.filter_all', 'All Items')} ({analysis.summary.totalItems})
          </button>
          {analysis.summary.servicesCount > 0 && (
            <button
              onClick={() => setSelectedCategory('service')}
              className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                selectedCategory === 'service'
                  ? 'bg-brand text-brand-foreground'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {t('script_runner.category_services', 'Services')} ({analysis.summary.servicesCount})
            </button>
          )}
          {analysis.summary.registryCount > 0 && (
            <button
              onClick={() => setSelectedCategory('registry')}
              className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                selectedCategory === 'registry'
                  ? 'bg-brand text-brand-foreground'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {t('script_runner.category_registry', 'Registry')} ({analysis.summary.registryCount})
            </button>
          )}
          {analysis.summary.tasksCount > 0 && (
            <button
              onClick={() => setSelectedCategory('scheduled_task')}
              className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                selectedCategory === 'scheduled_task'
                  ? 'bg-brand text-brand-foreground'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {t('script_runner.category_tasks', 'Scheduled Tasks')} ({analysis.summary.tasksCount})
            </button>
          )}
          {analysis.summary.filesystemCount > 0 && (
            <button
              onClick={() => setSelectedCategory('filesystem')}
              className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                selectedCategory === 'filesystem'
                  ? 'bg-brand text-brand-foreground'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {t('script_runner.category_filesystem', 'Filesystem')} ({analysis.summary.filesystemCount})
            </button>
          )}
          {analysis.summary.networkCount > 0 && (
            <button
              onClick={() => setSelectedCategory('network')}
              className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                selectedCategory === 'network'
                  ? 'bg-brand text-brand-foreground'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {t('script_runner.category_network', 'Network')} ({analysis.summary.networkCount})
            </button>
          )}
          {analysis.summary.processCount > 0 && (
            <button
              onClick={() => setSelectedCategory('process')}
              className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                selectedCategory === 'process'
                  ? 'bg-brand text-brand-foreground'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {t('script_runner.category_processes', 'Processes')} ({analysis.summary.processCount})
            </button>
          )}
        </div>

        {/* Mutation Items Card List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2 bg-[#0A0D14]">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-semibold text-text-primary">
                {t('script_runner.no_impact_detected', 'No system modifications detected. Script appears to be read-only or diagnostic.')}
              </h4>
              <p className="text-xs text-text-muted mt-1 max-w-md">
                {t('script_runner.safe_script_notice', 'This script does not modify core system settings, services, or registry keys.')}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 p-3 bg-surface-card border border-border rounded-[6px] hover:border-border-hover transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-1.5 rounded bg-surface-subtle/50 mt-0.5 shrink-0">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getActionBadge(item.action)}
                      <span className="font-mono text-xs font-semibold text-text-primary truncate break-all">
                        {item.target}
                      </span>
                      {item.isCritical && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          {t('script_runner.critical_warning', 'Touches critical operating system components or core security services.')}
                        </span>
                      )}
                    </div>
                    {item.detail && (
                      <p className="text-xs text-text-secondary mt-1 font-mono">{item.detail}</p>
                    )}
                  </div>
                </div>
                {item.lineNumber && (
                  <span className="text-[10px] text-text-muted font-mono shrink-0 px-1.5 py-0.5 rounded bg-surface-subtle/30">
                    {t('script_runner.line_label', {
                      line: item.lineNumber,
                      defaultValue: `Line ${item.lineNumber}`,
                    })}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Modal Footer Controls Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface-subtle/40">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={shouldElevate}
              onChange={(e) => setShouldElevate(e.target.checked)}
              className="rounded border-border text-brand focus:ring-brand"
            />
            <span>{t('script_runner.run_as_admin', 'Run as Administrator')}</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-[6px] transition-colors"
            >
              {t('script_runner.cancel', 'Cancel')}
            </button>
            <button
              disabled={isExecutingScript}
              onClick={() => {
                onClose();
                onExecuteDryRun(script, scriptContent, shouldElevate);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-300 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-[6px] transition-colors disabled:opacity-50"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>{t('script_runner.execute_dryrun_cta', 'Execute Dry-Run')}</span>
            </button>
            <button
              disabled={isExecutingScript}
              onClick={() => {
                onClose();
                onExecuteLive(script, scriptContent, shouldElevate);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-[6px] transition-colors disabled:opacity-50 ${
                shouldElevate
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-brand hover:bg-brand/90 text-brand-foreground'
              }`}
            >
              <Play className="h-3.5 w-3.5" />
              <span>
                {shouldElevate
                  ? t('script_runner.execute_elevated_cta', 'Execute Elevated (UAC)')
                  : t('script_runner.execute_live_cta', 'Execute Script')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

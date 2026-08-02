import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  RefreshCw,
  Power,
  Lock,
  CheckCircle2,
  AlertTriangle,
  FileKey,
  Info,
  Filter,
} from 'lucide-react';
import { AutorunEntry, QuarantineResult, AutorunCategoryFilter } from '../types/autoruns';
import { useAppStore } from '../store/useAppStore';

export function AutorunsView() {
  const { t } = useTranslation();
  const addLog = useAppStore((s) => s.addLog);
  const addToast = useAppStore((s) => s.addToast);

  const [entries, setEntries] = useState<AutorunEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<AutorunCategoryFilter>('all');
  const [selectedEntry, setSelectedEntry] = useState<AutorunEntry | null>(null);
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState<boolean>(false);
  const [quarantineResult, setQuarantineResult] = useState<QuarantineResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fetchAutoruns = async () => {
    setIsLoading(true);
    try {
      const res = await invoke<AutorunEntry[]>('scan_autorun_entries');
      setEntries(res);
      addLog({
        level: 'info',
        message: `AutoRuns scan completed: ${res.length} autostart locations cataloged`,
      });
    } catch (err) {
      addLog({
        level: 'error',
        message: `Failed to scan AutoRuns entries: ${String(err)}`,
      });
      addToast({
        type: 'error',
        title: t('autoruns.toast.scan_failed', 'AutoRuns Scan Failed'),
        message: String(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAutoruns();
  }, []);

  const handleToggleEntry = async (entry: AutorunEntry) => {
    const newStatus = !entry.enabled;
    setIsProcessing(true);
    try {
      await invoke<boolean>('toggle_autorun_entry', {
        entryId: entry.id,
        enable: newStatus,
      });
      setEntries((prev) =>
        prev.map((item) =>
          item.id === entry.id ? { ...item, enabled: newStatus } : item
        )
      );
      addToast({
        type: 'success',
        title: t('autoruns.toast.toggle_success', 'AutoRun Entry Updated'),
        message: `${entry.name} is now ${newStatus ? 'enabled' : 'disabled'}`,
      });
      addLog({
        level: 'info',
        message: `AutoRun entry '${entry.name}' (${entry.id}) toggled to enabled=${newStatus}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: t('autoruns.toast.toggle_failed', 'Toggle Failed'),
        message: String(err),
      });
      addLog({
        level: 'error',
        message: `Failed to toggle AutoRun entry '${entry.name}': ${String(err)}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuarantine = async () => {
    if (!selectedEntry) return;
    setIsProcessing(true);
    try {
      const res = await invoke<QuarantineResult>('quarantine_autorun_entry', {
        entryId: selectedEntry.id,
      });
      setQuarantineResult(res);
      if (res.success) {
        setEntries((prev) =>
          prev.map((item) =>
            item.id === selectedEntry.id ? { ...item, enabled: false } : item
          )
        );
        addToast({
          type: 'success',
          title: t('autoruns.toast.quarantine_success', 'Entry Quarantined'),
          message: `${selectedEntry.name} isolated to WiScripts Quarantine`,
        });
        addLog({
          level: 'warn',
          message: `AutoRun entry '${selectedEntry.name}' quarantined to ${res.quarantinedPath}`,
        });
      } else {
        addToast({
          type: 'error',
          title: t('autoruns.toast.quarantine_failed', 'Quarantine Failed'),
          message: res.error || 'Unknown quarantine error',
        });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: t('autoruns.toast.quarantine_failed', 'Quarantine Failed'),
        message: String(err),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      let matchesCategory = true;
      if (activeCategory === 'high_risk') {
        matchesCategory =
          item.riskScore >= 40 ||
          item.signatureStatus === 'Unsigned' ||
          item.signatureStatus === 'InvalidCertificate';
      } else if (activeCategory === 'registry') {
        const loc = item.location.toLowerCase();
        matchesCategory =
          loc.includes('run') ||
          loc.includes('policies') ||
          loc.includes('winlogon') ||
          loc.includes('ifeo') ||
          loc.includes('appinit') ||
          loc.includes('activesetup') ||
          loc.includes('bootexecute');
      } else if (activeCategory === 'tasks') {
        matchesCategory = item.location.toLowerCase().includes('task');
      } else if (activeCategory === 'services') {
        matchesCategory = item.location.toLowerCase().includes('service');
      }

      // Search filter
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        item.publisher.toLowerCase().includes(q) ||
        item.imagePath.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [entries, activeCategory, searchQuery]);

  const stats = useMemo(() => {
    const total = entries.length;
    const highRisk = entries.filter((e) => e.riskScore >= 70).length;
    const unsigned = entries.filter(
      (e) => e.signatureStatus === 'Unsigned' || e.signatureStatus === 'InvalidCertificate'
    ).length;
    const valid = entries.filter((e) => e.signatureStatus === 'Valid').length;
    return { total, highRisk, unsigned, valid };
  }, [entries]);

  const getSignatureBadge = (status: AutorunEntry['signatureStatus']) => {
    switch (status) {
      case 'Valid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-status-success/10 text-status-success border border-status-success/20">
            <ShieldCheck className="h-3 w-3" />
            {t('autoruns.sig.valid', 'Valid')}
          </span>
        );
      case 'Unsigned':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-status-warning/10 text-status-warning border border-status-warning/20">
            <AlertTriangle className="h-3 w-3" />
            {t('autoruns.sig.unsigned', 'Unsigned')}
          </span>
        );
      case 'InvalidCertificate':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-status-error/10 text-status-error border border-status-error/20">
            <ShieldX className="h-3 w-3" />
            {t('autoruns.sig.invalid', 'Invalid Cert')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-surface-subtle text-text-muted border border-border">
            <Info className="h-3 w-3" />
            {t('autoruns.sig.unknown', 'Unknown')}
          </span>
        );
    }
  };

  const getRiskScoreBadge = (score: number) => {
    let colorClass = 'text-status-success border-status-success/30 bg-status-success/10';
    if (score >= 70) {
      colorClass = 'text-status-error border-status-error/30 bg-status-error/10 font-bold';
    } else if (score >= 35) {
      colorClass = 'text-status-warning border-status-warning/30 bg-status-warning/10';
    }

    return (
      <span
        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-[4px] text-[11px] font-mono tabular-nums border ${colorClass}`}
      >
        {score}/100
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-6 w-6 text-brand" />
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              {t('autoruns.title', 'AutoRuns & Security Inspector')}
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-1">
            {t(
              'autoruns.subtitle',
              'Deep scanner inspecting 25+ persistence autostart locations with Authenticode digital signature auditing'
            )}
          </p>
        </div>
        <button
          onClick={fetchAutoruns}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-surface-hover hover:bg-surface-active text-text-primary text-xs font-medium border border-border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'Refresh')}
        </button>
      </div>

      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-[6px] border border-border bg-surface flex flex-col justify-between">
          <span className="text-[11px] text-text-muted font-medium">
            {t('autoruns.metrics.total', 'Total Autoruns')}
          </span>
          <span className="text-xl font-semibold text-text-primary mt-2 font-mono tabular-nums">
            {stats.total}
          </span>
        </div>
        <div className="p-3.5 rounded-[6px] border border-border bg-surface flex flex-col justify-between">
          <span className="text-[11px] text-text-muted font-medium">
            {t('autoruns.metrics.high_risk', 'High Risk Entries')}
          </span>
          <span className="text-xl font-semibold text-status-error mt-2 font-mono tabular-nums">
            {stats.highRisk}
          </span>
        </div>
        <div className="p-3.5 rounded-[6px] border border-border bg-surface flex flex-col justify-between">
          <span className="text-[11px] text-text-muted font-medium">
            {t('autoruns.metrics.unsigned', 'Unsigned / Untrusted')}
          </span>
          <span className="text-xl font-semibold text-status-warning mt-2 font-mono tabular-nums">
            {stats.unsigned}
          </span>
        </div>
        <div className="p-3.5 rounded-[6px] border border-border bg-surface flex flex-col justify-between">
          <span className="text-[11px] text-text-muted font-medium">
            {t('autoruns.metrics.valid', 'Valid Authenticode')}
          </span>
          <span className="text-xl font-semibold text-status-success mt-2 font-mono tabular-nums">
            {stats.valid}
          </span>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-brand text-white font-semibold'
                : 'bg-surface hover:bg-surface-hover text-text-secondary border border-border'
            }`}
          >
            {t('autoruns.tabs.all', 'All Entries')} ({entries.length})
          </button>
          <button
            onClick={() => setActiveCategory('high_risk')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'high_risk'
                ? 'bg-status-error text-white font-semibold'
                : 'bg-surface hover:bg-surface-hover text-status-error border border-border'
            }`}
          >
            {t('autoruns.tabs.high_risk', 'High Risk / Unsigned')}
          </button>
          <button
            onClick={() => setActiveCategory('registry')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'registry'
                ? 'bg-brand text-white font-semibold'
                : 'bg-surface hover:bg-surface-hover text-text-secondary border border-border'
            }`}
          >
            {t('autoruns.tabs.registry', 'Registry')}
          </button>
          <button
            onClick={() => setActiveCategory('tasks')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'tasks'
                ? 'bg-brand text-white font-semibold'
                : 'bg-surface hover:bg-surface-hover text-text-secondary border border-border'
            }`}
          >
            {t('autoruns.tabs.tasks', 'Tasks')}
          </button>
          <button
            onClick={() => setActiveCategory('services')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'services'
                ? 'bg-brand text-white font-semibold'
                : 'bg-surface hover:bg-surface-hover text-text-secondary border border-border'
            }`}
          >
            {t('autoruns.tabs.services', 'Services')}
          </button>
        </div>

        {/* Search Filter Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('autoruns.search_placeholder', 'Search autostart items...')}
            className="w-full pl-8 pr-3 py-1.5 rounded-[6px] bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* AutoRuns Table */}
      <div className="rounded-[6px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-text-muted text-xs flex flex-col items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-brand" />
            <span>{t('autoruns.scanning', 'Scanning persistence autostart locations...')}</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-12 text-center text-text-muted text-xs">
            {t('autoruns.no_entries', 'No autostart entries matched your filter criteria')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-4">{t('autoruns.col.status', 'State')}</th>
                  <th className="py-2.5 px-4">{t('autoruns.col.name', 'Entry Name & Location')}</th>
                  <th className="py-2.5 px-4">{t('autoruns.col.path', 'Image Path')}</th>
                  <th className="py-2.5 px-4">{t('autoruns.col.publisher', 'Publisher')}</th>
                  <th className="py-2.5 px-4">{t('autoruns.col.authenticode', 'Authenticode')}</th>
                  <th className="py-2.5 px-4">{t('autoruns.col.risk', 'Risk Score')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredEntries.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-hover/50 transition-colors">
                    {/* State Toggle */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleEntry(item)}
                        disabled={isProcessing}
                        title={item.enabled ? 'Disable Entry' : 'Enable Entry'}
                        className={`p-1 rounded-[4px] border transition-colors ${
                          item.enabled
                            ? 'bg-status-success/10 text-status-success border-status-success/30 hover:bg-status-success/20'
                            : 'bg-surface-subtle text-text-muted border-border hover:bg-surface-active'
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    </td>

                    {/* Name & Location */}
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-text-primary truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="text-[10px] font-mono text-text-muted truncate mt-0.5">
                        {item.location}
                      </div>
                    </td>

                    {/* Image Path */}
                    <td className="py-3 px-4 max-w-sm">
                      <div
                        className="font-mono text-[11px] text-text-secondary truncate"
                        title={item.imagePath}
                      >
                        {item.imagePath}
                      </div>
                    </td>

                    {/* Publisher */}
                    <td className="py-3 px-4 max-w-xs">
                      <div className="text-text-secondary truncate" title={item.publisher}>
                        {item.publisher || 'Unsigned'}
                      </div>
                    </td>

                    {/* Authenticode Status */}
                    <td className="py-3 px-4">{getSignatureBadge(item.signatureStatus)}</td>

                    {/* Risk Score */}
                    <td className="py-3 px-4">{getRiskScoreBadge(item.riskScore)}</td>

                    {/* Action Buttons */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedEntry(item);
                          setQuarantineResult(null);
                          setIsQuarantineModalOpen(true);
                        }}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-status-error/10 text-status-error border border-status-error/20 hover:bg-status-error/20 text-[11px] font-medium transition-colors disabled:opacity-50"
                      >
                        <Lock className="h-3 w-3" />
                        {t('autoruns.quarantine_btn', 'Quarantine')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quarantine Confirmation Modal */}
      {isQuarantineModalOpen && selectedEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-[8px] max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <ShieldAlert className="h-5 w-5 text-status-error" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('autoruns.quarantine.modal_title', 'Quarantine Persistence Entry')}
              </h3>
            </div>

            {!quarantineResult ? (
              <>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {t(
                    'autoruns.quarantine.modal_desc',
                    'Quarantining will create a safe registry backup and isolate the binary file in WiScripts Quarantine folder. Are you sure you want to proceed?'
                  )}
                </p>

                <div className="p-3 rounded-[6px] bg-surface-subtle border border-border text-xs space-y-1 font-mono">
                  <div>
                    <span className="text-text-muted">{t('autoruns.col.name', 'Name')}:</span>{' '}
                    <span className="text-text-primary font-semibold">{selectedEntry.name}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">{t('autoruns.col.path', 'Path')}:</span>{' '}
                    <span className="text-text-secondary truncate block">
                      {selectedEntry.imagePath}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsQuarantineModalOpen(false)}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-[6px] border border-border hover:bg-surface-hover text-text-secondary text-xs font-medium"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleQuarantine}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-[6px] bg-status-error text-white text-xs font-medium hover:bg-status-error/90 transition-colors disabled:opacity-50"
                  >
                    {isProcessing
                      ? t('autoruns.quarantine.processing', 'Quarantining...')
                      : t('autoruns.quarantine.confirm_btn', 'Isolate & Quarantine')}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {quarantineResult.success ? (
                  <div className="flex items-start gap-2.5 text-status-success text-xs">
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-text-primary">
                        {t('autoruns.quarantine.success_title', 'Entry Quarantined Successfully')}
                      </div>
                      <div className="text-text-secondary mt-1">
                        {t(
                          'autoruns.quarantine.success_msg',
                          'Binary payload and registry entry isolated to quarantine storage.'
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 text-status-error text-xs">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-text-primary">
                        {t('autoruns.quarantine.failed_title', 'Quarantine Operation Error')}
                      </div>
                      <div className="text-text-secondary mt-1">
                        {quarantineResult.error || 'Unknown error during quarantine'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-[6px] bg-surface-subtle border border-border text-[11px] font-mono space-y-1.5">
                  <div>
                    <span className="text-text-muted">Quarantined Path:</span>
                    <div className="text-text-primary truncate">
                      {quarantineResult.quarantinedPath || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span className="text-text-muted">Backup Registry File:</span>
                    <div className="text-text-primary truncate">
                      {quarantineResult.backupRegistryKey || 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setIsQuarantineModalOpen(false);
                      setSelectedEntry(null);
                      setQuarantineResult(null);
                    }}
                    className="px-4 py-1.5 rounded-[6px] bg-brand text-white text-xs font-medium hover:bg-brand/90 transition-colors"
                  >
                    {t('common.confirm', 'Close')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

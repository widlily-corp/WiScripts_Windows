import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  AlertTriangle,
  Info,
} from 'lucide-react';
import { AutorunEntry, QuarantineResult, AutorunCategoryFilter } from '../types/autoruns';
import { useAppStore } from '../store/useAppStore';
import { PaginationBar, usePagination } from '../components/common/VirtualList';
import { QuarantineModal } from './Autoruns/QuarantineModal';

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

  const fetchAutoruns = useCallback(async () => {
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
  }, [addLog, addToast, t]);

  useEffect(() => {
    fetchAutoruns();
  }, [fetchAutoruns]);

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

  const { page, totalPages, pageSize, totalItems, pagedItems, setPage } = usePagination(filteredEntries, 50);

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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-medium bg-status-danger/10 text-status-danger border border-status-danger/20">
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
      colorClass = 'text-status-danger border-status-danger/30 bg-status-danger/10 font-bold';
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
          type="button"
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
          <span className="text-xl font-semibold text-status-danger mt-2 font-mono tabular-nums">
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
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
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
            type="button"
            onClick={() => setActiveCategory('high_risk')}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'high_risk'
                ? 'bg-status-danger text-white font-semibold'
                : 'bg-surface hover:bg-surface-hover text-status-danger border border-border'
            }`}
          >
            {t('autoruns.tabs.high_risk', 'High Risk / Unsigned')}
          </button>
          <button
            type="button"
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
            type="button"
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
            type="button"
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
          <>
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
                  {pagedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleEntry(item)}
                          disabled={isProcessing}
                          title={item.enabled ? t('autoruns.disableEntry', 'Disable Entry') : t('autoruns.enableEntry', 'Enable Entry')}
                          aria-label={`${item.enabled ? t('autoruns.disableEntry', 'Disable Entry') : t('autoruns.enableEntry', 'Enable Entry')} ${item.name}`}
                          className={`p-1 rounded-[4px] border transition-colors ${
                            item.enabled
                              ? 'bg-status-success/10 text-status-success border-status-success/30 hover:bg-status-success/20'
                              : 'bg-surface-subtle text-text-muted border-border hover:bg-surface-active'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-text-primary truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] font-mono text-text-muted truncate mt-0.5">
                          {item.location}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-sm">
                        <div
                          className="font-mono text-[11px] text-text-secondary truncate"
                          title={item.imagePath}
                        >
                          {item.imagePath}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-text-secondary truncate" title={item.publisher}>
                          {item.publisher || t('autoruns.sig.unsigned', 'Unsigned')}
                        </div>
                      </td>

                      <td className="py-3 px-4">{getSignatureBadge(item.signatureStatus)}</td>
                      <td className="py-3 px-4">{getRiskScoreBadge(item.riskScore)}</td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEntry(item);
                            setQuarantineResult(null);
                            setIsQuarantineModalOpen(true);
                          }}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-status-danger/10 text-status-danger border border-status-danger/20 hover:bg-status-danger/20 text-[11px] font-medium transition-colors disabled:opacity-50"
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
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <QuarantineModal
        isOpen={isQuarantineModalOpen}
        selectedEntry={selectedEntry}
        quarantineResult={quarantineResult}
        isProcessing={isProcessing}
        onQuarantine={handleQuarantine}
        onClose={() => {
          setIsQuarantineModalOpen(false);
          setSelectedEntry(null);
          setQuarantineResult(null);
        }}
      />
    </div>
  );
}

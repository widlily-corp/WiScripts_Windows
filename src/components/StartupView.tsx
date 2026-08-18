import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { StartupItem } from '../types';
import {
  Power,
  RefreshCw,
  Search,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Folder,
  Database,
  Layers,
} from 'lucide-react';

export function StartupView() {
  const { t } = useTranslation();
  const startupItems = useAppStore((s) => s.startupItems);
  const isStartupLoading = useAppStore((s) => s.isStartupLoading);
  const fetchStartupItems = useAppStore((s) => s.fetchStartupItems);
  const toggleStartupItem = useAppStore((s) => s.toggleStartupItem);
  const removeStartupItem = useAppStore((s) => s.removeStartupItem);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');

  useEffect(() => {
    fetchStartupItems();
  }, [fetchStartupItems]);

  const filteredItems = startupItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.publisher && item.publisher.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesLocation =
      locationFilter === 'all' ||
      item.location.toLowerCase().includes(locationFilter.toLowerCase());

    return matchesSearch && matchesLocation;
  });

  const totalCount = startupItems.length;
  const enabledCount = startupItems.filter((i) => i.enabled).length;
  const disabledCount = totalCount - enabledCount;

  const handleRemoveClick = (item: StartupItem) => {
    openSafetyModal({
      title: t('startupView.removeStartupEntryTitle', { name: item.name }),
      description: t('startupView.removeStartupEntryDesc', { name: item.name }),
      riskLevel: 'medium',
      commandsToRun: [t('startupView.removeStartupItemId', { id: item.id }), t('startupView.command', { command: item.command })],
      onConfirmAction: async () => {
        await removeStartupItem(item.id, item.valueName || item.name, item.location);
      },
    });
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      <AdminElevationBanner featureName={t('startupView.title')} />

      {/* View Header */}
      <div className="rounded-[6px] border border-border bg-surface p-5 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Power className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">
              {t('startupView.title')}
            </h2>
            {dryRunMode && (
              <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-[4px] font-bold">
                {t('startupView.dryRunPreview')}
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            {t('startupView.description')}
          </p>
        </div>

        <button
          onClick={() => fetchStartupItems()}
          disabled={isStartupLoading}
          className="flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-brand ${isStartupLoading ? 'animate-spin' : ''}`} />
          <span>{t('startupView.refresh')}</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('startupView.totalStartupApps')}</div>
            <div className="text-2xl font-bold font-mono text-text-primary mt-1">{totalCount}</div>
          </div>
          <Layers className="h-6 w-6 text-brand opacity-60" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('startupView.enabled')}</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{enabledCount}</div>
          </div>
          <CheckCircle className="h-6 w-6 text-emerald-400 opacity-60" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('startupView.disabled')}</div>
            <div className="text-2xl font-bold font-mono text-text-muted mt-1">{disabledCount}</div>
          </div>
          <XCircle className="h-6 w-6 text-text-muted opacity-60" />
        </div>
      </div>

      {/* Controls & Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('startupView.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-[6px] text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
          />
        </div>

        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="bg-surface border border-border rounded-[6px] px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-brand"
        >
          <option value="all">{t('startupView.allLocations')}</option>
          <option value="hkcu">{t('startupView.hkcuRegistry')}</option>
          <option value="hklm">{t('startupView.hklmRegistry')}</option>
          <option value="folder">{t('startupView.startupFolders')}</option>
        </select>
      </div>

      {/* Startup Items Table */}
      <div className="rounded-[6px] border border-border bg-surface overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-text-muted space-y-2">
            <AlertTriangle className="h-8 w-8 text-text-muted mx-auto" />
            <div className="text-sm font-medium">{t('startupView.noStartupApps')}</div>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-subtle text-text-muted font-mono uppercase text-[10px] border-b border-border-subtle">
              <tr>
                <th className="py-3 px-4 font-semibold">{t('startupView.status')}</th>
                <th className="py-3 px-4 font-semibold">{t('startupView.appAndPublisher')}</th>
                <th className="py-3 px-4 font-semibold">{t('startupView.location')}</th>
                <th className="py-3 px-4 font-semibold">{t('startupView.commandTarget')}</th>
                <th className="py-3 px-4 font-semibold text-right">{t('startupView.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-surface-hover/50 transition-colors">
                  {/* Status Toggle */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleStartupItem(item.id, item.valueName || item.name, item.location, !item.enabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        item.enabled ? 'bg-brand' : 'bg-surface-subtle border-border-subtle'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          item.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>

                  {/* Name & Publisher */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-text-primary">{item.name}</div>
                    <div className="text-[11px] text-text-muted">
                      {item.publisher || t('startupView.unknownPublisher')}
                    </div>
                  </td>

                  {/* Location Badge */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border-subtle text-text-secondary">
                      {item.itemType === 'Shortcut' ? (
                        <Folder className="h-3 w-3 text-amber-400" />
                      ) : (
                        <Database className="h-3 w-3 text-brand" />
                      )}
                      {item.location}
                    </span>
                  </td>

                  {/* Command Line */}
                  <td className="py-3 px-4 max-w-xs truncate font-mono text-[11px] text-text-secondary">
                    {item.command}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleRemoveClick(item)}
                      className="p-1.5 rounded-[4px] text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title={t('startupView.removeStartupEntryTooltip')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

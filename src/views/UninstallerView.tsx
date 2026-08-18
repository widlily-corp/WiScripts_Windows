import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from '../components/AdminElevationBanner';
import { InstalledApp } from '../types';
import {
  Trash2,
  RefreshCw,
  Search,
  ArrowUpDown,
  ShieldAlert,
  HardDrive,
  Layers,
  Info,
  CheckCircle2,
  ExternalLink,
  Package,
} from 'lucide-react';

export function formatAppSize(sizeKb?: number | null): string {
  if (!sizeKb || sizeKb <= 0) return i18n.t ? i18n.t('uninstaller.unknownSize', 'Unknown') : 'Unknown';
  if (sizeKb < 1024) {
    return `${sizeKb} KB`;
  } else if (sizeKb < 1024 * 1024) {
    return `${(sizeKb / 1024).toFixed(1)} MB`;
  }
  return `${(sizeKb / (1024 * 1024)).toFixed(2)} GB`;
}

export function parseInstallDate(dateStr?: string | number | null): number {
  if (dateStr === null || dateStr === undefined) return 0;
  if (typeof dateStr === 'number') {
    return isNaN(dateStr) || dateStr < 0 ? 0 : dateStr;
  }
  const s = String(dateStr).trim();
  if (!s) return 0;

  // 1. Compact YYYYMMDD (e.g., 20240229)
  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compactMatch) {
    const year = parseInt(compactMatch[1], 10);
    const month = parseInt(compactMatch[2], 10);
    const day = parseInt(compactMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/.exec(s);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 3. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (European)
  const euroMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (euroMatch) {
    const day = parseInt(euroMatch[1], 10);
    const month = parseInt(euroMatch[2], 10);
    const year = parseInt(euroMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 4. Standard Date.parse fallback
  const parsed = Date.parse(s);
  return isNaN(parsed) ? 0 : parsed;
}

export type SortField = 'name' | 'size' | 'publisher' | 'date';
export type SortOrder = 'asc' | 'desc';

export function UninstallerView() {
  const { t } = useTranslation();
  const installedApps = useAppStore((s) => s.installedApps);
  const isAppsLoading = useAppStore((s) => s.isAppsLoading);
  const fetchInstalledApps = useAppStore((s) => s.fetchInstalledApps);
  const uninstallApp = useAppStore((s) => s.uninstallApp);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [hideSystemApps, setHideSystemApps] = useState(true);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  useEffect(() => {
    fetchInstalledApps();
  }, [fetchInstalledApps]);

  const filteredAndSortedApps = useMemo(() => {
    let result = installedApps.filter((app) => {
      if (hideSystemApps && app.isSystemComponent) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchName = app.name.toLowerCase().includes(q);
      const matchPublisher = app.publisher?.toLowerCase().includes(q) ?? false;
      const matchVersion = app.version?.toLowerCase().includes(q) ?? false;
      const matchPath = app.registryPath.toLowerCase().includes(q);

      return matchName || matchPublisher || matchVersion || matchPath;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === 'size') {
        const sizeA = a.estimatedSizeKb || 0;
        const sizeB = b.estimatedSizeKb || 0;
        cmp = sizeA - sizeB;
      } else if (sortField === 'publisher') {
        cmp = (a.publisher || '').localeCompare(b.publisher || '');
      } else if (sortField === 'date') {
        const dateA = parseInstallDate(a.installDate);
        const dateB = parseInstallDate(b.installDate);
        cmp = dateA - dateB;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [installedApps, searchQuery, hideSystemApps, sortField, sortOrder]);

  const totalStorageKb = useMemo(() => {
    return filteredAndSortedApps.reduce((acc, app) => acc + (app.estimatedSizeKb || 0), 0);
  }, [filteredAndSortedApps]);

  const handleUninstallClick = (app: InstalledApp) => {
    const isSystem = app.isSystemComponent;
    const commandToRun = app.uninstallString || app.quietUninstallString || t('uninstaller.noCommand', '# No uninstall command specified');

    openSafetyModal({
      title: t('uninstaller.uninstallTitle', { name: app.name }),
      description: t('uninstaller.uninstallDesc', {
        name: app.name,
        publisher: app.publisher || t('uninstaller.unknownPublisher'),
        version: app.version || 'N/A',
        size: formatAppSize(app.estimatedSizeKb),
      }),
      riskLevel: isSystem ? 'critical' : 'medium',
      commandsToRun: [
        `${t('uninstaller.targetAppLabel', 'Target Application:')} ${app.name}`,
        `${t('uninstaller.regPathLabel', 'Registry Path:')} ${app.registryPath}`,
        `${t('uninstaller.cmdLabel', 'Uninstaller Executable Command:')} ${commandToRun}`,
      ],
      onConfirmAction: async () => {
        await uninstallApp(app);
      },
    });
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      <AdminElevationBanner featureName={t('uninstaller.title')} />

      {/* Header Bar */}
      <div className="rounded-[6px] border border-border bg-surface p-5 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">
              {t('uninstaller.title')}
            </h2>
            {dryRunMode && (
              <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-[4px] font-bold">
                {t('common.dryRunBadge', 'Dry-Run Preview')}
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            {t('uninstaller.description')}
          </p>
        </div>

        <button
          onClick={() => fetchInstalledApps()}
          disabled={isAppsLoading}
          className="flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-brand ${isAppsLoading ? 'animate-spin' : ''}`} />
          <span>{t('uninstaller.refreshScan')}</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('uninstaller.totalApps')}</div>
            <div className="text-xl font-bold font-mono text-text-primary mt-1">
              {installedApps.length}
            </div>
          </div>
          <Layers className="h-6 w-6 text-brand opacity-80" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('uninstaller.filteredApps')}</div>
            <div className="text-xl font-bold font-mono text-brand mt-1">
              {filteredAndSortedApps.length}
            </div>
          </div>
          <Package className="h-6 w-6 text-brand opacity-80" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">{t('uninstaller.estimatedStorage')}</div>
            <div className="text-xl font-bold font-mono text-text-primary mt-1">
              {formatAppSize(totalStorageKb)}
            </div>
          </div>
          <HardDrive className="h-6 w-6 text-brand opacity-80" />
        </div>
      </div>

      {/* Controls Toolbar */}
      <div className="rounded-[6px] border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              placeholder={t('uninstaller.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-[6px] border border-border-subtle bg-surface-subtle pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none font-sans"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideSystemApps}
              onChange={(e) => setHideSystemApps(e.target.checked)}
              className="rounded border-border bg-surface-subtle text-brand focus:ring-0"
            />
            <span>{t('uninstaller.hideSystemApps')}</span>
          </label>

          <div className="flex items-center gap-2 border-l border-border pl-4">
            <span className="text-xs text-text-muted font-mono">{t('uninstaller.sortLabel')}</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="rounded-[6px] border border-border-subtle bg-surface-subtle px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-brand focus:outline-none"
            >
              <option value="name">{t('uninstaller.sortName')}</option>
              <option value="size">{t('uninstaller.sortSize')}</option>
              <option value="publisher">{t('uninstaller.sortPublisher')}</option>
              <option value="date">{t('uninstaller.sortDate')}</option>
            </select>

            <button
              onClick={toggleSortOrder}
              title={t('uninstaller.sortOrderTooltip', { order: sortOrder.toUpperCase() })}
              aria-label={t('uninstaller.sortOrderTooltip', { order: sortOrder.toUpperCase() })}
              className="p-1.5 rounded-[6px] border border-border-subtle bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Application List / Table */}
      <div className="rounded-[6px] border border-border bg-surface overflow-hidden">
        {isAppsLoading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="h-8 w-8 text-brand animate-spin mx-auto" />
            <div className="text-xs font-mono text-text-secondary">
              {t('uninstaller.scanningRegistry')}
            </div>
          </div>
        ) : filteredAndSortedApps.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Info className="h-8 w-8 text-text-muted mx-auto" />
            <div className="text-sm font-medium text-text-primary">{t('uninstaller.noAppsFound')}</div>
            <div className="text-xs text-text-muted max-w-sm mx-auto">
              {searchQuery
                ? t('uninstaller.noAppsMatching', { query: searchQuery })
                : t('uninstaller.noAppsInRegistry')}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface-subtle text-[11px] font-mono uppercase text-text-muted tracking-wider">
              <div className="col-span-5">{t('uninstaller.colAppName')}</div>
              <div className="col-span-3">{t('uninstaller.colPublisher')}</div>
              <div className="col-span-2 text-right">{t('uninstaller.colEstimatedSize')}</div>
              <div className="col-span-2 text-right">{t('uninstaller.colAction')}</div>
            </div>

            {/* Application Rows */}
            {filteredAndSortedApps.map((app) => (
              <div
                key={app.id}
                className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-surface-hover/50 transition-colors"
              >
                <div className="col-span-5 min-w-0 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-[6px] bg-surface-subtle border border-border-subtle flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary truncate">
                        {app.name}
                      </span>
                      {app.isSystemComponent && (
                        <span className="text-[9px] font-mono bg-status-dangerSubtle text-status-danger px-1.5 py-0.5 rounded border border-status-danger/20">
                          {t('uninstaller.systemBadge')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-text-muted truncate mt-0.5">
                      {app.version ? `v${app.version}` : t('uninstaller.versionNa')}
                    </div>
                  </div>
                </div>

                <div className="col-span-3 text-xs text-text-secondary truncate font-sans">
                  {app.publisher || t('uninstaller.unknownPublisher')}
                </div>

                <div className="col-span-2 text-xs font-mono text-text-secondary text-right tabular-nums">
                  {formatAppSize(app.estimatedSizeKb)}
                </div>

                <div className="col-span-2 flex justify-end">
                  <button
                    onClick={() => handleUninstallClick(app)}
                    className="flex items-center gap-1.5 rounded-[6px] border border-status-danger/30 bg-status-dangerSubtle px-2.5 py-1 text-xs font-mono text-status-danger hover:bg-status-danger hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{t('uninstaller.uninstall')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

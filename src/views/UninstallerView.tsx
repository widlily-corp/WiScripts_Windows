import React, { useEffect, useState, useMemo } from 'react';
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
  if (!sizeKb || sizeKb <= 0) return 'Unknown';
  if (sizeKb < 1024) {
    return `${sizeKb} KB`;
  } else if (sizeKb < 1024 * 1024) {
    return `${(sizeKb / 1024).toFixed(1)} MB`;
  }
  return `${(sizeKb / (1024 * 1024)).toFixed(2)} GB`;
}

export function parseInstallDate(dateStr?: string | null): number {
  if (!dateStr || !dateStr.trim()) return 0;
  const s = dateStr.trim();
  if (/^\d{8}$/.test(s)) {
    const year = parseInt(s.slice(0, 4), 10);
    const month = parseInt(s.slice(4, 6), 10);
    const day = parseInt(s.slice(6, 8), 10);
    return new Date(year, month - 1, day).getTime();
  }
  const parsed = Date.parse(s);
  return isNaN(parsed) ? 0 : parsed;
}

export type SortField = 'name' | 'size' | 'publisher' | 'date';
export type SortOrder = 'asc' | 'desc';

export function UninstallerView() {
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
    const commandToRun = app.uninstallString || app.quietUninstallString || '# No uninstall command specified';

    openSafetyModal({
      title: `Uninstall Application: ${app.name}`,
      description: `You are about to launch the uninstaller for "${app.name}" (Publisher: ${app.publisher || 'Unknown'}, Version: ${app.version || 'N/A'}). Estimated size to free: ${formatAppSize(app.estimatedSizeKb)}.`,
      riskLevel: isSystem ? 'critical' : 'medium',
      commandsToRun: [
        `Target Application: ${app.name}`,
        `Registry Path: ${app.registryPath}`,
        `Uninstaller Executable Command: ${commandToRun}`,
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
      <AdminElevationBanner featureName="Application Uninstaller" />

      {/* Header Bar */}
      <div className="rounded-[6px] border border-border bg-surface p-5 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">
              Application Uninstaller
            </h2>
            {dryRunMode && (
              <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-[4px] font-bold">
                Dry-Run Preview
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            Enumerate registered Windows software packages, inspect uninstall commands, and trigger process uninstallation.
          </p>
        </div>

        <button
          onClick={() => fetchInstalledApps()}
          disabled={isAppsLoading}
          className="flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-mono text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-brand ${isAppsLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Scan</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">Total Installed Apps</div>
            <div className="text-xl font-bold font-mono text-text-primary mt-1">
              {installedApps.length}
            </div>
          </div>
          <Layers className="h-6 w-6 text-brand opacity-80" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">Filtered Applications</div>
            <div className="text-xl font-bold font-mono text-brand mt-1">
              {filteredAndSortedApps.length}
            </div>
          </div>
          <Package className="h-6 w-6 text-brand opacity-80" />
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-text-muted">Estimated Storage</div>
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
              placeholder="Search by app name, publisher, version or path..."
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
            <span>Hide System Components</span>
          </label>

          <div className="flex items-center gap-2 border-l border-border pl-4">
            <span className="text-xs text-text-muted font-mono">Sort:</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="rounded-[6px] border border-border-subtle bg-surface-subtle px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-brand focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="size">Estimated Size</option>
              <option value="publisher">Publisher</option>
              <option value="date">Install Date</option>
            </select>

            <button
              onClick={toggleSortOrder}
              title={`Sort Order: ${sortOrder.toUpperCase()}`}
              aria-label={`Sort Order: ${sortOrder.toUpperCase()}`}
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
              Scanning Windows Registry hives (HKLM 64-bit, HKLM 32-bit, HKCU)...
            </div>
          </div>
        ) : filteredAndSortedApps.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Info className="h-8 w-8 text-text-muted mx-auto" />
            <div className="text-sm font-medium text-text-primary">No Installed Applications Found</div>
            <div className="text-xs text-text-muted max-w-sm mx-auto">
              {searchQuery
                ? `No applications matching "${searchQuery}" were found.`
                : 'No desktop applications were found in the registry.'}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface-subtle text-[11px] font-mono uppercase text-text-muted tracking-wider">
              <div className="col-span-5">Application Name</div>
              <div className="col-span-3">Publisher</div>
              <div className="col-span-2 text-right">Estimated Size</div>
              <div className="col-span-2 text-right">Action</div>
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
                          System
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-text-muted truncate mt-0.5">
                      {app.version ? `v${app.version}` : 'Version N/A'}
                    </div>
                  </div>
                </div>

                <div className="col-span-3 text-xs text-text-secondary truncate font-sans">
                  {app.publisher || 'Unknown Publisher'}
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
                    <span>Uninstall</span>
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

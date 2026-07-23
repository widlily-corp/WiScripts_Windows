import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { WingetPackage, UwpAppInfo } from '../types';
import {
  Package,
  Search,
  Download,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle2,
  Box,
  AppWindow,
  ArrowUpCircle,
  ShieldCheck,
} from 'lucide-react';

const QUICK_PRESETS = [
  { id: '7zip.7zip', name: '7-Zip' },
  { id: 'Git.Git', name: 'Git' },
  { id: 'Microsoft.VisualStudioCode', name: 'VS Code' },
  { id: 'Microsoft.PowerToys', name: 'PowerToys' },
  { id: 'VideoLAN.VLC', name: 'VLC Media Player' },
];

export function PackageManagerView() {
  const [activeSubTab, setActiveSubTab] = useState<'winget' | 'uwp'>('winget');
  const [searchQuery, setSearchQuery] = useState('');
  const [uwpFilter, setUwpFilter] = useState('');
  const [hideFrameworks, setHideFrameworks] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const wingetPackages = useAppStore((s) => s.wingetPackages);
  const isWingetSearching = useAppStore((s) => s.isWingetSearching);
  const uwpApps = useAppStore((s) => s.uwpApps);
  const isUwpLoading = useAppStore((s) => s.isUwpLoading);

  const wingetSearch = useAppStore((s) => s.wingetSearch);
  const wingetInstall = useAppStore((s) => s.wingetInstall);
  const wingetUpdate = useAppStore((s) => s.wingetUpdate);
  const fetchUwpApps = useAppStore((s) => s.fetchUwpApps);
  const removeUwpApp = useAppStore((s) => s.removeUwpApp);

  // Auto-fetch UWP apps when switching to UWP tab for the first time
  useEffect(() => {
    if (activeSubTab === 'uwp' && uwpApps.length === 0 && !isUwpLoading) {
      fetchUwpApps();
    }
  }, [activeSubTab, uwpApps.length, isUwpLoading, fetchUwpApps]);

  const handleWingetSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isWingetSearching) return;
    wingetSearch(searchQuery.trim());
  };

  const handleQuickPresetSearch = (presetId: string) => {
    setSearchQuery(presetId);
    wingetSearch(presetId);
  };

  const handleInstall = async (packageId: string) => {
    if (isExecuting) return;
    setActionInProgress(`install_${packageId}`);
    try {
      await wingetInstall(packageId);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleUpdate = async (packageId: string) => {
    if (isExecuting) return;
    setActionInProgress(`update_${packageId}`);
    try {
      await wingetUpdate(packageId);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveUwp = async (packageFullName: string) => {
    if (isExecuting) return;
    setActionInProgress(`uwp_${packageFullName}`);
    try {
      await removeUwpApp(packageFullName);
    } finally {
      setActionInProgress(null);
    }
  };

  const filteredUwpApps = uwpApps.filter((app) => {
    if (hideFrameworks && app.isFramework) return false;
    if (!uwpFilter.trim()) return true;
    const query = uwpFilter.toLowerCase();
    return (
      app.name.toLowerCase().includes(query) ||
      app.packageFullName.toLowerCase().includes(query) ||
      app.publisherId.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">Package & Bloatware Manager</h2>
          </div>
          <p className="text-xs text-text-secondary">
            Search and manage WinGet packages or clean preinstalled UWP AppX bloatware.
          </p>
        </div>

        {/* Sub-tab Pill Switcher */}
        <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-[6px] border border-border-subtle">
          <button
            onClick={() => setActiveSubTab('winget')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
              activeSubTab === 'winget'
                ? 'bg-brand text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Box className="h-3.5 w-3.5" />
            <span>WinGet Packages</span>
          </button>
          <button
            onClick={() => setActiveSubTab('uwp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
              activeSubTab === 'uwp'
                ? 'bg-brand text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <AppWindow className="h-3.5 w-3.5" />
            <span>UWP App Debloater</span>
          </button>
        </div>
      </div>

      {/* Sub-tab 1: Winget Package Manager */}
      {activeSubTab === 'winget' && (
        <div className="space-y-5">
          {/* Search Controls Card */}
          <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
            <form onSubmit={handleWingetSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search packages by name or ID (e.g. 7zip, Git.Git, vscode)..."
                  className="w-full rounded-[6px] border border-border bg-surface-subtle pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isWingetSearching || !searchQuery.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 transition-opacity shadow-sm"
              >
                {isWingetSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span>Search</span>
              </button>
            </form>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border-subtle/50">
              <span className="text-[11px] text-text-muted font-mono uppercase">Quick Searches:</span>
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleQuickPresetSearch(preset.id)}
                  disabled={isWingetSearching}
                  className="px-2.5 py-1 rounded-[4px] border border-border-subtle bg-surface-subtle text-[11px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Results Table Card */}
          <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider font-mono">
                Package Search Results ({wingetPackages.length})
              </h3>
              {dryRunMode && (
                <span className="text-[10px] bg-status-successSubtle text-status-success px-2 py-0.5 rounded border border-status-success/30 font-mono">
                  Dry-Run Active
                </span>
              )}
            </div>

            {isWingetSearching ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-text-muted text-xs">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
                <span>Executing WinGet package search query...</span>
              </div>
            ) : wingetPackages.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-muted italic border border-dashed border-border-subtle rounded-[6px]">
                No WinGet packages returned. Enter a search term above or click a quick preset to begin.
              </div>
            ) : (
              <div className="overflow-x-auto border border-border-subtle rounded-[6px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-subtle text-text-muted font-mono text-[11px] uppercase">
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Package ID</th>
                      <th className="py-2.5 px-3">Version</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60">
                    {wingetPackages.map((pkg) => (
                      <tr key={pkg.id} className="hover:bg-surface-hover transition-colors">
                        <td className="py-2.5 px-3 font-medium text-text-primary">{pkg.name}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-brand">{pkg.id}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-text-secondary">{pkg.version}</td>
                        <td className="py-2.5 px-3 font-mono text-[10px] uppercase text-text-muted">{pkg.source}</td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            onClick={() => handleInstall(pkg.id)}
                            disabled={isExecuting}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] bg-brand text-[11px] font-medium text-white hover:bg-brand-hover disabled:opacity-40 transition-opacity"
                          >
                            {actionInProgress === `install_${pkg.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            <span>Install</span>
                          </button>
                          <button
                            onClick={() => handleUpdate(pkg.id)}
                            disabled={isExecuting}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border border-border bg-surface-subtle text-[11px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 transition-colors"
                          >
                            {actionInProgress === `update_${pkg.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArrowUpCircle className="h-3 w-3" />
                            )}
                            <span>Upgrade</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-tab 2: UWP App Debloater */}
      {activeSubTab === 'uwp' && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="rounded-[6px] border border-border bg-surface p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                value={uwpFilter}
                onChange={(e) => setUwpFilter(e.target.value)}
                placeholder="Filter UWP packages (e.g. Xbox, Bing, YourPhone)..."
                className="w-full rounded-[6px] border border-border bg-surface-subtle pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-text-secondary select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideFrameworks}
                  onChange={(e) => setHideFrameworks(e.target.checked)}
                  className="rounded border-border bg-surface-subtle text-brand focus:ring-0"
                />
                <span>Hide Framework Packages</span>
              </label>

              <button
                onClick={fetchUwpApps}
                disabled={isUwpLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-[6px] border border-border bg-surface-subtle text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isUwpLoading ? 'animate-spin' : ''}`} />
                <span>Refresh List</span>
              </button>
            </div>
          </div>

          {/* UWP List Card */}
          <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider font-mono">
                Installed AppX Packages ({filteredUwpApps.length} shown of {uwpApps.length})
              </h3>
              {dryRunMode && (
                <span className="text-[10px] bg-status-successSubtle text-status-success px-2 py-0.5 rounded border border-status-success/30 font-mono">
                  Dry-Run Active
                </span>
              )}
            </div>

            {isUwpLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-text-muted text-xs">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
                <span>Scanning system for installed UWP AppX packages...</span>
              </div>
            ) : filteredUwpApps.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-muted italic border border-dashed border-border-subtle rounded-[6px]">
                No UWP packages match current filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto border border-border-subtle rounded-[6px] max-h-[460px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-surface-subtle border-b border-border-subtle text-text-muted font-mono text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Application Name</th>
                      <th className="py-2.5 px-3">Package Full Name</th>
                      <th className="py-2.5 px-3">Publisher ID</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/60">
                    {filteredUwpApps.map((app) => (
                      <tr key={app.packageFullName} className="hover:bg-surface-hover transition-colors">
                        <td className="py-2.5 px-3 font-medium text-text-primary max-w-[200px] truncate">
                          {app.name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-text-muted max-w-[280px] truncate">
                          {app.packageFullName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-text-muted">{app.publisherId}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleRemoveUwp(app.packageFullName)}
                            disabled={isExecuting}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border border-status-danger/30 bg-status-dangerSubtle text-[11px] font-medium text-status-danger hover:bg-status-danger/20 disabled:opacity-40 transition-colors"
                          >
                            {actionInProgress === `uwp_${app.packageFullName}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span>Uninstall</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

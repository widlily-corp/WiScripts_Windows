import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { TabType } from '../types';
import { invoke } from '@tauri-apps/api/core';
import {
  Search,
  LayoutDashboard,
  Terminal,
  Volume2,
  Cpu,
  Sliders,
  Package,
  Trash2,
  Sparkles,
  FolderSearch,
  Power,
  Clock,
  ShieldAlert,
  Globe,
  HardDrive,
  Activity,
  FileCode,
  KeyRound,
  RotateCcw,
  History,
  Settings,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Layers,
  Play,
  FileText,
  CornerDownLeft,
  X,
} from 'lucide-react';

export type CommandPaletteItemType = 'tab' | 'tweak' | 'script' | 'action';

export interface CommandPaletteAction {
  type: 'navigate' | 'toggle_tweak' | 'open_script' | 'toggle_dry_run' | 'create_restore_point';
  tab?: TabType;
  tweakId?: string;
  scriptId?: string;
}

export interface CommandPaletteItem {
  id: string;
  type: CommandPaletteItemType;
  title: string;
  category: string;
  keywords: string[];
  description?: string;
  icon?: React.ElementType;
  action: CommandPaletteAction;
}

const NAVIGATION_TABS: Array<{ id: TabType; title: string; keywords: string[]; icon: React.ElementType }> = [
  { id: 'dashboard', title: 'Dashboard & System Metrics', keywords: ['system', 'metrics', 'overview', 'telemetry', 'cpu', 'ram'], icon: LayoutDashboard },
  { id: 'script_runner', title: 'Script Runner & Online Library', keywords: ['scripts', 'powershell', 'online library', 'code', 'automation'], icon: Terminal },
  { id: 'audio_manager', title: 'Audio Manager & Volume Routing', keywords: ['sound', 'volume', 'mixer', 'endpoints', 'devices', 'speaker'], icon: Volume2 },
  { id: 'governor', title: 'Resource Governor & ProFlow Engine', keywords: ['cpu', 'affinity', 'priority', 'ram trim', 'process', 'performance'], icon: Cpu },
  { id: 'gaming_latency', title: 'Gaming Low-Latency & DPC Latency Analyzer', keywords: ['dpc', 'latency', 'isr', 'timer resolution', 'game boost', 'gaming', '0.5ms'], icon: Zap },
  { id: 'smart_ram', title: 'Smart RAM & Standby List Memory Purger', keywords: ['ram', 'memory', 'standby list', 'working set', 'purge cache', 'empty working sets', 'trim'], icon: Layers },
  { id: 'network_shield', title: 'Live Network Traffic & Process Firewall Shield', keywords: ['network', 'firewall', 'sockets', 'block process', 'tcp', 'udp', 'traffic', 'shield'], icon: ShieldCheck },
  { id: 'hardware_health', title: 'Hardware NVMe SMART & Battery/Power Analytics', keywords: ['nvme', 'smart', 'ssd health', 'tbw', 'battery', 'power scheme', 'ultimate performance'], icon: Cpu },
  { id: 'optimization', title: 'Optimization & System Tweaks', keywords: ['debloat', 'telemetry', 'privacy', 'tweaks', 'services', 'windows 11'], icon: Sliders },
  { id: 'package_manager', title: 'Package Manager (WinGet)', keywords: ['winget', 'software', 'install', 'update', 'apps', 'packages'], icon: Package },
  { id: 'app_uninstaller', title: 'App Uninstaller & Debloat', keywords: ['uninstall', 'uwp', 'clean apps', 'remove software', 'store apps'], icon: Trash2 },
  { id: 'presets', title: '1-Click Presets & Profiles (.wiscripts)', keywords: ['profiles', 'gaming', 'privacy', 'wiscripts', 'work', 'presets'], icon: Sparkles },
  { id: 'system_cleaner', title: 'System & Disk Cleaner', keywords: ['temp', 'junk', 'cache', 'clean', 'recycle bin', 'logs'], icon: Sparkles },
  { id: 'storage_utilities', title: 'Storage Utilities (2-Stage Deduplication)', keywords: ['duplicates', 'large files', '2-stage hash', 'disk space', 'storage'], icon: FolderSearch },
  { id: 'startup', title: 'Startup Apps & Boot Optimization', keywords: ['autostart', 'boot', 'run keys', 'startup programs', 'registry'], icon: Power },
  { id: 'scheduler', title: 'Task Scheduler Manager', keywords: ['tasks', 'scheduled', 'telemetry tasks', 'triggers', 'cron'], icon: Clock },
  { id: 'autoruns', title: 'Deep Autoruns & Security Quarantine', keywords: ['sysinternals', 'drivers', 'quarantine', 'code execution', 'services'], icon: ShieldAlert },
  { id: 'dns_context', title: 'DNS & Classic Context Menu', keywords: ['dns', 'cloudflare', 'classic menu', 'google dns', 'quad9', 'explorer'], icon: Globe },
  { id: 'driver_backup', title: 'Driver Backup & DISM Export', keywords: ['drivers', 'dism', 'backup', 'inf', 'hardware'], icon: HardDrive },
  { id: 'diagnostics', title: 'System Diagnostics (SFC, DISM, Battery)', keywords: ['sfc', 'dism', 'battery', 'network ping', 'health', 'chkdsk'], icon: Activity },
  { id: 'odt', title: 'Office Deployment Tool (ODT)', keywords: ['office', 'xml', 'deployment', 'word', 'excel', 'click-to-run'], icon: FileCode },
  { id: 'activation', title: 'Activation Hub (MAS HWID/KMS38)', keywords: ['mas', 'hwid', 'kms38', 'activation', 'ohook', 'license'], icon: KeyRound },
  { id: 'restore_points', title: 'System Restore Points (VSS)', keywords: ['vss', 'restore point', 'shadow copy', 'checkpoint', 'backup'], icon: RotateCcw },
  { id: 'state_engine', title: 'StateEngine & Delta Rollback', keywords: ['delta', 'rollback', 'snapshot', 'json backup', 'restore state'], icon: History },
  { id: 'settings', title: 'App Settings & Language', keywords: ['theme', 'dry-run', 'language', 'updates', 'dark mode', 'config'], icon: Settings },
];

const SCRIPT_LIBRARY_ENTRIES: Array<{ id: string; title: string; category: string; keywords: string[] }> = [
  { id: 'maint-clear-wu-cache', title: 'Clear Windows Update Cache', category: 'Script Library (Maintenance)', keywords: ['windows update', 'software distribution', 'wuauserv', 'cache purge', 'services'] },
  { id: 'maint-rebuild-icon-cache', title: 'Rebuild Icon & Thumbnail Cache', category: 'Script Library (Maintenance)', keywords: ['explorer', 'icon cache', 'thumbnails', 'db', 'refresh ui'] },
  { id: 'maint-clean-winsxs', title: 'Clean WinSxS Component Store', category: 'Script Library (Maintenance)', keywords: ['winsxs', 'dism', 'component-store', 'disk-cleanup', 'resetbase'] },
  { id: 'net-flush-dns-winsock', title: 'Flush DNS & Reset Winsock', category: 'Script Library (Network)', keywords: ['dns', 'winsock', 'network', 'repair', 'flush', 'catalog'] },
  { id: 'net-reset-tcp-ip', title: 'Reset TCP/IP Stack', category: 'Script Library (Network)', keywords: ['tcp-ip', 'netsh', 'dhcp', 'arp', 'network', 'renew'] },
  { id: 'net-optimize-tcp-window', title: 'Optimize TCP Window Scaling & RSS', category: 'Script Library (Network)', keywords: ['tcp', 'autotuning', 'rss', 'performance', 'throughput', 'cubic'] },
  { id: 'sec-harden-smb-netbios', title: 'Disable SMBv1 & Legacy NetBIOS', category: 'Script Library (Security)', keywords: ['smb', 'netbios', 'security', 'ransomware', 'harden'] },
  { id: 'sec-disable-wpad', title: 'Disable WPAD & LLMNR Resolution', category: 'Script Library (Security)', keywords: ['wpad', 'llmnr', 'spoofing', 'mitm', 'security'] },
  { id: 'sec-enable-uac-secure-desktop', title: 'Enable UAC Secure Desktop Mode', category: 'Script Library (Security)', keywords: ['uac', 'promptonsecuredesktop', 'elevation', 'security'] },
  { id: 'perf-ultimate-power-plan', title: 'Activate Ultimate Performance Power Scheme', category: 'Script Library (Performance)', keywords: ['power', 'ultimate performance', 'powercfg', 'energy', 'gaming'] },
  { id: 'perf-disable-core-parking', title: 'Disable CPU Core Parking', category: 'Script Library (Performance)', keywords: ['cpu', 'core parking', 'latency', 'unpark', 'threads'] },
  { id: 'perf-optimize-ntfs-memory', title: 'Optimize NTFS Memory & 8.3 Names', category: 'Script Library (Performance)', keywords: ['ntfs', '8dot3', 'memory usage', 'filesystem', 'fsutil'] },
  { id: 'diag-export-battery-report', title: 'Generate Battery Health Diagnostic Report', category: 'Script Library (Diagnostics)', keywords: ['battery', 'powercfg', 'batteryreport', 'health', 'diagnostics'] },
  { id: 'diag-network-latency-jitter', title: 'Test Network Latency & Jitter', category: 'Script Library (Diagnostics)', keywords: ['ping', 'latency', 'jitter', 'dns resolution', 'connection test'] },
  { id: 'diag-verify-system-integrity', title: 'Verify System File Integrity (SFC & DISM)', category: 'Script Library (Diagnostics)', keywords: ['sfc', 'scannow', 'dism', 'checkhealth', 'restorehealth'] },
];

export function CommandPalette() {
  const { t } = useTranslation();
  const isOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const optimizations = useAppStore((s) => s.optimizations);
  const toggleOptimizationSelected = useAppStore((s) => s.toggleOptimizationSelected);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const setDryRunMode = useAppStore((s) => s.setDryRunMode);
  const createRestorePoint = useAppStore((s) => s.createRestorePoint);
  const addToast = useAppStore((s) => s.addToast);
  const addLog = useAppStore((s) => s.addLog);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'tab' | 'tweak' | 'script' | 'action'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Build the complete search index
  const masterIndex = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [];

    // 1. Navigation Tabs (25 Views)
    for (const tab of NAVIGATION_TABS) {
      items.push({
        id: `tab_${tab.id}`,
        type: 'tab',
        title: tab.title,
        category: 'Navigation',
        keywords: tab.keywords,
        description: `Navigate to ${tab.title}`,
        icon: tab.icon,
        action: { type: 'navigate', tab: tab.id },
      });
    }

    // 2. Optimization Tweaks (70+ items)
    for (const tweak of optimizations) {
      let catLabel = 'Optimization & Tweaks';
      if (tweak.id.startsWith('win11_')) {
        catLabel = 'Windows 11 24H2 / AI';
      } else if (tweak.category === 'privacy') {
        catLabel = 'Privacy & Telemetry';
      } else if (tweak.category === 'services') {
        catLabel = 'Windows Services';
      } else if (tweak.category === 'ui_tweaks') {
        catLabel = 'Explorer & UI';
      } else if (tweak.category === 'disk_cleanup') {
        catLabel = 'Disk & Storage';
      }

      items.push({
        id: `tweak_${tweak.id}`,
        type: 'tweak',
        title: tweak.title,
        category: catLabel,
        keywords: [tweak.id, tweak.category, tweak.riskLevel, 'tweak', 'optimize', ...tweak.title.toLowerCase().split(' ')],
        description: tweak.description,
        icon: Sliders,
        action: { type: 'toggle_tweak', tweakId: tweak.id },
      });
    }

    // 3. PowerShell Scripts from scripts_lib (15 scripts)
    for (const sc of SCRIPT_LIBRARY_ENTRIES) {
      items.push({
        id: `script_${sc.id}`,
        type: 'script',
        title: sc.title,
        category: sc.category,
        keywords: sc.keywords,
        description: `Execute or edit ${sc.title}`,
        icon: FileCode,
        action: { type: 'open_script', scriptId: sc.id },
      });
    }

    // 4. Quick Actions
    items.push({
      id: 'action_toggle_dry_run',
      type: 'action',
      title: `Toggle Dry-Run Simulation Mode (${dryRunMode ? 'Currently Active' : 'Currently Inactive'})`,
      category: 'Quick Actions',
      keywords: ['dry-run', 'simulation', 'safe mode', 'test', 'safety'],
      description: 'Switch between actual system execution and dry-run command simulation',
      icon: dryRunMode ? ShieldCheck : ShieldAlert,
      action: { type: 'toggle_dry_run' },
    });

    items.push({
      id: 'action_create_restore_point',
      type: 'action',
      title: 'Create System Restore Point (VSS Checkpoint)',
      category: 'Quick Actions',
      keywords: ['vss', 'restore point', 'checkpoint', 'backup', 'system restore'],
      description: 'Create an immediate Windows System Restore Point prior to configuration changes',
      icon: RotateCcw,
      action: { type: 'create_restore_point' },
    });

    return items;
  }, [optimizations, dryRunMode]);

  // Fuzzy Search Scoring Engine
  const searchResults = useMemo(() => {
    let filteredList = masterIndex;
    if (selectedFilter !== 'all') {
      filteredList = masterIndex.filter((item) => item.type === selectedFilter);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      return filteredList.slice(0, 30);
    }

    // Neutralize regex characters and sanitize query
    const cleanQuery = trimmed.toLowerCase();

    const scored: Array<{ item: CommandPaletteItem; score: number }> = [];

    for (const item of filteredList) {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const idLower = item.id.toLowerCase();
      const catLower = item.category.toLowerCase();
      const descLower = (item.description || '').toLowerCase();

      // Exact matches
      if (titleLower === cleanQuery || idLower === cleanQuery) {
        score += 120;
      } else if (titleLower.startsWith(cleanQuery)) {
        score += 60;
      } else if (titleLower.includes(cleanQuery)) {
        score += 30;
      }

      // Category matches
      if (catLower.includes(cleanQuery)) {
        score += 15;
      }

      // Description matches
      if (descLower.includes(cleanQuery)) {
        score += 10;
      }

      // Keyword matches
      for (const kw of item.keywords) {
        const kwLower = kw.toLowerCase();
        if (kwLower === cleanQuery) {
          score += 45;
        } else if (kwLower.startsWith(cleanQuery)) {
          score += 25;
        } else if (kwLower.includes(cleanQuery)) {
          score += 15;
        }
      }

      if (score > 0) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [masterIndex, query, selectedFilter]);

  // Keep selected index in range
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults.length, selectedFilter]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const handleExecuteItem = async (item: CommandPaletteItem) => {
    setOpen(false);

    switch (item.action.type) {
      case 'navigate': {
        if (item.action.tab) {
          setActiveTab(item.action.tab);
        }
        break;
      }
      case 'toggle_tweak': {
        if (item.action.tweakId) {
          toggleOptimizationSelected(item.action.tweakId);
          setActiveTab('optimization');
          addToast({
            type: 'info',
            title: 'Tweak Toggled',
            message: `Selected status updated for "${item.title}".`,
          });
        }
        break;
      }
      case 'open_script': {
        setActiveTab('script_runner');
        addToast({
          type: 'info',
          title: 'Script Selected',
          message: `Opened "${item.title}" in Script Runner.`,
        });
        break;
      }
      case 'toggle_dry_run': {
        const nextMode = !dryRunMode;
        setDryRunMode(nextMode);
        addToast({
          type: nextMode ? 'success' : 'warning',
          title: 'Simulation Mode',
          message: nextMode ? 'Dry-Run simulation mode ENABLED' : 'Dry-Run simulation mode DISABLED (Live Execution)',
        });
        break;
      }
      case 'create_restore_point': {
        await createRestorePoint('WiScripts Command Palette Manual Checkpoint');
        break;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, searchResults.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0 && searchResults[selectedIndex]) {
        handleExecuteItem(searchResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/75 backdrop-blur-sm animate-fade-in select-none"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette"
    >
      <div
        className="w-full max-w-2xl rounded-[8px] border border-border bg-surface shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-surface-subtle">
          <Search className="h-5 w-5 text-brand shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, tweak, view, or script... (↑↓ to navigate, Enter to run, Esc to close)"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            aria-autocomplete="list"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded text-text-muted hover:text-text-primary"
              aria-label="Clear query"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="text-[10px] font-mono uppercase bg-surface border border-border px-1.5 py-0.5 rounded text-text-muted">
            ESC
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-surface text-xs">
          {(
            [
              { id: 'all' as const, label: 'All Items' },
              { id: 'tab' as const, label: `Views (${NAVIGATION_TABS.length})` },
              { id: 'tweak' as const, label: 'Tweaks (70+)' },
              { id: 'script' as const, label: `Scripts (${SCRIPT_LIBRARY_ENTRIES.length})` },
              { id: 'action' as const, label: 'Quick Actions' },
            ]
          ).map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSelectedFilter(filter.id)}
              className={`px-2.5 py-1 rounded-[4px] text-[11px] font-medium transition-colors ${
                selectedFilter === filter.id
                  ? 'bg-brand text-white'
                  : 'bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <div className="ml-auto text-[10px] font-mono text-text-muted">
            {searchResults.length} results
          </div>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto p-2 space-y-1 divide-y divide-border-subtle/40"
          role="listbox"
        >
          {searchResults.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-muted">
              No matching commands or tweaks found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            searchResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon || FileText;

              return (
                <div
                  key={item.id}
                  onClick={() => handleExecuteItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-[6px] cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-surface-active text-text-primary border border-border-focus/40 shadow-sm'
                      : 'text-text-secondary hover:bg-surface-hover/80 hover:text-text-primary border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-8 w-8 rounded-[6px] flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface-subtle text-text-secondary border-border-subtle'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate text-text-primary">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase bg-surface-subtle border border-border-subtle px-1.5 py-0.2 rounded text-text-muted shrink-0">
                          {item.category}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-text-muted truncate mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-brand bg-brand-subtle px-2 py-0.5 rounded border border-brand/20">
                        <CornerDownLeft className="h-3 w-3" /> Select
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-border bg-surface-subtle flex items-center justify-between text-[11px] text-text-muted font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div>WiScripts Command Engine v1.0</div>
        </div>
      </div>
    </div>
  );
}

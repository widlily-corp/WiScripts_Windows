import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { TabType } from '../types';
import {
  LayoutDashboard,
  Volume2,
  Cpu,
  Sliders,
  Package,
  Trash2,
  Sparkles,
  FolderSearch,
  Globe,
  HardDrive,
  Activity,
  FileCode,
  KeyRound,
  Terminal,
  Settings,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Power,
  Clock,
  History,
  Zap,
  Layers,
  Search,
  X,
} from 'lucide-react';

interface NavItem {
  id: TabType;
  labelKey: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.items.dashboard', icon: LayoutDashboard },
  { id: 'script_runner', labelKey: 'nav.items.script_runner', icon: Terminal },
  { id: 'audio_manager', labelKey: 'nav.items.audio_manager', icon: Volume2 },
  { id: 'governor', labelKey: 'nav.items.governor', icon: Cpu },
  { id: 'gaming_latency', labelKey: 'nav.items.gaming_latency', icon: Zap },
  { id: 'smart_ram', labelKey: 'nav.items.smart_ram', icon: Layers },
  { id: 'network_shield', labelKey: 'nav.items.network_shield', icon: ShieldCheck },
  { id: 'hardware_health', labelKey: 'nav.items.hardware_health', icon: Cpu },
  { id: 'optimization', labelKey: 'nav.items.optimization', icon: Sliders },
  { id: 'package_manager', labelKey: 'nav.items.package_manager', icon: Package },
  { id: 'app_uninstaller', labelKey: 'nav.items.app_uninstaller', icon: Trash2 },
  { id: 'presets', labelKey: 'nav.items.presets', icon: Sparkles },
  { id: 'system_cleaner', labelKey: 'nav.items.system_cleaner', icon: Sparkles },
  { id: 'storage_utilities', labelKey: 'nav.items.storage_utilities', icon: FolderSearch },
  { id: 'startup', labelKey: 'nav.items.startup', icon: Power },
  { id: 'scheduler', labelKey: 'nav.items.scheduler', icon: Clock },
  { id: 'autoruns', labelKey: 'nav.items.autoruns', icon: ShieldAlert },
  { id: 'dns_context', labelKey: 'nav.items.dns_context', icon: Globe },
  { id: 'driver_backup', labelKey: 'nav.items.driver_backup', icon: HardDrive },
  { id: 'diagnostics', labelKey: 'nav.items.diagnostics', icon: Activity },
  { id: 'odt', labelKey: 'nav.items.odt', icon: FileCode },
  { id: 'activation', labelKey: 'nav.items.activation', icon: KeyRound },
  { id: 'restore_points', labelKey: 'nav.items.restore_points', icon: RotateCcw },
  { id: 'state_engine', labelKey: 'nav.items.state_engine', icon: History },
  { id: 'settings', labelKey: 'nav.items.settings', icon: Settings },
];

interface NavCategory {
  id: string;
  labelKey: string;
  itemIds: TabType[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'core_monitoring',
    labelKey: 'nav.categories.core_monitoring',
    itemIds: ['dashboard', 'hardware_health', 'diagnostics', 'state_engine'],
  },
  {
    id: 'performance',
    labelKey: 'nav.categories.performance',
    itemIds: ['optimization', 'governor', 'gaming_latency', 'smart_ram', 'audio_manager'],
  },
  {
    id: 'storage_cleaner',
    labelKey: 'nav.categories.storage_cleaner',
    itemIds: ['storage_utilities', 'system_cleaner'],
  },
  {
    id: 'system_software',
    labelKey: 'nav.categories.system_software',
    itemIds: ['script_runner', 'package_manager', 'app_uninstaller', 'startup', 'scheduler', 'autoruns', 'driver_backup'],
  },
  {
    id: 'security_network',
    labelKey: 'nav.categories.security_network',
    itemIds: ['network_shield', 'dns_context', 'restore_points'],
  },
  {
    id: 'tools_settings',
    labelKey: 'nav.categories.tools_settings',
    itemIds: ['presets', 'odt', 'activation', 'settings'],
  },
];

export function Navigation() {
  const { t } = useTranslation();
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const appVersion = useAppStore((s) => s.appVersion);

  const [filterQuery, setFilterQuery] = useState('');

  const visibleItems = useMemo(() => {
    if (!filterQuery.trim()) return NAV_ITEMS;
    const q = filterQuery.toLowerCase();
    return NAV_ITEMS.filter((item) => {
      const label = t(item.labelKey).toLowerCase();
      return label.includes(q) || item.id.toLowerCase().includes(q);
    });
  }, [filterQuery, t]);

  return (
    <aside className="w-64 border-r border-border bg-surface flex flex-col h-full select-none shrink-0 overflow-hidden">
      {/* Brand Header */}
      <div className="p-4 border-b border-border flex flex-col gap-3 shrink-0">
        <div className="flex items-center gap-3 shrink-0">
          <img src="/icon.png" alt="WiScripts" className="h-8 w-8 rounded-[6px] object-cover bg-white shadow-sm shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold text-text-primary leading-tight truncate">WiScripts</h1>
            <span className="text-[10px] font-mono text-text-muted tracking-wider uppercase truncate block">
              {t('nav.app_version', { version: appVersion || '1.0.0' })}
            </span>
          </div>
        </div>

        {/* Quick Filter Search in Navigation */}
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={t('nav.filter_placeholder', 'Поиск разделов...')}
            className="w-full pl-8 pr-7 py-1 text-xs bg-surface-subtle border border-border rounded-[6px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors font-sans"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
              aria-label="Clear navigation filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Nav Links */}
      <nav
        className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 custom-scrollbar"
        aria-label="Main Navigation"
      >
        {filterQuery.trim() ? (
          visibleItems.length > 0 ? (
            visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  disabled={isExecuting}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-[6px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand ${
                    isExecuting ? 'opacity-50 cursor-not-allowed' : ''
                  } ${
                    isActive
                      ? 'bg-surface-active text-brand border border-border-focus/40'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary border border-transparent'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-brand' : 'text-text-muted'}`} />
                  <span className="truncate text-left">{t(item.labelKey)}</span>
                </button>
              );
            })
          ) : (
            <div className="py-6 text-center text-xs text-text-muted font-mono">
              Ничего не найдено
            </div>
          )
        ) : (
          NAV_CATEGORIES.map((category) => {
            const categoryItems = NAV_ITEMS.filter((item) => category.itemIds.includes(item.id));
            if (categoryItems.length === 0) return null;

            return (
              <div key={category.id} className="space-y-1 pt-1 first:pt-0">
                <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-text-muted font-semibold">
                  {t(category.labelKey)}
                </div>
                {categoryItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      disabled={isExecuting}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-[6px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand ${
                        isExecuting ? 'opacity-50 cursor-not-allowed' : ''
                      } ${
                        isActive
                          ? 'bg-surface-active text-brand border border-border-focus/40'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary border border-transparent'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-brand' : 'text-text-muted'}`} />
                      <span className="truncate text-left">{t(item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </nav>

      {/* Admin Elevation Status Card */}
      <div className="p-3 border-t border-border shrink-0 bg-surface">
        <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-2.5 flex items-center gap-2.5">
          {systemInfo?.isElevated ? (
            <ShieldCheck className="h-4 w-4 text-status-success shrink-0" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-status-warning shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-text-primary truncate">
              {systemInfo?.isElevated ? t('nav.admin_status.elevated') : t('nav.admin_status.standard')}
            </div>
            <div className="text-[10px] text-text-muted truncate">
              {systemInfo?.isElevated ? t('nav.admin_status.full_control') : t('nav.admin_status.limited_control')}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

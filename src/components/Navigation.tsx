import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { TabType } from '../types';
import {
  LayoutDashboard,
  Volume2,
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
} from 'lucide-react';

interface NavItem {
  id: TabType;
  labelKey: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.items.dashboard', icon: LayoutDashboard },
  { id: 'audio_manager', labelKey: 'nav.items.audio_manager', icon: Volume2 },
  { id: 'optimization', labelKey: 'nav.items.optimization', icon: Sliders },
  { id: 'package_manager', labelKey: 'nav.items.package_manager', icon: Package },
  { id: 'app_uninstaller', labelKey: 'nav.items.app_uninstaller', icon: Trash2 },
  { id: 'presets', labelKey: 'nav.items.presets', icon: Sparkles },
  { id: 'system_cleaner', labelKey: 'nav.items.system_cleaner', icon: Sparkles },
  { id: 'storage_utilities', labelKey: 'nav.items.storage_utilities', icon: FolderSearch },
  { id: 'startup', labelKey: 'nav.items.startup', icon: Power },
  { id: 'scheduler', labelKey: 'nav.items.scheduler', icon: Clock },
  { id: 'dns_context', labelKey: 'nav.items.dns_context', icon: Globe },
  { id: 'driver_backup', labelKey: 'nav.items.driver_backup', icon: HardDrive },
  { id: 'diagnostics', labelKey: 'nav.items.diagnostics', icon: Activity },
  { id: 'odt', labelKey: 'nav.items.odt', icon: FileCode },
  { id: 'activation', labelKey: 'nav.items.activation', icon: KeyRound },
  { id: 'restore_points', labelKey: 'nav.items.restore_points', icon: RotateCcw },
  { id: 'settings', labelKey: 'nav.items.settings', icon: Settings },
];



export function Navigation() {
  const { t } = useTranslation();
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const appVersion = useAppStore((s) => s.appVersion);

  return (
    <aside className="w-64 border-r border-border bg-surface flex flex-col justify-between h-full select-none">
      <div>
        {/* Brand Header */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <img src="/icon.png" alt="WiScripts" className="h-8 w-8 rounded-[6px] object-cover bg-white shadow-sm" />
          <div>
            <h1 className="text-sm font-semibold text-text-primary leading-tight">WiScripts</h1>
            <span className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
              {t('nav.app_version', { version: appVersion || '0.3.0' })}
            </span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                disabled={isExecuting}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-[6px] transition-opacity ${
                  isExecuting ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  isActive
                    ? 'bg-surface-active text-brand border border-border-focus/40'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-brand' : 'text-text-muted'}`} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Admin Elevation Status Card */}
      <div className="p-3 border-t border-border">
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

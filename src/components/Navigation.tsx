import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { TabType } from '../types';
import {
  LayoutDashboard,
  Sliders,
  Package,
  Sparkles,
  Globe,
  HardDrive,
  Activity,
  FileCode,
  KeyRound,
  Terminal,
  Settings,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'optimization', label: 'Optimizations', icon: Sliders },
  { id: 'package_manager', label: 'Package Manager', icon: Package },
  { id: 'presets', label: 'Optimization Presets', icon: Sparkles },
  { id: 'dns_context', label: 'DNS & Context Menu', icon: Globe },
  { id: 'driver_backup', label: 'Driver Backup', icon: HardDrive },
  { id: 'diagnostics', label: 'Diagnostics & Health', icon: Activity },
  { id: 'odt', label: 'Office ODT', icon: FileCode },
  { id: 'activation', label: 'Activation MAS', icon: KeyRound },
  { id: 'settings', label: 'Settings', icon: Settings },
];


export function Navigation() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const isExecuting = useAppStore((s) => s.isExecuting);

  return (
    <aside className="w-64 border-r border-border bg-surface flex flex-col justify-between h-full select-none">
      <div>
        {/* Brand Header */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="h-8 w-8 rounded-[6px] bg-brand text-white flex items-center justify-center font-bold text-sm">
            WS
          </div>
          <div>
            <h1 className="text-sm font-semibold text-text-primary leading-tight">WiScripts</h1>
            <span className="text-[10px] font-mono text-text-muted tracking-wider uppercase">
              Windows Utility v2.0
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
                <span>{item.label}</span>
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
              {systemInfo?.isElevated ? 'Elevated Privileges' : 'Standard User'}
            </div>
            <div className="text-[10px] text-text-muted truncate">
              {systemInfo?.isElevated ? 'Full Registry & Service Control' : 'Limited System Modifications'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

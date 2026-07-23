import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Globe,
  MousePointer,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Play,
  Network,
  Sliders,
  Check,
} from 'lucide-react';

interface DnsCard {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  description: string;
  recommendedFor: string;
}

const DNS_PROVIDERS: DnsCard[] = [
  {
    id: 'adguard',
    name: 'AdGuard DNS',
    primary: '94.140.14.14',
    secondary: '94.140.15.15',
    description: 'Blocks ads, malware domains, phishing sites, and tracking servers system-wide.',
    recommendedFor: 'Ad-blocking & Privacy',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare 1.1.1.1',
    primary: '1.1.1.1',
    secondary: '1.0.0.1',
    description: 'Ultra-fast privacy-focused DNS resolver with DNSSEC validation.',
    recommendedFor: 'High Speed & Privacy',
  },
  {
    id: 'google',
    name: 'Google Public DNS',
    primary: '8.8.8.8',
    secondary: '8.8.4.4',
    description: 'Global distributed high-reliability DNS resolver infrastructure.',
    recommendedFor: 'Global Reliability',
  },
  {
    id: 'dhcp',
    name: 'Automatic (DHCP)',
    primary: 'Obtain automatically',
    secondary: 'Obtain automatically',
    description: 'Resets DNS server configuration back to ISP/router automatic DHCP settings.',
    recommendedFor: 'Default ISP Network',
  },
];

export function DnsContextMenuView() {
  const [interfaceAlias, setInterfaceAlias] = useState('');
  const [activeDnsAction, setActiveDnsAction] = useState<string | null>(null);
  const [isTogglingMenu, setIsTogglingMenu] = useState(false);

  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const selectedDnsProvider = useAppStore((s) => s.selectedDnsProvider);
  const setSelectedDnsProvider = useAppStore((s) => s.setSelectedDnsProvider);
  const classicContextMenuEnabled = useAppStore((s) => s.classicContextMenuEnabled);
  const isContextMenuLoading = useAppStore((s) => s.isContextMenuLoading);

  const setDnsServer = useAppStore((s) => s.setDnsServer);
  const fetchClassicContextMenuStatus = useAppStore((s) => s.fetchClassicContextMenuStatus);
  const toggleClassicContextMenu = useAppStore((s) => s.toggleClassicContextMenu);

  useEffect(() => {
    fetchClassicContextMenuStatus();
  }, [fetchClassicContextMenuStatus]);

  const handleApplyDns = async (providerId: string) => {
    if (isExecuting) return;
    setActiveDnsAction(providerId);
    setSelectedDnsProvider(providerId);
    try {
      await setDnsServer(providerId, interfaceAlias.trim() || undefined);
    } finally {
      setActiveDnsAction(null);
    }
  };

  const handleToggleContextMenu = async (enable: boolean) => {
    if (isExecuting) return;
    setIsTogglingMenu(true);
    try {
      await toggleClassicContextMenu(enable);
    } finally {
      setIsTogglingMenu(false);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">DNS & Context Menu Manager</h2>
          </div>
          <p className="text-xs text-text-secondary">
            Configure system DNS resolver servers and toggle classic Windows 10 right-click menu on Windows 11.
          </p>
        </div>

        {dryRunMode && (
          <span className="text-xs bg-status-successSubtle text-status-success px-3 py-1 rounded-[6px] border border-status-success/30 font-mono">
            Dry-Run Active
          </span>
        )}
      </div>

      {/* Section 1: Win11 Classic Context Menu Manager */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <MousePointer className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Windows 11 Classic Context Menu</h3>
              <p className="text-xs text-text-secondary">
                Restores full classic right-click menu without needing "Show more options" (Shift+F10).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono px-2.5 py-1 rounded-[4px] border ${
                classicContextMenuEnabled
                  ? 'bg-status-successSubtle text-status-success border-status-success/30'
                  : 'bg-surface-subtle text-text-muted border-border-subtle'
              }`}
            >
              Status: {classicContextMenuEnabled ? 'Classic Win10 Active' : 'Modern Win11 Active'}
            </span>
            <button
              onClick={fetchClassicContextMenuStatus}
              disabled={isContextMenuLoading}
              className="p-1.5 rounded-[6px] border border-border bg-surface-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 transition-colors"
              title="Refresh Registry Status"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isContextMenuLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-subtle p-3 rounded-[6px] border border-border-subtle">
          <div className="text-xs text-text-secondary">
            Modifies HKCU CLSID registry key <code className="font-mono text-brand text-[11px] font-semibold">{`{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}`}</code>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleToggleContextMenu(true)}
              disabled={isExecuting || isTogglingMenu}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-[6px] text-xs font-medium transition-colors ${
                classicContextMenuEnabled
                  ? 'bg-brand text-white'
                  : 'border border-border bg-surface text-text-primary hover:bg-surface-hover'
              }`}
            >
              {isTogglingMenu ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>Enable Classic Menu</span>
            </button>

            <button
              onClick={() => handleToggleContextMenu(false)}
              disabled={isExecuting || isTogglingMenu}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-[6px] text-xs font-medium transition-colors ${
                !classicContextMenuEnabled
                  ? 'bg-surface-active text-text-primary border border-border-focus'
                  : 'border border-border bg-surface text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {isTogglingMenu ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span>Restore Win11 Modern Menu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: DNS Provider Switcher */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <Network className="h-4 w-4 text-brand" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">System DNS Server Switcher</h3>
              <p className="text-xs text-text-secondary">
                Set active DNS servers across active network adapters (`Set-DnsClientServerAddress`).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-text-muted font-mono whitespace-nowrap">Interface:</span>
            <input
              type="text"
              value={interfaceAlias}
              onChange={(e) => setInterfaceAlias(e.target.value)}
              placeholder="e.g. Ethernet, Wi-Fi (Blank = All Active)"
              className="w-full sm:w-64 rounded-[6px] border border-border bg-surface-subtle px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        {/* DNS Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DNS_PROVIDERS.map((dns) => {
            const isSelected = selectedDnsProvider === dns.id;
            const isRunning = activeDnsAction === dns.id;

            return (
              <div
                key={dns.id}
                className={`rounded-[6px] border p-4 flex flex-col justify-between space-y-3 transition-colors ${
                  isSelected
                    ? 'border-brand bg-brand-subtle/20'
                    : 'border-border bg-surface hover:border-border-focus/40'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      {dns.name}
                      {isSelected && (
                        <span className="text-[10px] bg-brand text-white px-2 py-0.5 rounded font-mono">
                          Selected
                        </span>
                      )}
                    </h4>
                    <span className="text-[10px] font-mono text-text-muted bg-surface-subtle border border-border-subtle px-2 py-0.5 rounded">
                      {dns.recommendedFor}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed">{dns.description}</p>

                  <div className="flex items-center gap-4 text-xs font-mono text-text-muted pt-1">
                    <div>
                      <span className="text-[10px] text-text-muted uppercase">Primary:</span>{' '}
                      <span className="text-text-primary font-semibold">{dns.primary}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-muted uppercase">Secondary:</span>{' '}
                      <span className="text-text-primary font-semibold">{dns.secondary}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleApplyDns(dns.id)}
                  disabled={isExecuting}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[6px] text-xs font-medium transition-opacity shadow-sm ${
                    isSelected
                      ? 'bg-brand text-white hover:bg-brand-hover'
                      : 'bg-surface-subtle border border-border text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Applying DNS...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Set {dns.name}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

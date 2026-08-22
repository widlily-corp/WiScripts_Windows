import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Search,
  RefreshCw,
  Filter,
  Lock,
  Unlock,
  AlertTriangle,
  Globe,
  Radio,
  Server,
  Layers,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { NetworkConnection, FirewallRuleInfo } from '../types/networkShield';

export function NetworkShieldView() {
  const { t } = useTranslation();

  const connections = useAppStore((s) => s.connections);
  const firewallRules = useAppStore((s) => s.firewallRules);
  const isNetworkLoading = useAppStore((s) => s.isNetworkLoading);
  const networkError = useAppStore((s) => s.networkError);

  const fetchActiveConnections = useAppStore((s) => s.fetchActiveConnections);
  const fetchFirewallRules = useAppStore((s) => s.fetchFirewallRules);
  const blockProcessFirewall = useAppStore((s) => s.blockProcessFirewall);
  const unblockProcessFirewall = useAppStore((s) => s.unblockProcessFirewall);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [protocolFilter, setProtocolFilter] = useState<'ALL' | 'TCP' | 'UDP'>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Modal / Drawer state for blocking
  const [selectedConnection, setSelectedConnection] = useState<NetworkConnection | null>(null);
  const [customRuleName, setCustomRuleName] = useState<string>('');
  const [showRulesDrawer, setShowRulesDrawer] = useState<boolean>(false);

  useEffect(() => {
    fetchActiveConnections();
    fetchFirewallRules();
  }, [fetchActiveConnections, fetchFirewallRules]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchActiveConnections();
    }, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActiveConnections]);

  const blockedProgramsSet = useMemo(() => {
    const set = new Set<string>();
    for (const rule of firewallRules) {
      if (rule.action.toLowerCase() === 'block' && rule.enabled) {
        if (rule.program) {
          const exe = rule.program.split('\\').pop()?.toLowerCase();
          if (exe) set.add(exe);
        }
      }
    }
    return set;
  }, [firewallRules]);

  const filteredConnections = useMemo(() => {
    return connections.filter((conn) => {
      if (protocolFilter !== 'ALL' && conn.protocol.toUpperCase() !== protocolFilter) {
        return false;
      }
      if (stateFilter !== 'ALL' && conn.state.toUpperCase() !== stateFilter.toUpperCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = conn.processName.toLowerCase().includes(query);
        const matchesPid = conn.pid.toString().includes(query);
        const matchesLocal = `${conn.localAddress}:${conn.localPort}`.toLowerCase().includes(query);
        const matchesRemote = `${conn.remoteAddress}:${conn.remotePort}`.toLowerCase().includes(query);
        if (!matchesName && !matchesPid && !matchesLocal && !matchesRemote) {
          return false;
        }
      }
      return true;
    });
  }, [connections, protocolFilter, stateFilter, searchQuery]);

  const stats = useMemo(() => {
    let tcpEstablished = 0;
    let tcpListening = 0;
    let udpCount = 0;
    for (const c of connections) {
      if (c.protocol.toUpperCase() === 'TCP') {
        if (c.state.toUpperCase() === 'ESTABLISHED') tcpEstablished++;
        else if (c.state.toUpperCase() === 'LISTEN' || c.state.toUpperCase() === 'LISTENING') tcpListening++;
      } else if (c.protocol.toUpperCase() === 'UDP') {
        udpCount++;
      }
    }
    return {
      total: connections.length,
      tcpEstablished,
      tcpListening,
      udpCount,
      firewallRulesCount: firewallRules.length,
    };
  }, [connections, firewallRules]);

  const handleOpenBlockModal = (conn: NetworkConnection) => {
    setSelectedConnection(conn);
    const exeName = conn.processName || 'Process';
    setCustomRuleName(`WiScripts_Block_${exeName}_${conn.pid}`);
  };

  const handleConfirmBlock = async () => {
    if (!selectedConnection) return;
    const path = selectedConnection.processPath || selectedConnection.processName;
    await blockProcessFirewall(path, customRuleName);
    setSelectedConnection(null);
  };

  const handleUnblockRule = async (ruleName: string) => {
    await unblockProcessFirewall(ruleName);
  };

  return (
    <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto select-none" role="region" aria-label={t('networkShield.title')}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-[6px] bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">
              {t('networkShield.title')}
            </h1>
            <p className="text-xs text-text-secondary">
              {t('networkShield.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRulesDrawer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-mono bg-surface border border-border text-text-primary hover:bg-surface-hover transition-colors"
          >
            <Lock className="w-3.5 h-3.5 text-brand" />
            <span>Rules ({firewallRules.length})</span>
          </button>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-mono border transition-colors ${
              autoRefresh
                ? 'bg-surface-active text-brand border-brand/30'
                : 'bg-surface text-text-muted border-border hover:text-text-primary'
            }`}
            aria-label={autoRefresh ? 'Pause Auto Refresh' : 'Resume Auto Refresh'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            <span>{autoRefresh ? '2s Polling' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {networkError && (
        <div className="p-3 rounded-[6px] bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{networkError}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-[6px] bg-surface border border-border">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('networkShield.stats.active_sockets')}</span>
            <Radio className="w-4 h-4 text-brand" />
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-text-primary tabular-nums">
            {stats.total.toLocaleString()}
          </div>
        </div>

        <div className="p-4 rounded-[6px] bg-surface border border-border">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('networkShield.stats.tcp_established')}</span>
            <CheckCircle2 className="w-4 h-4 text-status-success" />
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-status-success tabular-nums">
            {stats.tcpEstablished.toLocaleString()}
          </div>
        </div>

        <div className="p-4 rounded-[6px] bg-surface border border-border">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('networkShield.stats.tcp_listening')}</span>
            <Server className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-purple-400 tabular-nums">
            {stats.tcpListening.toLocaleString()}
          </div>
        </div>

        <div className="p-4 rounded-[6px] bg-surface border border-border">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>{t('networkShield.stats.udp_listeners')}</span>
            <Globe className="w-4 h-4 text-status-info" />
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-status-info tabular-nums">
            {stats.udpCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-[6px] bg-surface border border-border">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('networkShield.filters.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-[4px] bg-surface-subtle border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-brand"
          />
        </div>

        {/* Protocol Pills */}
        <div className="flex items-center gap-1.5">
          {(['ALL', 'TCP', 'UDP'] as const).map((proto) => (
            <button
              key={proto}
              onClick={() => setProtocolFilter(proto)}
              className={`px-2.5 py-1 rounded-[4px] text-xs font-mono transition-colors ${
                protocolFilter === proto
                  ? 'bg-brand text-white'
                  : 'bg-surface-subtle text-text-secondary hover:text-text-primary border border-border'
              }`}
            >
              {proto === 'ALL' ? t('networkShield.filters.all') : proto}
            </button>
          ))}
        </div>
      </div>

      {/* Socket Table */}
      <div className="rounded-[6px] bg-surface border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs" role="table">
            <thead className="bg-surface-subtle text-text-muted border-b border-border sticky top-0 uppercase tracking-wider font-mono text-[10px]">
              <tr>
                <th className="py-2.5 px-4">{t('networkShield.table.process')}</th>
                <th className="py-2.5 px-3">{t('networkShield.table.protocol')}</th>
                <th className="py-2.5 px-4">{t('networkShield.table.local_endpoint')}</th>
                <th className="py-2.5 px-4">{t('networkShield.table.remote_endpoint')}</th>
                <th className="py-2.5 px-3">{t('networkShield.table.state')}</th>
                <th className="py-2.5 px-4 text-right">{t('networkShield.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-muted">
                    {t('networkShield.table.no_connections')}
                  </td>
                </tr>
              ) : (
                filteredConnections.slice(0, 100).map((conn, idx) => {
                  const isBlocked = blockedProgramsSet.has(conn.processName.toLowerCase());
                  return (
                    <tr
                      key={`${conn.pid}-${conn.protocol}-${conn.localPort}-${conn.remotePort}-${idx}`}
                      className="hover:bg-surface-hover/50 transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary truncate max-w-[140px]" title={conn.processName}>
                            {conn.processName}
                          </span>
                          <span className="text-[10px] text-text-muted">PID: {conn.pid}</span>
                          {isBlocked && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-status-danger/10 text-status-danger border border-status-danger/20">
                              {t('networkShield.table.blocked_badge')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            conn.protocol.toUpperCase() === 'TCP'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {conn.protocol}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-text-secondary tabular-nums truncate max-w-[140px]">
                        {conn.localAddress}:{conn.localPort}
                      </td>
                      <td className="py-2.5 px-4 text-text-secondary tabular-nums truncate max-w-[140px]">
                        {conn.remoteAddress === '0.0.0.0' || conn.remoteAddress === '::'
                          ? '*'
                          : `${conn.remoteAddress}:${conn.remotePort}`}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] ${
                            conn.state.toUpperCase() === 'ESTABLISHED'
                              ? 'text-status-success'
                              : conn.state.toUpperCase() === 'LISTEN' || conn.state.toUpperCase() === 'LISTENING'
                              ? 'text-purple-400'
                              : 'text-text-muted'
                          }`}
                        >
                          {conn.state}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenBlockModal(conn)}
                          disabled={isNetworkLoading}
                          className="px-2.5 py-1 rounded-[4px] bg-surface-subtle hover:bg-status-danger/10 hover:text-status-danger border border-border hover:border-status-danger/30 text-[11px] text-text-secondary transition-colors"
                        >
                          {t('networkShield.table.block_btn')}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Confirmation Modal for Blocking Process */}
      {selectedConnection && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-surface border border-border rounded-[8px] max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-status-danger">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('networkShield.modal.title')}
                </h3>
              </div>
              <button
                onClick={() => setSelectedConnection(null)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              {t('networkShield.modal.confirm_text')}
            </p>

            <div className="p-3 rounded-[6px] bg-surface-subtle border border-border font-mono text-xs space-y-1">
              <div className="text-text-primary font-semibold">{selectedConnection.processName}</div>
              <div className="text-text-muted text-[11px]">
                {selectedConnection.processPath || 'System executable'}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary">
                {t('networkShield.modal.rule_name_label')}
              </label>
              <input
                type="text"
                value={customRuleName}
                onChange={(e) => setCustomRuleName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-[4px] bg-surface-subtle border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-brand"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedConnection(null)}
                className="px-3 py-1.5 rounded-[6px] bg-surface-subtle border border-border text-text-secondary hover:text-text-primary text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBlock}
                disabled={isNetworkLoading}
                className="px-4 py-1.5 rounded-[6px] bg-status-danger hover:bg-status-danger/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {t('networkShield.modal.block_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Drawer / Modal */}
      {showRulesDrawer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-surface border border-border rounded-[8px] max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('networkShield.modal.rules_drawer_title')}
                </h3>
              </div>
              <button
                onClick={() => setShowRulesDrawer(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {firewallRules.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  {t('networkShield.modal.no_rules')}
                </div>
              ) : (
                firewallRules.map((rule) => (
                  <div
                    key={rule.name}
                    className="p-3 rounded-[6px] bg-surface-subtle border border-border flex items-center justify-between text-xs font-mono"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1 pr-4">
                      <div className="font-semibold text-text-primary truncate">{rule.name}</div>
                      <div className="text-[11px] text-text-muted truncate">{rule.program}</div>
                      <div className="flex gap-2 text-[10px] text-text-secondary">
                        <span>Dir: {rule.direction}</span>
                        <span>Action: {rule.action}</span>
                        <span>Profile: {rule.profile}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleUnblockRule(rule.name)}
                      disabled={isNetworkLoading}
                      className="px-2.5 py-1 rounded-[4px] bg-surface hover:bg-status-danger/10 hover:text-status-danger border border-border text-[11px] text-text-secondary shrink-0 transition-colors"
                    >
                      {t('networkShield.table.unblock_btn')}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border/40">
              <button
                onClick={() => setShowRulesDrawer(false)}
                className="px-4 py-1.5 rounded-[6px] bg-surface-subtle border border-border text-text-primary text-xs font-medium hover:bg-surface-hover transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

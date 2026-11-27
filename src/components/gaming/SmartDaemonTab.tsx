import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  Clock,
  Square,
  CheckCircle2,
  Gamepad2,
  Shield,
  Search,
} from 'lucide-react';
import { DaemonStatus } from '../../types';

interface SmartDaemonTabProps {
  daemonStatus: DaemonStatus | null;
  isBoostActive: boolean;
  isGamingLoading: boolean;
  onOpenProcessModal: () => void;
  onRestoreGameProcess: () => void;
  onToggleAutoDetect: (enabled: boolean) => void;
}

export const SmartDaemonTab: React.FC<SmartDaemonTabProps> = ({
  daemonStatus,
  isBoostActive,
  isGamingLoading,
  onOpenProcessModal,
  onRestoreGameProcess,
  onToggleAutoDetect,
}) => {
  const { t } = useTranslation();
  const autoDetectEnabled = daemonStatus?.autoDetect ?? false;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Active Boost Banner (if active) */}
      {isBoostActive ? (
        <div className="p-5 rounded-xl border border-status-success/30 bg-status-success/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-3 rounded-xl bg-status-success text-white">
                <Gamepad2 className="w-6 h-6" />
              </div>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-status-success ring-4 ring-surface animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold uppercase text-status-success tracking-wider">
                  ● {t('gamingDaemon.activeBadge', 'Game Boost Active')}
                </span>
                <span className="text-xs text-text-muted font-mono">
                  PID: {daemonStatus?.boostedPid}
                </span>
              </div>
              <h2 className="text-base font-bold text-text-primary mt-0.5">
                {daemonStatus?.boostedName || t('gamingDaemon.defaultProcessName', 'Game Process')}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface border border-border text-brand">
                  ⚡ {t('gamingDaemon.timerLockedTag', '0.500 ms Timer Locked')}
                </span>
                {daemonStatus?.physicalAffinityApplied && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface border border-border text-status-success">
                    🎯 {t('gamingDaemon.affinityPinnedTag', 'P-Cores Affinity Pinned')}
                  </span>
                )}
                {daemonStatus?.suspendedServices && daemonStatus.suspendedServices.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface border border-border text-text-muted">
                    🛡️ {t('gamingDaemon.servicesSuspendedTag', {
                      count: daemonStatus.suspendedServices.length,
                      defaultValue: `${daemonStatus.suspendedServices.length} Services Suspended`,
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onRestoreGameProcess}
              disabled={isGamingLoading}
              className="px-4 py-2.5 bg-status-danger hover:bg-status-danger/90 text-white font-semibold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-status-danger/20 transition-all disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{t('gamingDaemon.stopBoost', 'Stop Boost')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-xl border border-border bg-surface-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-brand/10 text-brand shrink-0">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                {t('gamingDaemon.heroTitle', 'Smart Game Daemon')}
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-hover text-text-muted">
                  IDLE
                </span>
              </h3>
              <p className="text-xs text-text-muted mt-1 max-w-xl">
                {t('gamingDaemon.heroDesc', 'Select a process manually or enable background auto-detection.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenProcessModal}
              className="px-4 py-2.5 bg-brand hover:bg-brand-hover text-white font-semibold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-brand/20 transition-all"
            >
              <Search className="w-4 h-4" />
              <span>{t('gamingDaemon.selectProcessBtn', 'Select Process to Boost')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Daemon Heuristics & Auto-Detect Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Auto-Detect Toggle */}
        <div className="p-4 rounded-xl border border-border bg-surface flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-brand" />
                {t('gamingDaemon.autoDetectTitle', 'Auto-Detect 3D Games')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={autoDetectEnabled}
                aria-label={t('gamingDaemon.autoDetectTitle', 'Auto-Detect 3D Games')}
                onClick={() => onToggleAutoDetect(!autoDetectEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  autoDetectEnabled ? 'bg-brand' : 'bg-border'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    autoDetectEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2">
              {t('gamingDaemon.autoDetectDesc', 'Monitors active foreground windows every 1.5s.')}
            </p>
          </div>
          <div className="pt-1 text-[10px] font-mono text-text-muted">
            {t('gamingDaemon.autoDetectStatus', 'Status')}:{' '}
            {autoDetectEnabled
              ? t('gamingDaemon.autoDetectActive', 'Active (1.5s scan)')
              : t('gamingDaemon.autoDetectDisabled', 'Disabled')}
          </div>
        </div>

        {/* Card 2: PID-Bound Latch Protection */}
        <div className="p-4 rounded-xl border border-border bg-surface flex flex-col justify-between space-y-3">
          <div>
            <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-status-success" />
              {t('gamingDaemon.altTabTitle', 'PID-Bound Latch')}
            </span>
            <p className="text-[11px] text-text-muted mt-2">
              {t('gamingDaemon.altTabDesc', 'Settings remain bound to process lifetime without Alt-Tab thrashing.')}
            </p>
          </div>
          <div className="pt-1 text-[10px] font-mono text-status-success flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {t('gamingDaemon.zeroAltTabThrashing', 'Zero Alt-Tab Thrashing')}
          </div>
        </div>

        {/* Card 3: Watchdog Crash Safety */}
        <div className="p-4 rounded-xl border border-border bg-surface flex flex-col justify-between space-y-3">
          <div>
            <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-status-info" />
              {t('gamingDaemon.watchdogTitle', 'Watchdog Crash Protection')}
            </span>
            <p className="text-[11px] text-text-muted mt-2">
              {t('gamingDaemon.watchdogDesc', 'Session journal restores services and default timer on unexpected exit.')}
            </p>
          </div>
          <div className="pt-1 text-[10px] font-mono text-status-info flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {t('gamingDaemon.autoRecoveryArmed', 'Auto-Recovery Armed')}
          </div>
        </div>
      </div>
    </div>
  );
};

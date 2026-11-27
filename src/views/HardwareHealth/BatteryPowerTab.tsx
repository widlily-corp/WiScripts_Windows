import React from 'react';
import { useTranslation } from 'react-i18next';
import { Battery, Power, Zap } from 'lucide-react';
import { BatteryHealthAnalytics, PowerSchemeInfo } from '../../types/hardwareHealth';

interface BatteryPowerTabProps {
  batteryHealth: BatteryHealthAnalytics | null;
  powerSchemes: PowerSchemeInfo[];
  isHardwareLoading: boolean;
  onSetActiveScheme: (guid: string) => void;
  onActivateUltimate: () => void;
}

export const BatteryPowerTab: React.FC<BatteryPowerTabProps> = ({
  batteryHealth,
  powerSchemes,
  isHardwareLoading,
  onSetActiveScheme,
  onActivateUltimate,
}) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Battery Analytics Panel */}
      <div className="p-5 rounded-[8px] bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <Battery className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t('hardwareHealth.battery.title')}
            </h2>
          </div>
          {batteryHealth?.hasBattery && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-brand/10 text-brand border border-brand/20">
              {batteryHealth.powerProfileStatus}
            </span>
          )}
        </div>

        {batteryHealth?.hasBattery ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-text-secondary">{t('hardwareHealth.battery.charge_level')}</span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {batteryHealth.batteryPercentage}%
                </span>
              </div>
              <div className="h-3 w-full rounded-[4px] bg-surface-subtle border border-border overflow-hidden">
                <div
                  style={{ width: `${batteryHealth.batteryPercentage}%` }}
                  className="h-full bg-status-success rounded-[2px] transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-2.5 rounded-[4px] bg-surface-subtle border border-border-subtle">
                <div className="text-[10px] text-text-secondary uppercase">
                  {t('hardwareHealth.battery.power_profile')}
                </div>
                <div className="mt-1 text-sm font-mono font-medium text-text-primary">
                  {batteryHealth.isAcOnline
                    ? t('hardwareHealth.battery.ac_connected')
                    : t('hardwareHealth.battery.discharging')}
                </div>
              </div>

              <div className="p-2.5 rounded-[4px] bg-surface-subtle border border-border-subtle">
                <div className="text-[10px] text-text-secondary uppercase">
                  {t('hardwareHealth.battery.discharge_rate')}
                </div>
                <div className="mt-1 text-sm font-mono font-medium text-text-primary tabular-nums">
                  {(Math.abs(batteryHealth.dischargeRateMw) / 1000).toFixed(1)} W
                </div>
              </div>

              <div className="p-2.5 rounded-[4px] bg-surface-subtle border border-border-subtle">
                <div className="text-[10px] text-text-secondary uppercase">
                  {t('hardwareHealth.battery.wear_level')}
                </div>
                <div className="mt-1 text-sm font-mono font-medium text-text-primary tabular-nums">
                  {batteryHealth.wearLevelPercent !== null
                    ? `${batteryHealth.wearLevelPercent.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
            </div>

            {batteryHealth.designedCapacityMwh && batteryHealth.fullChargeCapacityMwh && (
              <div className="text-[11px] font-mono text-text-muted">
                {t('hardwareHealth.battery.capacity_ratio', {
                  current: batteryHealth.fullChargeCapacityMwh.toLocaleString(),
                  design: batteryHealth.designedCapacityMwh.toLocaleString(),
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-2">
            <Power className="w-8 h-8 text-text-muted" />
            <span className="text-xs font-semibold text-text-primary">
              {t('hardwareHealth.battery.desktop_ac')}
            </span>
            <p className="text-[11px] text-text-muted max-w-xs">
              {t('hardwareHealth.battery.desktop_ac_desc')}
            </p>
          </div>
        )}
      </div>

      {/* Windows Power Schemes Panel */}
      <div className="p-5 rounded-[8px] bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t('hardwareHealth.power_schemes.title')}
            </h2>
          </div>

          <button
            type="button"
            onClick={onActivateUltimate}
            disabled={isHardwareLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-amber-500 hover:bg-amber-500/90 text-black text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{t('hardwareHealth.power_schemes.enable_ultimate_btn')}</span>
          </button>
        </div>

        <div className="space-y-2">
          {powerSchemes.map((scheme) => (
            <div
              key={scheme.guid}
              className={`p-3 rounded-[6px] border flex items-center justify-between text-xs transition-colors ${
                scheme.isActive
                  ? 'bg-surface-active border-brand/40 text-brand'
                  : 'bg-surface-subtle border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <div className="space-y-0.5 pr-3 min-w-0">
                <div className="font-semibold text-text-primary flex items-center gap-2">
                  <span>{scheme.name}</span>
                  {scheme.isUltimatePerformance && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Ultimate
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted truncate">{scheme.description}</div>
              </div>

              {scheme.isActive ? (
                <span className="px-2.5 py-1 rounded-[4px] bg-brand/10 text-brand border border-brand/20 font-mono text-[10px] uppercase shrink-0">
                  {t('hardwareHealth.power_schemes.active_badge')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetActiveScheme(scheme.guid)}
                  disabled={isHardwareLoading}
                  className="px-2.5 py-1 rounded-[4px] bg-surface hover:bg-surface-hover border border-border text-[11px] text-text-primary shrink-0 transition-colors"
                >
                  {t('hardwareHealth.power_schemes.set_active')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

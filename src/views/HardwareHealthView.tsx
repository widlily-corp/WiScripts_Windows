import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HardDrive,
  BatteryCharging,
  Battery,
  BatteryMedium,
  Zap,
  Flame,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Power,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StorageDeviceHealth, PowerSchemeInfo } from '../types/hardwareHealth';

export function HardwareHealthView() {
  const { t } = useTranslation();

  const storageDevices = useAppStore((s) => s.storageDevices);
  const batteryHealth = useAppStore((s) => s.batteryHealth);
  const powerSchemes = useAppStore((s) => s.powerSchemes);
  const isHardwareLoading = useAppStore((s) => s.isHardwareLoading);
  const hardwareError = useAppStore((s) => s.hardwareError);

  const fetchStorageHealth = useAppStore((s) => s.fetchStorageHealth);
  const fetchBatteryAnalytics = useAppStore((s) => s.fetchBatteryAnalytics);
  const fetchPowerSchemes = useAppStore((s) => s.fetchPowerSchemes);
  const setActivePowerScheme = useAppStore((s) => s.setActivePowerScheme);
  const enableUltimatePerformance = useAppStore((s) => s.enableUltimatePerformance);

  const [selectedDiskIndex, setSelectedDiskIndex] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  useEffect(() => {
    fetchStorageHealth();
    fetchBatteryAnalytics();
    fetchPowerSchemes();
  }, [fetchStorageHealth, fetchBatteryAnalytics, fetchPowerSchemes]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStorageHealth();
      fetchBatteryAnalytics();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStorageHealth, fetchBatteryAnalytics]);

  const activeDrive: StorageDeviceHealth | null = useMemo(() => {
    if (storageDevices.length === 0) return null;
    return storageDevices[selectedDiskIndex] || storageDevices[0];
  }, [storageDevices, selectedDiskIndex]);

  const driveTempColor = useMemo(() => {
    if (!activeDrive) return 'text-text-muted';
    if (activeDrive.temperatureCelsius < 50) return 'text-status-success';
    if (activeDrive.temperatureCelsius < 65) return 'text-status-warning';
    return 'text-status-danger';
  }, [activeDrive]);

  const handleSetActiveScheme = async (guid: string) => {
    await setActivePowerScheme(guid);
  };

  const handleActivateUltimate = async () => {
    await enableUltimatePerformance();
  };

  return (
    <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto select-none" role="region" aria-label={t('hardwareHealth.title')}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-[6px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">
              {t('hardwareHealth.title')}
            </h1>
            <p className="text-xs text-text-secondary">
              {t('hardwareHealth.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            <span>{autoRefresh ? '4s Telemetry' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {hardwareError && (
        <div className="p-3 rounded-[6px] bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{hardwareError}</span>
        </div>
      )}

      {/* Storage NVMe SMART Panel */}
      <div className="p-5 rounded-[6px] bg-surface border border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t('hardwareHealth.storage.title')}
            </h2>
          </div>

          {storageDevices.length > 1 && (
            <div className="relative">
              <select
                value={selectedDiskIndex}
                onChange={(e) => setSelectedDiskIndex(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 rounded-[4px] bg-surface-subtle border border-border text-xs font-mono text-text-primary pr-8 focus:outline-none focus:border-brand"
              >
                {storageDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={i}>
                    Drive {i}: {d.model} ({d.busType})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {activeDrive ? (
          <div className="space-y-4">
            {/* Model & Primary Health Tag */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-text-primary">{activeDrive.model}</span>
                <div className="flex gap-2 text-[11px] font-mono text-text-muted">
                  <span>{activeDrive.deviceId}</span>
                  <span>•</span>
                  <span>{activeDrive.busType}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-text-muted">Health</div>
                  <div className="text-lg font-mono font-semibold text-status-success tabular-nums">
                    {activeDrive.healthPercentage}%
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-[4px] bg-status-success/10 text-status-success border border-status-success/20 text-xs font-mono">
                  {activeDrive.smartStatus}
                </span>
              </div>
            </div>

            {/* SMART Metrics 6-Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
                <div className="text-[11px] text-text-secondary">{t('hardwareHealth.storage.temperature')}</div>
                <div className={`mt-1.5 text-lg font-mono font-semibold tabular-nums ${driveTempColor}`}>
                  {activeDrive.temperatureCelsius.toFixed(1)}°C
                </div>
              </div>

              <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
                <div className="text-[11px] text-text-secondary">{t('hardwareHealth.storage.tbw_written')}</div>
                <div className="mt-1.5 text-lg font-mono font-semibold text-text-primary tabular-nums">
                  {activeDrive.totalBytesWrittenTb.toFixed(1)} TB
                </div>
              </div>

              <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
                <div className="text-[11px] text-text-secondary">{t('hardwareHealth.storage.power_on_hours')}</div>
                <div className="mt-1.5 text-lg font-mono font-semibold text-text-primary tabular-nums">
                  {activeDrive.powerOnHours.toLocaleString()} h
                </div>
              </div>

              <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
                <div className="text-[11px] text-text-secondary">{t('hardwareHealth.storage.spare_capacity')}</div>
                <div className="mt-1.5 text-lg font-mono font-semibold text-status-success tabular-nums">
                  {activeDrive.availableSparePercent}%
                </div>
              </div>

              <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
                <div className="text-[11px] text-text-secondary">{t('hardwareHealth.storage.unsafe_shutdowns')}</div>
                <div className="mt-1.5 text-lg font-mono font-semibold text-text-primary tabular-nums">
                  {activeDrive.unsafeShutdowns}
                </div>
              </div>

              <div className="p-3 rounded-[6px] bg-surface-subtle border border-border-subtle">
                <div className="text-[11px] text-text-secondary">{t('hardwareHealth.storage.power_cycles')}</div>
                <div className="mt-1.5 text-lg font-mono font-semibold text-text-primary tabular-nums">
                  {activeDrive.powerCycles}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-text-muted font-mono">
            {t('hardwareHealth.storage.no_drives')}
          </div>
        )}
      </div>

      {/* Battery & Power Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Battery Analytics Panel */}
        <div className="p-5 rounded-[6px] bg-surface border border-border space-y-4">
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
              {/* Battery Charge Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-text-secondary">{t('hardwareHealth.battery.charge_level')}</span>
                  <span className="font-semibold text-text-primary tabular-nums">{batteryHealth.batteryPercentage}%</span>
                </div>
                <div className="h-3 w-full rounded-[3px] bg-surface-subtle border border-border overflow-hidden">
                  <div
                    style={{ width: `${batteryHealth.batteryPercentage}%` }}
                    className="h-full bg-status-success rounded-[2px] transition-all"
                  />
                </div>
              </div>

              {/* Grid Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-2.5 rounded-[4px] bg-surface-subtle border border-border-subtle">
                  <div className="text-[10px] text-text-secondary uppercase">{t('hardwareHealth.battery.power_profile')}</div>
                  <div className="mt-1 text-sm font-mono font-medium text-text-primary">
                    {batteryHealth.isAcOnline ? t('hardwareHealth.battery.ac_connected') : t('hardwareHealth.battery.discharging')}
                  </div>
                </div>

                <div className="p-2.5 rounded-[4px] bg-surface-subtle border border-border-subtle">
                  <div className="text-[10px] text-text-secondary uppercase">{t('hardwareHealth.battery.discharge_rate')}</div>
                  <div className="mt-1 text-sm font-mono font-medium text-text-primary tabular-nums">
                    {(Math.abs(batteryHealth.dischargeRateMw) / 1000).toFixed(1)} W
                  </div>
                </div>

                <div className="p-2.5 rounded-[4px] bg-surface-subtle border border-border-subtle">
                  <div className="text-[10px] text-text-secondary uppercase">{t('hardwareHealth.battery.wear_level')}</div>
                  <div className="mt-1 text-sm font-mono font-medium text-text-primary tabular-nums">
                    {batteryHealth.wearLevelPercent !== null ? `${batteryHealth.wearLevelPercent.toFixed(1)}%` : '0%'}
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
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
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
        <div className="p-5 rounded-[6px] bg-surface border border-border space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-text-primary">
                {t('hardwareHealth.power_schemes.title')}
              </h2>
            </div>

            <button
              onClick={handleActivateUltimate}
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
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
                    onClick={() => handleSetActiveScheme(scheme.guid)}
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
    </div>
  );
}

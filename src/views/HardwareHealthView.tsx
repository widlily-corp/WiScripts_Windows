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
  Copy,
  Check,
  ExternalLink,
  Search,
  FileText,
  Info,
  Layers,
  Thermometer,
  Disc,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StorageDeviceHealth, PowerSchemeInfo, SmartAttributeItem } from '../types/hardwareHealth';

export function HardwareHealthView() {
  const { t } = useTranslation();

  const storageDevices = useAppStore((s) => s.storageDevices);
  const batteryHealth = useAppStore((s) => s.batteryHealth);
  const powerSchemes = useAppStore((s) => s.powerSchemes);
  const isHardwareLoading = useAppStore((s) => s.isHardwareLoading);
  const hardwareError = useAppStore((s) => s.hardwareError);
  const addToast = useAppStore((s) => s.addToast);

  const fetchStorageHealth = useAppStore((s) => s.fetchStorageHealth);
  const fetchBatteryAnalytics = useAppStore((s) => s.fetchBatteryAnalytics);
  const fetchPowerSchemes = useAppStore((s) => s.fetchPowerSchemes);
  const setActivePowerScheme = useAppStore((s) => s.setActivePowerScheme);
  const enableUltimatePerformance = useAppStore((s) => s.enableUltimatePerformance);

  const [activeTab, setActiveTab] = useState<'storage' | 'battery'>('storage');
  const [selectedDiskIndex, setSelectedDiskIndex] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [smartSearchQuery, setSmartSearchQuery] = useState<string>('');

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

  const hasSmartTelemetry = useMemo(() => {
    if (!activeDrive) return false;
    return (
      activeDrive.powerOnHours > 0 ||
      activeDrive.totalBytesWrittenTb > 0 ||
      activeDrive.powerCycles > 0 ||
      activeDrive.smartAttributes?.length > 0
    );
  }, [activeDrive]);

  const driveTempColor = useMemo(() => {
    if (!activeDrive || activeDrive.temperatureCelsius <= 0) return 'text-text-muted';
    if (activeDrive.temperatureCelsius < 50) return 'text-status-success';
    if (activeDrive.temperatureCelsius < 65) return 'text-status-warning';
    return 'text-status-danger';
  }, [activeDrive]);

  const driveHealthBadge = useMemo(() => {
    if (!activeDrive) return { label: 'Unknown', bg: 'bg-surface-subtle', text: 'text-text-muted', border: 'border-border' };
    const status = activeDrive.smartStatus?.toLowerCase() || '';
    if (status.includes('good') || status.includes('healthy') || activeDrive.healthPercentage >= 90) {
      return {
        label: `${t('hardwareHealth.storage.health_good', 'Good')} ${activeDrive.healthPercentage}%`,
        bg: 'bg-status-success/10',
        text: 'text-status-success',
        border: 'border-status-success/30',
      };
    }
    if (status.includes('warn') || activeDrive.healthPercentage >= 70) {
      return {
        label: `${t('hardwareHealth.storage.health_caution', 'Caution')} ${activeDrive.healthPercentage}%`,
        bg: 'bg-status-warning/10',
        text: 'text-status-warning',
        border: 'border-status-warning/30',
      };
    }
    return {
      label: `${t('hardwareHealth.storage.health_bad', 'Bad')} ${activeDrive.healthPercentage}%`,
      bg: 'bg-status-danger/10',
      text: 'text-status-danger',
      border: 'border-status-danger/30',
    };
  }, [activeDrive, t]);

  const filteredSmartAttributes = useMemo(() => {
    if (!activeDrive?.smartAttributes) return [];
    if (!smartSearchQuery.trim()) return activeDrive.smartAttributes;
    const q = smartSearchQuery.toLowerCase();
    return activeDrive.smartAttributes.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toString(16).toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.rawValue.toLowerCase().includes(q)
    );
  }, [activeDrive, smartSearchQuery]);

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    addToast({
      type: 'success',
      title: t('hardwareHealth.storage.copied_clipboard', 'Скопировано в буфер'),
      message: text,
    });
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleCopyCrystalDiskInfoReport = () => {
    if (!activeDrive) return;
    const dateStr = new Date().toLocaleString();
    const capacityGb =
      activeDrive.sizeBytes > 0
        ? (activeDrive.sizeBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
        : 'Unknown';

    let report = `----------------------------------------------------------------------------
CrystalDiskInfo Report (WiScripts Storage Telemetry Engine)
Date/Time         : ${dateStr}
OS                : Windows (via WiScripts)
----------------------------------------------------------------------------
(01) ${activeDrive.model}
----------------------------------------------------------------------------
           Model : ${activeDrive.model}
        Firmware : ${activeDrive.firmwareRevision || 'N/A'}
   Serial Number : ${activeDrive.serialNumber || 'N/A'}
       Disk Size : ${capacityGb}
       Interface : ${activeDrive.busType}
   Transfer Mode : ${activeDrive.transferMode || 'PCIe / SATA'}
   Drive Letters : ${activeDrive.driveLetters?.join(', ') || 'N/A'}
        Standard : ${activeDrive.standard || 'NVM Express / ACS'}
        Features : ${activeDrive.featuresSupported?.join(', ') || 'S.M.A.R.T., TRIM'}
     Temperature : ${activeDrive.temperatureCelsius > 0 ? `${activeDrive.temperatureCelsius}°C` : 'N/A'}
   Health Status : ${activeDrive.smartStatus} (${activeDrive.healthPercentage}%)
      Host Reads : ${activeDrive.totalBytesReadTb > 0 ? `${activeDrive.totalBytesReadTb.toFixed(2)} TB` : '—'}
     Host Writes : ${activeDrive.totalBytesWrittenTb > 0 ? `${activeDrive.totalBytesWrittenTb.toFixed(2)} TB` : '—'}
  Power On Count : ${activeDrive.powerCycles > 0 ? `${activeDrive.powerCycles} times` : '—'}
  Power On Hours : ${activeDrive.powerOnHours > 0 ? `${activeDrive.powerOnHours} hours` : '—'}
Unsafe Shutdowns : ${activeDrive.unsafeShutdowns}
 Available Spare : ${activeDrive.availableSparePercent}%

-- S.M.A.R.T. Attributes (CrystalDiskInfo Format) ---------------------------
ID  Attribute Name                         Current  Threshold  Raw Values    Status
`;

    activeDrive.smartAttributes?.forEach((attr) => {
      const idHex = attr.id.toString(16).padStart(2, '0').toUpperCase();
      const namePadded = attr.name.padEnd(38, ' ');
      const currPadded = (attr.current !== undefined ? attr.current.toString() : '—').padStart(7, ' ');
      const threshPadded = (attr.threshold !== undefined && attr.threshold !== null ? attr.threshold.toString() : '—').padStart(10, ' ');
      const rawPadded = attr.rawValue.padEnd(13, ' ');
      report += `${idHex}  ${namePadded} ${currPadded} ${threshPadded}  ${rawPadded} ${attr.status}\n`;
    });

    report += `----------------------------------------------------------------------------
Special Thanks: CrystalDiskInfo by Noriyuki Miyazaki (hiyohiyo)
Repository    : https://github.com/hiyohiyo/CrystalDiskInfo
----------------------------------------------------------------------------\n`;

    navigator.clipboard.writeText(report);
    addToast({
      type: 'success',
      title: t('hardwareHealth.storage.copy_report', 'Копировать отчет'),
      message: t('hardwareHealth.storage.report_copied', 'Текстовый отчет скопирован в буфер обмена!'),
    });
  };

  const handleOpenCrystalDiskInfoGitHub = async () => {
    const url = 'https://github.com/hiyohiyo/CrystalDiskInfo';
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleSetActiveScheme = async (guid: string) => {
    await setActivePowerScheme(guid);
  };

  const handleActivateUltimate = async () => {
    await enableUltimatePerformance();
  };

  return (
    <div
      className="flex-1 p-6 space-y-6 max-w-7xl mx-auto select-none"
      role="region"
      aria-label={t('hardwareHealth.title')}
    >
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-text-primary">
                {t('hardwareHealth.title')}
              </h1>
              <span className="px-2 py-0.5 rounded-[4px] bg-brand/10 border border-brand/20 text-brand text-[10px] font-mono">
                CrystalDiskInfo Powered
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              {t('hardwareHealth.subtitle')}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2.5">
          {/* Subtab Toggle Buttons */}
          <div className="flex items-center p-0.5 bg-surface-subtle border border-border rounded-[6px] text-xs">
            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] font-medium transition-colors ${
                activeTab === 'storage'
                  ? 'bg-surface text-brand shadow-sm border border-border/50'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{t('hardwareHealth.tabs.storage', 'SSD & Накопители')}</span>
            </button>
            <button
              onClick={() => setActiveTab('battery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] font-medium transition-colors ${
                activeTab === 'battery'
                  ? 'bg-surface text-brand shadow-sm border border-border/50'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Battery className="w-3.5 h-3.5" />
              <span>{t('hardwareHealth.tabs.battery', 'Батарея & Питание')}</span>
            </button>
          </div>

          {/* Refresh Manual Button */}
          <button
            onClick={() => {
              fetchStorageHealth();
              fetchBatteryAnalytics();
            }}
            disabled={isHardwareLoading}
            className="p-2 rounded-[6px] bg-surface hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title={t('hardwareHealth.storage.refresh_telemetry', 'Обновить телеметрию')}
            aria-label="Refresh Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isHardwareLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-mono border transition-colors ${
              autoRefresh
                ? 'bg-surface-active text-brand border-brand/30'
                : 'bg-surface text-text-muted border-border hover:text-text-primary'
            }`}
            aria-label={autoRefresh ? 'Pause Auto Refresh' : 'Resume Auto Refresh'}
          >
            <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
            <span className="hidden sm:inline">{autoRefresh ? '4s' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {hardwareError && (
        <div className="p-3 rounded-[6px] bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{hardwareError}</span>
        </div>
      )}

      {/* STORAGE TAB: CrystalDiskInfo View */}
      {activeTab === 'storage' && (
        <div className="space-y-6">
          {/* 1. CrystalDiskInfo Top Multi-Drive Selector Bar */}
          {storageDevices.length > 0 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1 custom-scrollbar">
              {storageDevices.map((d, index) => {
                const isSelected = selectedDiskIndex === index;
                const isNvme = d.busType?.toLowerCase().includes('nvme');
                const driveTemp = d.temperatureCelsius > 0 ? `${d.temperatureCelsius.toFixed(0)}°C` : 'N/A';
                const tempColor =
                  d.temperatureCelsius <= 0
                    ? 'text-text-muted'
                    : d.temperatureCelsius < 50
                    ? 'text-status-success'
                    : d.temperatureCelsius < 65
                    ? 'text-status-warning'
                    : 'text-status-danger';

                return (
                  <button
                    key={d.deviceId || index}
                    onClick={() => setSelectedDiskIndex(index)}
                    className={`flex items-center gap-3 p-3 rounded-[8px] border text-left shrink-0 transition-all min-w-[240px] max-w-[320px] ${
                      isSelected
                        ? 'bg-surface border-brand shadow-sm ring-1 ring-brand/20'
                        : 'bg-surface-subtle border-border hover:bg-surface hover:border-border-subtle'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-[6px] shrink-0 ${
                        isSelected
                          ? 'bg-brand/10 text-brand'
                          : 'bg-surface text-text-muted'
                      }`}
                    >
                      {isNvme ? <Cpu className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-mono font-bold text-text-primary truncate">
                          ({index}) {d.model}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
                        {d.driveLetters && d.driveLetters.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-brand/10 text-brand border border-brand/20 font-semibold">
                            {d.driveLetters.join(' ')}
                          </span>
                        )}
                        <span className="truncate">{d.busType}</span>
                        <span>•</span>
                        <span className={`font-semibold ${tempColor}`}>{driveTemp}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-mono font-semibold text-status-success">
                        {d.healthPercentage}%
                      </div>
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-status-success/10 text-status-success border border-status-success/20">
                        {d.smartStatus || 'Good'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {activeDrive ? (
            <div className="space-y-6">
              {/* 2. Main Drive Specs & CrystalDiskInfo Header Overview */}
              <div className="p-5 rounded-[8px] bg-surface border border-border grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Side: Large Health Ring + Temperature */}
                <div className="lg:col-span-4 flex flex-col items-center sm:items-start p-4 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-4">
                  <div className="w-full flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-mono">
                      Health Status (CrystalDiskInfo)
                    </span>
                    {!hasSmartTelemetry && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Limited (Non-Elevated)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-5 w-full">
                    {/* Big Health Badge */}
                    <div
                      className={`flex flex-col items-center justify-center w-24 h-24 rounded-full border-2 ${driveHealthBadge.bg} ${driveHealthBadge.border} ${driveHealthBadge.text} shadow-inner shrink-0`}
                    >
                      <span className="text-2xl font-bold font-mono tracking-tight tabular-nums">
                        {activeDrive.healthPercentage}%
                      </span>
                      <span className="text-[10px] font-mono uppercase font-bold tracking-wider mt-0.5">
                        {activeDrive.smartStatus || 'Good'}
                      </span>
                    </div>

                    {/* Temperature Indicator */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('hardwareHealth.storage.temperature')}</span>
                      </div>
                      <div className={`text-2xl font-bold font-mono tabular-nums ${driveTempColor}`}>
                        {activeDrive.temperatureCelsius > 0
                          ? `${activeDrive.temperatureCelsius.toFixed(1)}°C`
                          : 'N/A'}
                      </div>
                      <div className="text-[10px] font-mono text-text-muted">
                        {activeDrive.temperatureCelsius > 0 && activeDrive.temperatureCelsius < 60
                          ? 'Normal Range (< 60°C)'
                          : activeDrive.temperatureCelsius >= 60
                          ? 'Elevated (> 60°C)'
                          : 'Sensor Standby'}
                      </div>
                    </div>
                  </div>

                  {/* Drive Size & Partition Badges */}
                  <div className="w-full pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="text-text-secondary">
                      Capacity:{' '}
                      <span className="font-semibold text-text-primary">
                        {activeDrive.sizeBytes > 0
                          ? `${(activeDrive.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                          : '—'}
                      </span>
                    </div>
                    {activeDrive.driveLetters && activeDrive.driveLetters.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-muted">Volumes:</span>
                        {activeDrive.driveLetters.map((l) => (
                          <span
                            key={l}
                            className="px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20 font-bold"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: CrystalDiskInfo Technical Matrix */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border-subtle">
                    <div>
                      <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                        <span>{activeDrive.model}</span>
                      </h2>
                      <div className="text-xs font-mono text-text-muted mt-0.5">
                        {activeDrive.deviceId} • {activeDrive.busType}
                      </div>
                    </div>

                    {/* Copy CrystalDiskInfo Report Button */}
                    <button
                      onClick={handleCopyCrystalDiskInfoReport}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-surface-subtle hover:bg-surface-hover border border-border text-xs font-mono text-text-primary transition-colors shrink-0"
                      title={t('hardwareHealth.storage.copy_report')}
                    >
                      <Copy className="w-3.5 h-3.5 text-brand" />
                      <span>{t('hardwareHealth.storage.copy_report', 'Копировать отчет')}</span>
                    </button>
                  </div>

                  {/* Specification Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    {/* Firmware */}
                    <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                      <div className="text-[10px] uppercase font-mono text-text-muted flex items-center justify-between">
                        <span>{t('hardwareHealth.storage.firmware', 'Прошивка')}</span>
                        {activeDrive.firmwareRevision && (
                          <button
                            onClick={() => handleCopyText(activeDrive.firmwareRevision, 'firmware')}
                            className="hover:text-text-primary"
                            title="Copy Firmware"
                          >
                            {copiedKey === 'firmware' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                      <div className="font-mono font-semibold text-text-primary truncate">
                        {activeDrive.firmwareRevision || 'N/A'}
                      </div>
                    </div>

                    {/* Serial Number */}
                    <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                      <div className="text-[10px] uppercase font-mono text-text-muted flex items-center justify-between">
                        <span>{t('hardwareHealth.storage.serial_number', 'Серийный номер')}</span>
                        {activeDrive.serialNumber && (
                          <button
                            onClick={() => handleCopyText(activeDrive.serialNumber, 'serial')}
                            className="hover:text-text-primary"
                            title="Copy Serial"
                          >
                            {copiedKey === 'serial' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                      <div className="font-mono font-semibold text-text-primary truncate">
                        {activeDrive.serialNumber || 'N/A'}
                      </div>
                    </div>

                    {/* Interface */}
                    <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                      <div className="text-[10px] uppercase font-mono text-text-muted">
                        {t('hardwareHealth.storage.interface', 'Интерфейс')}
                      </div>
                      <div className="font-mono font-semibold text-text-primary truncate">
                        {activeDrive.busType}
                      </div>
                    </div>

                    {/* Transfer Mode */}
                    <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                      <div className="text-[10px] uppercase font-mono text-text-muted">
                        {t('hardwareHealth.storage.transfer_mode', 'Режим передачи')}
                      </div>
                      <div className="font-mono font-semibold text-text-primary truncate">
                        {activeDrive.transferMode || 'PCIe / SATA'}
                      </div>
                    </div>

                    {/* Standard */}
                    <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                      <div className="text-[10px] uppercase font-mono text-text-muted">
                        {t('hardwareHealth.storage.standard', 'Стандарт')}
                      </div>
                      <div className="font-mono font-semibold text-text-primary truncate">
                        {activeDrive.standard || 'NVM Express / ACS'}
                      </div>
                    </div>

                    {/* Media Type */}
                    <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                      <div className="text-[10px] uppercase font-mono text-text-muted">Media Type</div>
                      <div className="font-mono font-semibold text-text-primary truncate">
                        {activeDrive.mediaType || 'Solid State Drive (SSD)'}
                      </div>
                    </div>
                  </div>

                  {/* Supported Features Tags */}
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono text-text-muted mr-1">Features:</span>
                    {(activeDrive.featuresSupported && activeDrive.featuresSupported.length > 0
                      ? activeDrive.featuresSupported
                      : ['S.M.A.R.T.', 'TRIM', 'VolatileWriteCache']
                    ).map((feat) => (
                      <span
                        key={feat}
                        className="px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border text-[10px] font-mono text-text-secondary"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Core Telemetry 6-Grid (CrystalDiskInfo Metrics) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* TBW Written */}
                <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
                  <div className="text-[11px] text-text-secondary truncate">
                    {t('hardwareHealth.storage.tbw_written')}
                  </div>
                  <div className="text-lg font-mono font-semibold text-text-primary tabular-nums">
                    {activeDrive.totalBytesWrittenTb > 0
                      ? `${activeDrive.totalBytesWrittenTb.toFixed(1)} TB`
                      : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {activeDrive.totalBytesWrittenTb > 0
                      ? `~${(activeDrive.totalBytesWrittenTb * 1024).toFixed(0)} GB`
                      : 'Host Writes'}
                  </div>
                </div>

                {/* TBR Read */}
                <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
                  <div className="text-[11px] text-text-secondary truncate">
                    {t('hardwareHealth.storage.tbw_read')}
                  </div>
                  <div className="text-lg font-mono font-semibold text-text-primary tabular-nums">
                    {activeDrive.totalBytesReadTb > 0
                      ? `${activeDrive.totalBytesReadTb.toFixed(1)} TB`
                      : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {activeDrive.totalBytesReadTb > 0
                      ? `~${(activeDrive.totalBytesReadTb * 1024).toFixed(0)} GB`
                      : 'Host Reads'}
                  </div>
                </div>

                {/* Power-On Hours */}
                <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
                  <div className="text-[11px] text-text-secondary truncate">
                    {t('hardwareHealth.storage.power_on_hours')}
                  </div>
                  <div className="text-lg font-mono font-semibold text-text-primary tabular-nums">
                    {activeDrive.powerOnHours > 0 ? `${activeDrive.powerOnHours.toLocaleString()} h` : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {activeDrive.powerOnHours > 0
                      ? `~${Math.round(activeDrive.powerOnHours / 24)} days`
                      : 'Lifetime'}
                  </div>
                </div>

                {/* Power Cycles */}
                <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
                  <div className="text-[11px] text-text-secondary truncate">
                    {t('hardwareHealth.storage.power_cycles')}
                  </div>
                  <div className="text-lg font-mono font-semibold text-text-primary tabular-nums">
                    {activeDrive.powerCycles > 0 ? activeDrive.powerCycles.toLocaleString() : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">Power-On Count</div>
                </div>

                {/* Unsafe Shutdowns */}
                <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
                  <div className="text-[11px] text-text-secondary truncate">
                    {t('hardwareHealth.storage.unsafe_shutdowns')}
                  </div>
                  <div
                    className={`text-lg font-mono font-semibold tabular-nums ${
                      activeDrive.unsafeShutdowns > 10 ? 'text-status-warning' : 'text-text-primary'
                    }`}
                  >
                    {hasSmartTelemetry ? activeDrive.unsafeShutdowns : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">Sudden Power Loss</div>
                </div>

                {/* Available Spare */}
                <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
                  <div className="text-[11px] text-text-secondary truncate">
                    {t('hardwareHealth.storage.spare_capacity')}
                  </div>
                  <div className="text-lg font-mono font-semibold text-status-success tabular-nums">
                    {activeDrive.availableSparePercent > 0 ? `${activeDrive.availableSparePercent}%` : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">Reserve Blocks</div>
                </div>
              </div>

              {/* 4. CrystalDiskInfo S.M.A.R.T. Attributes Table */}
              <div className="p-5 rounded-[8px] bg-surface border border-border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand" />
                    <h2 className="text-sm font-semibold text-text-primary">
                      {t('hardwareHealth.storage.smart_table_title', 'Таблица атрибутов S.M.A.R.T.')}
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-subtle border border-border text-text-muted">
                      {activeDrive.smartAttributes?.length || 0} attributes
                    </span>
                  </div>

                  {/* Attributes Search Input */}
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={smartSearchQuery}
                      onChange={(e) => setSmartSearchQuery(e.target.value)}
                      placeholder={t('hardwareHealth.storage.search_attrs', 'Поиск по ID или названию...')}
                      className="w-full pl-8 pr-3 py-1 rounded-[4px] bg-surface-subtle border border-border text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                {filteredSmartAttributes.length > 0 ? (
                  <div className="overflow-x-auto custom-scrollbar border border-border-subtle rounded-[6px]">
                    <table className="w-full text-left text-xs font-mono border-collapse">
                      <thead>
                        <tr className="bg-surface-subtle border-b border-border-subtle text-text-muted text-[11px]">
                          <th className="py-2.5 px-3 w-14">{t('hardwareHealth.storage.attr_id', 'ID')}</th>
                          <th className="py-2.5 px-3">{t('hardwareHealth.storage.attr_name', 'Атрибут')}</th>
                          <th className="py-2.5 px-3 text-right">{t('hardwareHealth.storage.attr_current', 'Текущее')}</th>
                          <th className="py-2.5 px-3 text-right">{t('hardwareHealth.storage.attr_threshold', 'Порог')}</th>
                          <th className="py-2.5 px-3">{t('hardwareHealth.storage.attr_raw', 'Необработанные')}</th>
                          <th className="py-2.5 px-3 text-center w-24">{t('hardwareHealth.storage.attr_status', 'Статус')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {filteredSmartAttributes.map((attr) => {
                          const idHex = attr.id.toString(16).padStart(2, '0').toUpperCase();
                          const isGood = attr.status?.toLowerCase().includes('good');
                          const isWarn = attr.status?.toLowerCase().includes('warn');

                          return (
                            <tr
                              key={attr.id}
                              className="hover:bg-surface-hover/50 transition-colors group"
                            >
                              <td className="py-2 px-3 font-bold text-brand">{idHex}</td>
                              <td className="py-2 px-3">
                                <div className="font-medium text-text-primary">{attr.name}</div>
                                {attr.description && (
                                  <div className="text-[10px] text-text-muted truncate max-w-md">
                                    {attr.description}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
                                {attr.current !== undefined ? attr.current : '—'}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                                {attr.threshold !== undefined && attr.threshold !== null ? attr.threshold : '—'}
                              </td>
                              <td className="py-2 px-3 tabular-nums text-text-primary font-medium">
                                {attr.rawValue}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isGood
                                      ? 'bg-status-success/10 text-status-success border border-status-success/20'
                                      : isWarn
                                      ? 'bg-status-warning/10 text-status-warning border border-status-warning/20'
                                      : 'bg-status-danger/10 text-status-danger border border-status-danger/20'
                                  }`}
                                >
                                  {attr.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs font-mono text-text-muted">
                    No matching S.M.A.R.T. attributes found.
                  </div>
                )}
              </div>

              {/* 5. CrystalDiskInfo Acknowledgment & Credits Banner */}
              <div className="p-4 rounded-[8px] bg-gradient-to-r from-emerald-950/20 via-surface to-surface border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-[6px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-text-primary flex items-center gap-2">
                      <span>{t('hardwareHealth.storage.credits_title', 'Благодарность проекту CrystalDiskInfo')}</span>
                      <span className="text-[10px] font-mono text-emerald-400">MIT Open Source</span>
                    </h3>
                    <p className="text-[11px] text-text-secondary leading-relaxed max-w-3xl">
                      {t(
                        'hardwareHealth.storage.credits_desc',
                        'Раздел диагностики накопителей построен на базе методов опроса IOCTL и открытых спецификаций проекта CrystalDiskInfo автора Noriyuki Miyazaki (hiyohiyo). Особая благодарность за открытые алгоритмы чтения NVMe/ATA IOCTL и эталонный подход к S.M.A.R.T. аналитике.'
                      )}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleOpenCrystalDiskInfoGitHub}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-surface-subtle hover:bg-surface-hover border border-border text-xs font-mono text-text-primary transition-colors shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-brand" />
                  <span>GitHub</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-text-muted font-mono bg-surface border border-border rounded-[8px]">
              {t('hardwareHealth.storage.no_drives')}
            </div>
          )}
        </div>
      )}

      {/* BATTERY & POWER TAB */}
      {activeTab === 'battery' && (
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
                {/* Battery Charge Bar */}
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

                {/* Grid Stats */}
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
                        : '0%'}
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
      )}
    </div>
  );
}

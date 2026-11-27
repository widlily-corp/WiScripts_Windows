import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HardDrive,
  Battery,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StorageDeviceHealth } from '../types/hardwareHealth';
import { buildCrystalDiskInfoReport } from './HardwareHealth/healthUtils';
import { StorageHealthTab } from './HardwareHealth/StorageHealthTab';
import { BatteryPowerTab } from './HardwareHealth/BatteryPowerTab';

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
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

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

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      addToast({
        type: 'success',
        title: t('hardwareHealth.storage.copied_clipboard', 'Copied to clipboard'),
        message: text,
      });
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch (err) {
      addToast({
        type: 'error',
        title: t('common.clipboardError', 'Clipboard Copy Failed'),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCopyCrystalDiskInfoReport = async () => {
    if (!activeDrive) return;
    const report = buildCrystalDiskInfoReport(activeDrive);
    try {
      await navigator.clipboard.writeText(report);
      addToast({
        type: 'success',
        title: t('hardwareHealth.storage.copy_report', 'Copy Report'),
        message: t('hardwareHealth.storage.report_copied', 'Report copied to clipboard!'),
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: t('common.clipboardError', 'Clipboard Copy Failed'),
        message: err instanceof Error ? err.message : String(err),
      });
    }
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
          <div className="flex items-center p-0.5 bg-surface-subtle border border-border rounded-[6px] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] font-medium transition-colors ${
                activeTab === 'storage'
                  ? 'bg-surface text-brand shadow-sm border border-border/50'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{t('hardwareHealth.tabs.storage', 'SSD & Storage')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('battery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] font-medium transition-colors ${
                activeTab === 'battery'
                  ? 'bg-surface text-brand shadow-sm border border-border/50'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Battery className="w-3.5 h-3.5" />
              <span>{t('hardwareHealth.tabs.battery', 'Battery & Power')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchStorageHealth();
              fetchBatteryAnalytics();
            }}
            disabled={isHardwareLoading}
            className="p-2 rounded-[6px] bg-surface hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            title={t('hardwareHealth.storage.refresh_telemetry', 'Refresh Telemetry')}
            aria-label={t('hardwareHealth.storage.refresh_telemetry', 'Refresh Telemetry')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isHardwareLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-mono border transition-colors ${
              autoRefresh
                ? 'bg-surface-active text-brand border-brand/30'
                : 'bg-surface text-text-muted border-border hover:text-text-primary'
            }`}
            aria-label={autoRefresh ? t('hardwareHealth.pauseRefresh', 'Pause Auto Refresh') : t('hardwareHealth.resumeRefresh', 'Resume Auto Refresh')}
          >
            <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
            <span className="hidden sm:inline">
              {autoRefresh ? '4s' : t('hardwareHealth.paused', 'Paused')}
            </span>
          </button>
        </div>
      </div>

      {hardwareError && (
        <div className="p-3 rounded-[6px] bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{hardwareError}</span>
        </div>
      )}

      {activeTab === 'storage' && (
        <StorageHealthTab
          storageDevices={storageDevices}
          selectedDiskIndex={selectedDiskIndex}
          onSelectDisk={setSelectedDiskIndex}
          activeDrive={activeDrive}
          hasSmartTelemetry={hasSmartTelemetry}
          driveTempColor={driveTempColor}
          copiedKey={copiedKey}
          smartSearchQuery={smartSearchQuery}
          onSmartSearchChange={setSmartSearchQuery}
          filteredSmartAttributes={filteredSmartAttributes}
          onCopyText={handleCopyText}
          onCopyReport={handleCopyCrystalDiskInfoReport}
          onOpenGitHub={handleOpenCrystalDiskInfoGitHub}
        />
      )}

      {activeTab === 'battery' && (
        <BatteryPowerTab
          batteryHealth={batteryHealth}
          powerSchemes={powerSchemes}
          isHardwareLoading={isHardwareLoading}
          onSetActiveScheme={setActivePowerScheme}
          onActivateUltimate={enableUltimatePerformance}
        />
      )}
    </div>
  );
}

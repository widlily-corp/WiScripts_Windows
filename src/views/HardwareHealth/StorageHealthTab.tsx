import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  HardDrive,
  Flame,
  Cpu,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Search,
  FileText,
} from 'lucide-react';
import { StorageDeviceHealth, SmartAttributeItem } from '../../types/hardwareHealth';
import { getDriveHealthBadge } from './healthUtils';

interface StorageHealthTabProps {
  storageDevices: StorageDeviceHealth[];
  selectedDiskIndex: number;
  onSelectDisk: (index: number) => void;
  activeDrive: StorageDeviceHealth | null;
  hasSmartTelemetry: boolean;
  driveTempColor: string;
  copiedKey: string | null;
  smartSearchQuery: string;
  onSmartSearchChange: (q: string) => void;
  filteredSmartAttributes: SmartAttributeItem[];
  onCopyText: (text: string, key: string) => void;
  onCopyReport: () => void;
  onOpenGitHub: () => void;
}

export const StorageHealthTab: React.FC<StorageHealthTabProps> = ({
  storageDevices,
  selectedDiskIndex,
  onSelectDisk,
  activeDrive,
  hasSmartTelemetry,
  driveTempColor,
  copiedKey,
  smartSearchQuery,
  onSmartSearchChange,
  filteredSmartAttributes,
  onCopyText,
  onCopyReport,
  onOpenGitHub,
}) => {
  const { t } = useTranslation();
  const activeBadge = getDriveHealthBadge(activeDrive, t);

  return (
    <div className="space-y-6">
      {/* 1. CrystalDiskInfo Top Multi-Drive Selector Bar */}
      {storageDevices.length > 0 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-1 custom-scrollbar">
          {storageDevices.map((d, index) => {
            const isSelected = selectedDiskIndex === index;
            const isNvme = d.busType?.toLowerCase().includes('nvme');
            const driveTemp = d.temperatureCelsius > 0 ? `${d.temperatureCelsius.toFixed(0)}°C` : '—';
            const tempColor =
              d.temperatureCelsius <= 0
                ? 'text-text-muted'
                : d.temperatureCelsius < 50
                ? 'text-status-success'
                : d.temperatureCelsius < 65
                ? 'text-status-warning'
                : 'text-status-danger';
            const badge = getDriveHealthBadge(d, t);

            return (
              <button
                type="button"
                key={d.deviceId || index}
                onClick={() => onSelectDisk(index)}
                className={`flex items-center gap-3 p-3 rounded-[8px] border text-left shrink-0 transition-all min-w-[240px] max-w-[320px] ${
                  isSelected
                    ? 'bg-surface border-brand shadow-sm ring-1 ring-brand/20'
                    : 'bg-surface-subtle border-border hover:bg-surface hover:border-border-subtle'
                }`}
              >
                <div
                  className={`p-2 rounded-[6px] shrink-0 ${
                    isSelected ? 'bg-brand/10 text-brand' : 'bg-surface text-text-muted'
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
                      <span className="px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20 font-semibold">
                        {d.driveLetters.join(' ')}
                      </span>
                    )}
                    <span className="truncate">{d.busType || '—'}</span>
                    <span>•</span>
                    <span className={`font-semibold ${tempColor}`}>{driveTemp}</span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className={`text-[11px] font-mono font-semibold ${badge.text}`}>
                    {d.healthPercentage > 0 ? `${d.healthPercentage}%` : '—'}
                  </div>
                  <span className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border ${badge.bg} ${badge.text} ${badge.border}`}>
                    {badge.shortStatus}
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
                  {t('hardwareHealth.storage.healthStatusHeader', 'Health Status (CrystalDiskInfo)')}
                </span>
                {!hasSmartTelemetry && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {t('hardwareHealth.storage.limitedNonElevated', 'Limited (Non-Elevated)')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-5 w-full">
                {/* Big Health Badge */}
                <div
                  className={`flex flex-col items-center justify-center w-24 h-24 rounded-full border-2 ${activeBadge.bg} ${activeBadge.border} ${activeBadge.text} shadow-inner shrink-0`}
                >
                  <span className="text-2xl font-bold font-mono tracking-tight tabular-nums">
                    {activeDrive.healthPercentage > 0 ? `${activeDrive.healthPercentage}%` : '—'}
                  </span>
                  <span className="text-[10px] font-mono uppercase font-bold tracking-wider mt-0.5 text-center px-1 truncate max-w-full">
                    {activeBadge.shortStatus}
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
                      : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {activeDrive.temperatureCelsius > 0 && activeDrive.temperatureCelsius < 60
                      ? t('hardwareHealth.storage.tempNormalRange', 'Normal Range (< 60°C)')
                      : activeDrive.temperatureCelsius >= 60
                      ? t('hardwareHealth.storage.tempElevatedRange', 'Elevated (> 60°C)')
                      : t('hardwareHealth.storage.sensorStandby', 'Sensor Standby')}
                  </div>
                </div>
              </div>

              {/* Drive Size & Partition Badges */}
              <div className="w-full pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="text-text-secondary">
                  {t('hardwareHealth.storage.capacityLabel', 'Capacity')}:{' '}
                  <span className="font-semibold text-text-primary">
                    {activeDrive.sizeBytes > 0
                      ? `${(activeDrive.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                      : '—'}
                  </span>
                </div>
                {activeDrive.driveLetters && activeDrive.driveLetters.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-muted">{t('hardwareHealth.storage.volumesLabel', 'Volumes')}:</span>
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
                    {activeDrive.deviceId} • {activeDrive.busType || '—'}
                  </div>
                </div>

                {/* Copy CrystalDiskInfo Report Button */}
                <button
                  type="button"
                  onClick={onCopyReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-surface-subtle hover:bg-surface-hover border border-border text-xs font-mono text-text-primary transition-colors shrink-0"
                  title={t('hardwareHealth.storage.copy_report')}
                >
                  <Copy className="w-3.5 h-3.5 text-brand" />
                  <span>{t('hardwareHealth.storage.copy_report', 'Copy Report')}</span>
                </button>
              </div>

              {/* Specification Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                  <div className="text-[10px] uppercase font-mono text-text-muted flex items-center justify-between">
                    <span>{t('hardwareHealth.storage.firmware', 'Firmware')}</span>
                    {activeDrive.firmwareRevision && (
                      <button
                        type="button"
                        onClick={() => onCopyText(activeDrive.firmwareRevision, 'firmware')}
                        className="hover:text-text-primary"
                        aria-label={t('hardwareHealth.storage.copyFirmware', 'Copy Firmware')}
                        title={t('hardwareHealth.storage.copyFirmware', 'Copy Firmware')}
                      >
                        {copiedKey === 'firmware' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  <div className="font-mono font-semibold text-text-primary truncate">
                    {activeDrive.firmwareRevision || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                  <div className="text-[10px] uppercase font-mono text-text-muted flex items-center justify-between">
                    <span>{t('hardwareHealth.storage.serial_number', 'Serial Number')}</span>
                    {activeDrive.serialNumber && (
                      <button
                        type="button"
                        onClick={() => onCopyText(activeDrive.serialNumber, 'serial')}
                        className="hover:text-text-primary"
                        aria-label={t('hardwareHealth.storage.copySerial', 'Copy Serial')}
                        title={t('hardwareHealth.storage.copySerial', 'Copy Serial')}
                      >
                        {copiedKey === 'serial' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  <div className="font-mono font-semibold text-text-primary truncate">
                    {activeDrive.serialNumber || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                  <div className="text-[10px] uppercase font-mono text-text-muted">
                    {t('hardwareHealth.storage.interface', 'Interface')}
                  </div>
                  <div className="font-mono font-semibold text-text-primary truncate">
                    {activeDrive.busType || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                  <div className="text-[10px] uppercase font-mono text-text-muted">
                    {t('hardwareHealth.storage.transfer_mode', 'Transfer Mode')}
                  </div>
                  <div className="font-mono font-semibold text-text-primary truncate">
                    {activeDrive.transferMode || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                  <div className="text-[10px] uppercase font-mono text-text-muted">
                    {t('hardwareHealth.storage.standard', 'Standard')}
                  </div>
                  <div className="font-mono font-semibold text-text-primary truncate">
                    {activeDrive.standard || '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle space-y-1">
                  <div className="text-[10px] uppercase font-mono text-text-muted">
                    {t('hardwareHealth.storage.mediaType', 'Media Type')}
                  </div>
                  <div className="font-mono font-semibold text-text-primary truncate">
                    {activeDrive.mediaType || '—'}
                  </div>
                </div>
              </div>

              {/* Supported Features Tags */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono text-text-muted mr-1">
                  {t('hardwareHealth.storage.featuresLabel', 'Features')}:
                </span>
                {activeDrive.featuresSupported && activeDrive.featuresSupported.length > 0 ? (
                  activeDrive.featuresSupported.map((feat) => (
                    <span
                      key={feat}
                      className="px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border text-[10px] font-mono text-text-secondary"
                    >
                      {feat}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] font-mono text-text-muted">—</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Core Telemetry 6-Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
                  : t('hardwareHealth.storage.hostWrites', 'Host Writes')}
              </div>
            </div>

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
                  : t('hardwareHealth.storage.hostReads', 'Host Reads')}
              </div>
            </div>

            <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
              <div className="text-[11px] text-text-secondary truncate">
                {t('hardwareHealth.storage.power_on_hours')}
              </div>
              <div className="text-lg font-mono font-semibold text-text-primary tabular-nums">
                {activeDrive.powerOnHours > 0 ? `${activeDrive.powerOnHours.toLocaleString()} h` : '—'}
              </div>
              <div className="text-[10px] font-mono text-text-muted">
                {activeDrive.powerOnHours > 0
                  ? `~${Math.round(activeDrive.powerOnHours / 24)} ${t('hardwareHealth.storage.daysSuffix', 'days')}`
                  : t('hardwareHealth.storage.lifetimeLabel', 'Lifetime')}
              </div>
            </div>

            <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
              <div className="text-[11px] text-text-secondary truncate">
                {t('hardwareHealth.storage.power_cycles')}
              </div>
              <div className="text-lg font-mono font-semibold text-text-primary tabular-nums">
                {activeDrive.powerCycles > 0 ? activeDrive.powerCycles.toLocaleString() : '—'}
              </div>
              <div className="text-[10px] font-mono text-text-muted">
                {t('hardwareHealth.storage.powerOnCount', 'Power-On Count')}
              </div>
            </div>

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
              <div className="text-[10px] font-mono text-text-muted">
                {t('hardwareHealth.storage.suddenPowerLoss', 'Sudden Power Loss')}
              </div>
            </div>

            <div className="p-3.5 rounded-[6px] bg-surface border border-border space-y-1">
              <div className="text-[11px] text-text-secondary truncate">
                {t('hardwareHealth.storage.spare_capacity')}
              </div>
              <div className="text-lg font-mono font-semibold text-status-success tabular-nums">
                {activeDrive.availableSparePercent > 0 ? `${activeDrive.availableSparePercent}%` : '—'}
              </div>
              <div className="text-[10px] font-mono text-text-muted">
                {t('hardwareHealth.storage.reserveBlocks', 'Reserve Blocks')}
              </div>
            </div>
          </div>

          {/* 4. CrystalDiskInfo S.M.A.R.T. Attributes Table */}
          <div className="p-5 rounded-[8px] bg-surface border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand" />
                <h2 className="text-sm font-semibold text-text-primary">
                  {t('hardwareHealth.storage.smart_table_title', 'S.M.A.R.T. Attributes')}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-subtle border border-border text-text-muted">
                  {activeDrive.smartAttributes?.length || 0} {t('hardwareHealth.storage.attributesCountLabel', 'attributes')}
                </span>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={smartSearchQuery}
                  onChange={(e) => onSmartSearchChange(e.target.value)}
                  placeholder={t('hardwareHealth.storage.search_attrs', 'Search ID or name...')}
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
                      <th className="py-2.5 px-3">{t('hardwareHealth.storage.attr_name', 'Attribute')}</th>
                      <th className="py-2.5 px-3 text-right">{t('hardwareHealth.storage.attr_current', 'Current')}</th>
                      <th className="py-2.5 px-3 text-right">{t('hardwareHealth.storage.attr_threshold', 'Threshold')}</th>
                      <th className="py-2.5 px-3">{t('hardwareHealth.storage.attr_raw', 'Raw Values')}</th>
                      <th className="py-2.5 px-3 text-center w-24">{t('hardwareHealth.storage.attr_status', 'Status')}</th>
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
                {t('hardwareHealth.storage.noMatchingAttrs', 'No matching S.M.A.R.T. attributes found.')}
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
                  <span>{t('hardwareHealth.storage.credits_title', 'CrystalDiskInfo Attribution')}</span>
                  <span className="text-[10px] font-mono text-emerald-400">MIT Open Source</span>
                </h3>
                <p className="text-[11px] text-text-secondary leading-relaxed max-w-3xl">
                  {t(
                    'hardwareHealth.storage.credits_desc',
                    'Storage diagnostics IOCTL polling methods and S.M.A.R.T. analytics are inspired by CrystalDiskInfo by Noriyuki Miyazaki (hiyohiyo).'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenGitHub}
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
  );
};

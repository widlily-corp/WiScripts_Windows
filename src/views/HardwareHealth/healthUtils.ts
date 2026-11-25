import type { TFunction } from 'i18next';
import { StorageDeviceHealth } from '../../types/hardwareHealth';

export interface DriveHealthBadgeStyle {
  label: string;
  shortStatus: string;
  bg: string;
  text: string;
  border: string;
}

/**
 * Computes consistent health status badge styling: green only for explicitly healthy/good drives,
 * amber for warnings/unknown, and red for critical/failing drives.
 */
export function getDriveHealthBadge(drive: StorageDeviceHealth | null, t: TFunction): DriveHealthBadgeStyle {
  if (!drive) {
    return {
      label: t('hardwareHealth.storage.health_unknown', 'Unknown'),
      shortStatus: t('hardwareHealth.storage.health_unknown', 'Unknown'),
      bg: 'bg-status-warning/10',
      text: 'text-status-warning',
      border: 'border-status-warning/30',
    };
  }

  const status = (drive.smartStatus || '').trim().toLowerCase();
  const pctSuffix = drive.healthPercentage > 0 ? ` ${drive.healthPercentage}%` : '';

  if (
    status.includes('crit') ||
    status.includes('bad') ||
    status.includes('fail') ||
    status.includes('unhealthy') ||
    (drive.healthPercentage > 0 && drive.healthPercentage < 70)
  ) {
    return {
      label: `${t('hardwareHealth.storage.health_bad', 'Bad')}${pctSuffix}`,
      shortStatus: drive.smartStatus || t('hardwareHealth.storage.health_bad', 'Bad'),
      bg: 'bg-status-danger/10',
      text: 'text-status-danger',
      border: 'border-status-danger/30',
    };
  }

  if (status.includes('warn') || status.includes('caution') || (drive.healthPercentage > 0 && drive.healthPercentage < 90)) {
    return {
      label: `${t('hardwareHealth.storage.health_caution', 'Caution')}${pctSuffix}`,
      shortStatus: drive.smartStatus || t('hardwareHealth.storage.health_caution', 'Caution'),
      bg: 'bg-status-warning/10',
      text: 'text-status-warning',
      border: 'border-status-warning/30',
    };
  }

  if (status.includes('good') || status.includes('healthy')) {
    return {
      label: `${t('hardwareHealth.storage.health_good', 'Good')}${pctSuffix}`,
      shortStatus: drive.smartStatus,
      bg: 'bg-status-success/10',
      text: 'text-status-success',
      border: 'border-status-success/30',
    };
  }

  return {
    label: `${t('hardwareHealth.storage.health_unknown', 'Unknown')}${pctSuffix}`,
    shortStatus: drive.smartStatus || t('hardwareHealth.storage.health_unknown', 'Unknown'),
    bg: 'bg-status-warning/10',
    text: 'text-status-warning',
    border: 'border-status-warning/30',
  };
}

export function buildCrystalDiskInfoReport(drive: StorageDeviceHealth): string {
  const dateStr = new Date().toLocaleString();
  const capacityGb =
    drive.sizeBytes > 0
      ? (drive.sizeBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
      : '—';

  let report = `----------------------------------------------------------------------------
CrystalDiskInfo Report (WiScripts Storage Telemetry Engine)
Date/Time         : ${dateStr}
OS                : Windows (via WiScripts)
----------------------------------------------------------------------------
(01) ${drive.model}
----------------------------------------------------------------------------
           Model : ${drive.model}
        Firmware : ${drive.firmwareRevision || '—'}
   Serial Number : ${drive.serialNumber || '—'}
       Disk Size : ${capacityGb}
       Interface : ${drive.busType || '—'}
   Transfer Mode : ${drive.transferMode || '—'}
   Drive Letters : ${drive.driveLetters?.join(', ') || '—'}
        Standard : ${drive.standard || '—'}
        Features : ${drive.featuresSupported?.length ? drive.featuresSupported.join(', ') : '—'}
     Temperature : ${drive.temperatureCelsius > 0 ? `${drive.temperatureCelsius}°C` : '—'}
   Health Status : ${drive.smartStatus || 'Unknown'} (${drive.healthPercentage}%)
      Host Reads : ${drive.totalBytesReadTb > 0 ? `${drive.totalBytesReadTb.toFixed(2)} TB` : '—'}
     Host Writes : ${drive.totalBytesWrittenTb > 0 ? `${drive.totalBytesWrittenTb.toFixed(2)} TB` : '—'}
  Power On Count : ${drive.powerCycles > 0 ? `${drive.powerCycles} times` : '—'}
  Power On Hours : ${drive.powerOnHours > 0 ? `${drive.powerOnHours} hours` : '—'}
Unsafe Shutdowns : ${drive.unsafeShutdowns}
 Available Spare : ${drive.availableSparePercent}%

-- S.M.A.R.T. Attributes (CrystalDiskInfo Format) ---------------------------
ID  Attribute Name                         Current  Threshold  Raw Values    Status
`;

  drive.smartAttributes?.forEach((attr) => {
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

  return report;
}

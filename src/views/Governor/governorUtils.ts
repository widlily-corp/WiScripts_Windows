export interface PriorityOption {
  id: string;
  labelKey: string;
  defaultLabel: string;
  color: string;
}

export const PRIORITIES: PriorityOption[] = [
  {
    id: 'IDLE',
    labelKey: 'governor.priorityIdle',
    defaultLabel: 'Idle (Lowest)',
    color: 'text-text-muted bg-surface-subtle border-border',
  },
  {
    id: 'BELOW_NORMAL',
    labelKey: 'governor.priorityBelowNormal',
    defaultLabel: 'Below Normal',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'NORMAL',
    labelKey: 'governor.priorityNormal',
    defaultLabel: 'Normal',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'ABOVE_NORMAL',
    labelKey: 'governor.priorityAboveNormal',
    defaultLabel: 'Above Normal',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'HIGH',
    labelKey: 'governor.priorityHigh',
    defaultLabel: 'High Priority',
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
  {
    id: 'REALTIME',
    labelKey: 'governor.priorityRealtime',
    defaultLabel: 'Realtime (Max)',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
];

export function getLogicalCoreCount(telemetryCoresCount: number): number {
  const hwConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 0;
  const raw = telemetryCoresCount > 0 ? telemetryCoresCount : hwConcurrency > 0 ? hwConcurrency : 8;
  return Math.max(1, Math.min(64, raw));
}

export function calculateMaskFromCores(cores: number[], totalCores = 8): string {
  const padWidth = Math.max(8, Math.ceil(totalCores / 4));
  if (cores.length === 0) {
    return `0x${'1'.padStart(padWidth, '0')}`;
  }
  let mask = 0n;
  for (const core of cores) {
    if (core >= 0 && core < 64) {
      mask |= 1n << BigInt(core);
    }
  }
  return `0x${mask.toString(16).toUpperCase().padStart(padWidth, '0')}`;
}

export interface MemoryBreakdown {
  totalPhysicalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usagePercent: number;
  standbyBytes: number;
  modifiedBytes: number;
  freeBytes: number;
  pagedPoolBytes: number;
  nonPagedPoolBytes: number;
  systemCacheBytes: number;
}

export type StandbyPurgeMode = 'all' | 'lowPriorityOnly';

export interface PurgeResult {
  bytesFreed: number;
  mbFreed: number;
  processesTrimmed: number;
  success: boolean;
  message: string;
}

export interface AutoTrimmerConfig {
  enabled: boolean;
  thresholdPercent: number;
  intervalSeconds: number;
  purgeStandby: boolean;
  purgeWorkingSets: boolean;
  excludedProcessNames: string[];
}

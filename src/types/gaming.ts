export interface LatencyMetrics {
  currentLatencyUs: number;
  averageLatencyUs: number;
  maxLatencyUs: number;
  dpcCount: number;
  isrCount: number;
  dpcRatePerSec: number;
  isrRatePerSec: number;
  timerResolution100ns: number;
  status: string;
}

export interface TimerResolutionInfo {
  currentResolution100ns: number;
  minResolution100ns: number;
  maxResolution100ns: number;
  isCustom: boolean;
}

export interface GameBoostStatus {
  enabled: boolean;
  boostedPid: number | null;
  boostedProcessName: string | null;
  suspendedServices: string[];
  timerResolutionApplied: boolean;
}

export interface LatencyHistoryPoint {
  timestamp: number;
  latencyUs: number;
}

export interface ProcessSelectorItem {
  pid: number;
  name: string;
  windowTitle: string;
  memoryMb: number;
  priorityClass: number;
  isKnownGame: boolean;
}

export interface DaemonStatus {
  active: boolean;
  autoDetect: boolean;
  boostedPid: number | null;
  boostedName: string | null;
  timerResolutionApplied: boolean;
  physicalAffinityApplied: boolean;
  suspendedServices: string[];
}

export interface GameOptimizationConfig {
  targetPid: number;
  processName: string;
  setHighPriority: boolean;
  pinPhysicalCores: boolean;
  setTimerResolution: boolean;
  purgeStandbyRam: boolean;
  suspendServices: boolean;
}

export interface ShaderCacheEntry {
  id: string;
  name: string;
  vendor: string;
  path: string;
  sizeBytes: number;
  fileCount: number;
  exists: boolean;
}

export interface ShaderScanSummary {
  entries: ShaderCacheEntry[];
  totalBytes: number;
  totalFiles: number;
}

export interface ShaderNukeResult {
  bytesFreed: number;
  filesRemoved: number;
  skippedLockedCount: number;
  errors: string[];
}

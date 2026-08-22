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

export interface ResourceGovernorRule {
  processName: string;
  targetPriority: 'IDLE' | 'BELOW_NORMAL' | 'NORMAL' | 'ABOVE_NORMAL' | 'HIGH' | 'REALTIME' | string;
  coreAffinityMask: string;
  audioEndpointId?: string | null;
  autoTrimMemoryMbThreshold?: number | null;
}

export interface ManagedProcessInfo {
  pid: number;
  name: string;
  cpuUsage: number;
  currentPriority: string;
  assignedCores: string;
}

export interface GovernorStatus {
  activeRulesCount: number;
  proBalanceEventsTriggered: number;
  totalMemoryTrimmedMb: number;
  managedProcesses: ManagedProcessInfo[];
}

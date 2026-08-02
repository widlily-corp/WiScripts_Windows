export type StateSnapshotSource = 'user_manual' | 'pre_optimization' | 'scheduled' | 'api_trigger' | 'system_event';

export function isStateSnapshotSource(value: unknown): value is StateSnapshotSource {
  return (
    typeof value === 'string' &&
    ['user_manual', 'pre_optimization', 'scheduled', 'api_trigger', 'system_event'].includes(value)
  );
}

export interface RegistryValueBackup {
  keyPath: string;
  valueName: string;
  valueType: 'REG_SZ' | 'REG_DWORD' | 'REG_BINARY' | 'REG_MULTI_SZ' | string;
  previousData: string | null;
}

export interface ServiceBackup {
  serviceName: string;
  previousStartupType: 'Automatic' | 'Manual' | 'Disabled' | string;
  previousStatus: 'Running' | 'Stopped' | string;
}

export interface SystemStateSnapshot {
  id: string;
  timestamp: number;
  label: string;
  triggerSource: StateSnapshotSource | string;
  registryDeltas: RegistryValueBackup[];
  serviceDeltas: ServiceBackup[];
}

export interface RollbackResult {
  snapshotId: string;
  success: boolean;
  restoredKeysCount: number;
  restoredServicesCount: number;
  errors: string[];
}

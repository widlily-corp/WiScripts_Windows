export interface StorageDeviceHealth {
  deviceId: string;
  model: string;
  busType: string;
  temperatureCelsius: number;
  healthPercentage: number;
  criticalWarning: number;
  availableSparePercent: number;
  percentageUsed: number;
  totalBytesWrittenTb: number;
  totalBytesReadTb: number;
  powerOnHours: number;
  powerCycles: number;
  unsafeShutdowns: number;
  smartStatus: string;
}

export interface BatteryHealthAnalytics {
  hasBattery: boolean;
  isCharging: boolean;
  isAcOnline: boolean;
  batteryPercentage: number;
  dischargeRateMw: number;
  estimatedRemainingTimeMinutes: number | null;
  designedCapacityMwh: number | null;
  fullChargeCapacityMwh: number | null;
  currentCapacityMwh: number | null;
  wearLevelPercent: number | null;
  cycleCount: number | null;
  powerProfileStatus: string;
}

export interface PowerSchemeInfo {
  guid: string;
  name: string;
  description: string;
  isActive: boolean;
  isUltimatePerformance: boolean;
}

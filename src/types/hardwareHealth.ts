export interface SmartAttributeItem {
  id: number;
  name: string;
  current: number;
  worst?: number | null;
  threshold?: number | null;
  rawValue: string;
  status: 'Good' | 'Warning' | 'Critical' | string;
  description: string;
}

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
  firmwareRevision: string;
  serialNumber: string;
  transferMode: string;
  standard: string;
  driveLetters: string[];
  sizeBytes: number;
  mediaType: string;
  rotationRateRpm?: number | null;
  featuresSupported: string[];
  mediaErrors: number;
  errorLogEntries: number;
  warningTempTimeMins: number;
  criticalTempTimeMins: number;
  sensorTemperatures: number[];
  smartAttributes: SmartAttributeItem[];
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

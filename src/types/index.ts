export interface SystemInfo {
  osName: string;
  osVersion: string;
  osBuild: string;
  isElevated: boolean;
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  telemetryStatus: 'Active' | 'Minimized' | 'Disabled' | 'Unknown';
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type OptimizationCategory =
  | 'all'
  | 'telemetry'
  | 'bloatware'
  | 'privacy'
  | 'services'
  | 'ui_tweaks'
  | 'disk_cleanup';

export type PresetType = 'recommended' | 'telemetry_only' | 'full_debloat';

export interface OptimizationItem {
  id: string;
  category: OptimizationCategory;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  isReversible: boolean;
  powershellCommand: string;
  undoCommand: string;
  isRecommended: boolean;
  isSelected?: boolean;
  isApplied?: boolean;
}

export interface OdtConfig {
  architecture: 'x64' | 'x86';
  channel: 'Current' | 'MonthlyEnterprise' | 'SemiAnnual';
  products: string[];
  excludedApps: string[];
  language: string;
  removeExistingOffice: boolean;
  acceptEula: boolean;
}

export type MasMethod = 'HWID' | 'Ohook' | 'KMS38' | 'TSforge';

export interface CommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecutedAction {
  id: string;
  name: string;
  command: string;
  output: CommandOutput;
  skipped: boolean;
}

export interface ExecutionSummary {
  success: boolean;
  executedActions: ExecutedAction[];
  totalDurationMs: number;
  isDryRun: boolean;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'cmd';
  message: string;
  commandExecuted?: string;
}

export interface TaskProgressPayload {
  currentStep: number;
  totalSteps: number;
  message: string;
  isError: boolean;
}

export type TabType =
  | 'dashboard'
  | 'audio_manager'
  | 'optimization'
  | 'package_manager'
  | 'app_uninstaller'
  | 'presets'
  | 'system_cleaner'
  | 'storage_utilities'
  | 'startup'
  | 'scheduler'
  | 'dns_context'
  | 'driver_backup'
  | 'diagnostics'
  | 'odt'
  | 'activation'
  | 'restore_points'
  | 'settings';

export interface CleanerCategoryItem {
  id: string;
  name: string;
  description: string;
  paths: string[];
  totalSizeBytes: number;
  fileCount: number;
}

export interface CleanerScanResult {
  categories: CleanerCategoryItem[];
  totalBytes: number;
  totalFiles: number;
}

export interface CleanerCleanResult {
  bytesFreed: number;
  filesRemoved: number;
  skippedFilesCount: number;
  errors: string[];
}

export interface DuplicateFileItem {
  path: string;
  sizeBytes: number;
  modifiedTimestamp: number;
}

export interface DuplicateGroup {
  hash: string;
  sizeBytes: number;
  files: DuplicateFileItem[];
}

export interface LargeFileItem {
  path: string;
  name: string;
  sizeBytes: number;
  extension: string;
  modifiedTimestamp: number;
}

export interface StorageDeleteResult {
  filesDeleted: number;
  bytesFreed: number;
  errors: string[];
}


export interface InstalledApp {
  id: string;
  name: string;
  version?: string | null;
  publisher?: string | null;
  uninstallString?: string | null;
  displayIcon?: string | null;
  estimatedSizeKb?: number | null;
  installDate?: string | null;
  registryPath: string;
  isSystemComponent: boolean;
  quietUninstallString?: string | null;
  installLocation?: string | null;
}

export interface SystemMetricsPayload {
  cpuUsagePercent: number;
  cpuCoreCount: number;
  perCoreCpuUsage: number[];
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryFreeMb: number;
  memoryUsagePercent: number;
  diskReadBytesPerSec: number;
  diskWriteBytesPerSec: number;
  diskTotalReadBytes: number;
  diskTotalWriteBytes: number;
  networkRxBytesPerSec: number;
  networkTxBytesPerSec: number;
  networkTotalRxBytes: number;
  networkTotalTxBytes: number;
  timestampMs: number;
}

export type ThermalStatus = 'normal' | 'warm' | 'hot' | 'unknown';

export interface TemperatureSensorInfo {
  name: string;
  label: string;
  temperatureCelsius: number;
  sensorType: 'cpu' | 'gpu' | 'other' | string;
}

export interface SystemTemperaturesPayload {
  cpuTempCelsius: number | null;
  gpuTempCelsius: number | null;
  isCpuTempAvailable: boolean;
  isGpuTempAvailable: boolean;
  sensorSource: string;
  sensorItems: TemperatureSensorInfo[];
}

export interface MetricSnapshot {
  timestamp: number;
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryUsagePercent: number;
  diskReadBytesPerSec: number;
  diskWriteBytesPerSec: number;
  networkRxBytesPerSec: number;
  networkTxBytesPerSec: number;
  cpuTempC: number | null;
  gpuTempC: number | null;
  cpuThermalStatus: ThermalStatus;
  gpuThermalStatus: ThermalStatus;
}

export interface StartupItem {
  id: string;
  name: string;
  valueName: string;
  command: string;
  location: string;
  enabled: boolean;
  itemType: string;
  publisher?: string | null;
}

export interface ScheduledTaskItem {
  taskName: string;
  taskPath: string;
  state: string;
  enabled: boolean;
  triggerType: string;
  author: string;
  lastRunTime?: string | null;
  nextRunTime?: string | null;
  actionSummary: string;
}


export interface RestorePoint {
  sequenceNumber: number;
  description: string;
  restorePointType: string;
  creationTime: string;
}

export interface WingetPackage {
  id: string;
  name: string;
  version: string;
  source: string;
}

export interface UwpAppInfo {
  name: string;
  packageFullName: string;
  publisherId: string;
  isFramework: boolean;
}

export interface OptimizationProfile {
  id: string;
  name: string;
  description: string;
  iconName: string;
  ruleIds: string[];
}

export interface DnsProvider {
  id: string;
  name: string;
  primaryDns: string;
  secondaryDns: string;
  description: string;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'upToDate'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastNotification {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type Language = 'ru' | 'en';

export interface AppPreferences {
  themeMode: ThemeMode;
  dryRunMode: boolean;
  autoCreateRestorePoint: boolean;
  pollingIntervalMs: number;
  autoCheckUpdates: boolean;
  language: Language;
}

export interface PresetMetadata {
  id: string;
  name: string;
  description: string;
  author?: string;
  createdTimestamp: string;
  appVersion: string;
  iconName?: string;
  tags?: string[];
}

export interface PresetTargetOs {
  minBuild?: string;
  supportedEditions?: string[];
}

export interface CustomPresetParameters {
  createRestorePoint?: boolean;
  dryRunRecommended?: boolean;
  categoryOverrides?: Record<string, string>;
}

export interface WiScriptsPreset {
  schemaVersion: '1.0' | string;
  metadata: PresetMetadata;
  targetOs?: PresetTargetOs;
  ruleIds: string[];
  customParameters?: CustomPresetParameters;
}

export interface PresetValidationResult {
  isValid: boolean;
  preset: WiScriptsPreset | null;
  validRuleIds: string[];
  unknownRuleIds: string[];
  validationErrors: string[];
}

export type GitHubIssueCategory = 'bug' | 'enhancement' | 'question';

export interface GitHubIssuePayload {
  title: string;
  category: GitHubIssueCategory | string;
  description: string;
  includeLogs: boolean;
  includeSystemInfo: boolean;
  githubToken?: string;
}

export interface GitHubIssueResult {
  success: boolean;
  issueUrl?: string;
  method: 'api' | 'browser' | string;
  error?: string;
}

export type AudioFlow = 'render' | 'capture' | 'Render' | 'Capture';
export type AudioRole = 'console' | 'multimedia' | 'communications' | 'Console' | 'Multimedia' | 'Communications';

export interface AudioDevice {
  id: string;
  name: string;
  flow: AudioFlow;
  isDefault: boolean;
  isDefaultMultimedia?: boolean;
  isDefaultCommunications?: boolean;
  volume?: number;
  isMuted?: boolean;
  state: 'active' | 'disabled' | 'notpresent' | 'unplugged' | 'Active' | 'Disabled' | 'Unplugged' | string;
  icon?: string;
  channels?: number;
}

export interface AudioDevicesPayload {
  renderDevices: AudioDevice[];
  captureDevices: AudioDevice[];
  defaultRenderId: string | null;
  defaultCaptureId: string | null;
}

export interface AppAudioSession {
  pid: number;
  name: string;
  processName?: string;
  displayName?: string;
  sessionId?: string;
  volume: number;
  isMuted: boolean;
  deviceId?: string | null;
  outputDeviceId?: string | null;
  inputDeviceId?: string | null;
  flow?: AudioFlow;
  icon?: string | null;
  iconPath?: string | null;
}

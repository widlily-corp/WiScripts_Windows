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
  isSelected: boolean;
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
  | 'optimization'
  | 'package_manager'
  | 'presets'
  | 'dns_context'
  | 'driver_backup'
  | 'diagnostics'
  | 'odt'
  | 'activation'
  | 'settings';

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


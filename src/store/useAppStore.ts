import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  SystemInfo,
  OptimizationItem,
  OdtConfig,
  MasMethod,
  ExecutionLog,
  TabType,
  RiskLevel,
  WingetPackage,
  UwpAppInfo,
  OptimizationProfile,
  DnsProvider,
  ExecutionSummary,
  UpdateStatus,
  UpdateInfo,
  ToastNotification,
  ToastType,
  RestorePoint,
  SystemMetricsPayload,
  SystemTemperaturesPayload,
  MetricSnapshot,
  ThermalStatus,
  StartupItem,
  ScheduledTaskItem,
} from '../types';

export interface PendingSafetyModal {
  isOpen: boolean;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  commandsToRun: string[];
  onConfirmAction: () => Promise<void>;
}

interface AppState {
  // Global App Settings
  dryRunMode: boolean;
  setDryRunMode: (enabled: boolean) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  // Application Version & Updater State
  appVersion: string;
  setAppVersion: (version: string) => void;
  fetchAppVersion: () => Promise<string>;
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  updateProgress: number;
  updateError: string | null;
  autoCheckUpdates: boolean;
  bannerDismissed: boolean;
  lastUpdateCheckTime: string | null;
  setAutoCheckUpdates: (enabled: boolean) => void;
  dismissUpdateBanner: () => void;
  checkForUpdates: (silent?: boolean) => Promise<boolean>;
  downloadAndInstallUpdate: () => Promise<void>;

  // Toast Notification System
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id'>) => string;
  dismissToast: (id: string) => void;

  // System Info State
  systemInfo: SystemInfo | null;
  isElevated: boolean;
  isSystemLoading: boolean;
  checkElevation: () => Promise<boolean>;
  setSystemInfo: (info: SystemInfo) => void;
  setSystemLoading: (loading: boolean) => void;

  // Optimization State
  optimizations: OptimizationItem[];
  selectedCategory: string;
  searchQuery: string;
  setSelectedCategory: (cat: string) => void;
  setSearchQuery: (query: string) => void;
  toggleOptimizationSelected: (id: string) => void;
  selectAllOptimizations: (category?: string) => void;
  deselectAllOptimizations: () => void;
  selectRecommendedOptimizations: () => void;
  selectTelemetryOnlyOptimizations: () => void;
  applyPreset: (preset: 'recommended' | 'telemetry_only' | 'full_debloat') => void;
  setOptimizations: (items: OptimizationItem[]) => void;

  // Feature R1: Diagnostics
  runDiagnostics: (action: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  // Feature R2: Package & Bloatware Manager
  wingetPackages: WingetPackage[];
  isWingetSearching: boolean;
  uwpApps: UwpAppInfo[];
  isUwpLoading: boolean;
  wingetSearch: (query: string) => Promise<WingetPackage[]>;
  wingetInstall: (packageId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  wingetUpdate: (packageId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  fetchUwpApps: () => Promise<UwpAppInfo[]>;
  removeUwpApp: (packageFullName: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  // Feature R3: Optimization Presets / Profiles
  optimizationProfiles: OptimizationProfile[];
  isLoadingProfiles: boolean;
  fetchOptimizationProfiles: () => Promise<OptimizationProfile[]>;
  applyOptimizationProfile: (profileId: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  // Feature R4: DNS & Context Menu Manager
  classicContextMenuEnabled: boolean;
  isContextMenuLoading: boolean;
  selectedDnsProvider: string;
  setSelectedDnsProvider: (provider: string) => void;
  setDnsServer: (provider: string, interfaceAlias?: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  fetchClassicContextMenuStatus: () => Promise<boolean>;
  toggleClassicContextMenu: (enable: boolean, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  // Feature R5: Driver Backup
  driverBackupPath: string;
  isDriverBackupLoading: boolean;
  setDriverBackupPath: (path: string) => void;
  backupDrivers: (outputDir: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  // Feature R6: System Restore Points
  restorePoints: RestorePoint[];
  isLoadingRestorePoints: boolean;
  fetchRestorePoints: () => Promise<RestorePoint[]>;
  createRestorePoint: (description: string, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  restoreSystemToPoint: (sequenceNumber: number, dryRun?: boolean) => Promise<ExecutionSummary | null>;

  // Milestone 3: Real-time Metrics & Hardware Sensors
  metricsHistory: MetricSnapshot[];
  currentMetrics: MetricSnapshot | null;
  isPollingActive: boolean;
  pollingIntervalMs: number;
  setPollingIntervalMs: (interval: number) => void;
  togglePollingActive: () => void;
  pushMetricSnapshot: (snapshot: MetricSnapshot) => void;
  fetchLatestMetrics: () => Promise<MetricSnapshot | null>;

  // Milestone 3: Startup Apps Manager
  startupItems: StartupItem[];
  isStartupLoading: boolean;
  fetchStartupItems: () => Promise<StartupItem[]>;
  toggleStartupItem: (id: string, arg2?: boolean | string, arg3?: string, arg4?: boolean) => Promise<ExecutionSummary | null>;
  removeStartupItem: (id: string, valueName?: string, location?: string) => Promise<ExecutionSummary | null>;

  // Milestone 3: Task Scheduler Background Tasks
  scheduledTasks: ScheduledTaskItem[];
  isSchedulerLoading: boolean;
  fetchScheduledTasks: () => Promise<ScheduledTaskItem[]>;
  toggleScheduledTask: (taskName: string, taskPath: string, enable: boolean) => Promise<ExecutionSummary | null>;
  runScheduledTask: (taskName: string, taskPath: string) => Promise<ExecutionSummary | null>;

  // ODT State
  odtConfig: OdtConfig;
  updateOdtConfig: (patch: Partial<OdtConfig>) => void;
  generatedXml: string;
  setGeneratedXml: (xml: string) => void;

  // MAS State
  selectedMasMethod: MasMethod;
  setSelectedMasMethod: (method: MasMethod) => void;

  // Execution & Safety Modal State
  isExecuting: boolean;
  setIsExecuting: (executing: boolean) => void;
  executionProgress: number;
  currentStep: number;
  totalSteps: number;
  setCurrentProgress: (currentStep: number, totalSteps: number) => void;
  setExecutionProgress: (percent: number) => void;
  logs: ExecutionLog[];
  addLog: (log: Omit<ExecutionLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;

  // Safety Confirmation Modal Target
  pendingSafetyModal: PendingSafetyModal | null;
  openSafetyModal: (modal: Omit<PendingSafetyModal, 'isOpen'>) => void;
  closeSafetyModal: () => void;
}


const DEFAULT_OPTIMIZATIONS: OptimizationItem[] = [
  // Category 1: telemetry
  {
    id: 'telemetry_diagtrack',
    category: 'telemetry',
    title: 'Disable DiagTrack & Telemetry Services',
    description: 'Stops and disables Connected User Experiences and Telemetry service (DiagTrack).',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: 'Stop-Service -Name DiagTrack; Set-Service -Name DiagTrack -StartupType Disabled',
    undoCommand: 'Set-Service -Name DiagTrack -StartupType Automatic; Start-Service -Name DiagTrack',
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'telemetry_dmwappush',
    category: 'telemetry',
    title: 'Disable dmwappushservice',
    description: 'Disables WAP Push Message Routing Service used for telemetry diagnostics collection.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: 'Stop-Service -Name dmwappushservice; Set-Service -Name dmwappushservice -StartupType Disabled',
    undoCommand: 'Set-Service -Name dmwappushservice -StartupType Demand',
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'telemetry_ceip_tasks',
    category: 'telemetry',
    title: 'Disable CEIP Scheduled Telemetry Tasks',
    description: 'Disables Customer Experience Improvement Program scheduled tasks in Task Scheduler.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "Disable-ScheduledTask -TaskPath '\\Microsoft\\Windows\\Customer Experience Improvement Program\\' -TaskName 'Consolidator', 'UsbCeip'",
    undoCommand: "Enable-ScheduledTask -TaskPath '\\Microsoft\\Windows\\Customer Experience Improvement Program\\' -TaskName 'Consolidator', 'UsbCeip'",
    isRecommended: true,
    isSelected: true,
  },
  // Category 2: bloatware
  {
    id: 'bloatware_cortana',
    category: 'bloatware',
    title: 'Disable Cortana App & Background Execution',
    description: 'Disables Cortana autostart and background task execution via group policy registry key.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search' -Name 'AllowCortana' -Value 0 -Type DWord -Force",
    undoCommand: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search' -Name 'AllowCortana' -Value 1 -Type DWord -Force",
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'bloatware_onedrive',
    category: 'bloatware',
    title: 'Uninstall OneDrive Integration',
    description: 'Removes standalone OneDrive client and unbinds Explorer cloud integration.',
    riskLevel: 'medium',
    isReversible: false,
    powershellCommand: "Stop-Process -Name OneDrive -ErrorAction SilentlyContinue; $setup = Join-Path $env:SystemRoot 'SysWOW64\\OneDriveSetup.exe'; if (-not (Test-Path $setup)) { $setup = Join-Path $env:SystemRoot 'System32\\OneDriveSetup.exe' }; if (Test-Path $setup) { Start-Process $setup -ArgumentList '/uninstall' -Wait }",
    undoCommand: '# Manual reinstallation required via OneDrive setup binary',
    isRecommended: false,
    isSelected: false,
  },
  {
    id: 'bloatware_xbox_apps',
    category: 'bloatware',
    title: 'Remove Xbox Companion & Game Overlay Apps',
    description: 'Uninstalls Xbox Companion and Game Bar AppX packages for non-gaming Windows installations.',
    riskLevel: 'medium',
    isReversible: true,
    powershellCommand: 'Get-AppxPackage -AllUsers *XboxApp* | Remove-AppxPackage -ErrorAction SilentlyContinue',
    undoCommand: 'Get-AppxPackage -AllUsers *XboxApp* | Foreach {Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml"}',
    isRecommended: false,
    isSelected: false,
  },
  {
    id: 'bloatware_3d_viewer',
    category: 'bloatware',
    title: 'Remove 3D Viewer & Mixed Reality Apps',
    description: 'Removes 3D Viewer and Mixed Reality Portal provisioned packages.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: 'Get-AppxPackage *Microsoft3DViewer* | Remove-AppxPackage -ErrorAction SilentlyContinue',
    undoCommand: '# Reinstall via Microsoft Store',
    isRecommended: true,
    isSelected: true,
  },
  // Category 3: privacy
  {
    id: 'privacy_advertising_id',
    category: 'privacy',
    title: 'Disable Advertising ID for Apps',
    description: 'Prevents apps from using advertising ID for tailored ads across application sessions.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Name 'Enabled' -Value 0 -Type DWord -Force",
    undoCommand: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Name 'Enabled' -Value 1 -Type DWord -Force",
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'privacy_location_tracking',
    category: 'privacy',
    title: 'Disable System Location Tracking Services',
    description: 'Turns off global OS location service access and location history logging.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' -Name 'Value' -Value 'Deny' -Type String -Force",
    undoCommand: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location' -Name 'Value' -Value 'Allow' -Type String -Force",
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'privacy_activity_history',
    category: 'privacy',
    title: 'Disable Activity History & Cloud Sync',
    description: 'Stops collecting user activity history and prevents cloud timeline synchronization.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'PublishUserActivities' -Value 0 -Type DWord -Force",
    undoCommand: "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'PublishUserActivities' -Value 1 -Type DWord -Force",
    isRecommended: true,
    isSelected: true,
  },
  // Category 4: services
  {
    id: 'services_sysmain',
    category: 'services',
    title: 'Disable SysMain (Superfetch) Service',
    description: 'Stops SysMain service to reduce excessive disk read/write cycles on NVMe/SSD drives.',
    riskLevel: 'medium',
    isReversible: true,
    powershellCommand: 'Stop-Service -Name SysMain; Set-Service -Name SysMain -StartupType Disabled',
    undoCommand: 'Set-Service -Name SysMain -StartupType Automatic; Start-Service -Name SysMain',
    isRecommended: false,
    isSelected: false,
  },
  {
    id: 'services_search_indexing',
    category: 'services',
    title: 'Set Windows Search Indexing to Manual',
    description: 'Configures Windows Search (WSearch) service startup type to Manual to avoid background CPU spikes.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: 'Set-Service -Name WSearch -StartupType Manual',
    undoCommand: 'Set-Service -Name WSearch -StartupType Automatic; Start-Service -Name WSearch',
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'services_fax_spooler',
    category: 'services',
    title: 'Disable Fax & Legacy Print Services',
    description: 'Disables Fax service and disables automatic legacy print spooler background scanning.',
    riskLevel: 'medium',
    isReversible: true,
    powershellCommand: 'Stop-Service -Name Fax -ErrorAction SilentlyContinue; Set-Service -Name Fax -StartupType Disabled',
    undoCommand: 'Set-Service -Name Fax -StartupType Manual',
    isRecommended: false,
    isSelected: false,
  },
  // Category 5: ui_tweaks
  {
    id: 'ui_show_file_extensions',
    category: 'ui_tweaks',
    title: 'Show File Extensions in Explorer',
    description: 'Forces Windows File Explorer to display file extension suffixes for all known file types.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'HideFileExt' -Value 0 -Type DWord -Force",
    undoCommand: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'HideFileExt' -Value 1 -Type DWord -Force",
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'ui_show_hidden_files',
    category: 'ui_tweaks',
    title: 'Show Hidden Files & Folders',
    description: 'Configures File Explorer to reveal hidden files, system directories, and hidden items.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'Hidden' -Value 1 -Type DWord -Force",
    undoCommand: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name 'Hidden' -Value 2 -Type DWord -Force",
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'ui_classic_context_menu',
    category: 'ui_tweaks',
    title: 'Restore Classic Windows 10 Right-Click Context Menu',
    description: 'Restores classic context menu in Windows 11 Explorer without requiring Shift+F10.',
    riskLevel: 'low',
    isReversible: true,
    powershellCommand: "New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32' -Value '' -Force",
    undoCommand: "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse -Force -ErrorAction SilentlyContinue",
    isRecommended: true,
    isSelected: true,
  },
  // Category 6: disk_cleanup
  {
    id: 'disk_clean_temp',
    category: 'disk_cleanup',
    title: 'Purge System & User Temp Directories',
    description: 'Safely removes temporary files and cache artifacts from Windows Temp and User Temp folders.',
    riskLevel: 'low',
    isReversible: false,
    powershellCommand: 'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path "$env:SystemRoot\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue',
    undoCommand: '# Temp file deletion is permanent and cannot be undone',
    isRecommended: true,
    isSelected: true,
  },
  {
    id: 'disk_clean_delivery_optimization',
    category: 'disk_cleanup',
    title: 'Flush Delivery Optimization Cache',
    description: 'Clears residual Windows Update Delivery Optimization cache files to free storage space.',
    riskLevel: 'low',
    isReversible: false,
    powershellCommand: 'Delete-DeliveryOptimizationCache -ErrorAction SilentlyContinue',
    undoCommand: '# Cache flush cannot be undone',
    isRecommended: true,
    isSelected: true,
  },
];

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        dryRunMode: false,
        setDryRunMode: (enabled) => set({ dryRunMode: enabled }),
        activeTab: 'dashboard',
        setActiveTab: (tab) => set({ activeTab: tab }),

        // Application Version & Auto-Updater Implementation
        appVersion: '0.3.0',
        setAppVersion: (ver) => set({ appVersion: ver }),
        fetchAppVersion: async () => {
          try {
            const ver = await invoke<string>('get_app_version');
            if (ver) {
              set({ appVersion: ver });
              return ver;
            }
          } catch (err) {
            // Dev mode fallback
          }
          const current = get().appVersion || '0.3.0';
          return current;
        },

        updateStatus: 'idle',
        updateInfo: null,
        updateProgress: 0,
        updateError: null,
        autoCheckUpdates: true,
        bannerDismissed: false,
        lastUpdateCheckTime: null,

        setAutoCheckUpdates: (enabled) => set({ autoCheckUpdates: enabled }),
        dismissUpdateBanner: () => set({ bannerDismissed: true }),

        checkForUpdates: async (silent = false) => {
          set({ updateStatus: 'checking', updateError: null });
          if (!silent) {
            get().addLog({ level: 'cmd', message: 'Checking for application updates...' });
          }
          try {
            const update = await check();
            const now = new Date().toLocaleTimeString();
            set({ lastUpdateCheckTime: now });

            if (update?.available) {
              const info: UpdateInfo = {
                version: update.version,
                currentVersion: get().appVersion,
                body: update.body || undefined,
                date: update.date || undefined,
              };
              set({
                updateStatus: 'available',
                updateInfo: info,
                bannerDismissed: false,
              });
              get().addLog({
                level: 'info',
                message: `Update available: v${update.version} (current: v${get().appVersion})`,
              });
              get().addToast({
                type: 'info',
                title: 'Update Available',
                message: `WiScripts v${update.version} is ready for download.`,
                actionLabel: 'Update Now',
                onAction: () => get().downloadAndInstallUpdate(),
              });
              return true;
            } else {
              set({ updateStatus: 'upToDate', updateInfo: null });
              if (!silent) {
                get().addLog({ level: 'info', message: 'Application is up to date.' });
                get().addToast({
                  type: 'success',
                  title: 'Up to Date',
                  message: `WiScripts v${get().appVersion} is currently the latest version.`,
                });
              }
              return false;
            }
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            set({ updateStatus: 'error', updateError: errMsg });
            if (!silent) {
              get().addLog({ level: 'error', message: `Update check failed: ${errMsg}` });
              get().addToast({
                type: 'error',
                title: 'Update Check Failed',
                message: errMsg || 'Unable to connect to update server.',
              });
            }
            return false;
          }
        },

        downloadAndInstallUpdate: async () => {
          set({ updateStatus: 'downloading', updateProgress: 0 });
          get().addLog({ level: 'cmd', message: 'Downloading & installing update package...' });
          try {
            const update = await check();
            if (!update) {
              const errMsg = 'No update package available for installation.';
              set({ updateStatus: 'error', updateError: errMsg });
              get().addLog({ level: 'error', message: `Download/install failed: ${errMsg}` });
              get().addToast({
                type: 'error',
                title: 'Update Installation Failed',
                message: errMsg,
              });
              return;
            }
            let downloaded = 0;
            let contentLength = 0;
            await update.downloadAndInstall((event: DownloadEvent) => {
              const eventType = event.event;
              const payload: any = (event as any).data || (event as any).payload;
              switch (eventType) {
                case 'Started':
                  contentLength = payload?.contentLength || 0;
                  break;
                case 'Progress':
                  downloaded += payload?.chunkLength || 0;
                  if (contentLength > 0) {
                    const percent = Math.round((downloaded / contentLength) * 100);
                    set({ updateProgress: percent });
                  }
                  break;
                case 'Finished':
                  set({ updateProgress: 100, updateStatus: 'ready' });
                  break;
              }
            });

            set({ updateStatus: 'ready' });
            get().addLog({ level: 'info', message: 'Update installation complete. Relaunching application...' });
            get().addToast({
              type: 'success',
              title: 'Update Installed',
              message: 'WiScripts is restarting to apply changes.',
            });

            await relaunch();
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            set({ updateStatus: 'error', updateError: errMsg });
            get().addLog({ level: 'error', message: `Download/install failed: ${errMsg}` });
            get().addToast({
              type: 'error',
              title: 'Update Installation Failed',
              message: errMsg,
            });
          }
        },

        // Toast Notification System
        toasts: [],
        addToast: (toast) => {
          const id = crypto.randomUUID();
          const newToast: ToastNotification = { ...toast, id };
          set((state) => ({ toasts: [...state.toasts, newToast] }));
          return id;
        },
        dismissToast: (id) => {
          set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
        },

        systemInfo: {
          osName: 'Windows 11 Pro',
          osVersion: '23H2',
          osBuild: '22631.3880',
          isElevated: true,
          cpuUsagePercent: 12,
          memoryUsedMb: 6144,
          memoryTotalMb: 16384,
          telemetryStatus: 'Active',
        },
        isElevated: true,
        isSystemLoading: false,
        checkElevation: async () => {
          try {
            const info = await invoke<SystemInfo>('get_system_info');
            set({ systemInfo: info, isElevated: info.isElevated });
            return info.isElevated;
          } catch (err) {
            return false;
          }
        },
        setSystemInfo: (info) => set({ systemInfo: info, isElevated: info.isElevated }),
        setSystemLoading: (loading) => set({ isSystemLoading: loading }),

        optimizations: DEFAULT_OPTIMIZATIONS,
        selectedCategory: 'all',
        searchQuery: '',
        setSelectedCategory: (cat) => set({ selectedCategory: cat }),
        setSearchQuery: (query) => set({ searchQuery: query }),
        toggleOptimizationSelected: (id) =>
          set((state) => ({
            optimizations: state.optimizations.map((item) =>
              item.id === id ? { ...item, isSelected: !item.isSelected } : item
            ),
          })),
        selectAllOptimizations: (category) =>
          set((state) => ({
            optimizations: state.optimizations.map((item) =>
              !category || category === 'all' || item.category === category
                ? { ...item, isSelected: true }
                : item
            ),
          })),
        deselectAllOptimizations: () =>
          set((state) => ({
            optimizations: state.optimizations.map((item) => ({ ...item, isSelected: false })),
          })),
        selectRecommendedOptimizations: () =>
          set((state) => ({
            optimizations: state.optimizations.map((item) => ({
              ...item,
              isSelected: item.isRecommended,
            })),
          })),
        selectTelemetryOnlyOptimizations: () =>
          set((state) => ({
            optimizations: state.optimizations.map((item) => ({
              ...item,
              isSelected: item.category === 'telemetry',
            })),
          })),
        applyPreset: (preset) =>
          set((state) => ({
            optimizations: state.optimizations.map((item) => {
              if (preset === 'recommended') {
                return { ...item, isSelected: item.isRecommended };
              } else if (preset === 'telemetry_only') {
                return { ...item, isSelected: item.category === 'telemetry' };
              } else if (preset === 'full_debloat') {
                return { ...item, isSelected: true };
              }
              return item;
            }),
          })),
        setOptimizations: (items) => set({ optimizations: items }),

        // Feature R1: Diagnostics
        runDiagnostics: async (action: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({
            level: 'cmd',
            message: `Invoking run_diagnostics: ${action} (dryRun: ${currentDryRun})`,
          });
          try {
            const summary = await invoke<ExecutionSummary>('run_diagnostics', {
              action,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Diagnostics ${action} finished: ${summary.success ? 'Success' : 'Failed'} (${summary.totalDurationMs}ms)`,
            });
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Diagnostics ${action} failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        // Feature R2: Package & Bloatware Manager
        wingetPackages: [],
        isWingetSearching: false,
        uwpApps: [],
        isUwpLoading: false,

        wingetSearch: async (query: string) => {
          set({ isWingetSearching: true });
          get().addLog({ level: 'cmd', message: `Searching Winget packages: "${query}"` });
          try {
            const pkgs = await invoke<WingetPackage[]>('winget_search', { query });
            set({ wingetPackages: pkgs });
            get().addLog({ level: 'info', message: `Found ${pkgs.length} packages for "${query}"` });
            return pkgs;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            get().addLog({ level: 'error', message: `Winget search failed: ${errMsg}` });
            set({ wingetPackages: [] });
            return [];
          } finally {
            set({ isWingetSearching: false });
          }
        },

        wingetInstall: async (packageId: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Installing Winget package "${packageId}" (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('winget_install', {
              packageId,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Winget install ${packageId} result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Winget install failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        wingetUpdate: async (packageId: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Updating Winget package "${packageId}" (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('winget_update', {
              packageId,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Winget update ${packageId} result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Winget update failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        fetchUwpApps: async () => {
          set({ isUwpLoading: true });
          get().addLog({ level: 'cmd', message: 'Querying installed UWP AppX packages' });
          try {
            const apps = await invoke<UwpAppInfo[]>('get_uwp_apps');
            set({ uwpApps: apps });
            get().addLog({ level: 'info', message: `Retrieved ${apps.length} UWP packages` });
            return apps;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            get().addLog({ level: 'error', message: `Fetch UWP apps failed: ${errMsg}` });
            set({ uwpApps: [] });
            return [];
          } finally {
            set({ isUwpLoading: false });
          }
        },

        removeUwpApp: async (packageFullName: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Removing UWP App: ${packageFullName} (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('remove_uwp_app', {
              packageFullName,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Remove UWP ${packageFullName} result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            if (summary.success && !currentDryRun) {
              set((state) => ({
                uwpApps: state.uwpApps.filter((a) => a.packageFullName !== packageFullName),
              }));
            }
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Remove UWP app failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        // Feature R3: Optimization Presets / Profiles
        optimizationProfiles: [],
        isLoadingProfiles: false,

        fetchOptimizationProfiles: async () => {
          set({ isLoadingProfiles: true });
          get().addLog({ level: 'cmd', message: 'Fetching optimization profiles' });
          try {
            const profiles = await invoke<OptimizationProfile[]>('get_optimization_profiles');
            set({ optimizationProfiles: profiles });
            get().addLog({ level: 'info', message: `Loaded ${profiles.length} optimization profiles` });
            return profiles;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            get().addLog({ level: 'error', message: `Fetch profiles failed: ${errMsg}` });
            set({ optimizationProfiles: [] });
            return [];
          } finally {
            set({ isLoadingProfiles: false });
          }
        },

        applyOptimizationProfile: async (profileId: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Applying optimization profile "${profileId}" (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('apply_optimization_profile', {
              profileId,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Profile ${profileId} applied: ${summary.success ? 'Success' : 'Failed'} (${summary.executedActions.length} actions)`,
            });
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Apply profile failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        // Feature R4: DNS & Context Menu Manager
        classicContextMenuEnabled: false,
        isContextMenuLoading: false,
        selectedDnsProvider: 'adguard',

        setSelectedDnsProvider: (provider: string) => set({ selectedDnsProvider: provider }),

        setDnsServer: async (provider: string, interfaceAlias?: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({
            level: 'cmd',
            message: `Setting DNS provider: ${provider} (interface: ${interfaceAlias || 'All Active'}, dryRun: ${currentDryRun})`,
          });
          try {
            const summary = await invoke<ExecutionSummary>('set_dns_server', {
              provider,
              interfaceAlias: interfaceAlias || null,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Set DNS server (${provider}) completed: ${summary.success ? 'Success' : 'Failed'}`,
            });
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Set DNS server failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        fetchClassicContextMenuStatus: async () => {
          set({ isContextMenuLoading: true });
          try {
            const status = await invoke<boolean>('get_classic_context_menu_status');
            set({ classicContextMenuEnabled: status });
            get().addLog({ level: 'info', message: `Classic context menu active: ${status}` });
            return status;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            get().addLog({ level: 'error', message: `Fetch classic context menu status failed: ${errMsg}` });
            return false;
          } finally {
            set({ isContextMenuLoading: false });
          }
        },

        toggleClassicContextMenu: async (enable: boolean, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Toggling classic context menu: ${enable} (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('toggle_classic_context_menu', {
              enable,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Toggle classic context menu (${enable}) result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            if (summary.success && !currentDryRun) {
              set({ classicContextMenuEnabled: enable });
            }
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Toggle classic context menu failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        // Feature R5: Driver Backup
        driverBackupPath: 'C:\\DriverBackup',
        isDriverBackupLoading: false,
        setDriverBackupPath: (path: string) => set({ driverBackupPath: path }),

        backupDrivers: async (outputDir: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Exporting drivers to "${outputDir}" (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('backup_drivers', {
              outputDir,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Driver export to "${outputDir}" result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Backup drivers failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        // Feature System Restore
        restorePoints: [],
        isLoadingRestorePoints: false,

        fetchRestorePoints: async () => {
          set({ isLoadingRestorePoints: true });
          get().addLog({ level: 'cmd', message: 'Fetching System Restore Points' });
          try {
            const points = await invoke<RestorePoint[]>('get_restore_points');
            set({ restorePoints: points });
            get().addLog({ level: 'info', message: `Retrieved ${points.length} system restore points` });
            return points;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            get().addLog({ level: 'error', message: `Fetch restore points failed: ${errMsg}` });
            set({ restorePoints: [] });
            return [];
          } finally {
            set({ isLoadingRestorePoints: false });
          }
        },

        createRestorePoint: async (description: string, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Creating restore point "${description}" (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('create_restore_point', {
              description,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Create restore point ("${description}") result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            if (summary.success) {
              await get().fetchRestorePoints();
            }
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `Create restore point failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        restoreSystemToPoint: async (sequenceNumber: number, dryRun?: boolean) => {
          const currentDryRun = dryRun ?? get().dryRunMode;
          const { addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Restoring system to point #${sequenceNumber} (dryRun: ${currentDryRun})` });
          try {
            const summary = await invoke<ExecutionSummary>('restore_system_point', {
              sequenceNumber,
              dryRun: currentDryRun,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `System restore to #${sequenceNumber} result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            return summary;
          } catch (err) {
            const errMsg = typeof err === 'string' ? err : String(err);
            addLog({ level: 'error', message: `System restore to #${sequenceNumber} failed: ${errMsg}` });
            return null;
          } finally {
            setIsExecuting(false);
          }
        },

        odtConfig: {
          architecture: 'x64',
          channel: 'Current',
          products: ['O365ProPlusRetail'],
          excludedApps: [],
          language: 'en-us',
          removeExistingOffice: true,
          acceptEula: true,
        },
        updateOdtConfig: (patch) =>
          set((state) => ({ odtConfig: { ...state.odtConfig, ...patch } })),
        generatedXml: '',
        setGeneratedXml: (xml) => set({ generatedXml: xml }),

        selectedMasMethod: 'HWID',
        setSelectedMasMethod: (method) => set({ selectedMasMethod: method }),

        isExecuting: false,
        setIsExecuting: (executing) => set({ isExecuting: executing }),
        executionProgress: 0,
        currentStep: 0,
        totalSteps: 0,
        setCurrentProgress: (currentStep, totalSteps) => set({ currentStep, totalSteps }),
        setExecutionProgress: (percent) => set({ executionProgress: percent }),
        logs: [],
        addLog: (log) =>
          set((state) => ({
            logs: [
              ...state.logs,
              {
                ...log,
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
              },
            ],
          })),
        clearLogs: () => set({ logs: [] }),

        pendingSafetyModal: null,
        openSafetyModal: (modal) =>
          set({
            pendingSafetyModal: { ...modal, isOpen: true },
          }),
        closeSafetyModal: () => set({ pendingSafetyModal: null }),

        // Milestone 3: Real-time Metrics & Hardware Sensors
        metricsHistory: [],
        currentMetrics: null,
        isPollingActive: true,
        pollingIntervalMs: 2000,
        setPollingIntervalMs: (interval) => set({ pollingIntervalMs: interval }),
        togglePollingActive: () => set((state) => ({ isPollingActive: !state.isPollingActive })),
        pushMetricSnapshot: (snapshot) =>
          set((state) => ({
            currentMetrics: snapshot,
            metricsHistory: [...state.metricsHistory, snapshot].slice(-30),
          })),
        fetchLatestMetrics: async () => {
          try {
            const metricsPayload = await invoke<SystemMetricsPayload>('get_system_metrics');
            const tempsPayload = await invoke<SystemTemperaturesPayload>('get_system_temperatures');

            const getThermalStatus = (temp: number | null): ThermalStatus => {
              if (temp === null) return 'unknown';
              if (temp > 80) return 'hot';
              if (temp >= 65) return 'warm';
              return 'normal';
            };

            const snapshot: MetricSnapshot = {
              timestamp: metricsPayload.timestampMs || Date.now(),
              cpuUsagePercent: metricsPayload.cpuUsagePercent,
              memoryUsedMb: metricsPayload.memoryUsedMb,
              memoryTotalMb: metricsPayload.memoryTotalMb,
              memoryUsagePercent: metricsPayload.memoryUsagePercent,
              diskReadBytesPerSec: metricsPayload.diskReadBytesPerSec,
              diskWriteBytesPerSec: metricsPayload.diskWriteBytesPerSec,
              networkRxBytesPerSec: metricsPayload.networkRxBytesPerSec,
              networkTxBytesPerSec: metricsPayload.networkTxBytesPerSec,
              cpuTempC: tempsPayload.cpuTempCelsius,
              gpuTempC: tempsPayload.gpuTempCelsius,
              cpuThermalStatus: getThermalStatus(tempsPayload.cpuTempCelsius),
              gpuThermalStatus: getThermalStatus(tempsPayload.gpuTempCelsius),
            };

            get().pushMetricSnapshot(snapshot);
            return snapshot;
          } catch (e) {
            const ramUsed = Math.floor(4000 + Math.random() * 1500);
            const ramTotal = 16384;
            const simSnapshot: MetricSnapshot = {
              timestamp: Date.now(),
              cpuUsagePercent: Math.floor(10 + Math.random() * 25),
              memoryUsedMb: ramUsed,
              memoryTotalMb: ramTotal,
              memoryUsagePercent: (ramUsed / ramTotal) * 100,
              diskReadBytesPerSec: Math.floor(Math.random() * 5000000),
              diskWriteBytesPerSec: Math.floor(Math.random() * 2000000),
              networkRxBytesPerSec: Math.floor(Math.random() * 1000000),
              networkTxBytesPerSec: Math.floor(Math.random() * 300000),
              cpuTempC: Math.floor(45 + Math.random() * 15),
              gpuTempC: Math.floor(40 + Math.random() * 12),
              cpuThermalStatus: 'normal',
              gpuThermalStatus: 'normal',
            };
            get().pushMetricSnapshot(simSnapshot);
            return simSnapshot;
          }
        },

        // Milestone 3: Startup Apps Manager
        startupItems: [],
        isStartupLoading: false,
        fetchStartupItems: async () => {
          set({ isStartupLoading: true });
          try {
            const items = await invoke<StartupItem[]>('get_startup_items', {
              dryRun: get().dryRunMode,
            });
            set({ startupItems: items, isStartupLoading: false });
            return items;
          } catch (e) {
            set({ isStartupLoading: false });
            return [];
          }
        },
        toggleStartupItem: async (id, arg2, arg3, arg4) => {
          let enable = false;
          let valueName: string | undefined = undefined;
          let location: string | undefined = undefined;

          if (typeof arg2 === 'boolean') {
            enable = arg2;
            const item = get().startupItems.find((i) => i.id === id);
            if (item) {
              valueName = item.valueName || item.name;
              location = item.location;
            }
          } else {
            valueName = arg2;
            location = arg3;
            enable = arg4 ?? false;
          }

          try {
            const summary = await invoke<ExecutionSummary>('toggle_startup_item', {
              id,
              valueName,
              location,
              enable,
              dryRun: get().dryRunMode,
            });
            await get().fetchStartupItems();
            return summary;
          } catch (e) {
            get().addToast({ type: 'error', title: 'Toggle Startup App Failed', message: String(e) });
            return null;
          }
        },
        removeStartupItem: async (id, valueNameArg, locationArg) => {
          let valueName = valueNameArg;
          let location = locationArg;

          if (!valueName || !location) {
            const item = get().startupItems.find((i) => i.id === id);
            if (item) {
              valueName = valueName || item.valueName || item.name;
              location = location || item.location;
            }
          }

          try {
            const summary = await invoke<ExecutionSummary>('remove_startup_item', {
              id,
              valueName,
              location,
              dryRun: get().dryRunMode,
            });
            await get().fetchStartupItems();
            return summary;
          } catch (e) {
            get().addToast({ type: 'error', title: 'Remove Startup App Failed', message: String(e) });
            return null;
          }
        },

        // Milestone 3: Task Scheduler Background Tasks
        scheduledTasks: [],
        isSchedulerLoading: false,
        fetchScheduledTasks: async () => {
          set({ isSchedulerLoading: true });
          try {
            const tasks = await invoke<ScheduledTaskItem[]>('get_scheduled_tasks', {
              dryRun: get().dryRunMode,
            });
            set({ scheduledTasks: tasks, isSchedulerLoading: false });
            return tasks;
          } catch (e) {
            set({ isSchedulerLoading: false });
            return [];
          }
        },
        toggleScheduledTask: async (taskName, taskPath, enable) => {
          try {
            const summary = await invoke<ExecutionSummary>('toggle_scheduled_task', {
              taskName,
              taskPath,
              enable,
              dryRun: get().dryRunMode,
            });
            await get().fetchScheduledTasks();
            return summary;
          } catch (e) {
            get().addToast({ type: 'error', title: 'Toggle Task Failed', message: String(e) });
            return null;
          }
        },
        runScheduledTask: async (taskName, taskPath) => {
          try {
            const summary = await invoke<ExecutionSummary>('run_scheduled_task', {
              taskName,
              taskPath,
              dryRun: get().dryRunMode,
            });
            get().addToast({
              type: 'success',
              title: 'Task Execution Triggered',
              message: `Triggered '${taskName}' successfully.`,
            });
            await get().fetchScheduledTasks();
            return summary;
          } catch (e) {
            get().addToast({ type: 'error', title: 'Run Task Failed', message: String(e) });
            return null;
          }
        },
      }),
      {
        name: 'wiscripts-app-store',
        partialize: (state) => ({
          dryRunMode: state.dryRunMode,
          autoCheckUpdates: state.autoCheckUpdates,
          odtConfig: state.odtConfig,
          selectedMasMethod: state.selectedMasMethod,
          driverBackupPath: state.driverBackupPath,
          selectedDnsProvider: state.selectedDnsProvider,
        }),
      }
    )
  )
);



import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
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

  // System Info State
  systemInfo: SystemInfo | null;
  isSystemLoading: boolean;
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
  runDiagnostics: (action: string) => Promise<ExecutionSummary | null>;

  // Feature R2: Package & Bloatware Manager
  wingetPackages: WingetPackage[];
  isWingetSearching: boolean;
  uwpApps: UwpAppInfo[];
  isUwpLoading: boolean;
  wingetSearch: (query: string) => Promise<WingetPackage[]>;
  wingetInstall: (packageId: string) => Promise<ExecutionSummary | null>;
  wingetUpdate: (packageId: string) => Promise<ExecutionSummary | null>;
  fetchUwpApps: () => Promise<UwpAppInfo[]>;
  removeUwpApp: (packageFullName: string) => Promise<ExecutionSummary | null>;

  // Feature R3: Optimization Presets / Profiles
  optimizationProfiles: OptimizationProfile[];
  isLoadingProfiles: boolean;
  fetchOptimizationProfiles: () => Promise<OptimizationProfile[]>;
  applyOptimizationProfile: (profileId: string) => Promise<ExecutionSummary | null>;

  // Feature R4: DNS & Context Menu Manager
  classicContextMenuEnabled: boolean;
  isContextMenuLoading: boolean;
  selectedDnsProvider: string;
  setSelectedDnsProvider: (provider: string) => void;
  setDnsServer: (provider: string, interfaceAlias?: string) => Promise<ExecutionSummary | null>;
  fetchClassicContextMenuStatus: () => Promise<boolean>;
  toggleClassicContextMenu: (enable: boolean) => Promise<ExecutionSummary | null>;

  // Feature R5: Driver Backup
  driverBackupPath: string;
  setDriverBackupPath: (path: string) => void;
  backupDrivers: (outputDir: string) => Promise<ExecutionSummary | null>;

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
        dryRunMode: true,
        setDryRunMode: (enabled) => set({ dryRunMode: enabled }),
        activeTab: 'dashboard',
        setActiveTab: (tab) => set({ activeTab: tab }),

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
        isSystemLoading: false,
        setSystemInfo: (info) => set({ systemInfo: info }),
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
        runDiagnostics: async (action: string) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({
            level: 'cmd',
            message: `Invoking run_diagnostics: ${action} (dryRun: ${dryRunMode})`,
          });
          try {
            const summary = await invoke<ExecutionSummary>('run_diagnostics', {
              action,
              dryRun: dryRunMode,
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

        wingetInstall: async (packageId: string) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Installing Winget package "${packageId}" (dryRun: ${dryRunMode})` });
          try {
            const summary = await invoke<ExecutionSummary>('winget_install', {
              packageId,
              dryRun: dryRunMode,
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

        wingetUpdate: async (packageId: string) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Updating Winget package "${packageId}" (dryRun: ${dryRunMode})` });
          try {
            const summary = await invoke<ExecutionSummary>('winget_update', {
              packageId,
              dryRun: dryRunMode,
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

        removeUwpApp: async (packageFullName: string) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Removing UWP App: ${packageFullName} (dryRun: ${dryRunMode})` });
          try {
            const summary = await invoke<ExecutionSummary>('remove_uwp_app', {
              packageFullName,
              dryRun: dryRunMode,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Remove UWP ${packageFullName} result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            if (summary.success && !dryRunMode) {
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

        applyOptimizationProfile: async (profileId: string) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Applying optimization profile "${profileId}" (dryRun: ${dryRunMode})` });
          try {
            const summary = await invoke<ExecutionSummary>('apply_optimization_profile', {
              profileId,
              dryRun: dryRunMode,
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

        setDnsServer: async (provider: string, interfaceAlias?: string) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({
            level: 'cmd',
            message: `Setting DNS provider: ${provider} (interface: ${interfaceAlias || 'All Active'}, dryRun: ${dryRunMode})`,
          });
          try {
            const summary = await invoke<ExecutionSummary>('set_dns_server', {
              provider,
              interfaceAlias: interfaceAlias || null,
              dryRun: dryRunMode,
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

        toggleClassicContextMenu: async (enable: boolean) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Toggling classic context menu: ${enable} (dryRun: ${dryRunMode})` });
          try {
            const summary = await invoke<ExecutionSummary>('toggle_classic_context_menu', {
              enable,
              dryRun: dryRunMode,
            });
            addLog({
              level: summary.success ? 'info' : 'error',
              message: `Toggle classic context menu (${enable}) result: ${summary.success ? 'Success' : 'Failed'}`,
            });
            if (summary.success && !dryRunMode) {
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
        setDriverBackupPath: (path: string) => set({ driverBackupPath: path }),

        backupDrivers: async (outputDir: string) => {
          const { dryRunMode, addLog, setIsExecuting } = get();
          setIsExecuting(true);
          addLog({ level: 'cmd', message: `Exporting drivers to "${outputDir}" (dryRun: ${dryRunMode})` });
          try {
            const summary = await invoke<ExecutionSummary>('backup_drivers', {
              outputDir,
              dryRun: dryRunMode,
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
      }),
      {
        name: 'wiscripts-app-store',
        partialize: (state) => ({
          dryRunMode: state.dryRunMode,
          odtConfig: state.odtConfig,
          selectedMasMethod: state.selectedMasMethod,
          driverBackupPath: state.driverBackupPath,
          selectedDnsProvider: state.selectedDnsProvider,
        }),
      }
    )
  )
);


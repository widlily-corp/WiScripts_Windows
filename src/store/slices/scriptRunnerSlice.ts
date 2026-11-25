import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AppState } from '../useAppStore';
import type {
  CommandOutput,
  ScriptsLibraryManifest,
  ScriptManifestEntry,
  ScriptCategory,
  ScriptRiskLevel,
  ScriptParameterValue,
} from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { exportLiveOutputLogs } from '../../utils/scriptLogExporter';
import {
  formatScriptWithParameters,
  buildInitialParameterValues,
} from '../../utils/scriptParameters';
import {
  loadPersistedExecutionHistory,
  savePersistedExecutionHistory,
} from '../../utils/historyStorage';

export { formatScriptWithParameters };

export interface ScriptOutputLine {
  id: string;
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface ScriptOutputLinePayload {
  line: string;
  stream: 'stdout' | 'stderr';
}

let scriptOutputSetupPromise: Promise<UnlistenFn> | null = null;
let scriptOutputHasViewSubscriber = false;
let scriptOutputPendingCleanup = false;

export type ExecutionStatus = 'success' | 'failed' | 'cancelled';

export interface ScriptExecutionRecord {
  id: string;
  scriptId?: string;
  scriptName: string;
  scriptType: 'ps1' | 'bat' | 'cmd';
  timestamp: string; // ISO 8601
  durationMs: number;
  exitCode: number;
  status: ExecutionStatus;
  elevated: boolean;
  isDryRun: boolean;
  rawContent: string;
  parameters?: Record<string, ScriptParameterValue>;
  logLines: ScriptOutputLine[];
}

export const MAX_HISTORY_ENTRIES = 50;
export const MAX_HISTORY_LOG_LINES = 300;

export interface ExecuteScriptOptions {
  runAsAdmin?: boolean;
  dryRun?: boolean;
  timeoutSeconds?: number;
  scriptId?: string;
  scriptName?: string;
  parameters?: Record<string, ScriptParameterValue>;
}

export interface ScriptRunnerSlice {
  scriptContent: string;
  scriptType: 'ps1' | 'bat' | 'cmd';
  uploadedFileName: string | null;
  outputLogs: ScriptOutputLine[];
  isExecutingScript: boolean;
  isElevatedRunning: boolean;
  activeExecutionId: string | null;
  isCancellingScript: boolean;
  executionStartTime: number | null;
  unlistenScriptOutput: UnlistenFn | null;

  // Editor Elevation State
  editorRunAsAdmin: boolean;
  setEditorRunAsAdmin: (runAsAdmin: boolean) => void;
  defaultRunAsAdmin?: boolean;
  setDefaultRunAsAdmin?: (enabled: boolean) => void;

  // Online Library State
  libraryManifest: ScriptsLibraryManifest | null;
  isLoadingLibrary: boolean;
  libraryError: string | null;
  lastSyncTimestamp: string | null;
  activeRunnerTab: 'editor' | 'library' | 'history';
  librarySelectedCategory: ScriptCategory;
  librarySearchQuery: string;
  librarySelectedRisk: 'all' | ScriptRiskLevel;
  previewScript: ScriptManifestEntry | null;
  previewContent: string | null;
  isLoadingPreview: boolean;

  // Parameter Configuration Dialog State
  parameterDialogScript: ScriptManifestEntry | null;
  parameterValues: Record<string, ScriptParameterValue>;
  parameterValidationErrors: Record<string, string>;
  parameterRunAsAdmin: boolean;
  setParameterRunAsAdmin: (runAsAdmin: boolean) => void;

  // Execution History State & Actions
  executionHistory: ScriptExecutionRecord[];
  hydrateExecutionHistory: () => Promise<void>;
  addHistoryEntry: (entry: ScriptExecutionRecord) => void;
  clearHistory: () => void;
  deleteHistoryEntry: (id: string) => void;
  rerunHistoryEntry: (record: ScriptExecutionRecord) => Promise<void>;

  // Impact Simulator State & Actions
  isImpactSimulatorOpen: boolean;
  impactSimulatorScript: ScriptManifestEntry | null;
  impactSimulatorContent: string | null;
  openImpactSimulator: (script?: ScriptManifestEntry, customContent?: string) => Promise<void>;
  closeImpactSimulator: () => void;

  // Actions
  setScriptContent: (content: string) => void;
  setScriptType: (type: 'ps1' | 'bat' | 'cmd') => void;
  setUploadedFileName: (name: string | null) => void;
  addOutputLine: (payload: { line: string; stream: 'stdout' | 'stderr' }) => void;
  clearOutputLogs: () => void;
  executeScript: (
    customContent?: string,
    customType?: 'ps1' | 'bat' | 'cmd',
    runAsAdminOrOptions?: boolean | ExecuteScriptOptions
  ) => Promise<CommandOutput | null>;
  cancelRunningScript: () => Promise<void>;
  cancelCurrentScript: () => Promise<void>;
  downloadOutputLog: () => void;
  setupScriptOutputListener: () => Promise<UnlistenFn>;
  cleanupScriptOutputListener: () => void;

  // Library Actions
  setActiveRunnerTab: (tab: 'editor' | 'library' | 'history') => void;
  setLibrarySelectedCategory: (category: ScriptCategory) => void;
  setLibrarySearchQuery: (query: string) => void;
  setLibrarySelectedRisk: (risk: 'all' | ScriptRiskLevel) => void;
  fetchLibrary: (force?: boolean) => Promise<void>;
  openScriptPreview: (script: ScriptManifestEntry) => Promise<void>;
  closeScriptPreview: () => void;
  loadScriptToEditor: (script: ScriptManifestEntry) => Promise<void>;
  runLibraryScriptDirectly: (
    script: ScriptManifestEntry,
    runAsAdminOrOptions?: boolean | ExecuteScriptOptions
  ) => Promise<void>;

  // Parameter Dialog Actions
  openParameterDialog: (script: ScriptManifestEntry, initialRunAsAdmin?: boolean) => void;
  closeParameterDialog: () => void;
  setParameterValue: (paramName: string, value: ScriptParameterValue) => void;
  resetParameterValues: () => void;
  validateParameters: () => boolean;
  executeScriptWithParameters: (
    script: ScriptManifestEntry,
    values?: Record<string, ScriptParameterValue>,
    runAsAdminOrOptions?: boolean | ExecuteScriptOptions
  ) => Promise<CommandOutput | null>;
}

/**
 * Detects whether a string contains a progress percentage pattern,
 * such as "50%", "[*] 50%", or "[======] 50%".
 */
export function hasPercentagePattern(line: string): boolean {
  return /(?:\[.*?\]\s*)?\b\d{1,3}(?:\.\d+)?%/.test(line);
}

/**
 * Detects whether a string contains an ASCII/Unicode progress bar pattern,
 * e.g. "[====>   ]", "[#####   ]", "[------  ]".
 */
export function hasProgressBarPattern(line: string): boolean {
  return /\[[=#>*\- ]{3,}\]/.test(line);
}

/**
 * Extracts a process/task prefix from a line up to the start of progress markers or percentages.
 */
export function extractProcessPrefix(line: string): string {
  const percentIdx = line.search(/(?:\[.*?\]\s*)?\b\d{1,3}(?:\.\d+)?%/);
  if (percentIdx > 0) {
    return line.substring(0, percentIdx).trim();
  }
  const barIdx = line.search(/\[[=#>*\- ]{3,}\]/);
  if (barIdx > 0) {
    return line.substring(0, barIdx).trim();
  }
  return '';
}

/**
 * Normalizes a line to compare progress structure by replacing volatile counters/bars.
 */
export function normalizeProgressPattern(line: string): string {
  return line
    .replace(/\[[=#>*\- ]{3,}\]/g, '[BAR]')
    .replace(/(?:\[.*?\]\s*)?\b\d{1,3}(?:\.\d+)?%/g, '%')
    .replace(/\b\d+(?:\.\d+)?\s*(?:MB|GB|KB|B)\b/gi, 'SIZE')
    .replace(/\b\d+(?:\.\d+)?\s*(?:MB\/s|KB\/s|GB\/s|B\/s)\b/gi, 'SPEED')
    .replace(/\d+/g, '#')
    .trim();
}

/**
 * Determines whether the incoming line represents an in-place progress update
 * of the immediately preceding output line.
 */
export function isProgressUpdate(
  prevLine: string,
  nextLine: string,
  streamMatches: boolean,
  hasCarriageReturn: boolean
): boolean {
  if (!streamMatches) {
    return false;
  }

  // 1. Explicit carriage return indicates in-place update
  if (hasCarriageReturn) {
    return true;
  }

  const p = prevLine.trim();
  const n = nextLine.trim();

  if (!p || !n) {
    return false;
  }

  const pHasPct = hasPercentagePattern(p);
  const nHasPct = hasPercentagePattern(n);
  const pHasBar = hasProgressBarPattern(p);
  const nHasBar = hasProgressBarPattern(n);

  const pIsProgress = pHasPct || pHasBar;
  const nIsProgress = nHasPct || nHasBar;

  if (pIsProgress && nIsProgress) {
    // Check 1: Normalized structure matches
    if (normalizeProgressPattern(p) === normalizeProgressPattern(n)) {
      return true;
    }

    // Check 2: Same non-empty process prefix
    const pPrefix = extractProcessPrefix(p);
    const nPrefix = extractProcessPrefix(n);
    if (pPrefix.length >= 3 && pPrefix.toLowerCase() === nPrefix.toLowerCase()) {
      return true;
    }

    // Check 3: Common prefix before progress
    if ((pHasBar && nHasBar) || (pHasPct && nHasPct)) {
      let commonPrefixLen = 0;
      const minLen = Math.min(p.length, n.length);
      while (commonPrefixLen < minLen && p[commonPrefixLen] === n[commonPrefixLen]) {
        commonPrefixLen++;
      }
      if (commonPrefixLen >= 4 && /[a-zA-Z]/.test(p.substring(0, commonPrefixLen))) {
        return true;
      }
    }
  }

  return false;
}

const MAX_SCRIPT_LOG_LINES = 2000;

const DEFAULT_SCRIPT_CONTENT = `# WiScripts Windows Custom PowerShell Script
# Runs with elevated Administrator privileges

Write-Host "Initializing WiScripts System Diagnostic Check..." -ForegroundColor Cyan
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsArchitecture | Format-Table -AutoSize
Write-Host "Diagnostic completed successfully." -ForegroundColor Green
`;

export const createScriptRunnerSlice: StateCreator<AppState, [], [], ScriptRunnerSlice> = (set, get) => {
  const ensureScriptOutputListener = async (): Promise<UnlistenFn> => {
    const currentUnlisten = get().unlistenScriptOutput;
    if (currentUnlisten) {
      return currentUnlisten;
    }
    if (scriptOutputSetupPromise) {
      return scriptOutputSetupPromise;
    }

    scriptOutputSetupPromise = (async () => {
      try {
        const unlisten = await listen<ScriptOutputLinePayload>('script-output-line', (event) => {
          get().addOutputLine(event.payload);
        });

        if (scriptOutputPendingCleanup && !get().isExecutingScript && !scriptOutputHasViewSubscriber) {
          unlisten();
          const noop: UnlistenFn = () => {};
          return noop;
        }

        set({ unlistenScriptOutput: unlisten });
        return unlisten;
      } catch (err) {
        console.warn('[ScriptRunner] Could not set up Tauri event listener (web/mock environment):', err);
        const dummyUnlisten: UnlistenFn = () => {};
        if (!(scriptOutputPendingCleanup && !get().isExecutingScript && !scriptOutputHasViewSubscriber)) {
          set({ unlistenScriptOutput: dummyUnlisten });
        }
        return dummyUnlisten;
      } finally {
        scriptOutputSetupPromise = null;
      }
    })();

    return scriptOutputSetupPromise;
  };

  return {
  scriptContent: DEFAULT_SCRIPT_CONTENT,
  scriptType: 'ps1',
  uploadedFileName: null,
  outputLogs: [],
  isExecutingScript: false,
  isElevatedRunning: false,
  activeExecutionId: null,
  isCancellingScript: false,
  executionStartTime: null,
  unlistenScriptOutput: null,

  // Editor Elevation State
  editorRunAsAdmin: false,
  setEditorRunAsAdmin: (runAsAdmin) => set({ editorRunAsAdmin: runAsAdmin }),
  defaultRunAsAdmin: false,
  setDefaultRunAsAdmin: (enabled) => set({ defaultRunAsAdmin: enabled, editorRunAsAdmin: enabled }),

  // Online Library initial state
  libraryManifest: null,
  isLoadingLibrary: false,
  libraryError: null,
  lastSyncTimestamp: null,
  activeRunnerTab: 'editor',
  librarySelectedCategory: 'all',
  librarySearchQuery: '',
  librarySelectedRisk: 'all',
  previewScript: null,
  previewContent: null,
  isLoadingPreview: false,

  // Execution History initial state
  executionHistory: [],

  // Impact Simulator initial state
  isImpactSimulatorOpen: false,
  impactSimulatorScript: null,
  impactSimulatorContent: null,

  // Parameter Configuration Dialog State
  parameterDialogScript: null,
  parameterValues: {},
  parameterValidationErrors: {},
  parameterRunAsAdmin: false,
  setParameterRunAsAdmin: (runAsAdmin) => set({ parameterRunAsAdmin: runAsAdmin }),

  // Execution History Actions
  hydrateExecutionHistory: async () => {
    const persisted = await loadPersistedExecutionHistory();
    if (persisted.length === 0) return;
    set((state) => {
      const existing = state.executionHistory || [];
      const seen = new Set(existing.map((e) => e.id));
      const merged = [
        ...existing,
        ...persisted.filter((e) => !seen.has(e.id)),
      ].slice(0, MAX_HISTORY_ENTRIES);
      return { executionHistory: merged };
    });
  },
  addHistoryEntry: (entry) => {
    const boundedEntry: ScriptExecutionRecord = {
      ...entry,
      logLines: (entry.logLines || []).slice(-MAX_HISTORY_LOG_LINES),
    };
    set((state) => {
      const next = [boundedEntry, ...(state.executionHistory || [])].slice(0, MAX_HISTORY_ENTRIES);
      void savePersistedExecutionHistory(next);
      return { executionHistory: next };
    });
  },
  clearHistory: () => {
    void savePersistedExecutionHistory([]);
    set({ executionHistory: [] });
  },
  deleteHistoryEntry: (id) =>
    set((state) => {
      const next = (state.executionHistory || []).filter((e) => e.id !== id);
      void savePersistedExecutionHistory(next);
      return { executionHistory: next };
    }),
  rerunHistoryEntry: async (record) => {
    set({
      scriptContent: record.rawContent,
      scriptType: record.scriptType,
      uploadedFileName: record.scriptName,
      activeRunnerTab: 'editor',
      editorRunAsAdmin: record.elevated,
    });
    await get().executeScript(record.rawContent, record.scriptType, {
      runAsAdmin: record.elevated,
      dryRun: record.isDryRun,
      scriptId: record.scriptId,
      scriptName: record.scriptName,
      parameters: record.parameters,
    });
  },

  // Impact Simulator Actions
  openImpactSimulator: async (script, customContent) => {
    if (script && !customContent) {
      try {
        const code = await invoke<string>('read_library_script', { scriptId: script.id });
        const cleanCode = (code || '').replace(/^\uFEFF+/, '');
        set({
          impactSimulatorScript: script,
          impactSimulatorContent: cleanCode,
          isImpactSimulatorOpen: true,
        });
      } catch (err) {
        get().addToast({
          type: 'error',
          title: 'Impact Simulator Error',
          message: `Could not load script code: ${getErrorMessage(err)}`,
        });
      }
    } else {
      set({
        impactSimulatorScript: script || null,
        impactSimulatorContent: customContent || get().scriptContent,
        isImpactSimulatorOpen: true,
      });
    }
  },
  closeImpactSimulator: () => {
    set({
      isImpactSimulatorOpen: false,
      impactSimulatorScript: null,
      impactSimulatorContent: null,
    });
  },

  setScriptContent: (content) => set({ scriptContent: content }),
  setScriptType: (type) => set({ scriptType: type }),
  setUploadedFileName: (name) => set({ uploadedFileName: name }),

  addOutputLine: (payload) => {
    const rawLine = payload.line ?? '';
    const rawHasCarriageReturn = rawLine.includes('\r');

    // Extract the latest segment if \r is present in incoming payload
    let cleanLine = rawLine;
    if (rawHasCarriageReturn) {
      const parts = rawLine.split('\r').filter((p) => p.length > 0);
      cleanLine = parts.length > 0 ? parts[parts.length - 1] : '';
    }

    // Strip trailing \n or \r if any
    cleanLine = cleanLine.replace(/[\r\n]+$/, '');

    // Skip empty updates that have no text and were purely carriage returns
    if (!cleanLine && rawHasCarriageReturn) {
      return;
    }

    const timestamp = new Date().toLocaleTimeString();

    set((state) => {
      const logs = state.outputLogs;
      const lastEntry = logs.length > 0 ? logs[logs.length - 1] : null;

      if (
        lastEntry &&
        isProgressUpdate(
          lastEntry.line,
          cleanLine,
          lastEntry.stream === payload.stream,
          rawHasCarriageReturn
        )
      ) {
        // In-place replacement of the progress line
        const updatedLogs = [...logs];
        updatedLogs[updatedLogs.length - 1] = {
          ...lastEntry,
          line: cleanLine,
          timestamp,
        };
        return { outputLogs: updatedLogs };
      }

      // Standard line append
      const newEntry: ScriptOutputLine = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        line: cleanLine,
        stream: payload.stream,
        timestamp,
      };

      return {
        outputLogs: [...logs, newEntry].slice(-MAX_SCRIPT_LOG_LINES),
      };
    });
  },

  clearOutputLogs: () => set({ outputLogs: [] }),

  setupScriptOutputListener: async () => {
    scriptOutputHasViewSubscriber = true;
    scriptOutputPendingCleanup = false;
    return ensureScriptOutputListener();
  },

  cleanupScriptOutputListener: () => {
    scriptOutputHasViewSubscriber = false;
    if (get().isExecutingScript) {
      // Keep log capture active while a script is running; executeScript's finally cleans up if unmounted.
      scriptOutputPendingCleanup = true;
      return;
    }

    scriptOutputPendingCleanup = true;
    const unlisten = get().unlistenScriptOutput;
    if (unlisten) {
      unlisten();
      set({ unlistenScriptOutput: null });
    }
  },

  executeScript: async (customContent, customType, runAsAdminOrOptions) => {
    const { dryRunMode, addLog, addToast, editorRunAsAdmin } = get();
    const rawContent = customContent ?? get().scriptContent;
    const content = (rawContent || '').replace(/^\uFEFF+/, '');
    const type = customType ?? get().scriptType;
    const optionsObj = typeof runAsAdminOrOptions === 'object' ? runAsAdminOrOptions : undefined;

    const shouldElevate = typeof runAsAdminOrOptions === 'boolean'
      ? runAsAdminOrOptions
      : optionsObj?.runAsAdmin !== undefined
        ? Boolean(optionsObj.runAsAdmin)
        : Boolean(editorRunAsAdmin);

    const isDryRun = optionsObj?.dryRun !== undefined
      ? optionsObj.dryRun
      : dryRunMode;

    const timeoutSeconds = optionsObj?.timeoutSeconds !== undefined
      ? optionsObj.timeoutSeconds
      : 300;

    if (!content || !content.trim()) {
      addToast({
        type: 'warning',
        title: 'Empty Script',
        message: 'Please enter or upload script code before executing.',
      });
      return null;
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const scriptName = optionsObj?.scriptName || get().uploadedFileName || 'Custom Script';
    const scriptId = optionsObj?.scriptId;
    const parameters = optionsObj?.parameters;

    const recordExecutionHistory = (exitCode: number, status: ExecutionStatus) => {
      const durationMs = Date.now() - (get().executionStartTime || Date.now());
      const capturedLogs = get().outputLogs.slice(-MAX_HISTORY_LOG_LINES);
      get().addHistoryEntry({
        id: executionId,
        scriptId,
        scriptName,
        scriptType: type,
        timestamp: new Date().toISOString(),
        durationMs,
        exitCode,
        status,
        elevated: shouldElevate,
        isDryRun,
        rawContent: content,
        parameters,
        logLines: capturedLogs,
      });
    };

    set({
      isExecutingScript: true,
      isElevatedRunning: shouldElevate,
      activeExecutionId: executionId,
      executionStartTime: Date.now(),
      isCancellingScript: false,
    });
    get().clearOutputLogs();

    await ensureScriptOutputListener();

    addLog({
      level: 'cmd',
      message: `Executing script (${type}, id: ${executionId}, dryRun: ${isDryRun}, elevated: ${shouldElevate})`,
    });

    try {
      const output = await invoke<CommandOutput>('execute_custom_script', {
        scriptContent: content,
        scriptType: type,
        dryRun: isDryRun,
        executionId,
        timeoutSeconds,
        elevate: shouldElevate,
      });

      const exitCode = output.exitCode ?? output.exit_code ?? 0;
      const executionStatus: ExecutionStatus =
        exitCode === 0 ? 'success' : exitCode === 1223 ? 'cancelled' : 'failed';

      recordExecutionHistory(exitCode, executionStatus);

      if (exitCode === 0) {
        addToast({
          type: 'success',
          title: 'Execution Complete',
          message: `Script finished successfully (exit code ${exitCode}).`,
        });
      } else if (exitCode === 1223) {
        // Win32 ERROR_CANCELLED (1223) returned when user dismisses UAC prompt
        addLog({
          level: 'warn',
          message: `UAC elevation prompt was cancelled by the user for script '${executionId}'.`,
        });
        addToast({
          type: 'warning',
          title: 'UAC Elevation Cancelled',
          message: 'The Windows UAC administrator elevation prompt was declined or cancelled.',
        });
        get().addOutputLine({
          line: '[UAC] Administrator elevation prompt was declined or cancelled by the user.',
          stream: 'stderr',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Execution Failed',
          message: `Script finished with non-zero exit code (${exitCode}).`,
        });
      }

      return output;
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      const lowerError = errorMsg.toLowerCase();

      // Differentiate UAC cancellation (single 'l' / double 'l' / code 1223 / Russian locale) from crashes
      const isUacDecline =
        lowerError.includes('canceled by the user') ||
        lowerError.includes('cancelled by the user') ||
        lowerError.includes('declined by user') ||
        lowerError.includes('declined by the user') ||
        lowerError.includes('операция отменена пользователем') ||
        lowerError.includes('отменена пользователем') ||
        lowerError.includes('отменено пользователем') ||
        lowerError.includes('error_cancelled') ||
        lowerError.includes('1223') ||
        lowerError.includes('0x800704c7') ||
        (lowerError.includes('uac') && (lowerError.includes('cancel') || lowerError.includes('decline')));

      const isProcessCancelled =
        lowerError.includes('cancelled') ||
        lowerError.includes('canceled') ||
        lowerError.includes('отменен') ||
        lowerError.includes('отменена') ||
        lowerError.includes('отменено') ||
        isUacDecline;

      const executionStatus: ExecutionStatus =
        isUacDecline || isProcessCancelled ? 'cancelled' : 'failed';
      const exitCode = isUacDecline ? 1223 : isProcessCancelled ? -1 : 1;

      recordExecutionHistory(exitCode, executionStatus);

      if (isUacDecline) {
        addLog({
          level: 'warn',
          message: `UAC elevation prompt was cancelled by user: ${errorMsg}`,
        });
        addToast({
          type: 'warning',
          title: 'UAC Elevation Cancelled',
          message: 'The Windows UAC administrator elevation prompt was declined or cancelled.',
        });
        get().addOutputLine({
          line: '[UAC] Administrator elevation prompt was declined or cancelled by the user.',
          stream: 'stderr',
        });
      } else if (isProcessCancelled) {
        addLog({
          level: 'warn',
          message: `Script execution was cancelled: ${errorMsg}`,
        });
        addToast({
          type: 'warning',
          title: 'Execution Cancelled',
          message: errorMsg,
        });
      } else {
        addLog({
          level: 'error',
          message: `Script execution failed: ${errorMsg}`,
        });
        addToast({
          type: 'error',
          title: 'Script Execution Error',
          message: errorMsg,
        });
        get().addOutputLine({
          line: `[ERROR] ${errorMsg}`,
          stream: 'stderr',
        });
      }

      return null;
    } finally {
      set({
        isExecutingScript: false,
        isElevatedRunning: false,
        activeExecutionId: null,
        executionStartTime: null,
        isCancellingScript: false,
      });

      if (!scriptOutputHasViewSubscriber || scriptOutputPendingCleanup) {
        const unlisten = get().unlistenScriptOutput;
        if (unlisten) {
          unlisten();
          set({ unlistenScriptOutput: null });
        }
        scriptOutputPendingCleanup = false;
      }
    }
  },

  cancelRunningScript: async () => {
    const { activeExecutionId, isExecutingScript, isCancellingScript, isElevatedRunning, addLog, addToast } = get();
    if (!isExecutingScript || !activeExecutionId || isCancellingScript) {
      return;
    }

    set({ isCancellingScript: true });

    addLog({
      level: 'warn',
      message: `Requesting cancellation for ${isElevatedRunning ? 'elevated ' : ''}script execution '${activeExecutionId}'...`,
    });

    addToast({
      type: 'info',
      title: 'Cancelling Script',
      message: isElevatedRunning
        ? 'Sending cancellation signal to elevated process watcher...'
        : 'Sending termination signal to process tree...',
    });

    try {
      await invoke('cancel_running_script', { executionId: activeExecutionId });
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      console.warn('[ScriptRunner] cancel_running_script notice:', errorMsg);
    }
  },

  cancelCurrentScript: async () => {
    return get().cancelRunningScript();
  },

  downloadOutputLog: () => {
    const { outputLogs, scriptType, uploadedFileName } = get();
    exportLiveOutputLogs(outputLogs, scriptType, uploadedFileName);
  },

  // Online Library Implementation
  setActiveRunnerTab: (tab) => set({ activeRunnerTab: tab }),
  setLibrarySelectedCategory: (category) => set({ librarySelectedCategory: category }),
  setLibrarySearchQuery: (query) => set({ librarySearchQuery: query }),
  setLibrarySelectedRisk: (risk) => set({ librarySelectedRisk: risk }),

  fetchLibrary: async (force = false) => {
    set({ isLoadingLibrary: true, libraryError: null });
    const { addLog, addToast } = get();

    try {
      addLog({
        level: 'info',
        message: force
          ? 'Syncing online scripts library from GitHub repository...'
          : 'Loading cached scripts library manifest...',
      });

      const manifest = force
        ? await invoke<ScriptsLibraryManifest>('sync_scripts_library', { force: true })
        : await invoke<ScriptsLibraryManifest>('get_cached_scripts_library');

      set({
        libraryManifest: manifest,
        isLoadingLibrary: false,
        lastSyncTimestamp: new Date().toLocaleTimeString(),
        libraryError: null,
      });

      addToast({
        type: 'success',
        title: force ? 'Library Synced' : 'Library Loaded',
        message: `${manifest.scripts.length} verified scripts ready in library catalog.`,
      });
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      set({
        isLoadingLibrary: false,
        libraryError: errorMsg,
      });
      addLog({
        level: 'error',
        message: `Scripts library sync error: ${errorMsg}`,
      });
      addToast({
        type: 'error',
        title: 'Library Sync Error',
        message: errorMsg,
      });
    }
  },

  openScriptPreview: async (script) => {
    set({ previewScript: script, isLoadingPreview: true, previewContent: null });
    const { addLog, addToast } = get();

    try {
      const code = await invoke<string>('read_library_script', { scriptId: script.id });
      const cleanCode = (code || '').replace(/^\uFEFF+/, '');
      set({ previewContent: cleanCode, isLoadingPreview: false });
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      set({ isLoadingPreview: false });
      addLog({
        level: 'error',
        message: `Failed to read script "${script.name}": ${errorMsg}`,
      });
      addToast({
        type: 'error',
        title: 'Script Read Error',
        message: errorMsg,
      });
    }
  },

  closeScriptPreview: () => {
    set({ previewScript: null, previewContent: null, isLoadingPreview: false });
  },

  loadScriptToEditor: async (script) => {
    const { addLog, addToast } = get();
    try {
      const code = await invoke<string>('read_library_script', { scriptId: script.id });
      const cleanCode = (code || '').replace(/^\uFEFF+/, '');
      set({
        scriptContent: cleanCode,
        scriptType: 'ps1',
        uploadedFileName: `${script.name} (${script.path})`,
        activeRunnerTab: 'editor',
        previewScript: null,
        previewContent: null,
      });
      addToast({
        type: 'info',
        title: 'Loaded to Editor',
        message: `"${script.name}" loaded into Script Editor.`,
      });
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to load script "${script.name}": ${errorMsg}`,
      });
      addToast({
        type: 'error',
        title: 'Script Load Error',
        message: errorMsg,
      });
    }
  },

  runLibraryScriptDirectly: async (script, runAsAdminOrOptions) => {
    const shouldElevate = typeof runAsAdminOrOptions === 'boolean'
      ? runAsAdminOrOptions
      : runAsAdminOrOptions?.runAsAdmin !== undefined
        ? runAsAdminOrOptions.runAsAdmin
        : Boolean(script.requiresAdmin || script.riskLevel === 'elevated' || script.riskLevel === 'critical');

    if (script.parameters && script.parameters.length > 0) {
      get().openParameterDialog(script, shouldElevate);
      return;
    }

    const { addLog, addToast, executeScript } = get();
    try {
      const code = await invoke<string>('read_library_script', { scriptId: script.id });
      const cleanCode = (code || '').replace(/^\uFEFF+/, '');
      set({
        scriptContent: cleanCode,
        scriptType: 'ps1',
        uploadedFileName: `${script.name} (${script.path})`,
        activeRunnerTab: 'editor',
        previewScript: null,
        previewContent: null,
        editorRunAsAdmin: shouldElevate,
      });
      addToast({
        type: 'info',
        title: 'Starting Execution',
        message: `Executing "${script.name}"${shouldElevate ? ' (Elevated)' : ''} with live output stream...`,
      });
      await executeScript(code, 'ps1', {
        runAsAdmin: shouldElevate,
        scriptId: script.id,
        scriptName: script.name,
      });
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to execute library script "${script.name}": ${errorMsg}`,
      });
      addToast({
        type: 'error',
        title: 'Execution Error',
        message: errorMsg,
      });
    }
  },

  // Parameter Dialog Actions
  openParameterDialog: (script, initialRunAsAdmin) => {
    const initialValues = buildInitialParameterValues(script.parameters);

    const shouldElevate = initialRunAsAdmin !== undefined
      ? initialRunAsAdmin
      : Boolean(script.requiresAdmin || script.riskLevel === 'elevated' || script.riskLevel === 'critical');

    set({
      parameterDialogScript: script,
      parameterValues: initialValues,
      parameterValidationErrors: {},
      parameterRunAsAdmin: shouldElevate,
    });
  },

  closeParameterDialog: () => {
    set({
      parameterDialogScript: null,
      parameterValues: {},
      parameterValidationErrors: {},
      parameterRunAsAdmin: false,
    });
  },

  setParameterValue: (paramName, value) => {
    set((state) => {
      const newErrors = { ...state.parameterValidationErrors };
      delete newErrors[paramName];
      return {
        parameterValues: {
          ...state.parameterValues,
          [paramName]: value,
        },
        parameterValidationErrors: newErrors,
      };
    });
  },

  resetParameterValues: () => {
    const script = get().parameterDialogScript;
    if (!script) return;

    set({
      parameterValues: buildInitialParameterValues(script.parameters),
      parameterValidationErrors: {},
    });
  },

  validateParameters: () => {
    const script = get().parameterDialogScript;
    if (!script || !script.parameters) {
      return true;
    }

    const values = get().parameterValues;
    const errors: Record<string, string> = {};

    for (const param of script.parameters) {
      const val = values[param.name];
      if (param.type === 'number') {
        const numVal = Number(val);
        if (val !== undefined && val !== '' && (Number.isNaN(numVal) || !Number.isFinite(numVal))) {
          errors[param.name] = 'Must be a valid finite number';
        }
      }
    }

    set({ parameterValidationErrors: errors });
    return Object.keys(errors).length === 0;
  },

  executeScriptWithParameters: async (script, customValues, runAsAdminOrOptions) => {
    const isValid = get().validateParameters();
    if (!isValid) {
      return null;
    }

    const { addLog, addToast, executeScript, parameterRunAsAdmin } = get();
    const values = customValues ?? get().parameterValues;
    const shouldElevate = typeof runAsAdminOrOptions === 'boolean'
      ? runAsAdminOrOptions
      : runAsAdminOrOptions?.runAsAdmin !== undefined
        ? runAsAdminOrOptions.runAsAdmin
        : (parameterRunAsAdmin ?? Boolean(script.requiresAdmin || script.riskLevel === 'elevated' || script.riskLevel === 'critical'));

    try {
      const rawCode = await invoke<string>('read_library_script', { scriptId: script.id });
      const cleanCode = (rawCode || '').replace(/^\uFEFF+/, '');
      const formattedCode = formatScriptWithParameters(cleanCode, script.parameters ?? [], values);

      set({
        scriptContent: formattedCode,
        scriptType: 'ps1',
        uploadedFileName: `${script.name} (${script.path})`,
        activeRunnerTab: 'editor',
        parameterDialogScript: null,
        parameterValues: {},
        parameterValidationErrors: {},
        previewScript: null,
        previewContent: null,
        editorRunAsAdmin: shouldElevate,
      });

      addToast({
        type: 'info',
        title: 'Starting Execution',
        message: `Executing "${script.name}"${shouldElevate ? ' (Elevated)' : ''} with custom parameters...`,
      });

      return await executeScript(formattedCode, 'ps1', {
        runAsAdmin: shouldElevate,
        scriptId: script.id,
        scriptName: script.name,
        parameters: values,
      });
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      addLog({
        level: 'error',
        message: `Failed to execute script "${script.name}" with parameters: ${errorMsg}`,
      });
      addToast({
        type: 'error',
        title: 'Execution Error',
        message: errorMsg,
      });
      return null;
    }
  },
  };
};

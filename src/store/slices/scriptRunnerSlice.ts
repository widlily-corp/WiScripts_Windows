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
  ScriptParameter,
  ScriptParameterValue,
} from '../../types';

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

/**
 * Extracts the top-level param(...) header block from a PowerShell script,
 * including any preceding comments (<# ... #>, #) or attributes ([CmdletBinding()]),
 * properly tracking nested parentheses within parameter attributes and default values.
 */
function extractParamBlockHeader(code: string): string | null {
  const clean = code.replace(/^\uFEFF/, '');
  const paramRegex = /(?:^|\s)(param\s*\()/i;
  const match = paramRegex.exec(clean);
  if (!match) {
    return null;
  }

  const startIndex = match.index + (match[0].length - match[1].length);
  const openParenIndex = clean.indexOf('(', startIndex);
  if (openParenIndex === -1) {
    return null;
  }

  let depth = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = openParenIndex + 1; i < clean.length; i++) {
    const char = clean[i];
    const prev = clean[i - 1];

    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && clean[i + 1] === "'") {
        i++; // skip escaped single quote ''
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      if (prev !== '`') {
        inDoubleQuote = !inDoubleQuote;
      }
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        // Return everything from script start (after BOM) up to end of param(...)
        return clean.substring(0, i + 1).trim();
      }
    }
  }

  return null;
}

/**
 * Synthesizes a clean PowerShell param(...) block for scripts that lack one,
 * ensuring root AST ParamBlock preservation.
 */
function synthesizeParamBlock(parameters: ScriptParameter[]): string {
  const paramDecls = parameters.map((p) => {
    if (p.type === 'boolean') {
      return `  [switch]$${p.name}`;
    } else if (p.type === 'number') {
      return `  [double]$${p.name}`;
    } else {
      return `  [string]$${p.name}`;
    }
  });
  return `param(\n${paramDecls.join(',\n')}\n)`;
}

export function formatScriptWithParameters(
  rawContent: string,
  parameters: ScriptParameter[],
  values: Record<string, ScriptParameterValue>
): string {
  if (!parameters || parameters.length === 0 || !values) {
    return rawContent;
  }

  // 1. Strip UTF-8 BOM if present at start
  const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();

  // 2. Build PowerShell CLI arguments with strict typing and injection protection
  const args: string[] = [];
  for (const param of parameters) {
    const val = values[param.name];
    if (val === undefined || val === null || val === '') {
      continue;
    }

    if (param.type === 'boolean') {
      // Use -$name:$true or -$name:$false (prevents ParameterBindingArgumentTransformationException)
      const boolToken = Boolean(val) ? '$true' : '$false';
      args.push(`-${param.name}:${boolToken}`);
    } else if (param.type === 'number') {
      const numVal = Number(val);
      if (!Number.isNaN(numVal) && Number.isFinite(numVal)) {
        args.push(`-${param.name} ${numVal}`);
      }
    } else {
      // Escape single quotes for PowerShell single-quoted literal: ' -> ''
      const strVal = String(val).replace(/'/g, "''");
      args.push(`-${param.name} '${strVal}'`);
    }
  }

  if (args.length === 0) {
    return cleanContent;
  }

  // 3. Preserve root AST ParamBlock to ensure PowerShell 5.1/7 AST and static analyzer compliance
  const existingHeader = extractParamBlockHeader(cleanContent);
  const rootParamBlock = existingHeader || synthesizeParamBlock(parameters);

  return `${rootParamBlock}\n\n& {\n${cleanContent}\n} ${args.join(' ')}\n`;
}

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

const MAX_SCRIPT_LOG_LINES = 2000;

const DEFAULT_SCRIPT_CONTENT = `# WiScripts Windows Custom PowerShell Script
# Runs with elevated Administrator privileges

Write-Host "Initializing WiScripts System Diagnostic Check..." -ForegroundColor Cyan
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsArchitecture | Format-Table -AutoSize
Write-Host "Diagnostic completed successfully." -ForegroundColor Green
`;

export const createScriptRunnerSlice: StateCreator<AppState, [], [], ScriptRunnerSlice> = (set, get) => ({
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
  addHistoryEntry: (entry) => {
    const boundedEntry: ScriptExecutionRecord = {
      ...entry,
      logLines: (entry.logLines || []).slice(-MAX_HISTORY_LOG_LINES),
    };
    set((state) => ({
      executionHistory: [boundedEntry, ...(state.executionHistory || [])].slice(0, MAX_HISTORY_ENTRIES),
    }));
  },
  clearHistory: () => set({ executionHistory: [] }),
  deleteHistoryEntry: (id) =>
    set((state) => ({
      executionHistory: (state.executionHistory || []).filter((e) => e.id !== id),
    })),
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
        set({
          impactSimulatorScript: script,
          impactSimulatorContent: code,
          isImpactSimulatorOpen: true,
        });
      } catch (err) {
        get().addToast({
          type: 'error',
          title: 'Impact Simulator Error',
          message: `Could not load script code: ${err instanceof Error ? err.message : String(err)}`,
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
    const timestamp = new Date().toLocaleTimeString();
    const newEntry: ScriptOutputLine = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      line: payload.line,
      stream: payload.stream,
      timestamp,
    };
    set((state) => ({
      outputLogs: [...state.outputLogs, newEntry].slice(-MAX_SCRIPT_LOG_LINES),
    }));
  },

  clearOutputLogs: () => set({ outputLogs: [] }),

  setupScriptOutputListener: async () => {
    const currentUnlisten = get().unlistenScriptOutput;
    if (currentUnlisten) {
      return currentUnlisten;
    }

    try {
      const unlisten = await listen<ScriptOutputLinePayload>('script-output-line', (event) => {
        get().addOutputLine(event.payload);
      });

      set({ unlistenScriptOutput: unlisten });
      return unlisten;
    } catch (err) {
      console.warn('[ScriptRunner] Could not set up Tauri event listener (web/mock environment):', err);
      const dummyUnlisten: UnlistenFn = () => {};
      set({ unlistenScriptOutput: dummyUnlisten });
      return dummyUnlisten;
    }
  },

  cleanupScriptOutputListener: () => {
    const unlisten = get().unlistenScriptOutput;
    if (unlisten) {
      unlisten();
      set({ unlistenScriptOutput: null });
    }
  },

  executeScript: async (customContent, customType, runAsAdminOrOptions) => {
    const { dryRunMode, addLog, addToast, editorRunAsAdmin } = get();
    const content = customContent ?? get().scriptContent;
    const type = customType ?? get().scriptType;

    const shouldElevate = typeof runAsAdminOrOptions === 'boolean'
      ? runAsAdminOrOptions
      : runAsAdminOrOptions?.runAsAdmin !== undefined
        ? Boolean(runAsAdminOrOptions.runAsAdmin)
        : Boolean(editorRunAsAdmin);

    const isDryRun = typeof runAsAdminOrOptions === 'object' && runAsAdminOrOptions?.dryRun !== undefined
      ? runAsAdminOrOptions.dryRun
      : dryRunMode;

    const timeoutSeconds = typeof runAsAdminOrOptions === 'object' && runAsAdminOrOptions?.timeoutSeconds !== undefined
      ? runAsAdminOrOptions.timeoutSeconds
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

    set({
      isExecutingScript: true,
      isElevatedRunning: shouldElevate,
      activeExecutionId: executionId,
      executionStartTime: Date.now(),
      isCancellingScript: false,
    });
    get().clearOutputLogs();

    await get().setupScriptOutputListener();

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
      const durationMs = Date.now() - (get().executionStartTime || Date.now());
      const capturedLogs = get().outputLogs.slice(-MAX_HISTORY_LOG_LINES);
      const executionStatus: ExecutionStatus =
        exitCode === 0 ? 'success' : exitCode === 1223 ? 'cancelled' : 'failed';

      const scriptName =
        typeof runAsAdminOrOptions === 'object' && runAsAdminOrOptions?.scriptName
          ? runAsAdminOrOptions.scriptName
          : get().uploadedFileName || 'Custom Script';

      const scriptId =
        typeof runAsAdminOrOptions === 'object' ? runAsAdminOrOptions?.scriptId : undefined;

      const parameters =
        typeof runAsAdminOrOptions === 'object' ? runAsAdminOrOptions?.parameters : undefined;

      get().addHistoryEntry({
        id: executionId,
        scriptId,
        scriptName,
        scriptType: type,
        timestamp: new Date().toISOString(),
        durationMs,
        exitCode,
        status: executionStatus,
        elevated: shouldElevate,
        isDryRun,
        rawContent: content,
        parameters,
        logLines: capturedLogs,
      });

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
      const errorMsg = err instanceof Error ? err.message : String(err);
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

      const durationMs = Date.now() - (get().executionStartTime || Date.now());
      const capturedLogs = get().outputLogs.slice(-MAX_HISTORY_LOG_LINES);
      const executionStatus: ExecutionStatus =
        isUacDecline || isProcessCancelled ? 'cancelled' : 'failed';
      const exitCode = isUacDecline ? 1223 : isProcessCancelled ? -1 : 1;

      const scriptName =
        typeof runAsAdminOrOptions === 'object' && runAsAdminOrOptions?.scriptName
          ? runAsAdminOrOptions.scriptName
          : get().uploadedFileName || 'Custom Script';

      const scriptId =
        typeof runAsAdminOrOptions === 'object' ? runAsAdminOrOptions?.scriptId : undefined;

      const parameters =
        typeof runAsAdminOrOptions === 'object' ? runAsAdminOrOptions?.parameters : undefined;

      get().addHistoryEntry({
        id: executionId,
        scriptId,
        scriptName,
        scriptType: type,
        timestamp: new Date().toISOString(),
        durationMs,
        exitCode,
        status: executionStatus,
        elevated: shouldElevate,
        isDryRun,
        rawContent: content,
        parameters,
        logLines: capturedLogs,
      });

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
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn('[ScriptRunner] cancel_running_script notice:', errorMsg);
    }
  },

  cancelCurrentScript: async () => {
    return get().cancelRunningScript();
  },

  downloadOutputLog: () => {
    const { outputLogs, scriptType } = get();
    if (outputLogs.length === 0) {
      return;
    }

    const header = [
      '===================================================================',
      'WiScripts Windows - Script Execution Output Log',
      `Timestamp: ${new Date().toISOString()}`,
      `Script Type: .${scriptType}`,
      '===================================================================',
      '',
    ].join('\n');

    const body = outputLogs
      .map((item) => `[${item.timestamp}] [${item.stream.toUpperCase()}] ${item.line}`)
      .join('\n');

    const footer = [
      '',
      '===================================================================',
      'End of Log',
    ].join('\n');

    const fullText = `${header}${body}${footer}`;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wiscripts_execution_log_${Date.now()}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      const errorMsg = err instanceof Error ? err.message : String(err);
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
      set({ previewContent: code, isLoadingPreview: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
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
      set({
        scriptContent: code,
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
      const errorMsg = err instanceof Error ? err.message : String(err);
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
      set({
        scriptContent: code,
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
      const errorMsg = err instanceof Error ? err.message : String(err);
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
    const initialValues: Record<string, ScriptParameterValue> = {};
    if (script.parameters) {
      for (const param of script.parameters) {
        if (param.default !== undefined && param.default !== null) {
          initialValues[param.name] = param.default as ScriptParameterValue;
        } else if (param.type === 'boolean') {
          initialValues[param.name] = false;
        } else if (param.type === 'number') {
          initialValues[param.name] = 0;
        } else {
          initialValues[param.name] = '';
        }
      }
    }

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

    const initialValues: Record<string, ScriptParameterValue> = {};
    if (script.parameters) {
      for (const param of script.parameters) {
        if (param.default !== undefined && param.default !== null) {
          initialValues[param.name] = param.default as ScriptParameterValue;
        } else if (param.type === 'boolean') {
          initialValues[param.name] = false;
        } else if (param.type === 'number') {
          initialValues[param.name] = 0;
        } else {
          initialValues[param.name] = '';
        }
      }
    }

    set({
      parameterValues: initialValues,
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
      const formattedCode = formatScriptWithParameters(rawCode, script.parameters ?? [], values);

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
      const errorMsg = err instanceof Error ? err.message : String(err);
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
});

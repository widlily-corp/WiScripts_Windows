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

export function formatScriptWithParameters(
  rawContent: string,
  parameters: ScriptParameter[],
  values: Record<string, ScriptParameterValue>
): string {
  if (!parameters || parameters.length === 0 || !values) {
    return rawContent;
  }

  const args: string[] = [];
  for (const param of parameters) {
    const val = values[param.name];
    if (val === undefined || val === null || val === '') {
      continue;
    }

    if (param.type === 'boolean') {
      args.push(`-${param.name}:${Boolean(val)}`);
    } else if (param.type === 'number') {
      const numVal = Number(val);
      if (!Number.isNaN(numVal) && Number.isFinite(numVal)) {
        args.push(`-${param.name} ${numVal}`);
      }
    } else {
      const strVal = String(val).replace(/'/g, "''");
      args.push(`-${param.name} '${strVal}'`);
    }
  }

  if (args.length === 0) {
    return rawContent;
  }

  const trimmed = rawContent.trim();
  return `& {\n${trimmed}\n} ${args.join(' ')}\n`;
}

export interface ScriptRunnerSlice {
  scriptContent: string;
  scriptType: 'ps1' | 'bat' | 'cmd';
  uploadedFileName: string | null;
  outputLogs: ScriptOutputLine[];
  isExecutingScript: boolean;
  activeExecutionId: string | null;
  isCancellingScript: boolean;
  executionStartTime: number | null;
  unlistenScriptOutput: UnlistenFn | null;

  // Online Library State
  libraryManifest: ScriptsLibraryManifest | null;
  isLoadingLibrary: boolean;
  libraryError: string | null;
  lastSyncTimestamp: string | null;
  activeRunnerTab: 'editor' | 'library';
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

  // Actions
  setScriptContent: (content: string) => void;
  setScriptType: (type: 'ps1' | 'bat' | 'cmd') => void;
  setUploadedFileName: (name: string | null) => void;
  addOutputLine: (payload: { line: string; stream: 'stdout' | 'stderr' }) => void;
  clearOutputLogs: () => void;
  executeScript: (customContent?: string, customType?: 'ps1' | 'bat' | 'cmd') => Promise<CommandOutput | null>;
  cancelRunningScript: () => Promise<void>;
  downloadOutputLog: () => void;
  setupScriptOutputListener: () => Promise<UnlistenFn>;
  cleanupScriptOutputListener: () => void;

  // Library Actions
  setActiveRunnerTab: (tab: 'editor' | 'library') => void;
  setLibrarySelectedCategory: (category: ScriptCategory) => void;
  setLibrarySearchQuery: (query: string) => void;
  setLibrarySelectedRisk: (risk: 'all' | ScriptRiskLevel) => void;
  fetchLibrary: (force?: boolean) => Promise<void>;
  openScriptPreview: (script: ScriptManifestEntry) => Promise<void>;
  closeScriptPreview: () => void;
  loadScriptToEditor: (script: ScriptManifestEntry) => Promise<void>;
  runLibraryScriptDirectly: (script: ScriptManifestEntry) => Promise<void>;

  // Parameter Dialog Actions
  openParameterDialog: (script: ScriptManifestEntry) => void;
  closeParameterDialog: () => void;
  setParameterValue: (paramName: string, value: ScriptParameterValue) => void;
  resetParameterValues: () => void;
  validateParameters: () => boolean;
  executeScriptWithParameters: (script: ScriptManifestEntry, values?: Record<string, ScriptParameterValue>) => Promise<CommandOutput | null>;
}

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
  activeExecutionId: null,
  isCancellingScript: false,
  executionStartTime: null,
  unlistenScriptOutput: null,

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

  // Parameter Configuration Dialog State
  parameterDialogScript: null,
  parameterValues: {},
  parameterValidationErrors: {},

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
      outputLogs: [...state.outputLogs, newEntry],
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

  executeScript: async (customContent, customType) => {
    const { dryRunMode, addLog, addToast } = get();
    const content = customContent ?? get().scriptContent;
    const type = customType ?? get().scriptType;

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
      activeExecutionId: executionId,
      executionStartTime: Date.now(),
      isCancellingScript: false,
    });
    get().clearOutputLogs();

    await get().setupScriptOutputListener();

    addLog({
      level: 'cmd',
      message: `Executing script (${type}, id: ${executionId}, dryRun: ${dryRunMode})`,
    });

    try {
      const output = await invoke<CommandOutput>('execute_custom_script', {
        scriptContent: content,
        scriptType: type,
        dryRun: dryRunMode,
        executionId,
      });

      const exitCode = output.exitCode ?? output.exit_code ?? 0;

      if (exitCode === 0) {
        addToast({
          type: 'success',
          title: 'Execution Complete',
          message: `Script finished successfully (exit code ${exitCode}).`,
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
      const isCancelled = errorMsg.toLowerCase().includes('cancelled');

      addLog({
        level: isCancelled ? 'warn' : 'error',
        message: isCancelled
          ? `Script execution was cancelled: ${errorMsg}`
          : `Script execution failed: ${errorMsg}`,
      });

      addToast({
        type: isCancelled ? 'warning' : 'error',
        title: isCancelled ? 'Execution Cancelled' : 'Script Execution Error',
        message: errorMsg,
      });

      if (!isCancelled) {
        get().addOutputLine({
          line: `[ERROR] ${errorMsg}`,
          stream: 'stderr',
        });
      }

      return null;
    } finally {
      set({
        isExecutingScript: false,
        activeExecutionId: null,
        executionStartTime: null,
        isCancellingScript: false,
      });
    }
  },

  cancelRunningScript: async () => {
    const { activeExecutionId, isExecutingScript, isCancellingScript, addLog, addToast } = get();
    if (!isExecutingScript || !activeExecutionId || isCancellingScript) {
      return;
    }

    set({ isCancellingScript: true });

    addLog({
      level: 'warn',
      message: `Requesting cancellation for script execution '${activeExecutionId}'...`,
    });

    addToast({
      type: 'info',
      title: 'Cancelling Script',
      message: 'Sending termination signal to process tree...',
    });

    try {
      await invoke('cancel_running_script', { executionId: activeExecutionId });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn('[ScriptRunner] cancel_running_script notice:', errorMsg);
    }
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

  runLibraryScriptDirectly: async (script) => {
    if (script.parameters && script.parameters.length > 0) {
      get().openParameterDialog(script);
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
      });
      addToast({
        type: 'info',
        title: 'Starting Execution',
        message: `Executing "${script.name}" with live output stream...`,
      });
      await executeScript(code, 'ps1');
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
  openParameterDialog: (script) => {
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
      parameterDialogScript: script,
      parameterValues: initialValues,
      parameterValidationErrors: {},
    });
  },

  closeParameterDialog: () => {
    set({
      parameterDialogScript: null,
      parameterValues: {},
      parameterValidationErrors: {},
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

  executeScriptWithParameters: async (script, customValues) => {
    const isValid = get().validateParameters();
    if (!isValid) {
      return null;
    }

    const { addLog, addToast, executeScript } = get();
    const values = customValues ?? get().parameterValues;

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
      });

      addToast({
        type: 'info',
        title: 'Starting Execution',
        message: `Executing "${script.name}" with custom parameters...`,
      });

      return await executeScript(formattedCode, 'ps1');
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

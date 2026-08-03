import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AppState } from '../useAppStore';
import type { CommandOutput } from '../../types';

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

export interface ScriptRunnerSlice {
  scriptContent: string;
  scriptType: 'ps1' | 'bat' | 'cmd';
  uploadedFileName: string | null;
  outputLogs: ScriptOutputLine[];
  isExecutingScript: boolean;
  unlistenScriptOutput: UnlistenFn | null;

  setScriptContent: (content: string) => void;
  setScriptType: (type: 'ps1' | 'bat' | 'cmd') => void;
  setUploadedFileName: (name: string | null) => void;
  addOutputLine: (payload: { line: string; stream: 'stdout' | 'stderr' }) => void;
  clearOutputLogs: () => void;
  executeScript: () => Promise<CommandOutput | null>;
  downloadOutputLog: () => void;
  setupScriptOutputListener: () => Promise<UnlistenFn>;
  cleanupScriptOutputListener: () => void;
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
  unlistenScriptOutput: null,

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

  executeScript: async () => {
    const { scriptContent, scriptType, dryRunMode, addLog, addToast } = get();

    if (!scriptContent || !scriptContent.trim()) {
      addToast({
        type: 'warning',
        title: 'Empty Script',
        message: 'Please enter or upload script code before executing.',
      });
      return null;
    }

    set({ isExecutingScript: true });
    get().clearOutputLogs();

    await get().setupScriptOutputListener();

    addLog({
      level: 'cmd',
      message: `Executing custom script (${scriptType}, dryRun: ${dryRunMode})`,
    });

    try {
      const output = await invoke<CommandOutput>('execute_custom_script', {
        scriptContent,
        scriptType,
        dryRun: dryRunMode,
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
      addLog({
        level: 'error',
        message: `Custom script execution failed: ${errorMsg}`,
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

      return null;
    } finally {
      set({ isExecutingScript: false });
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
});

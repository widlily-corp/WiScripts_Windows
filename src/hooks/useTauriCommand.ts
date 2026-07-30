import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';

interface UseTauriCommandOptions<TResult> {
  onSuccess?: (data: TResult) => void;
  onError?: (error: string) => void;
}

export function useTauriCommand<TResult = unknown, TArgs extends Record<string, unknown> = Record<string, unknown>>(
  commandName: string,
  options: UseTauriCommandOptions<TResult> = {}
) {
  const [data, setData] = useState<TResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const addLog = useAppStore((s) => s.addLog);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const execute = useCallback(
    async (args?: TArgs): Promise<TResult | null> => {
      setIsLoading(true);
      setError(null);

      const currentDryRun = useAppStore.getState().dryRunMode;
      const payload = {
        ...(args || {}),
        dryRun: currentDryRun,
      };

      addLog({
        level: 'cmd',
        message: `Invoking IPC command: ${commandName} (dryRun: ${currentDryRun})`,
        commandExecuted: JSON.stringify(payload),
      });

      try {
        const result = await invoke<TResult>(commandName, payload);
        setData(result);
        addLog({
          level: 'info',
          message: `IPC command ${commandName} completed successfully.`,
        });
        optionsRef.current.onSuccess?.(result);
        return result;
      } catch (err) {
        const errMessage = typeof err === 'string' ? err : String(err);
        setError(errMessage);
        addLog({
          level: 'error',
          message: `IPC command ${commandName} failed: ${errMessage}`,
        });
        optionsRef.current.onError?.(errMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [commandName, dryRunMode, addLog]
  );

  return { data, isLoading, error, execute };
}

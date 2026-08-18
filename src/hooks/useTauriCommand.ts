import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';

export interface UseTauriCommandOptions<TResult> {
  onSuccess?: (data: TResult) => void;
  onError?: (error: string) => void;
}

/**
 * Custom Tauri IPC hook optimized with useRef memoization and non-reactive store access.
 * Eliminates redundant component re-renders when global settings (like dryRunMode) change.
 */
export function useTauriCommand<
  TResult = unknown,
  TArgs extends Record<string, unknown> = Record<string, unknown>
>(
  commandName: string,
  options: UseTauriCommandOptions<TResult> = {}
) {
  const [data, setData] = useState<TResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize options and handlers with useRef to prevent execution callback invalidation
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const commandNameRef = useRef(commandName);
  commandNameRef.current = commandName;

  const execute = useCallback(
    async (args?: TArgs): Promise<TResult | null> => {
      setIsLoading(true);
      setError(null);

      // Query reactive settings directly via getState() to prevent hook re-subscriptions
      const currentDryRun = useAppStore.getState().dryRunMode;
      const addLog = useAppStore.getState().addLog;
      const activeCommand = commandNameRef.current;

      const payload = {
        ...(args || {}),
        dryRun: currentDryRun,
      };

      addLog({
        level: 'cmd',
        message: `Invoking IPC command: ${activeCommand} (dryRun: ${currentDryRun})`,
        commandExecuted: JSON.stringify(payload),
      });

      try {
        const result = await invoke<TResult>(activeCommand, payload);
        setData(result);
        addLog({
          level: 'info',
          message: `IPC command ${activeCommand} completed successfully.`,
        });
        optionsRef.current.onSuccess?.(result);
        return result;
      } catch (err) {
        const errMessage = typeof err === 'string' ? err : String(err);
        setError(errMessage);
        addLog({
          level: 'error',
          message: `IPC command ${activeCommand} failed: ${errMessage}`,
        });
        optionsRef.current.onError?.(errMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [] // Stable reference across all component render cycles
  );

  return { data, isLoading, error, execute };
}

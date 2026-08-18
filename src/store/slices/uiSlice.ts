import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { ToastNotification, ExecutionLog, RiskLevel } from '../../types';
import type { AppState } from '../useAppStore';

export interface PendingSafetyModal {
  isOpen: boolean;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  commandsToRun: string[];
  onConfirmAction: () => Promise<void>;
}

export interface UiSlice {
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id'>) => string;
  dismissToast: (id: string) => void;

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

  pendingSafetyModal: PendingSafetyModal | null;
  openSafetyModal: (modal: Omit<PendingSafetyModal, 'isOpen'>) => void;
  closeSafetyModal: () => void;

  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
}

const MAX_LOG_ENTRIES = 1000;

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
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

  isExecuting: false,
  setIsExecuting: (executing) => set({ isExecuting: executing }),
  executionProgress: 0,
  currentStep: 0,
  totalSteps: 0,
  setCurrentProgress: (currentStep, totalSteps) => set({ currentStep, totalSteps }),
  setExecutionProgress: (percent) => set({ executionProgress: percent }),

  logs: [],
  addLog: (log) => {
    try {
      invoke('log_frontend_event', { level: log.level, message: log.message }).catch(() => {});
    } catch (e) {
      // Headless / non-Tauri environment fallback
    }
    set((state) => {
      const newLog: ExecutionLog = {
        ...log,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
      return {
        logs: [...state.logs, newLog].slice(-MAX_LOG_ENTRIES),
      };
    });
  },
  clearLogs: () => set({ logs: [] }),

  pendingSafetyModal: null,
  openSafetyModal: (modal) =>
    set({
      pendingSafetyModal: { ...modal, isOpen: true },
    }),
  closeSafetyModal: () => set({ pendingSafetyModal: null }),

  isCommandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
});

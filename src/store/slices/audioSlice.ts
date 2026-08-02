import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  AudioDevicesPayload,
  AppAudioSession,
  AudioFlow,
  ExecutionSummary,
} from '../../types';
import { MOCK_AUDIO_PAYLOAD, MOCK_APP_SESSIONS } from '../../mocks/audioMocks';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

export interface AudioSlice {
  audioDevicesPayload: AudioDevicesPayload | null;
  audioDevices: AudioDevicesPayload | null;
  appAudioSessions: AppAudioSession[];
  isAudioLoading: boolean;
  audioLoading: boolean;
  audioError: string | null;
  fetchAudioDevices: () => Promise<AudioDevicesPayload | null>;
  fetchAppAudioSessions: () => Promise<AppAudioSession[]>;
  setGlobalAudioDevice: (deviceId: string, flow: AudioFlow, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  setAppAudioDevice: (pid: number, deviceId: string, flow: AudioFlow, dryRun?: boolean) => Promise<ExecutionSummary | null>;
  setAppVolume: (pid: number, volume: number, muted: boolean, dryRun?: boolean) => Promise<ExecutionSummary | null>;
}

export const createAudioSlice: StateCreator<AppState, [], [], AudioSlice> = (set, get) => ({
  audioDevicesPayload: null,
  audioDevices: null,
  appAudioSessions: [],
  isAudioLoading: false,
  audioLoading: false,
  audioError: null,

  fetchAudioDevices: async () => {
    set({ isAudioLoading: true, audioLoading: true, audioError: null });
    get().addLog({ level: 'cmd', message: 'Enumerating Windows MMDevice audio endpoints...' });
    try {
      const payload = await invoke<AudioDevicesPayload>('get_audio_devices');
      set({ audioDevicesPayload: payload, audioDevices: payload });
      get().addLog({
        level: 'info',
        message: `Enumerated ${payload.renderDevices.length} render and ${payload.captureDevices.length} capture audio devices.`,
      });
      return payload;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      get().addLog({ level: 'warn', message: `Fetch audio devices IPC failed (${errMsg}), using fallback preview state.` });
      set({ audioDevicesPayload: MOCK_AUDIO_PAYLOAD, audioDevices: MOCK_AUDIO_PAYLOAD, audioError: null });
      return MOCK_AUDIO_PAYLOAD;
    } finally {
      set({ isAudioLoading: false, audioLoading: false });
    }
  },

  fetchAppAudioSessions: async () => {
    set({ isAudioLoading: true, audioLoading: true, audioError: null });
    get().addLog({ level: 'cmd', message: 'Scanning Win32 WASAPI application audio sessions...' });
    try {
      const sessions = await invoke<AppAudioSession[]>('get_app_audio_sessions');
      set({ appAudioSessions: sessions });
      get().addLog({ level: 'info', message: `Retrieved ${sessions.length} active application audio sessions.` });
      return sessions;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      get().addLog({ level: 'warn', message: `Fetch audio sessions IPC failed (${errMsg}), using fallback preview state.` });
      set({ appAudioSessions: MOCK_APP_SESSIONS, audioError: null });
      return MOCK_APP_SESSIONS;
    } finally {
      set({ isAudioLoading: false, audioLoading: false });
    }
  },

  setGlobalAudioDevice: async (deviceId: string, flow: AudioFlow, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    const flowStr = String(flow).toLowerCase();
    addLog({
      level: 'cmd',
      message: `Setting global audio default device to ID "${deviceId}" (flow: ${flowStr}, dryRun: ${currentDryRun})`,
    });

    const startTime = Date.now();
    try {
      if (!currentDryRun) {
        await invoke('set_global_audio_device', { deviceId, flow: flowStr });
      }
      const duration = Date.now() - startTime;
      const summary: ExecutionSummary = {
        success: true,
        executedActions: [
          {
            id: `set_audio_${flowStr}_${deviceId}`,
            name: `Set Default Audio ${flowStr.toUpperCase()} Device`,
            command: `Set-AudioDevice -ID "${deviceId}" -Flow ${flowStr}`,
            output: { exitCode: 0, stdout: 'Device set as default', stderr: '' },
            skipped: currentDryRun,
          },
        ],
        totalDurationMs: duration,
        isDryRun: currentDryRun,
      };

      addLog({
        level: 'info',
        message: `Successfully set global audio default device for ${flowStr}.`,
      });
      addToast({
        type: 'success',
        title: 'Audio Device Updated',
        message: `Default ${flowStr} device changed successfully.`,
      });

      set((state) => {
        const currentPayload = state.audioDevicesPayload || MOCK_AUDIO_PAYLOAD;
        const updatedPayload = { ...currentPayload };
        if (flowStr === 'render') {
          updatedPayload.defaultRenderId = deviceId;
          updatedPayload.renderDevices = updatedPayload.renderDevices.map((d) => ({
            ...d,
            isDefault: d.id === deviceId,
          }));
        } else {
          updatedPayload.defaultCaptureId = deviceId;
          updatedPayload.captureDevices = updatedPayload.captureDevices.map((d) => ({
            ...d,
            isDefault: d.id === deviceId,
          }));
        }
        return { audioDevicesPayload: updatedPayload, audioDevices: updatedPayload };
      });

      await get().fetchAudioDevices();
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Set global audio device failed: ${errMsg}` });
      addToast({ type: 'error', title: 'Audio Change Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  setAppAudioDevice: async (pid: number, deviceId: string, flow: AudioFlow, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog, setIsExecuting, addToast } = get();
    setIsExecuting(true);
    const flowStr = String(flow).toLowerCase();
    addLog({
      level: 'cmd',
      message: `Routing PID ${pid} audio output/input to device ID "${deviceId}" (flow: ${flowStr}, dryRun: ${currentDryRun})`,
    });

    const startTime = Date.now();
    try {
      if (!currentDryRun) {
        await invoke('set_app_audio_device', { pid, deviceId, flow: flowStr });
      }
      const duration = Date.now() - startTime;
      const summary: ExecutionSummary = {
        success: true,
        executedActions: [
          {
            id: `route_app_${pid}_${deviceId}`,
            name: `Set Process PID ${pid} Audio Route`,
            command: `Set-AppAudioDevice -PID ${pid} -DeviceID "${deviceId}" -Flow ${flowStr}`,
            output: { exitCode: 0, stdout: 'App audio route updated', stderr: '' },
            skipped: currentDryRun,
          },
        ],
        totalDurationMs: duration,
        isDryRun: currentDryRun,
      };

      addLog({
        level: 'info',
        message: `App audio routing updated for PID ${pid}.`,
      });
      addToast({
        type: 'success',
        title: 'App Audio Route Updated',
        message: `Updated audio endpoint route for PID ${pid}.`,
      });

      set((state) => ({
        appAudioSessions: state.appAudioSessions.map((session) => {
          if (session.pid === pid) {
            return {
              ...session,
              deviceId,
              outputDeviceId: flowStr === 'render' ? deviceId : session.outputDeviceId,
              inputDeviceId: flowStr === 'capture' ? deviceId : session.inputDeviceId,
            };
          }
          return session;
        }),
      }));

      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Set app audio device failed: ${errMsg}` });
      addToast({ type: 'error', title: 'App Routing Error', message: errMsg });
      return null;
    } finally {
      setIsExecuting(false);
    }
  },

  setAppVolume: async (pid: number, volume: number, muted: boolean, dryRun?: boolean) => {
    const currentDryRun = dryRun ?? get().dryRunMode;
    const { addLog } = get();
    const clampedVol = Math.max(0, Math.min(1, volume));

    set((state) => ({
      appAudioSessions: state.appAudioSessions.map((session) => {
        if (session.pid === pid) {
          return { ...session, volume: clampedVol, isMuted: muted };
        }
        return session;
      }),
    }));

    try {
      if (!currentDryRun) {
        await invoke('set_app_volume', { pid, volume: clampedVol, muted });
      }
      const summary: ExecutionSummary = {
        success: true,
        executedActions: [
          {
            id: `volume_app_${pid}`,
            name: `Set App PID ${pid} Volume/Mute`,
            command: `Set-AppVolume -PID ${pid} -Volume ${clampedVol} -Muted ${muted}`,
            output: { exitCode: 0, stdout: 'App volume updated', stderr: '' },
            skipped: currentDryRun,
          },
        ],
        totalDurationMs: 5,
        isDryRun: currentDryRun,
      };
      return summary;
    } catch (err) {
      const errMsg = getErrorMessage(err);
      addLog({ level: 'error', message: `Set app volume failed for PID ${pid}: ${errMsg}` });
      return null;
    }
  },
});

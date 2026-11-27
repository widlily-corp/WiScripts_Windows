import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { UpdateStatus, UpdateInfo } from '../../types';
import type { AppState } from '../useAppStore';
import { getErrorMessage } from '../../utils';

let cachedPendingUpdate: Update | null = null;

interface DownloadEventPayload {
  contentLength?: number;
  chunkLength?: number;
}

function extractDownloadPayload(event: DownloadEvent): DownloadEventPayload | undefined {
  const ev = event as unknown as { data?: DownloadEventPayload; payload?: DownloadEventPayload };
  return ev.data || ev.payload;
}

async function fetchReleaseNotesFallback(version: string): Promise<string | undefined> {
  const cleanVer = version.replace(/^v/, '');
  const urls = [
    `https://api.github.com/repos/widlily-corp/WiScripts_Windows/releases/tags/v${cleanVer}`,
    `https://api.github.com/repos/widlily-corp/WiScripts_Windows/releases/tags/${cleanVer}`,
    `https://raw.githubusercontent.com/widlily-corp/WiScripts_Windows/main/RELEASE_NOTES_${cleanVer}.md`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github.v3+json, text/plain' },
      });
      clearTimeout(timeoutId);

      if (!res.ok) continue;

      if (url.includes('api.github.com')) {
        const data = (await res.json()) as { body?: string };
        if (data.body && data.body.trim().length > 0) {
          return data.body.trim();
        }
      } else {
        const text = await res.text();
        if (text && text.trim().length > 0 && !text.includes('404: Not Found')) {
          return text.trim();
        }
      }
    } catch {
      // Ignore network errors on fallback
    }
  }
  return undefined;
}

export interface UpdaterSlice {
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
  openReleaseNotesModal: () => void;
  triggerMockUpdate: (mockInfo?: Partial<UpdateInfo>) => void;
  checkForUpdates: (silent?: boolean) => Promise<boolean>;
  downloadAndInstallUpdate: () => Promise<void>;
}

export const createUpdaterSlice: StateCreator<AppState, [], [], UpdaterSlice> = (set, get) => ({
  appVersion: '1.8.1',
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
    const current = get().appVersion || '1.8.1';
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
  openReleaseNotesModal: () => set({ bannerDismissed: false }),

  triggerMockUpdate: (mockInfo) => {
    if (!import.meta.env.DEV) {
      return;
    }
    const currentVer = get().appVersion || '1.8.1';
    const info: UpdateInfo = {
      version: mockInfo?.version || '1.8.2-dev',
      currentVersion: currentVer,
      body:
        mockInfo?.body ||
        `# What's New in v${mockInfo?.version || '1.8.2-dev'}\n\n- Development preview release notes.`,
      date: mockInfo?.date || new Date().toISOString().split('T')[0],
    };
    set({
      updateStatus: 'available',
      updateInfo: info,
      bannerDismissed: false,
      updateError: null,
    });
    get().addLog({
      level: 'info',
      message: `[Dev/Test] Triggered mock update: v${info.version}`,
    });
  },

  checkForUpdates: async (silent = false) => {
    set({ updateStatus: 'checking', updateError: null });
    if (!silent) {
      get().addLog({ level: 'cmd', message: 'Checking for application updates...' });
    }
    try {
      const update = await check();
      const now = new Date().toLocaleTimeString();
      set({ lastUpdateCheckTime: now });

      if (!update?.available) {
        cachedPendingUpdate = null;
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

      cachedPendingUpdate = update;
      let releaseBody = update.body?.trim();
      if (!releaseBody) {
        releaseBody = await fetchReleaseNotesFallback(update.version);
      }

      const info: UpdateInfo = {
        version: update.version,
        currentVersion: get().appVersion,
        body: releaseBody || undefined,
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
    } catch (err) {
      cachedPendingUpdate = null;
      let errMsg = getErrorMessage(err);

      if (
        errMsg.includes('Could not fetch a valid release JSON from the remote') ||
        errMsg.includes('latest.json') ||
        errMsg.includes('release JSON')
      ) {
        errMsg = 'Update check failed: No valid release manifest found on remote repository';
      }

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
      const update = cachedPendingUpdate ?? (await check());
      if (!update?.available) {
        cachedPendingUpdate = null;
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
        const payload = extractDownloadPayload(event);
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

      cachedPendingUpdate = null;
      set({ updateStatus: 'ready' });
      get().addLog({ level: 'info', message: 'Update installation complete. Relaunching application...' });
      get().addToast({
        type: 'success',
        title: 'Update Installed',
        message: 'WiScripts is restarting to apply changes.',
      });

      await relaunch();
    } catch (err) {
      const errMsg = getErrorMessage(err);
      set({ updateStatus: 'error', updateError: errMsg });
      get().addLog({ level: 'error', message: `Download/install failed: ${errMsg}` });
      get().addToast({
        type: 'error',
        title: 'Update Installation Failed',
        message: errMsg,
      });
    }
  },
});

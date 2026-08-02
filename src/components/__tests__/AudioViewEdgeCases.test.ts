import { useAppStore } from '../../store/useAppStore';
import { AudioDevicesPayload, AppAudioSession, TabType, ExecutionSummary } from '../../types';
import { getErrorMessage } from '../../utils';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

/**
 * AAA Empirical Stress Test Suite for Audio UI & Store
 */
export async function runAudioViewStressTests(): Promise<{ passed: number; failed: number; log: string[] }> {
  const logs: string[] = [];
  let passed = 0;
  let failed = 0;

  const logTest = async (title: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      passed++;
      logs.push(`✓ PASSED: ${title}`);
    } catch (err: unknown) {
      failed++;
      logs.push(`✗ FAILED: ${title} - ${getErrorMessage(err)}`);
    }
  };

  await logTest('Scenario 1.1: Store handles empty render and capture device lists gracefully', () => {
    const emptyPayload: AudioDevicesPayload = {
      renderDevices: [],
      captureDevices: [],
      defaultRenderId: null,
      defaultCaptureId: null,
    };

    useAppStore.setState({ audioDevicesPayload: emptyPayload, audioDevices: emptyPayload });
    const state = useAppStore.getState();

    const payload = state.audioDevicesPayload;
    assert(payload !== null, 'Payload is set');
    assert(payload?.renderDevices.length === 0, 'Render devices is empty array');
    assert(payload?.captureDevices.length === 0, 'Capture devices is empty array');
    const activeRender = (payload?.renderDevices || []).find((d) => d.id === payload?.defaultRenderId || d.isDefault) || payload?.renderDevices[0];
    assert(activeRender === undefined, 'Active render device resolves to undefined safely without crash');
  });

  await logTest('Scenario 1.2: App sessions list handles empty session array without throwing', () => {
    useAppStore.setState({ appAudioSessions: [] });
    const state = useAppStore.getState();

    assert(Array.isArray(state.appAudioSessions), 'appAudioSessions is array');
    assert(state.appAudioSessions.length === 0, 'appAudioSessions is empty');
  });

  await logTest('Scenario 2.1: Store handles 1000-character process names and unicode titles', () => {
    const longProcessName = 'System32_Driver_Host_Process_' + 'X'.repeat(500) + '.exe';
    const longDisplayName = '🔊 Extremely Long Audio Process Title with Unicode Test (рукописи не горят) ' + 'A'.repeat(500);

    const longSession: AppAudioSession = {
      pid: 99999,
      name: longProcessName,
      processName: longProcessName,
      displayName: longDisplayName,
      sessionId: 'session-long-99999',
      volume: 0.75,
      isMuted: false,
      deviceId: '{0.0.0.00000000}.{long-device-id}',
      flow: 'render',
      icon: 'app-window',
    };

    useAppStore.setState({ appAudioSessions: [longSession] });
    const state = useAppStore.getState();

    assert(state.appAudioSessions.length === 1, 'Long session added');
    assert(state.appAudioSessions[0].name.length > 500, 'Process name length > 500 preserved');
    assert(state.appAudioSessions[0].displayName?.includes('рукописи не горят') ?? false, 'Unicode chars preserved');
  });

  await logTest('Scenario 3.1: Burst call of 100 setAppVolume operations maintains state consistency & clamping', async () => {
    const session: AppAudioSession = {
      pid: 1234,
      name: 'RapidTestApp',
      processName: 'rapid.exe',
      sessionId: 'rapid-1234',
      volume: 0.5,
      isMuted: false,
      deviceId: 'dev-1',
      flow: 'render',
    };
    useAppStore.setState({ appAudioSessions: [session], dryRunMode: true });

    const promises: Promise<ExecutionSummary | null>[] = [];
    for (let i = 0; i <= 100; i++) {
      const vol = i / 50;
      promises.push(useAppStore.getState().setAppVolume(1234, vol, false));
    }
    await Promise.all(promises);

    const updatedState = useAppStore.getState();
    const updatedSession = updatedState.appAudioSessions.find((s) => s.pid === 1234);
    assert(updatedSession !== undefined, 'Session exists after burst updates');
    if (!updatedSession) {
      throw new Error('Session is undefined after burst updates');
    }
    assert(updatedSession.volume <= 1.0, `Volume clamped to <= 1.0, got ${updatedSession.volume}`);
    assert(updatedSession.volume >= 0.0, `Volume clamped to >= 0.0, got ${updatedSession.volume}`);
  });

  await logTest('Scenario 4.1: fetchAudioDevices catches IPC error and sets fallback state gracefully', async () => {
    useAppStore.setState({ audioDevicesPayload: null, isAudioLoading: false });

    const res = await useAppStore.getState().fetchAudioDevices();

    assert(res !== null, 'fetchAudioDevices returned fallback payload on dev mode');
    assert((res?.renderDevices.length ?? 0) > 0, 'Fallback contains render devices');
    assert(useAppStore.getState().isAudioLoading === false, 'Loading state reset to false');
  });

  await logTest('Scenario 4.2: fetchAppAudioSessions catches IPC error and sets fallback app sessions', async () => {
    useAppStore.setState({ appAudioSessions: [], isAudioLoading: false });

    const sessions = await useAppStore.getState().fetchAppAudioSessions();

    assert(sessions.length > 0, 'Fallback returned sessions');
    assert(useAppStore.getState().isAudioLoading === false, 'Loading state reset to false');
  });

  await logTest('Scenario 5.1: Rapid tab switching between audio_manager and other tabs preserves store state', () => {
    const initialTab = useAppStore.getState().activeTab;

    const tabs: TabType[] = ['dashboard', 'audio_manager', 'optimization', 'package_manager', 'audio_manager'];
    for (let i = 0; i < 20; i++) {
      useAppStore.getState().setActiveTab(tabs[i % tabs.length]);
    }

    const finalTab = useAppStore.getState().activeTab;
    assert(finalTab === 'audio_manager', 'Final active tab is audio_manager');
    useAppStore.getState().setActiveTab(initialTab);
  });

  return { passed, failed, log: logs };
}

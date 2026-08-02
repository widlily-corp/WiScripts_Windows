// Setup full browser window and localStorage mock BEFORE importing Zustand store
const storageStore = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageStore.get(key) ?? null,
  setItem: (key: string, value: string) => { storageStore.set(key, String(value)); },
  removeItem: (key: string) => { storageStore.delete(key); },
  clear: () => { storageStore.clear(); },
  get length() { return storageStore.size; },
  key: (index: number) => Array.from(storageStore.keys())[index] ?? null,
};

(globalThis as any).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: any) => {
      if (cmd === 'get_system_info') {
        return {
          osName: 'Windows 11 Pro',
          osVersion: '23H2',
          osBuild: '22631.3880',
          isElevated: true,
          cpuUsagePercent: 15,
          memoryUsedMb: 8192,
          memoryTotalMb: 16384,
          telemetryStatus: 'Active',
        };
      }
      if (cmd === 'run_diagnostics') {
        return {
          success: true,
          executedActions: [
            {
              id: 'diag_1',
              name: 'Diagnostic Action',
              command: `diag.exe ${args?.action}`,
              output: { exitCode: 0, stdout: 'OK', stderr: '' },
              skipped: Boolean(args?.dryRun),
            },
          ],
          totalDurationMs: 25,
          isDryRun: Boolean(args?.dryRun),
        };
      }
      if (cmd === 'apply_optimization_profile') {
        return {
          success: true,
          executedActions: [
            {
              id: 'opt_1',
              name: 'Apply Profile',
              command: `opt.exe ${args?.profileId}`,
              output: { exitCode: 0, stdout: 'Applied', stderr: '' },
              skipped: Boolean(args?.dryRun),
            },
          ],
          totalDurationMs: 40,
          isDryRun: Boolean(args?.dryRun),
        };
      }
      if (cmd === 'winget_install') {
        return {
          success: true,
          executedActions: [
            {
              id: `install_${args?.packageId}`,
              name: 'Winget Install',
              command: `winget install ${args?.packageId}`,
              output: { exitCode: 0, stdout: 'Installed', stderr: '' },
              skipped: Boolean(args?.dryRun),
            },
          ],
          totalDurationMs: 100,
          isDryRun: Boolean(args?.dryRun),
        };
      }
      if (cmd === 'set_dns_server') {
        return {
          success: true,
          executedActions: [
            {
              id: 'dns_1',
              name: 'Set DNS',
              command: `netsh interface ip set dns "${args?.provider}"`,
              output: { exitCode: 0, stdout: 'DNS set', stderr: '' },
              skipped: Boolean(args?.dryRun),
            },
          ],
          totalDurationMs: 10,
          isDryRun: Boolean(args?.dryRun),
        };
      }
      if (cmd === 'get_audio_devices') {
        return {
          renderDevices: [
            { id: 'render_1', name: 'Speakers', isDefault: true, flow: 'render' },
            { id: 'render_2', name: 'Headphones', isDefault: false, flow: 'render' },
          ],
          captureDevices: [
            { id: 'capture_1', name: 'Microphone', isDefault: true, flow: 'capture' },
          ],
          defaultRenderId: 'render_1',
          defaultCaptureId: 'capture_1',
        };
      }
      if (cmd === 'get_system_metrics') {
        return {
          timestampMs: Date.now(),
          cpuUsagePercent: 20,
          memoryUsedMb: 8000,
          memoryTotalMb: 16000,
          memoryUsagePercent: 50,
          diskReadBytesPerSec: 1000,
          diskWriteBytesPerSec: 2000,
          networkRxBytesPerSec: 5000,
          networkTxBytesPerSec: 3000,
        };
      }
      if (cmd === 'get_system_temperatures') {
        return {
          cpuTempCelsius: 50,
          gpuTempCelsius: 45,
        };
      }
      if (cmd === 'log_frontend_event') {
        return null;
      }
      return {};
    },
    transformCallback: (cb: any) => cb,
  },
  localStorage: mockLocalStorage,
};
(globalThis as any).__TAURI_INTERNALS__ = (globalThis as any).window.__TAURI_INTERNALS__;
(globalThis as any).localStorage = mockLocalStorage;

import { useAppStore } from '../store/useAppStore';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runAdversarialStressTests() {
  console.log('====================================================');
  console.log(' ADVERSARIAL STRESS TEST SUITE: Zustand State Store');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST 1: useAppStore.getState() Behavior & Direct Access
  // ----------------------------------------------------
  console.log('[Test 1] useAppStore.getState() Direct Access & Slice Cohesion');
  const store = useAppStore.getState();
  assert(typeof store.setDryRunMode === 'function', 'systemSlice method setDryRunMode exists');
  assert(typeof store.checkForUpdates === 'function', 'updaterSlice method checkForUpdates exists');
  assert(typeof store.addToast === 'function', 'uiSlice method addToast exists');
  assert(typeof store.setSelectedCategory === 'function', 'optimizationSlice method setSelectedCategory exists');
  assert(typeof store.fetchAudioDevices === 'function', 'audioSlice method fetchAudioDevices exists');
  assert(typeof store.wingetSearch === 'function', 'packageManagerSlice method wingetSearch exists');
  assert(typeof store.setDnsServer === 'function', 'systemToolsSlice method setDnsServer exists');

  // Verify non-hook state modifications
  store.setAppVersion('1.2.3');
  assert(useAppStore.getState().appVersion === '1.2.3', 'getState() reflects updated appVersion');
  store.setSelectedCategory('privacy');
  assert(useAppStore.getState().selectedCategory === 'privacy', 'getState() reflects updated selectedCategory');
  store.updateOdtConfig({ architecture: 'x86', language: 'de-de' });
  assert(useAppStore.getState().odtConfig.architecture === 'x86', 'getState() reflects partial update to odtConfig');
  assert(useAppStore.getState().odtConfig.language === 'de-de', 'getState() preserves patch fields in odtConfig');

  // ----------------------------------------------------
  // TEST 2: Listener Subscriptions (useAppStore.subscribe)
  // ----------------------------------------------------
  console.log('\n[Test 2] Listener Subscriptions & Unsubscribe Lifecycle');
  let listenerCallCount = 0;
  let lastObservedDryRun: boolean | null = null;
  let lastObservedTab: string | null = null;

  const unsubscribe = useAppStore.subscribe((state) => {
    listenerCallCount++;
    lastObservedDryRun = state.dryRunMode;
    lastObservedTab = state.activeTab;
  });

  const initialCount = listenerCallCount;
  store.setDryRunMode(true);
  assert(listenerCallCount === initialCount + 1, 'Subscriber notified on setDryRunMode change');
  assert(lastObservedDryRun === true, 'Subscriber received correct updated state value (dryRunMode=true)');

  store.setActiveTab('audio_manager');
  assert(listenerCallCount === initialCount + 2, 'Subscriber notified on setActiveTab change');
  assert(lastObservedTab === 'audio_manager', 'Subscriber received correct updated state value (activeTab=audio_manager)');

  // Unsubscribe and verify no further notifications
  unsubscribe();
  store.setDryRunMode(false);
  assert(listenerCallCount === initialCount + 2, 'Unsubscribed listener does NOT receive notifications after unsubscribe()');
  assert(lastObservedDryRun === true, 'Stale subscriber variable remains unchanged after unsubscribe()');

  // ----------------------------------------------------
  // TEST 3: Concurrent State Updates Across Multiple Slices
  // ----------------------------------------------------
  console.log('\n[Test 3] Concurrent State Updates Across Slices');
  store.clearLogs();
  useAppStore.setState({ toasts: [] });

  // Each iteration calls addToast explicitly (1), runDiagnostics (adds 1 toast), setGlobalAudioDevice (adds 1 toast)
  // Total toasts generated per iteration = 3 -> Total for 50 iterations = 150
  const concurrentOperations = Array.from({ length: 50 }, (_, i) => {
    return Promise.all([
      Promise.resolve().then(() => store.addToast({ type: 'info', title: `Toast ${i}`, message: `Msg ${i}` })),
      Promise.resolve().then(() => store.addLog({ level: 'cmd', message: `Log ${i}` })),
      Promise.resolve().then(() => store.pushMetricSnapshot({
        timestamp: Date.now() + i,
        cpuUsagePercent: i % 100,
        memoryUsedMb: 4000 + i,
        memoryTotalMb: 16384,
        memoryUsagePercent: ((4000 + i) / 16384) * 100,
        diskReadBytesPerSec: 0,
        diskWriteBytesPerSec: 0,
        networkRxBytesPerSec: 0,
        networkTxBytesPerSec: 0,
        cpuTempC: 45,
        gpuTempC: 40,
        cpuThermalStatus: 'normal',
        gpuThermalStatus: 'normal',
      })),
      store.runDiagnostics(`test_action_${i}`, true),
      store.setGlobalAudioDevice('render_1', 'render', true),
    ]);
  });

  await Promise.all(concurrentOperations);

  const finalState = useAppStore.getState();
  assert(finalState.toasts.length === 150, `All 150 concurrent toasts (50 direct + 50 diag + 50 audio) added cleanly without race conditions`);
  assert(finalState.logs.length >= 100, 'Logs created concurrently across system diagnostics and audio devices');
  assert(finalState.metricsHistory.length === 30, 'Metrics history strictly capped at 30 snapshots under high concurrency');
  assert(finalState.isExecuting === false, 'isExecuting cleanly reset to false after all async concurrent tasks completed');

  // ----------------------------------------------------
  // TEST 4: State Reset & Operations
  // ----------------------------------------------------
  console.log('\n[Test 4] State Reset Operations & Collection Clearing');
  store.clearLogs();
  assert(useAppStore.getState().logs.length === 0, 'clearLogs() empties logs array completely');

  store.selectAllOptimizations();
  const countBeforeDeselect = useAppStore.getState().optimizations.filter(o => o.isSelected).length;
  assert(countBeforeDeselect > 0, 'selectAllOptimizations() selects optimization items');

  store.deselectAllOptimizations();
  const countAfterDeselect = useAppStore.getState().optimizations.filter(o => o.isSelected).length;
  assert(countAfterDeselect === 0, 'deselectAllOptimizations() unselects all optimization items');

  // Toast clear / dismiss all loop test
  const currentToasts = [...useAppStore.getState().toasts];
  currentToasts.forEach((t) => store.dismissToast(t.id));
  assert(useAppStore.getState().toasts.length === 0, 'Individual dismissToast calls clear all remaining toasts');

  // ----------------------------------------------------
  // TEST 5: Dry Run Toggles & Parameter Fallback Hierarchy
  // ----------------------------------------------------
  console.log('\n[Test 5] Dry Run Mode Fallback & Explicit Override Hierarchy');
  // Scenario A: Store dryRunMode = false, explicit dryRun = true
  store.setDryRunMode(false);
  assert(useAppStore.getState().dryRunMode === false, 'Store dryRunMode set to false');
  const summaryA = await store.runDiagnostics('diag_a', true);
  assert(summaryA?.isDryRun === true, 'Explicit dryRun=true parameter overrides store dryRunMode=false');

  // Scenario B: Store dryRunMode = true, omitted dryRun parameter
  store.setDryRunMode(true);
  assert(useAppStore.getState().dryRunMode === true, 'Store dryRunMode set to true');
  const summaryB = await store.runDiagnostics('diag_b');
  assert(summaryB?.isDryRun === true, 'Omitted dryRun parameter falls back to store dryRunMode=true');

  // Scenario C: Store dryRunMode = true, explicit dryRun = false
  const summaryC = await store.runDiagnostics('diag_c', false);
  assert(summaryC?.isDryRun === false, 'Explicit dryRun=false parameter overrides store dryRunMode=true');

  // Test across multiple domain actions: wingetInstall, setDnsServer, applyOptimizationProfile
  const optSummary = await store.applyOptimizationProfile('profile_1');
  assert(optSummary?.isDryRun === true, 'applyOptimizationProfile falls back to store dryRunMode=true');

  const wingetSummary = await store.wingetInstall('Git.Git', false);
  assert(wingetSummary?.isDryRun === false, 'wingetInstall explicitly overrides store dryRunMode=true with false');

  const dnsSummary = await store.setDnsServer('cloudflare');
  assert(dnsSummary?.isDryRun === true, 'setDnsServer falls back to store dryRunMode=true');

  // Restore dryRunMode to false
  store.setDryRunMode(false);

  // ----------------------------------------------------
  // TEST 6: Toast Notifications List Overflow & Stress Testing
  // ----------------------------------------------------
  console.log('\n[Test 6] Toast Notifications List Overflow & Stress Test (1,000 toasts)');
  // Reset toasts array cleanly before overflow test
  useAppStore.setState({ toasts: [] });

  const overflowStart = Date.now();
  const toastIds: string[] = [];

  for (let i = 0; i < 1000; i++) {
    const id = store.addToast({
      type: i % 2 === 0 ? 'info' : 'success',
      title: `Stress Toast ${i}`,
      message: `High frequency notification message content ${i}`,
    });
    toastIds.push(id);
  }
  const overflowDuration = Date.now() - overflowStart;

  const toastCountAfterInsert = useAppStore.getState().toasts.length;
  assert(toastCountAfterInsert === 1000, `1,000 toasts inserted successfully in ${overflowDuration}ms`);
  assert(new Set(toastIds).size === 1000, 'All 1,000 generated toast UUIDs are distinct and unique');

  // Test mass dismissal performance
  const dismissStart = Date.now();
  // Dismiss first 500
  for (let i = 0; i < 500; i++) {
    store.dismissToast(toastIds[i]);
  }
  const dismissDuration = Date.now() - dismissStart;
  assert(useAppStore.getState().toasts.length === 500, `500 toasts dismissed correctly in ${dismissDuration}ms`);

  // Dismiss remaining 500
  for (let i = 500; i < 1000; i++) {
    store.dismissToast(toastIds[i]);
  }
  assert(useAppStore.getState().toasts.length === 0, 'All remaining 500 toasts dismissed; store.toasts length is 0');

  console.log('\n====================================================');
  console.log(' ALL ADVERSARIAL STRESS TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('====================================================\n');
}

runAdversarialStressTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Adversarial Stress Test Failed:', err);
    process.exit(1);
  });

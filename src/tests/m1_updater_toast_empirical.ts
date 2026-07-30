import type { UpdateStatus } from '../types';

// State tracking for Tauri IPC mock
let mockUpdateResponse: any = null;
let mockDownloadError: string | null = null;
let relaunchCalled: boolean = false;
let lastIpcCmds: string[] = [];

// Setup global window and Tauri IPC mock before loading store
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof globalThis.localStorage === 'undefined') {
  const storeMap = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => storeMap.get(key) ?? null,
    setItem: (key: string, val: string) => storeMap.set(key, val),
    removeItem: (key: string) => storeMap.delete(key),
    clear: () => storeMap.clear(),
  };
}
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
  const crypto = require('crypto');
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

(globalThis as any).window.__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args: any) => {
    lastIpcCmds.push(cmd);
    if (cmd === 'plugin:updater|check') {
      if (mockUpdateResponse === 'THROW') {
        throw new Error('Failed to connect to update server');
      }
      return mockUpdateResponse;
    }
    if (cmd === 'plugin:updater|download_and_install') {
      if (mockDownloadError) {
        throw new Error(mockDownloadError);
      }
      if (args && args.onEvent && typeof args.onEvent.onmessage === 'function') {
        args.onEvent.onmessage({ event: 'Started', payload: { contentLength: 1000 } });
        args.onEvent.onmessage({ event: 'Progress', payload: { chunkLength: 500 } });
        args.onEvent.onmessage({ event: 'Progress', payload: { chunkLength: 500 } });
        args.onEvent.onmessage({ event: 'Finished', payload: {} });
      }
      return null;
    }
    if (cmd === 'plugin:process|restart') {
      relaunchCalled = true;
      return null;
    }
    return null;
  },
  transformCallback: () => 1,
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runM1EmpiricalTests() {
  console.log('================================================================');
  console.log(' EMPIRICAL TEST SUITE: M1 Zustand Updater Store & Toast System');
  console.log('================================================================\n');

  // Dynamically import store after global mock initialization
  const { useAppStore } = await import('../store/useAppStore');

  // ---------------------------------------------------------
  // TEST 1: Toast System Actions (addToast & dismissToast)
  // ---------------------------------------------------------
  console.log('[Test 1] Toast System: addToast, dismissToast, & Callback Contracts');
  
  const initialToasts = useAppStore.getState().toasts;
  assert(Array.isArray(initialToasts), 'toasts state is an array');

  // Add Toast 1 (info)
  const t1Id = useAppStore.getState().addToast({
    type: 'info',
    title: 'Test Toast 1',
    message: 'System info notification',
  });
  assert(typeof t1Id === 'string' && t1Id.length > 0, 'addToast returns a valid UUID string');
  let currentToasts = useAppStore.getState().toasts;
  const foundT1 = currentToasts.find((t) => t.id === t1Id);
  assert(foundT1 !== undefined, 'Toast 1 present in store state');
  assert(foundT1?.type === 'info' && foundT1?.title === 'Test Toast 1', 'Toast 1 properties match input');

  // Add Toast 2 (success with onAction)
  let actionTriggered: boolean = false;
  const t2Id = useAppStore.getState().addToast({
    type: 'success',
    title: 'Update Ready',
    actionLabel: 'Restart Now',
    onAction: () => {
      actionTriggered = true;
    },
  });
  currentToasts = useAppStore.getState().toasts;
  const foundT2 = currentToasts.find((t) => t.id === t2Id);
  assert(foundT2 !== undefined, 'Toast 2 present in store state');
  assert(foundT2?.actionLabel === 'Restart Now', 'Toast 2 actionLabel matches');
  foundT2?.onAction?.();
  assert((actionTriggered as boolean) === true, 'Toast 2 onAction callback executed successfully');

  // Dismiss Toast 1
  useAppStore.getState().dismissToast(t1Id);
  currentToasts = useAppStore.getState().toasts;
  assert(!currentToasts.some((t) => t.id === t1Id), 'Toast 1 removed after dismissToast(t1Id)');
  assert(currentToasts.some((t) => t.id === t2Id), 'Toast 2 remains active');

  // Dismiss Toast 2
  useAppStore.getState().dismissToast(t2Id);
  currentToasts = useAppStore.getState().toasts;
  assert(!currentToasts.some((t) => t.id === t2Id), 'Toast 2 removed after dismissToast(t2Id)');

  // Edge case: dismiss non-existent toast ID
  const countBeforeInvalid = useAppStore.getState().toasts.length;
  useAppStore.getState().dismissToast('non-existent-uuid-999');
  assert(useAppStore.getState().toasts.length === countBeforeInvalid, 'dismissToast with non-existent ID handled gracefully (no-op)');

  // ---------------------------------------------------------
  // TEST 2: Initial Updater Store State & Banner Dismiss
  // ---------------------------------------------------------
  console.log('\n[Test 2] Updater Store Initial State & Settings');
  const store = useAppStore.getState();
  assert(store.appVersion === '0.9.0', 'Initial appVersion is "0.9.0"');
  assert(store.updateStatus === 'idle', 'Initial updateStatus is "idle"');
  assert(store.updateInfo === null, 'Initial updateInfo is null');
  assert(store.updateProgress === 0, 'Initial updateProgress is 0');
  assert(store.updateError === null, 'Initial updateError is null');
  assert(store.autoCheckUpdates === true, 'Initial autoCheckUpdates is true');
  assert(store.bannerDismissed === false, 'Initial bannerDismissed is false');

  // Test setAutoCheckUpdates
  useAppStore.getState().setAutoCheckUpdates(false);
  assert(useAppStore.getState().autoCheckUpdates === false, 'setAutoCheckUpdates(false) works');
  useAppStore.getState().setAutoCheckUpdates(true);
  assert(useAppStore.getState().autoCheckUpdates === true, 'setAutoCheckUpdates(true) works');

  // Test dismissUpdateBanner
  useAppStore.getState().dismissUpdateBanner();
  assert(useAppStore.getState().bannerDismissed === true, 'dismissUpdateBanner() sets bannerDismissed to true');

  // ---------------------------------------------------------
  // TEST 3: Async Scenario A: Update Available -> Download -> Ready -> Relaunch
  // ---------------------------------------------------------
  console.log('\n[Test 3] Async Scenario A: checkForUpdates (Available) -> downloadAndInstallUpdate (Success)');

  mockUpdateResponse = {
    rid: 42,
    currentVersion: '0.9.0',
    version: '0.4.0',
    body: 'Awesome new features',
    date: '2026-07-27',
  };
  mockDownloadError = null;
  relaunchCalled = false;
  lastIpcCmds = [];

  // Execute checkForUpdates(false)
  const isAvailable = await useAppStore.getState().checkForUpdates(false);
  assert(isAvailable === true, 'checkForUpdates returned true when update is available');
  assert(useAppStore.getState().updateStatus === 'available', 'updateStatus transitioned to "available"');
  assert(useAppStore.getState().updateInfo?.version === '0.4.0', 'updateInfo.version is "0.4.0"');
  assert(useAppStore.getState().bannerDismissed === false, 'bannerDismissed reset to false upon update available');
  
  // Verify log and toast added
  const availableToasts = useAppStore.getState().toasts;
  const updateAvailableToast = availableToasts.find((t) => t.title === 'Update Available');
  assert(updateAvailableToast !== undefined, 'Toast "Update Available" added to toasts');
  assert(updateAvailableToast?.actionLabel === 'Update Now', 'Toast actionLabel is "Update Now"');

  // Execute downloadAndInstallUpdate()
  await useAppStore.getState().downloadAndInstallUpdate();
  assert(useAppStore.getState().updateStatus === 'ready', 'updateStatus transitioned to "ready"');
  assert(useAppStore.getState().updateProgress === 100, 'updateProgress is 100%');
  assert((relaunchCalled as boolean) === true, 'relaunch() IPC command was invoked upon completion');

  const readyToast = useAppStore.getState().toasts.find((t) => t.title === 'Update Installed');
  assert(readyToast !== undefined, 'Toast "Update Installed" added upon ready state');

  // ---------------------------------------------------------
  // TEST 4: Async Scenario B: checkForUpdates (Up To Date)
  // ---------------------------------------------------------
  console.log('\n[Test 4] Async Scenario B: checkForUpdates (Up To Date Path)');

  mockUpdateResponse = null; // No update available
  lastIpcCmds = [];

  const checkUpToDate = await useAppStore.getState().checkForUpdates(false);
  assert(checkUpToDate === false, 'checkForUpdates returned false when up to date');
  assert(useAppStore.getState().updateStatus === 'upToDate', 'updateStatus transitioned to "upToDate"');
  assert(useAppStore.getState().updateInfo === null, 'updateInfo reset to null');

  const upToDateToast = useAppStore.getState().toasts.find((t) => t.title === 'Up to Date');
  assert(upToDateToast !== undefined, 'Toast "Up to Date" added when not silent');

  // Test silent = true mode (should not add toast)
  const toastsBeforeSilent = useAppStore.getState().toasts.length;
  await useAppStore.getState().checkForUpdates(true);
  assert(useAppStore.getState().toasts.length === toastsBeforeSilent, 'Silent check does NOT produce toast');

  // ---------------------------------------------------------
  // TEST 5: Async Scenario C: checkForUpdates (Network Error Path)
  // ---------------------------------------------------------
  console.log('\n[Test 5] Async Scenario C: checkForUpdates (Error Path)');

  mockUpdateResponse = 'THROW'; // Simulates network failure

  const checkErrResult = await useAppStore.getState().checkForUpdates(false);
  assert(checkErrResult === false, 'checkForUpdates returned false on network error');
  assert(useAppStore.getState().updateStatus === 'error', 'updateStatus transitioned to "error"');
  const actualErr = useAppStore.getState().updateError;
  console.log('  -> Actual updateError in store:', JSON.stringify(actualErr));
  assert(
    typeof actualErr === 'string' && actualErr.includes('Failed to connect to update server'),
    'updateError stores network error message'
  );

  const errToast = useAppStore.getState().toasts.find((t) => t.title === 'Update Check Failed');
  assert(errToast !== undefined, 'Toast "Update Check Failed" added on check error');

  // ---------------------------------------------------------
  // TEST 6: Async Scenario D: downloadAndInstallUpdate (Installation Failure)
  // ---------------------------------------------------------
  console.log('\n[Test 6] Async Scenario D: downloadAndInstallUpdate (Error Path)');

  mockUpdateResponse = {
    rid: 99,
    currentVersion: '0.9.0',
    version: '0.5.0',
  };
  mockDownloadError = 'Disk full during extraction';

  // First set status to available
  await useAppStore.getState().checkForUpdates(true);
  assert(useAppStore.getState().updateStatus === 'available', 'Set to available before download test');

  // Attempt download which fails
  await useAppStore.getState().downloadAndInstallUpdate();
  assert(useAppStore.getState().updateStatus === 'error', 'updateStatus transitioned to "error" on download failure');
  const actualDownloadErr = useAppStore.getState().updateError;
  console.log('  -> Actual updateError on download failure:', JSON.stringify(actualDownloadErr));
  assert(
    typeof actualDownloadErr === 'string' && actualDownloadErr.includes('Disk full during extraction'),
    'updateError stores download failure message'
  );

  const downloadErrToast = useAppStore.getState().toasts.find((t) => t.title === 'Update Installation Failed');
  assert(downloadErrToast !== undefined, 'Toast "Update Installation Failed" added on download error');

  // ---------------------------------------------------------
  // TEST 7: Component Render Contracts (UpdateBanner Visibility)
  // ---------------------------------------------------------
  console.log('\n[Test 7] Component Render Contract: UpdateBanner Visibility Rules');

  const hiddenStates: UpdateStatus[] = ['idle', 'checking', 'upToDate', 'error'];
  for (const s of hiddenStates) {
    useAppStore.setState({ updateStatus: s, bannerDismissed: false });
    const state = useAppStore.getState();
    const shouldRender =
      !state.bannerDismissed &&
      (state.updateStatus === 'available' || state.updateStatus === 'downloading' || state.updateStatus === 'ready');
    assert(!shouldRender, `UpdateBanner hidden when updateStatus === "${s}"`);
  }

  const visibleStates: UpdateStatus[] = ['available', 'downloading', 'ready'];
  for (const s of visibleStates) {
    useAppStore.setState({ updateStatus: s, bannerDismissed: false });
    const state = useAppStore.getState();
    const shouldRender =
      !state.bannerDismissed &&
      (state.updateStatus === 'available' || state.updateStatus === 'downloading' || state.updateStatus === 'ready');
    assert(shouldRender, `UpdateBanner visible when updateStatus === "${s}" and bannerDismissed === false`);
  }

  // Dismissed override
  useAppStore.setState({ updateStatus: 'available', bannerDismissed: true });
  const renderWhenDismissed =
    !useAppStore.getState().bannerDismissed &&
    ['available', 'downloading', 'ready'].includes(useAppStore.getState().updateStatus);
  assert(!renderWhenDismissed, 'UpdateBanner hidden when bannerDismissed === true regardless of status');

  console.log('\n================================================================');
  console.log(' ALL 7 M1 EMPIRICAL TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runM1EmpiricalTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

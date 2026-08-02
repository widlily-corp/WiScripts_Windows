import type { ExecutionSummary, RestorePoint, UwpAppInfo } from '../types';

let mockUpdateResponse: any = null;
let mockInvokeHandler: ((cmd: string, args: any) => Promise<any>) | null = null;
let fetchRestorePointsCalled: boolean = false;

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

const storeMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storeMap.get(key) ?? null,
  setItem: (key: string, val: string) => storeMap.set(key, val),
  removeItem: (key: string) => storeMap.delete(key),
  clear: () => storeMap.clear(),
};

if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
  const crypto = require('crypto');
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

(globalThis as any).window.__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args: any) => {
    if (cmd === 'plugin:updater|check') {
      if (mockUpdateResponse === 'THROW_RELEASE_JSON') {
        throw new Error('Could not fetch a valid release JSON from the remote');
      }
      if (mockUpdateResponse === 'THROW_GENERIC') {
        throw new Error('Network error: server timeout');
      }
      return mockUpdateResponse;
    }
    if (mockInvokeHandler) {
      return await mockInvokeHandler(cmd, args);
    }
    return {};
  },
  transformCallback: (cb: any) => cb,
};
(globalThis as any).__TAURI_INTERNALS__ = (globalThis as any).window.__TAURI_INTERNALS__;

import { useAppStore } from '../store/useAppStore';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runEarlyReturnStressTests() {
  console.log('===============================================================');
  console.log(' EMPIRICAL STRESS TEST HARNESS: Early Return Control Flows (R3)');
  console.log('===============================================================\n');

  // =========================================================================
  // 1. Stress Testing checkForUpdates early returns & failure paths
  // =========================================================================
  console.log('[Suite 1] Stress Testing checkForUpdates Early Return Control Flows');

  // Test 1.1: Up to date (null returned by IPC check) -> Early Return false
  mockUpdateResponse = null;
  let result = await useAppStore.getState().checkForUpdates(false);
  let state = useAppStore.getState();
  assert(result === false, 'checkForUpdates returns false when update is not available (IPC returns null)');
  assert(state.updateStatus === 'upToDate', 'updateStatus set to "upToDate" on early return');
  assert(state.updateInfo === null, 'updateInfo is null on early return');
  assert(state.updateError === null, 'updateError is null when up to date');

  // Test 1.2: Update available -> Normal flow return true
  mockUpdateResponse = { rid: 1, currentVersion: '0.9.0', version: '1.0.0', body: 'New features', date: '2026-08-01' };
  result = await useAppStore.getState().checkForUpdates(false);
  state = useAppStore.getState();
  assert(result === true, 'checkForUpdates returns true when update is available');
  assert(state.updateStatus === 'available', 'updateStatus set to "available"');
  assert(state.updateInfo?.version === '1.0.0', 'updateInfo properly structured');

  // Test 1.3: Release manifest error -> Catch block early exit
  mockUpdateResponse = 'THROW_RELEASE_JSON';
  result = await useAppStore.getState().checkForUpdates(false);
  state = useAppStore.getState();
  assert(result === false, 'checkForUpdates returns false on release JSON error');
  assert(state.updateStatus === 'error', 'updateStatus set to "error" on exception');
  assert(
    state.updateError === 'Update check failed: No valid release manifest found on remote repository',
    'Error message normalized for release JSON failure'
  );

  // Test 1.4: Generic network error -> Catch block early exit
  mockUpdateResponse = 'THROW_GENERIC';
  result = await useAppStore.getState().checkForUpdates(false);
  state = useAppStore.getState();
  assert(result === false, 'checkForUpdates returns false on generic network error');
  assert(state.updateStatus === 'error', 'updateStatus set to "error"');
  assert(state.updateError === 'Network error: server timeout', 'Generic error message preserved via getErrorMessage');

  console.log('✓ checkForUpdates early return stress tests passed!\n');

  // =========================================================================
  // 2. Stress Testing removeUwpApp early returns & failure paths
  // =========================================================================
  console.log('[Suite 2] Stress Testing removeUwpApp Early Return Control Flows');

  const initialUwpApps: UwpAppInfo[] = [
    { name: 'App1', packageFullName: 'App1_1.0_x64', publisherId: 'Publisher1', isFramework: false },
    { name: 'App2', packageFullName: 'App2_2.0_x64', publisherId: 'Publisher2', isFramework: false },
  ];

  // Test 2.1: Success path -> removes app from state
  useAppStore.setState({ uwpApps: [...initialUwpApps], isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'remove_uwp_app') {
      return {
        success: true,
        executedActions: [],
        totalDurationMs: 10,
        isDryRun: false,
      } satisfies ExecutionSummary;
    }
    return {};
  };

  let removeSummary = await useAppStore.getState().removeUwpApp('App1_1.0_x64', false);
  state = useAppStore.getState();
  assert(removeSummary?.success === true, 'removeUwpApp returns success summary on success');
  assert(state.uwpApps.length === 1, 'App removed from uwpApps array on success');
  assert(state.uwpApps[0].packageFullName === 'App2_2.0_x64', 'Remaining app is intact');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block');

  // Test 2.2: Failure path (summary.success === false) -> Early return without modifying uwpApps state
  useAppStore.setState({ uwpApps: [...initialUwpApps], isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'remove_uwp_app') {
      return {
        success: false,
        executedActions: [
          {
            id: 'action_1',
            name: 'Remove App1',
            command: 'Remove-AppxPackage',
            output: { exitCode: 1, stdout: '', stderr: 'Access denied: privilege required' },
            skipped: false,
          },
        ],
        totalDurationMs: 10,
        isDryRun: false,
      } satisfies ExecutionSummary;
    }
    return {};
  };

  removeSummary = await useAppStore.getState().removeUwpApp('App1_1.0_x64', false);
  state = useAppStore.getState();
  assert(removeSummary?.success === false, 'removeUwpApp returns failed summary on early return');
  assert(state.uwpApps.length === 2, 'uwpApps state NOT modified on early return failure path');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block after early return');
  assert(
    state.toasts.some((t) => t.message === 'Access denied: privilege required'),
    'Error toast generated from stderr on early return failure'
  );

  // Test 2.3: Rejection/Exception path -> Catch block returns null without crash
  useAppStore.setState({ uwpApps: [...initialUwpApps], isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'remove_uwp_app') {
      throw new Error('IPC Connection lost during remove_uwp_app');
    }
    return {};
  };

  removeSummary = await useAppStore.getState().removeUwpApp('App1_1.0_x64', false);
  state = useAppStore.getState();
  assert(removeSummary === null, 'removeUwpApp returns null on IPC rejection');
  assert(state.uwpApps.length === 2, 'uwpApps state NOT modified on IPC rejection');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block after exception');
  assert(
    state.toasts.some((t) => t.message === 'IPC Connection lost during remove_uwp_app'),
    'Error toast generated via getErrorMessage on IPC rejection'
  );

  console.log('✓ removeUwpApp early return stress tests passed!\n');

  // =========================================================================
  // 3. Stress Testing toggleClassicContextMenu early returns & failure paths
  // =========================================================================
  console.log('[Suite 3] Stress Testing toggleClassicContextMenu Early Return Control Flows');

  // Test 3.1: Success path -> updates classicContextMenuEnabled state
  useAppStore.setState({ classicContextMenuEnabled: false, isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'toggle_classic_context_menu') {
      return {
        success: true,
        executedActions: [],
        totalDurationMs: 10,
        isDryRun: false,
      } satisfies ExecutionSummary;
    }
    return {};
  };

  let toggleSummary = await useAppStore.getState().toggleClassicContextMenu(true, false);
  state = useAppStore.getState();
  assert(toggleSummary?.success === true, 'toggleClassicContextMenu returns success summary');
  assert(state.classicContextMenuEnabled === true, 'classicContextMenuEnabled state updated to true on success');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block');

  // Test 3.2: Failure path (summary.success === false) -> Early return without changing state
  useAppStore.setState({ classicContextMenuEnabled: false, isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'toggle_classic_context_menu') {
      return {
        success: false,
        executedActions: [
          {
            id: 'action_2',
            name: 'Set Registry Key',
            command: 'reg add',
            output: { exitCode: 5, stdout: '', stderr: 'Registry key is write-protected' },
            skipped: false,
          },
        ],
        totalDurationMs: 10,
        isDryRun: false,
      } satisfies ExecutionSummary;
    }
    return {};
  };

  toggleSummary = await useAppStore.getState().toggleClassicContextMenu(true, false);
  state = useAppStore.getState();
  assert(toggleSummary?.success === false, 'toggleClassicContextMenu returns failure summary on early return');
  assert(state.classicContextMenuEnabled === false, 'classicContextMenuEnabled remains false (unmodified) on early return');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block after early return');
  assert(
    state.toasts.some((t) => t.message === 'Registry key is write-protected'),
    'Error toast generated from stderr on early return'
  );

  // Test 3.3: Exception path -> Catch block returns null without unhandled rejection
  useAppStore.setState({ classicContextMenuEnabled: false, isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'toggle_classic_context_menu') {
      throw new Error('System registry service unavailable');
    }
    return {};
  };

  toggleSummary = await useAppStore.getState().toggleClassicContextMenu(true, false);
  state = useAppStore.getState();
  assert(toggleSummary === null, 'toggleClassicContextMenu returns null on exception');
  assert(state.classicContextMenuEnabled === false, 'classicContextMenuEnabled remains false on exception');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block after exception');
  assert(
    state.toasts.some((t) => t.message === 'System registry service unavailable'),
    'Error toast generated via getErrorMessage on exception'
  );

  console.log('✓ toggleClassicContextMenu early return stress tests passed!\n');

  // =========================================================================
  // 4. Stress Testing createRestorePoint early returns & failure paths
  // =========================================================================
  console.log('[Suite 4] Stress Testing createRestorePoint Early Return Control Flows');

  fetchRestorePointsCalled = false;

  // Test 4.1: Success path -> triggers fetchRestorePoints and updates state
  useAppStore.setState({ restorePoints: [], isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'create_restore_point') {
      return {
        success: true,
        executedActions: [],
        totalDurationMs: 10,
        isDryRun: false,
      } satisfies ExecutionSummary;
    }
    if (cmd === 'get_restore_points') {
      fetchRestorePointsCalled = true;
      return [
        { sequenceNumber: 1, description: 'Test Point', creationTime: '2026-08-02', restorePointType: 'APPLICATION_INSTALL' },
      ] satisfies RestorePoint[];
    }
    return {};
  };

  let restoreSummary = await useAppStore.getState().createRestorePoint('Test Point', false);
  state = useAppStore.getState();
  assert(restoreSummary?.success === true, 'createRestorePoint returns success summary');
  assert(Boolean(fetchRestorePointsCalled), 'fetchRestorePoints called on success path');
  assert(state.restorePoints.length === 1, 'restorePoints populated on success');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block');

  // Test 4.2: Failure path (summary.success === false) -> Early return skips fetchRestorePoints
  fetchRestorePointsCalled = false;
  useAppStore.setState({ restorePoints: [], isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'create_restore_point') {
      return {
        success: false,
        executedActions: [
          {
            id: 'action_3',
            name: 'Create VSS Point',
            command: 'Checkpoint-Computer',
            output: { exitCode: 10, stdout: '', stderr: 'System Restore frequency limit reached' },
            skipped: false,
          },
        ],
        totalDurationMs: 10,
        isDryRun: false,
      } satisfies ExecutionSummary;
    }
    if (cmd === 'get_restore_points') {
      fetchRestorePointsCalled = true;
      return [];
    }
    return {};
  };

  restoreSummary = await useAppStore.getState().createRestorePoint('Failed Point', false);
  state = useAppStore.getState();
  assert(restoreSummary?.success === false, 'createRestorePoint returns failure summary on early return');
  assert(fetchRestorePointsCalled === false, 'fetchRestorePoints SKIPPED on early return failure path');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block after early return');
  assert(
    state.toasts.some((t) => t.message === 'System Restore frequency limit reached'),
    'Error toast generated from stderr on early return'
  );

  // Test 4.3: Exception path -> Catch block returns null without unhandled rejection
  fetchRestorePointsCalled = false;
  useAppStore.setState({ restorePoints: [], isExecuting: false });
  mockInvokeHandler = async (cmd, args) => {
    if (cmd === 'create_restore_point') {
      throw new Error('VSS Writer error: Service timed out');
    }
    return {};
  };

  restoreSummary = await useAppStore.getState().createRestorePoint('Exception Point', false);
  state = useAppStore.getState();
  assert(restoreSummary === null, 'createRestorePoint returns null on exception');
  assert(fetchRestorePointsCalled === false, 'fetchRestorePoints SKIPPED on exception path');
  assert(state.isExecuting === false, 'isExecuting reset to false in finally block after exception');
  assert(
    state.toasts.some((t) => t.message === 'VSS Writer error: Service timed out'),
    'Error toast generated via getErrorMessage on exception'
  );

  console.log('✓ createRestorePoint early return stress tests passed!\n');

  console.log('===============================================================');
  console.log(' ALL EARLY RETURN STRESS TESTS PASSED EMPIRICALLY! (100%)');
  console.log('===============================================================\n');
}

runEarlyReturnStressTests().catch((err) => {
  console.error('Stress test harness error:', err);
  process.exit(1);
});

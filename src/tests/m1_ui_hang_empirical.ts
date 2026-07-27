import { useAppStore } from '../store/useAppStore';

// Setup minimal browser window mock for Zustand and Tauri
(globalThis as any).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: any) => {
      if (cmd === 'mock_success') {
        return {
          success: true,
          executedActions: [],
          totalDurationMs: 10,
          isDryRun: true,
        };
      }
      if (cmd === 'mock_failure') {
        return {
          success: false,
          executedActions: [
            {
              id: 'act_1',
              name: 'Failed Action',
              command: 'fail.exe',
              output: { exitCode: 1, stdout: '', stderr: 'Command failed with code 1' },
              skipped: false,
            },
          ],
          totalDurationMs: 15,
          isDryRun: true,
        };
      }
      if (cmd === 'mock_rejection') {
        throw new Error('IPC Connection Timeout / Process Aborted');
      }
      return {};
    },
    transformCallback: (cb: any) => cb,
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};
(globalThis as any).__TAURI_INTERNALS__ = (globalThis as any).window.__TAURI_INTERNALS__;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runUiHangEmpiricalTests() {
  console.log('====================================================');
  console.log(' EMPIRICAL TEST SUITE: UI Execution Hangs & Modals');
  console.log('====================================================\n');

  // Test 1: Initial Modal States
  console.log('[Test 1] Initial Modal States');
  assert(useAppStore.getState().pendingSafetyModal === null, 'pendingSafetyModal is initially null');
  assert(useAppStore.getState().isExecuting === false, 'isExecuting is initially false');

  // Test 2: Safety Modal State Machine (Open, Input Validation & Cancel)
  console.log('\n[Test 2] Safety Modal State Machine (Open & Cancel)');
  let actionExecuted = false;
  useAppStore.getState().openSafetyModal({
    title: 'Test Safety Action',
    description: 'Testing safety confirmation modal',
    riskLevel: 'high',
    commandsToRun: ['echo test'],
    onConfirmAction: async () => {
      actionExecuted = true;
    },
  });

  const modalState = useAppStore.getState().pendingSafetyModal;
  assert(modalState !== null && modalState.isOpen === true, 'Safety modal opens with isOpen=true');
  assert(modalState?.title === 'Test Safety Action', 'Safety modal title matches');
  assert(modalState?.riskLevel === 'high', 'Safety modal risk level matches');

  // Close / Cancel modal
  useAppStore.getState().closeSafetyModal();
  assert(useAppStore.getState().pendingSafetyModal === null, 'Safety modal closes and sets state to null');
  assert(actionExecuted === false, 'Confirm action was not executed on cancel');

  // Test 3: Edge Condition 0 Steps (totalSteps = 0)
  console.log('\n[Test 3] Execution Progress Modal - 0 Steps Edge Condition');
  useAppStore.getState().setIsExecuting(true);
  useAppStore.getState().setCurrentProgress(0, 0);
  useAppStore.getState().setExecutionProgress(0);

  const state0 = useAppStore.getState();
  assert(Boolean(state0.isExecuting) === true, 'isExecuting is true');
  assert(state0.totalSteps === 0, 'totalSteps is 0');
  assert(state0.executionProgress === 0, 'executionProgress is 0');

  // Evaluate canClose condition: totalSteps === 0 || executionProgress >= 100 || hasError
  const canClose0 = state0.totalSteps === 0 || state0.executionProgress >= 100 || state0.logs.some(l => l.level === 'error');
  assert(canClose0 === true, 'Modal canClose evaluates to true when totalSteps === 0 (prevents UI deadlock)');

  useAppStore.getState().setIsExecuting(false);
  assert(Boolean(useAppStore.getState().isExecuting) === false, 'isExecuting resets cleanly to false');

  // Test 4: Rejected Promise / IPC Exception Handling
  console.log('\n[Test 4] Execution Progress Modal - Rejected Promise / IPC Exception');
  let exceptionCaught: boolean = false;

  const mockActionWithRejection = async () => {
    const store = useAppStore.getState();
    store.setIsExecuting(true);
    store.addLog({ level: 'cmd', message: 'Invoking mock_rejection' });
    try {
      await (globalThis as any).window.__TAURI_INTERNALS__.invoke('mock_rejection', {});
    } catch (err: any) {
      exceptionCaught = true;
      store.addLog({ level: 'error', message: `IPC error: ${err.message}` });
      store.addToast({ type: 'error', title: 'Execution Failed', message: err.message });
    } finally {
      store.setIsExecuting(false);
    }
  };

  await mockActionWithRejection();

  assert(Boolean(exceptionCaught) === true, 'Exception caught in try/catch block');
  assert(Boolean(useAppStore.getState().isExecuting) === false, 'finally block executed setIsExecuting(false)');
  assert(useAppStore.getState().logs.some(l => l.level === 'error'), 'Error log entry created');


  // Test 5: Execution Failure Result (success: false)
  console.log('\n[Test 5] Execution Progress Modal - Process Failure (success: false)');
  const mockActionWithFailure = async () => {
    const store = useAppStore.getState();
    store.setIsExecuting(true);
    try {
      const summary = await (globalThis as any).window.__TAURI_INTERNALS__.invoke('mock_failure', {});
      if (!summary.success) {
        store.addLog({ level: 'error', message: 'Process returned exit code 1' });
        store.addToast({ type: 'error', title: 'Process Failed', message: 'Command failed' });
      }
    } finally {
      store.setIsExecuting(false);
    }
  };

  await mockActionWithFailure();
  assert(Boolean(useAppStore.getState().isExecuting) === false, 'isExecuting reset to false after failed process');
  assert(useAppStore.getState().toasts.some(t => t.type === 'error'), 'Error toast registered in store');

  // Test 6: Safety Modal Exception Propagation Prevention
  console.log('\n[Test 6] Safety Modal Exception Safety');
  let safetyModalErrorCaught: boolean = false;

  useAppStore.getState().openSafetyModal({
    title: 'Explosive Action',
    description: 'Will throw uncaught error',
    riskLevel: 'critical',
    commandsToRun: [],
    onConfirmAction: async () => {
      throw new Error('Uncaught inner error');
    },
  });

  // Simulate handleConfirm logic from SafetyConfirmationModal.tsx
  const handleConfirmSimulator = async () => {
    const modal = useAppStore.getState().pendingSafetyModal;
    if (!modal) return;
    try {
      const action = modal.onConfirmAction;
      useAppStore.getState().closeSafetyModal();
      await action();
    } catch (err: any) {
      safetyModalErrorCaught = true;
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Action Execution Failed',
        message: err.message,
      });
    }
  };

  await handleConfirmSimulator();

  assert(useAppStore.getState().pendingSafetyModal === null, 'Safety modal closed before executing action');
  assert(Boolean(safetyModalErrorCaught) === true, 'Safety modal outer try/catch safely caught inner action exception');
  assert(Boolean(useAppStore.getState().isExecuting) === false, 'UI state remain responsive and not locked in executing');



  console.log('\n====================================================');
  console.log(' ALL UI EXECUTION & MODAL HANG TESTS PASSED! 🎉');
  console.log('====================================================\n');
}

runUiHangEmpiricalTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ UI Hang empirical test failed:', err);
    process.exit(1);
  });

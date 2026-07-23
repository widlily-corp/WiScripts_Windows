// Test Harness for Frontend IPC, State Management, and Safety Confirmation Modal Guard Logic
// Executed by Challenger M1-2

import assert from 'node:assert';

console.log('=== STARTING EMPIRICAL TEST HARNESS ===');

// --- Test 1: Critical Risk String Verification (SafetyConfirmationModal Guard Logic) ---
console.log('\n--- TEST 1: SafetyConfirmationModal Guard Logic & String Matching ---');

function checkInputValid(riskLevel, dryRunMode, confirmInput) {
  const isCritical = riskLevel === 'critical';
  return !isCritical || dryRunMode || confirmInput.trim().toUpperCase() === 'CONFIRM';
}

// Test cases for critical risk string verification:
const stringTestCases = [
  { input: '', dryRun: false, risk: 'critical', expected: false, name: 'Empty string (Live mode)' },
  { input: '   ', dryRun: false, risk: 'critical', expected: false, name: 'Whitespace only (Live mode)' },
  { input: 'confirm', dryRun: false, risk: 'critical', expected: true, name: 'Lowercase "confirm" (Live mode)' },
  { input: 'CONFIRM', dryRun: false, risk: 'critical', expected: true, name: 'Uppercase "CONFIRM" (Live mode)' },
  { input: '  CONFIRM  ', dryRun: false, risk: 'critical', expected: true, name: 'Trimmed " CONFIRM " (Live mode)' },
  { input: 'CoNfIrM', dryRun: false, risk: 'critical', expected: true, name: 'Mixed case "CoNfIrM" (Live mode)' },
  { input: 'CONFIRMED', dryRun: false, risk: 'critical', expected: false, name: 'Invalid string "CONFIRMED" (Live mode)' },
  { input: 'CONFIRM!', dryRun: false, risk: 'critical', expected: false, name: 'Invalid string "CONFIRM!" (Live mode)' },
  { input: '', dryRun: true, risk: 'critical', expected: true, name: 'Empty string (Dry-Run mode)' },
  { input: '', dryRun: false, risk: 'high', expected: true, name: 'High risk level non-critical (Live mode)' },
  { input: '', dryRun: false, risk: 'medium', expected: true, name: 'Medium risk level non-critical (Live mode)' },
];

let test1Passed = 0;
stringTestCases.forEach((tc) => {
  const res = checkInputValid(tc.risk, tc.dryRun, tc.input);
  if (res === tc.expected) {
    console.log(`  [PASS] ${tc.name} -> result: ${res}`);
    test1Passed++;
  } else {
    console.error(`  [FAIL] ${tc.name} -> expected: ${tc.expected}, got: ${res}`);
  }
});
assert.strictEqual(test1Passed, stringTestCases.length, 'All string test cases must pass');


// --- Test 2: Empty Selection Edge Case ---
console.log('\n--- TEST 2: Empty Selection Edge Case in Optimization Runner ---');

const mockOptimizations = [
  { id: '1', title: 'Opt 1', isSelected: false },
  { id: '2', title: 'Opt 2', isSelected: false },
];

function handleExecuteOptimizationMock(optimizations, openModalCallback) {
  const selected = optimizations.filter((o) => o.isSelected);
  if (selected.length === 0) {
    return { executed: false, reason: 'EMPTY_SELECTION' };
  }
  openModalCallback(selected);
  return { executed: true, count: selected.length };
}

let modalOpened = false;
const resEmpty = handleExecuteOptimizationMock(mockOptimizations, () => { modalOpened = true; });
assert.strictEqual(resEmpty.executed, false, 'Should not execute when 0 optimizations selected');
assert.strictEqual(modalOpened, false, 'Modal should not open when 0 optimizations selected');
console.log('  [PASS] Empty selection correctly prevents modal opening');


// --- Test 3: Stale Closure Bug in Dry-Run Toggle within Modal ---
console.log('\n--- TEST 3: Empirical Verification of Stale Closure Bug on Dry-Run Toggle ---');

// Simulation of App.tsx state & closure pattern
class AppStore {
  constructor() {
    this.dryRunMode = true;
    this.pendingSafetyModal = null;
  }
  setDryRunMode(val) {
    this.dryRunMode = val;
  }
  openSafetyModal(modal) {
    this.pendingSafetyModal = { ...modal, isOpen: true };
  }
}

const store = new AppStore();

// App.tsx creates handler using captured local variable dryRunMode (as React components do)
function createMasHandlerCurrentImpl(storeInstance) {
  const dryRunMode = storeInstance.dryRunMode; // Captured at handler creation time (e.g. render / click time)
  return {
    title: 'MAS Activation',
    onConfirmAction: async () => {
      // IPC call uses captured `dryRunMode`
      return { ipcDryRunSent: dryRunMode };
    }
  };
}

// User Flow:
// 1. Initial state: store.dryRunMode = true
console.log('  Step 1: User opens MAS modal while store.dryRunMode = true');
const modalCurrent = createMasHandlerCurrentImpl(store);
store.openSafetyModal(modalCurrent);

// 2. Inside modal, user unchecks Dry-Run toggle (switches dryRunMode to false)
console.log('  Step 2: User unchecks Dry-Run checkbox inside modal (store.setDryRunMode(false))');
store.setDryRunMode(false);
assert.strictEqual(store.dryRunMode, false, 'Store dryRunMode should now be false');

// 3. User clicks Execute Live Action inside modal
console.log('  Step 3: User confirms action in modal, triggering modal.onConfirmAction()');
const actionResult = await store.pendingSafetyModal.onConfirmAction();
console.log(`  Result of IPC call: dryRunSent = ${actionResult.ipcDryRunSent}`);

if (actionResult.ipcDryRunSent !== store.dryRunMode) {
  console.error(`  ⚠️ CRITICAL BUG REPRODUCED: Store dryRunMode is ${store.dryRunMode}, but IPC call received STALE dryRun=${actionResult.ipcDryRunSent}!`);
} else {
  console.log('  [PASS] IPC received updated dryRunMode');
}


// --- Test 4: Corrected Implementation using Store Getter ---
console.log('\n--- TEST 4: Verification of Fix using Store Getter (getState) ---');

function createMasHandlerFixedImpl(storeInstance) {
  return {
    title: 'MAS Activation',
    onConfirmAction: async () => {
      // Dynamically fetch current store state at execution time!
      const currentDryRun = storeInstance.dryRunMode;
      return { ipcDryRunSent: currentDryRun };
    }
  };
}

// User Flow with Fix:
store.setDryRunMode(true);
console.log('  Step 1: User opens MAS modal with store.dryRunMode = true');
const modalFixed = createMasHandlerFixedImpl(store);
store.openSafetyModal(modalFixed);

console.log('  Step 2: User unchecks Dry-Run checkbox inside modal (store.setDryRunMode(false))');
store.setDryRunMode(false);

console.log('  Step 3: User confirms action in modal');
const actionResultFixed = await store.pendingSafetyModal.onConfirmAction();
console.log(`  Result of Fixed IPC call: dryRunSent = ${actionResultFixed.ipcDryRunSent}`);
assert.strictEqual(actionResultFixed.ipcDryRunSent, false, 'Fixed IPC call must use current store value false');
console.log('  [PASS] Fixed implementation correctly sends updated dryRun state (false)');

console.log('\n=== EMPIRICAL TEST HARNESS COMPLETE ===');

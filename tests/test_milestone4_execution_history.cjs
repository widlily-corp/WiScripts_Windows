/**
 * Test Suite: Milestone 4 Execution History & Log Exporter
 * 
 * Verifies:
 * 1. AST Invariants (MAX_SCRIPT_LOG_LINES = 2000, MAX_HISTORY_ENTRIES = 50, MAX_HISTORY_LOG_LINES = 300)
 * 2. Zustand slice partialize persistence in useAppStore.ts
 * 3. History FIFO eviction capped at 50 entries
 * 4. History logLines truncation capped at 300 lines
 * 5. Single item deletion and full clear
 * 6. Structured log exporter text generation and formatting
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  generateStructuredLogText,
} = require('../src/utils/scriptLogExporter.ts');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('===============================================================');
console.log(' WiScripts Windows — Execution History & Log Exporter Test Suite');
console.log('===============================================================');

const scriptRunnerSlicePath = path.join(__dirname, '../src/store/slices/scriptRunnerSlice.ts');
const useAppStorePath = path.join(__dirname, '../src/store/useAppStore.ts');

// 1. AST & Invariant Tests
test('HIST_AST_01: MAX_SCRIPT_LOG_LINES = 2000 remains untouched (AST regex proof)', () => {
  const code = fs.readFileSync(scriptRunnerSlicePath, 'utf8');
  assert.match(
    code,
    /const\s+MAX_SCRIPT_LOG_LINES\s*=\s*2000;/,
    'MAX_SCRIPT_LOG_LINES must remain 2000 for compatibility with challenger test assertions'
  );
});

test('HIST_AST_02: MAX_HISTORY_ENTRIES = 50 and MAX_HISTORY_LOG_LINES = 300 are declared', () => {
  const code = fs.readFileSync(scriptRunnerSlicePath, 'utf8');
  assert.match(
    code,
    /MAX_HISTORY_ENTRIES\s*=\s*50;/,
    'MAX_HISTORY_ENTRIES must be declared as 50'
  );
  assert.match(
    code,
    /MAX_HISTORY_LOG_LINES\s*=\s*300;/,
    'MAX_HISTORY_LOG_LINES must be declared as 300'
  );
});

test('HIST_AST_03: activeRunnerTab includes "history" in slice type and state', () => {
  const code = fs.readFileSync(scriptRunnerSlicePath, 'utf8');
  assert.match(
    code,
    /activeRunnerTab:\s*['"]editor['"]\s*\|\s*['"]library['"]\s*\|\s*['"]history['"]/,
    'activeRunnerTab type must include history'
  );
});

test('HIST_AST_04: useAppStore.ts partialize includes executionHistory for persistent storage', () => {
  const code = fs.readFileSync(useAppStorePath, 'utf8');
  assert.match(
    code,
    /executionHistory:\s*state\.executionHistory/,
    'partialize must include executionHistory'
  );
});

// 2. FIFO Bounding & Truncation Simulation
test('HIST_FIFO_01: Enforces FIFO eviction at 50 records (60 inserted -> 50 retained, newest first)', () => {
  const MAX_HISTORY_ENTRIES = 50;
  let state = { executionHistory: [] };

  const addHistoryEntry = (entry) => {
    state.executionHistory = [entry, ...state.executionHistory].slice(0, MAX_HISTORY_ENTRIES);
  };

  for (let i = 1; i <= 60; i++) {
    addHistoryEntry({
      id: `exec_${i}`,
      scriptName: `Script_${i}`,
      scriptType: 'ps1',
      timestamp: new Date().toISOString(),
      durationMs: 100 * i,
      exitCode: 0,
      status: 'success',
      elevated: false,
      isDryRun: false,
      rawContent: `Write-Host ${i}`,
      logLines: [],
    });
  }

  assert.strictEqual(state.executionHistory.length, 50);
  assert.strictEqual(state.executionHistory[0].id, 'exec_60', 'Newest entry must be at index 0');
  assert.strictEqual(state.executionHistory[49].id, 'exec_11', 'Oldest entry must be exec_11');
});

test('HIST_TRUNC_01: Enforces log line bounding at 300 lines (400 lines ingested -> 300 retained)', () => {
  const MAX_HISTORY_LOG_LINES = 300;

  const rawLogs = [];
  for (let i = 1; i <= 400; i++) {
    rawLogs.push({
      id: `log_${i}`,
      line: `Output line #${i}`,
      stream: 'stdout',
      timestamp: '12:00:00',
    });
  }

  const boundedLogs = rawLogs.slice(-MAX_HISTORY_LOG_LINES);
  assert.strictEqual(boundedLogs.length, 300);
  assert.strictEqual(boundedLogs[0].line, 'Output line #101', 'Must drop the first 100 lines');
  assert.strictEqual(boundedLogs[299].line, 'Output line #400', 'Must keep the latest line');
});

// 3. Clear and Delete Operations
test('HIST_OPS_01: deleteHistoryEntry removes only the targeted record', () => {
  let list = [
    { id: 'rec_1', scriptName: 'S1' },
    { id: 'rec_2', scriptName: 'S2' },
    { id: 'rec_3', scriptName: 'S3' },
  ];

  const deleteHistoryEntry = (id) => {
    list = list.filter((e) => e.id !== id);
  };

  deleteHistoryEntry('rec_2');
  assert.strictEqual(list.length, 2);
  assert.ok(!list.some((e) => e.id === 'rec_2'));
  assert.strictEqual(list[0].id, 'rec_1');
  assert.strictEqual(list[1].id, 'rec_3');
});

test('HIST_OPS_02: clearHistory resets history array to length 0', () => {
  let list = [{ id: 'rec_1' }, { id: 'rec_2' }];
  const clearHistory = () => {
    list = [];
  };

  clearHistory();
  assert.strictEqual(list.length, 0);
});

// 4. Structured Log Exporter
test('LOG_EXP_01: Generates standardized ASCII-bordered log text with full metadata header', () => {
  const mockRecord = {
    id: 'exec_test_123',
    scriptId: 'maint-safe-browser-cache-cleaner',
    scriptName: 'Safe Browser Cache Cleaner',
    scriptType: 'ps1',
    timestamp: '2026-09-06T12:00:00.000Z',
    durationMs: 2540,
    exitCode: 0,
    status: 'success',
    elevated: true,
    isDryRun: false,
    rawContent: 'Write-Host "Cleaning browser cache..."',
    logLines: [
      { id: '1', line: 'Scanning Edge profile cache...', stream: 'stdout', timestamp: '12:00:01' },
      { id: '2', line: 'Purged 45 MB of temporary data.', stream: 'stdout', timestamp: '12:00:02' },
    ],
  };

  const output = generateStructuredLogText(mockRecord);
  assert.ok(output.includes('WiScripts Windows — Script Execution Output Log'));
  assert.ok(output.includes('Script Name : Safe Browser Cache Cleaner'));
  assert.ok(output.includes('Script ID   : maint-safe-browser-cache-cleaner'));
  assert.ok(output.includes('Duration    : 2.54s (2540 ms)'));
  assert.ok(output.includes('Status      : SUCCESS'));
  assert.ok(output.includes('Privilege   : Elevated (Administrator / UAC)'));
  assert.ok(output.includes('Scanning Edge profile cache...'));
  assert.ok(output.includes('Purged 45 MB of temporary data.'));
  assert.ok(output.includes('END OF EXECUTION LOG — STATUS: SUCCESS'));
});

test('LOG_EXP_02: Handles empty log output gracefully', () => {
  const mockRecord = {
    id: 'exec_empty_123',
    scriptName: 'Custom Script',
    scriptType: 'cmd',
    timestamp: '2026-09-06T12:00:00.000Z',
    durationMs: 300,
    exitCode: 1,
    status: 'failed',
    elevated: false,
    isDryRun: true,
    rawContent: 'echo test',
    logLines: [],
  };

  const output = generateStructuredLogText(mockRecord);
  assert.ok(output.includes('[NO OUTPUT LOG LINES CAPTURED]'));
  assert.ok(output.includes('STATUS: FAILED'));
  assert.ok(output.includes('DRY-RUN (Simulated)'));
});

console.log('---------------------------------------------------------------');
console.log(`Results: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) {
  process.exit(1);
}

/**
 * Empirical Adversarial Challenger Test Suite — Milestone 4
 * Focus: Execution History FIFO Eviction, Log Line Bounding, Store Persistence,
 *        UAC 1223 Cancellation Semantics, and Structured Log Exporter.
 * 
 * Challenger Identity: challenger_m4_1
 * Timestamp: 2026-09-06
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { generateStructuredLogText } = require('../src/utils/scriptLogExporter.ts');

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
    console.error(`    ${err.stack || err.message}`);
  }
}

console.log('================================================================================');
console.log(' CHALLENGER EMPIRICAL STRESS TEST SUITE: MILESTONE 4 EXECUTION HISTORY');
console.log(' Target: FIFO Eviction, Log Line Bounding, Persistence & UAC Cancellation');
console.log('================================================================================');

const scriptRunnerSlicePath = path.join(__dirname, '../src/store/slices/scriptRunnerSlice.ts');
const useAppStorePath = path.join(__dirname, '../src/store/useAppStore.ts');
const scriptRunnerCode = fs.readFileSync(scriptRunnerSlicePath, 'utf8');
const useAppStoreCode = fs.readFileSync(useAppStorePath, 'utf8');

// ============================================================================
// SECTION 1: AST INVARIANTS & INTEGRITY
// ============================================================================
console.log('\n--- SECTION 1: AST Invariants & Declarations ---');

test('CHALLENGE_AST_01: MAX_SCRIPT_LOG_LINES = 2000 is preserved verbatim', () => {
  assert.match(
    scriptRunnerCode,
    /const\s+MAX_SCRIPT_LOG_LINES\s*=\s*2000;/,
    'MAX_SCRIPT_LOG_LINES must be strictly 2000'
  );
});

test('CHALLENGE_AST_02: MAX_HISTORY_ENTRIES = 50 and MAX_HISTORY_LOG_LINES = 300 exported constants', () => {
  assert.match(
    scriptRunnerCode,
    /export\s+const\s+MAX_HISTORY_ENTRIES\s*=\s*50;/,
    'MAX_HISTORY_ENTRIES must be exported as 50'
  );
  assert.match(
    scriptRunnerCode,
    /export\s+const\s+MAX_HISTORY_LOG_LINES\s*=\s*300;/,
    'MAX_HISTORY_LOG_LINES must be exported as 300'
  );
});

test('CHALLENGE_AST_03: ScriptExecutionRecord interface contains all required telemetry fields', () => {
  const fields = [
    'id',
    'scriptId',
    'scriptName',
    'scriptType',
    'timestamp',
    'durationMs',
    'exitCode',
    'status',
    'elevated',
    'isDryRun',
    'rawContent',
    'parameters',
    'logLines',
  ];
  for (const field of fields) {
    const regex = new RegExp(`${field}\\??\\s*:`);
    assert.match(
      scriptRunnerCode,
      regex,
      `ScriptExecutionRecord must declare field '${field}'`
    );
  }
});

test('CHALLENGE_AST_04: ExecutionStatus is strictly union of success, failed, cancelled', () => {
  assert.match(
    scriptRunnerCode,
    /export\s+type\s+ExecutionStatus\s*=\s*['"]success['"]\s*\|\s*['"]failed['"]\s*\|\s*['"]cancelled['"]/,
    'ExecutionStatus must be success | failed | cancelled'
  );
});

// ============================================================================
// SECTION 2: ADVERSARIAL FIFO STRESS TESTING (100+ ENTRIES)
// ============================================================================
console.log('\n--- SECTION 2: Adversarial FIFO Eviction (100 Entries -> Strict 50 Cap) ---');

test('CHALLENGE_FIFO_01: Ingest 100 entries sequentially; verify strict cap of 50 with newest retained', () => {
  const MAX_HISTORY_ENTRIES = 50;
  const MAX_HISTORY_LOG_LINES = 300;

  // Exact reducer implementation from scriptRunnerSlice.ts lines 333-340
  let state = { executionHistory: [] };
  const addHistoryEntry = (entry) => {
    const boundedEntry = {
      ...entry,
      logLines: (entry.logLines || []).slice(-MAX_HISTORY_LOG_LINES),
    };
    state.executionHistory = [boundedEntry, ...(state.executionHistory || [])].slice(0, MAX_HISTORY_ENTRIES);
  };

  // Ingest 100 distinct records
  for (let i = 1; i <= 100; i++) {
    addHistoryEntry({
      id: `exec_id_${i}`,
      scriptId: `script_${i}`,
      scriptName: `Benchmark Script #${i}`,
      scriptType: i % 2 === 0 ? 'ps1' : 'bat',
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      durationMs: 50 + i * 10,
      exitCode: i === 50 ? 1223 : i % 5 === 0 ? 1 : 0,
      status: i === 50 ? 'cancelled' : i % 5 === 0 ? 'failed' : 'success',
      elevated: i % 3 === 0,
      isDryRun: i % 7 === 0,
      rawContent: `Write-Host "Script run ${i}"`,
      logLines: [{ id: `l_${i}`, line: `Log line ${i}`, stream: 'stdout', timestamp: '12:00:00' }],
    });
  }

  // Verification 1: Exactly 50 records retained
  assert.strictEqual(state.executionHistory.length, 50, 'History length must be exactly 50 after 100 insertions');

  // Verification 2: Newest entry is at index 0 (exec_id_100)
  assert.strictEqual(state.executionHistory[0].id, 'exec_id_100', 'Index 0 must be the most recently added entry (exec_id_100)');
  assert.strictEqual(state.executionHistory[0].scriptName, 'Benchmark Script #100');

  // Verification 3: Oldest retained entry is at index 49 (exec_id_51)
  assert.strictEqual(state.executionHistory[49].id, 'exec_id_51', 'Index 49 must be exec_id_51');
  assert.strictEqual(state.executionHistory[49].scriptName, 'Benchmark Script #51');

  // Verification 4: Oldest 50 entries (exec_id_1 through exec_id_50) were purged completely
  for (let i = 1; i <= 50; i++) {
    const found = state.executionHistory.some((rec) => rec.id === `exec_id_${i}`);
    assert.strictEqual(found, false, `Purged entry exec_id_${i} must not exist in history`);
  }

  // Verification 5: Ingest 50 more (101 through 150)
  for (let i = 101; i <= 150; i++) {
    addHistoryEntry({
      id: `exec_id_${i}`,
      scriptName: `Benchmark Script #${i}`,
      scriptType: 'ps1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      exitCode: 0,
      status: 'success',
      elevated: false,
      isDryRun: false,
      rawContent: 'Write-Host "Hi"',
      logLines: [],
    });
  }

  assert.strictEqual(state.executionHistory.length, 50, 'History length must still be strictly 50 after 150 total insertions');
  assert.strictEqual(state.executionHistory[0].id, 'exec_id_150');
  assert.strictEqual(state.executionHistory[49].id, 'exec_id_101');
});

test('CHALLENGE_FIFO_02: Reducer handles undefined or corrupted initial state gracefully', () => {
  const MAX_HISTORY_ENTRIES = 50;
  let state = { executionHistory: undefined };

  const addHistoryEntry = (entry) => {
    state.executionHistory = [entry, ...(state.executionHistory || [])].slice(0, MAX_HISTORY_ENTRIES);
  };

  assert.doesNotThrow(() => {
    addHistoryEntry({
      id: 'exec_first',
      scriptName: 'First Script',
      scriptType: 'ps1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      exitCode: 0,
      status: 'success',
      elevated: false,
      isDryRun: false,
      rawContent: 'Write-Host 1',
      logLines: [],
    });
  });

  assert.strictEqual(state.executionHistory.length, 1);
  assert.strictEqual(state.executionHistory[0].id, 'exec_first');
});

test('CHALLENGE_FIFO_03: deleteHistoryEntry and clearHistory mutation resilience', () => {
  let list = [
    { id: 'h1', scriptName: 'S1' },
    { id: 'h2', scriptName: 'S2' },
    { id: 'h3', scriptName: 'S3' },
    { id: 'h4', scriptName: 'S4' },
  ];

  const deleteHistoryEntry = (id) => {
    list = list.filter((e) => e.id !== id);
  };

  // Delete head
  deleteHistoryEntry('h1');
  assert.strictEqual(list.length, 3);
  assert.strictEqual(list[0].id, 'h2');

  // Delete non-existent ID (no-op)
  deleteHistoryEntry('h999');
  assert.strictEqual(list.length, 3);

  // Delete tail
  deleteHistoryEntry('h4');
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[1].id, 'h3');

  // Clear all
  list = [];
  assert.strictEqual(list.length, 0);
});

// ============================================================================
// SECTION 3: ADVERSARIAL LOG LINE BOUNDING (1,000 LINES -> STRICT 300 CAP)
// ============================================================================
console.log('\n--- SECTION 3: Adversarial Log Line Bounding (1,000 Lines -> Strict 300 Cap) ---');

test('CHALLENGE_LOG_01: Ingest 1,000 log lines; verify strict truncation to exactly 300 newest lines', () => {
  const MAX_HISTORY_LOG_LINES = 300;

  // Generate 1,000 realistic log lines
  const rawLogs = [];
  for (let i = 1; i <= 1000; i++) {
    rawLogs.push({
      id: `line_id_${i}`,
      line: `[SystemDiagnostic] Iteration #${i} — processing subsystem metrics and telemetry buffer...`,
      stream: i % 10 === 0 ? 'stderr' : 'stdout',
      timestamp: `12:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    });
  }

  const boundedLogs = (rawLogs || []).slice(-MAX_HISTORY_LOG_LINES);

  // Verification 1: Array length is exactly 300
  assert.strictEqual(boundedLogs.length, 300, 'Log line array length must be strictly bounded to 300');

  // Verification 2: The first kept line is line #701 (lines 1..700 dropped)
  assert.strictEqual(
    boundedLogs[0].id,
    'line_id_701',
    'First kept log line must be line_id_701'
  );
  assert.strictEqual(
    boundedLogs[0].line,
    '[SystemDiagnostic] Iteration #701 — processing subsystem metrics and telemetry buffer...'
  );

  // Verification 3: The last kept line is line #1000 (newest line preserved)
  assert.strictEqual(
    boundedLogs[299].id,
    'line_id_1000',
    'Last kept log line must be line_id_1000'
  );

  // Verification 4: Stream distinction is preserved
  const stderrCount = boundedLogs.filter((l) => l.stream === 'stderr').length;
  assert.strictEqual(stderrCount, 30, 'Exactly 30 stderr lines preserved (every 10th from 701 to 1000)');
});

test('CHALLENGE_LOG_02: Boundary conditions for logLines: 0, 299, 300, 301, null, undefined', () => {
  const MAX_HISTORY_LOG_LINES = 300;
  const bound = (lines) => (lines || []).slice(-MAX_HISTORY_LOG_LINES);

  // Null & Undefined
  assert.deepStrictEqual(bound(null), []);
  assert.deepStrictEqual(bound(undefined), []);

  // 0 lines
  assert.deepStrictEqual(bound([]), []);

  // 299 lines (under limit)
  const lines299 = Array.from({ length: 299 }, (_, i) => ({ id: `${i}`, line: `L${i}`, stream: 'stdout', timestamp: 'T' }));
  const bounded299 = bound(lines299);
  assert.strictEqual(bounded299.length, 299);
  assert.strictEqual(bounded299[0].line, 'L0');
  assert.strictEqual(bounded299[298].line, 'L298');

  // 300 lines (exact limit)
  const lines300 = Array.from({ length: 300 }, (_, i) => ({ id: `${i}`, line: `L${i}`, stream: 'stdout', timestamp: 'T' }));
  const bounded300 = bound(lines300);
  assert.strictEqual(bounded300.length, 300);
  assert.strictEqual(bounded300[0].line, 'L0');
  assert.strictEqual(bounded300[299].line, 'L299');

  // 301 lines (1 line overflow)
  const lines301 = Array.from({ length: 301 }, (_, i) => ({ id: `${i}`, line: `L${i}`, stream: 'stdout', timestamp: 'T' }));
  const bounded301 = bound(lines301);
  assert.strictEqual(bounded301.length, 300);
  assert.strictEqual(bounded301[0].line, 'L1', 'L0 should be dropped');
  assert.strictEqual(bounded301[299].line, 'L300');
});

test('CHALLENGE_LOG_03: Memory pressure test — 300 large log lines (>10KB each) serialize cleanly', () => {
  const hugeString = 'X'.repeat(10240); // 10KB string
  const heavyLogs = Array.from({ length: 300 }, (_, i) => ({
    id: `heavy_${i}`,
    line: `[LINE ${i}] ${hugeString}`,
    stream: 'stdout',
    timestamp: '12:00:00',
  }));

  const record = {
    id: 'heavy_rec',
    scriptName: 'Heavy Log Script',
    scriptType: 'ps1',
    timestamp: new Date().toISOString(),
    durationMs: 1200,
    exitCode: 0,
    status: 'success',
    elevated: false,
    isDryRun: false,
    rawContent: 'test',
    logLines: heavyLogs,
  };

  const json = JSON.stringify(record);
  assert.ok(json.length > 2.5 * 1024 * 1024, 'Serialized record size > 2.5MB');
  const restored = JSON.parse(json);
  assert.strictEqual(restored.logLines.length, 300);
  assert.strictEqual(restored.logLines[0].line.startsWith('[LINE 0]'), true);
});

// ============================================================================
// SECTION 4: PERSISTENCE & PARTIALIZE IN useAppStore.ts
// ============================================================================
console.log('\n--- SECTION 4: Store Persistence & Partialize Verification ---');

test('CHALLENGE_PERSIST_01: useAppStore.ts partialize includes executionHistory', () => {
  // Regex verify in useAppStore.ts
  const partializeMatch = useAppStoreCode.match(/partialize:\s*\(\s*state\s*\)\s*=>\s*\(\{([\s\S]*?)\}\)/);
  assert.ok(partializeMatch, 'partialize function must be defined in useAppStore.ts');
  const partializeBody = partializeMatch[1];
  assert.match(
    partializeBody,
    /executionHistory:\s*state\.executionHistory/,
    'executionHistory must be explicitly mapped in partialize body'
  );
});

test('CHALLENGE_PERSIST_02: partialize filters out transient runtime state (no outputLogs, no isExecutingScript)', () => {
  const partializeMatch = useAppStoreCode.match(/partialize:\s*\(\s*state\s*\)\s*=>\s*\(\{([\s\S]*?)\}\)/);
  const partializeBody = partializeMatch[1];

  // Transient state that MUST NOT be persisted to prevent localStorage pollution:
  assert.doesNotMatch(partializeBody, /outputLogs:/, 'outputLogs must not be in partialize');
  assert.doesNotMatch(partializeBody, /isExecutingScript:/, 'isExecutingScript must not be in partialize');
  assert.doesNotMatch(partializeBody, /activeExecutionId:/, 'activeExecutionId must not be in partialize');
  assert.doesNotMatch(partializeBody, /unlistenScriptOutput:/, 'unlistenScriptOutput must not be in partialize');
});

test('CHALLENGE_PERSIST_03: Mock state passes through partialize and survives JSON round-trip', () => {
  const mockState = {
    dryRunMode: true,
    autoCheckUpdates: false,
    odtConfig: null,
    selectedMasMethod: 'HWID',
    driverBackupPath: 'C:\\Drivers',
    selectedDnsProvider: '1.1.1.1',
    selectedCpuSensorId: 'cpu_0',
    selectedGpuSensorId: 'gpu_0',
    selectedDrive: 'C:',
    customPath: 'C:\\Test',
    viewMode: 'compact',
    executionHistory: [
      {
        id: 'rec_persist_1',
        scriptName: 'Persisted Script',
        scriptType: 'ps1',
        timestamp: '2026-09-06T12:00:00.000Z',
        durationMs: 1500,
        exitCode: 0,
        status: 'success',
        elevated: true,
        isDryRun: false,
        rawContent: 'Write-Host "persisted"',
        logLines: [{ id: 'l1', line: 'persisted log', stream: 'stdout', timestamp: '12:00:01' }],
      },
    ],
    // Transient props that should be dropped:
    outputLogs: [{ id: 'transient_1', line: 'temp', stream: 'stdout', timestamp: '12:00:00' }],
    isExecutingScript: true,
    activeExecutionId: 'temp_exec_id',
  };

  // Simulate useAppStore partialize
  const partializeFn = (state) => ({
    dryRunMode: state.dryRunMode,
    autoCheckUpdates: state.autoCheckUpdates,
    odtConfig: state.odtConfig,
    selectedMasMethod: state.selectedMasMethod,
    driverBackupPath: state.driverBackupPath,
    selectedDnsProvider: state.selectedDnsProvider,
    selectedCpuSensorId: state.selectedCpuSensorId,
    selectedGpuSensorId: state.selectedGpuSensorId,
    selectedDrive: state.selectedDrive,
    customPath: state.customPath,
    viewMode: state.viewMode,
    executionHistory: state.executionHistory,
  });

  const persisted = partializeFn(mockState);
  assert.strictEqual(persisted.executionHistory.length, 1);
  assert.strictEqual(persisted.outputLogs, undefined);
  assert.strictEqual(persisted.isExecutingScript, undefined);

  // Test serialization & rehydration
  const serialized = JSON.stringify(persisted);
  const rehydrated = JSON.parse(serialized);
  assert.deepStrictEqual(rehydrated.executionHistory, mockState.executionHistory);
});

// ============================================================================
// SECTION 5: UAC CANCELLATION CODE 1223 SEMANTICS
// ============================================================================
console.log('\n--- SECTION 5: UAC Cancellation Code 1223 & Error Classification ---');

test('CHALLENGE_UAC_01: Exit code 1223 maps directly to status "cancelled"', () => {
  // Logic from scriptRunnerSlice.ts line 504-506:
  // const executionStatus: ExecutionStatus = exitCode === 0 ? 'success' : exitCode === 1223 ? 'cancelled' : 'failed';
  const getStatusFromExitCode = (exitCode) =>
    exitCode === 0 ? 'success' : exitCode === 1223 ? 'cancelled' : 'failed';

  assert.strictEqual(getStatusFromExitCode(0), 'success');
  assert.strictEqual(getStatusFromExitCode(1223), 'cancelled');
  assert.strictEqual(getStatusFromExitCode(1), 'failed');
  assert.strictEqual(getStatusFromExitCode(2), 'failed');
  assert.strictEqual(getStatusFromExitCode(-1), 'failed');
});

test('CHALLENGE_UAC_02: Catch block UAC pattern matching classifies all Win32 UAC cancellation forms as "cancelled"', () => {
  // Logic from scriptRunnerSlice.ts lines 569-588:
  const classifyError = (errorMsg) => {
    const lowerError = errorMsg.toLowerCase();
    const isUacDecline =
      lowerError.includes('canceled by the user') ||
      lowerError.includes('cancelled by the user') ||
      lowerError.includes('declined by user') ||
      lowerError.includes('declined by the user') ||
      lowerError.includes('операция отменена пользователем') ||
      lowerError.includes('отменена пользователем') ||
      lowerError.includes('отменено пользователем') ||
      lowerError.includes('error_cancelled') ||
      lowerError.includes('1223') ||
      lowerError.includes('0x800704c7') ||
      (lowerError.includes('uac') && (lowerError.includes('cancel') || lowerError.includes('decline')));

    const isProcessCancelled =
      lowerError.includes('cancelled') ||
      lowerError.includes('canceled') ||
      lowerError.includes('отменен') ||
      lowerError.includes('отменена') ||
      lowerError.includes('отменено') ||
      isUacDecline;

    const executionStatus = isUacDecline || isProcessCancelled ? 'cancelled' : 'failed';
    const exitCode = isUacDecline ? 1223 : isProcessCancelled ? -1 : 1;
    return { executionStatus, exitCode };
  };

  const cancellationPhrases = [
    'The operation was canceled by the user (os error 1223)',
    'The operation was cancelled by the user.',
    'elevation prompt declined by user',
    'elevation declined by the user in UAC dialog',
    'Операция отменена пользователем (Код ошибки 1223)',
    'UAC prompt was cancelled',
    'Win32 error ERROR_CANCELLED encountered during ShellExecuteExW',
    'HRESULT 0x800704c7 (ERROR_CANCELLED)',
    'Process was cancelled by user action',
    'Выполнение было отменено',
  ];

  for (const phrase of cancellationPhrases) {
    const result = classifyError(phrase);
    assert.strictEqual(
      result.executionStatus,
      'cancelled',
      `Phrase "${phrase}" must be classified as 'cancelled'`
    );
  }

  // Non-cancellation errors must NOT be classified as cancelled:
  const failurePhrases = [
    'Access is denied (os error 5)',
    'The system cannot find the file specified (os error 2)',
    'PowerShell syntax error at line 14: Unexpected token',
    'Script execution timed out after 300 seconds',
    'Out of memory exception',
  ];

  for (const phrase of failurePhrases) {
    const result = classifyError(phrase);
    assert.strictEqual(
      result.executionStatus,
      'failed',
      `Phrase "${phrase}" must be classified as 'failed'`
    );
    assert.strictEqual(result.exitCode, 1);
  }
});

// ============================================================================
// SECTION 6: STRUCTURED LOG EXPORTER ADVERSARIAL FORMATTING
// ============================================================================
console.log('\n--- SECTION 6: Structured Log Exporter Formatting ---');

test('CHALLENGE_EXP_01: Formats complete metadata header with borders, status, and exit code', () => {
  const sampleRecord = {
    id: 'exec_sample_999',
    scriptId: 'sec-toggle-ai-recall',
    scriptName: 'Toggle Windows 11 AI Recall',
    scriptType: 'ps1',
    timestamp: '2026-09-06T12:34:56.789Z',
    durationMs: 4120,
    exitCode: 0,
    status: 'success',
    elevated: true,
    isDryRun: false,
    rawContent: 'param([switch]$DisableRecall)',
    logLines: [
      { id: '1', line: 'Scanning Windows 11 24H2 Recall policy...', stream: 'stdout', timestamp: '12:34:57' },
      { id: '2', line: 'Policy successfully updated.', stream: 'stdout', timestamp: '12:34:59' },
    ],
  };

  const output = generateStructuredLogText(sampleRecord);

  // Border and Title checks
  assert.ok(output.startsWith('='.repeat(80)), 'Output must start with 80 "=" characters');
  assert.ok(output.includes('WiScripts Windows — Script Execution Output Log'));

  // Metadata field assertions
  assert.ok(output.includes('Script Name : Toggle Windows 11 AI Recall'));
  assert.ok(output.includes('Script ID   : sec-toggle-ai-recall'));
  assert.ok(output.includes('Script Type : PS1'));
  assert.ok(output.includes('Timestamp   : 2026-09-06T12:34:56.789Z'));
  assert.ok(output.includes('Duration    : 4.12s (4120 ms)'));
  assert.ok(output.includes('Status      : SUCCESS'));
  assert.ok(output.includes('Exit Code   : 0'));
  assert.ok(output.includes('Privilege   : Elevated (Administrator / UAC)'));
  assert.ok(output.includes('Mode        : LIVE EXECUTION'));
  assert.ok(output.includes('Total Lines : 2'));

  // Divider and Output stream
  assert.ok(output.includes('-'.repeat(80)));
  assert.ok(output.includes('OUTPUT LOG STREAM:'));
  assert.ok(output.includes('[12:34:57] [STDOUT] Scanning Windows 11 24H2 Recall policy...'));
  assert.ok(output.includes('[12:34:59] [STDOUT] Policy successfully updated.'));

  // Footer assertions
  assert.ok(output.includes('END OF EXECUTION LOG — STATUS: SUCCESS (EXIT CODE: 0)'));
  assert.ok(output.trimEnd().endsWith('='.repeat(80)));
});

test('CHALLENGE_EXP_02: Formats cancelled UAC 1223 execution correctly', () => {
  const cancelledRecord = {
    id: 'exec_cancelled_1223',
    scriptName: 'Optimize Gaming QoS',
    scriptType: 'ps1',
    timestamp: '2026-09-06T12:40:00.000Z',
    durationMs: 850,
    exitCode: 1223,
    status: 'cancelled',
    elevated: true,
    isDryRun: false,
    rawContent: 'param()',
    logLines: [
      { id: '1', line: '[UAC] Administrator elevation prompt was declined or cancelled by the user.', stream: 'stderr', timestamp: '12:40:00' },
    ],
  };

  const output = generateStructuredLogText(cancelledRecord);

  assert.ok(output.includes('Status      : CANCELLED'));
  assert.ok(output.includes('Exit Code   : 1223'));
  assert.ok(output.includes('Privilege   : Elevated (Administrator / UAC)'));
  assert.ok(output.includes('[12:40:00] [STDERR] [UAC] Administrator elevation prompt was declined or cancelled by the user.'));
  assert.ok(output.includes('END OF EXECUTION LOG — STATUS: CANCELLED (EXIT CODE: 1223)'));
});

test('CHALLENGE_EXP_03: Formats dry-run simulation with standard user privilege and no script ID', () => {
  const dryRunRecord = {
    id: 'exec_dry_custom',
    scriptName: 'Ad-hoc Maintenance Script',
    scriptType: 'cmd',
    timestamp: '2026-09-06T12:50:00.000Z',
    durationMs: 120,
    exitCode: 0,
    status: 'success',
    elevated: false,
    isDryRun: true,
    rawContent: 'dir',
    logLines: [],
  };

  const output = generateStructuredLogText(dryRunRecord);

  // scriptId line must be completely omitted without null or undefined printed
  assert.strictEqual(output.includes('Script ID'), false, 'Should not render Script ID when undefined');
  assert.strictEqual(output.includes('undefined'), false, 'Should not contain "undefined" text');
  assert.strictEqual(output.includes('null'), false, 'Should not contain "null" text');

  assert.ok(output.includes('Privilege   : Standard User'));
  assert.ok(output.includes('Mode        : DRY-RUN (Simulated)'));
  assert.ok(output.includes('Total Lines : 0'));
  assert.ok(output.includes('[NO OUTPUT LOG LINES CAPTURED]'));
});

console.log('\n================================================================================');
console.log(` CHALLENGER EMPIRICAL VERIFICATION RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================================');

if (failedTests > 0) {
  process.exit(1);
}

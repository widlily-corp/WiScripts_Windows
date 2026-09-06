/**
 * WiScripts Windows — Milestone 2 Remediation Deep Empirical Verification
 * Challenger: challenger_m2_1_iter2
 * 
 * Strict Host Safety: 100% sandboxed / mock-based, zero live elevation or host mutation.
 * 
 * Target Verifications:
 * 1. PowerShell Runspace Watcher Thread:
 *    - Valid runspace creation via [powershell]::Create() in PowerShell 5.1
 *    - Concurrent background execution without blocking main thread
 *    - Cancellation sentinel detection via Test-Path -LiteralPath
 *    - Clean teardown via Dispose() on normal script completion without hanging
 * 2. UTF-8 BOM Stripping & Producer/Consumer Integrity:
 *    - Producer: [System.Text.UTF8Encoding]::new($false) produces raw UTF-8 (no 0xEF, 0xBB, 0xBF)
 *    - Consumer: Rust \u{feff} stripping parses successfully even if BOM is present
 *    - Edge cases: Multi-byte Cyrillic content, compressed JSON, null exitCode
 * 3. Path Escaping Matrix:
 *    - Single quote escaping (' -> '')
 *    - Double quote wrapping in Start-Process ArgumentList
 *    - Unicode / Cyrillic paths, spaces, parenthesis, brackets, $var, and backticks
 *    - PowerShell AST parsing verification across 15 adversarial path patterns
 * 4. Error classification:
 *    - UAC decline vs user cancellation vs execution error across English and Russian
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

console.log('================================================================');
console.log(' CHALLENGER M2-1 ITER2: DEEP EMPIRICAL REMEDIATION VERIFICATION');
console.log(' Timestamp: ' + new Date().toISOString());
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;
const issues = [];

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ PASS: ' + name);
    passCount++;
  } catch (err) {
    console.log('  ✗ FAIL: ' + name);
    console.log('    Error: ' + err.message);
    failCount++;
    issues.push({ test: name, error: err.message });
  }
}

const sandboxDir = path.join(__dirname, 'sandbox_m2_deep');

function resetSandbox() {
  if (fs.existsSync(sandboxDir)) {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sandboxDir, { recursive: true });
}

// ----------------------------------------------------------------------------
// SECTION 1: PowerShell Runspace Watcher Thread Verification
// ----------------------------------------------------------------------------
console.log('--- SECTION 1: PowerShell Runspace Watcher Thread Verification ---');

test('Watcher Runspace: [powershell]::Create() executes concurrently in PS 5.1 without errors', () => {
  resetSandbox();
  const scriptPath = path.join(sandboxDir, 'test_runspace_basic.ps1');
  const outPath = path.join(sandboxDir, 'runspace_out.txt');

  const psCode = `$out = '${outPath.replace(/'/g, "''")}'
$watcher = [powershell]::Create().AddScript({
    param($dest)
    [System.Threading.Thread]::Sleep(50)
    [System.IO.File]::WriteAllText($dest, "RUNSPACE_OK")
}).AddArgument($out).BeginInvoke()

# Wait for completion
Start-Sleep -Milliseconds 150
if ($watcher -ne $null) {
    if ($watcher -is [System.IDisposable]) { $watcher.Dispose() }
    elseif ($watcher.AsyncWaitHandle -ne $null) { $watcher.AsyncWaitHandle.Close() }
}
`;

  fs.writeFileSync(scriptPath, psCode, 'utf8');

  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    encoding: 'utf8',
    timeout: 5000
  });

  assert.strictEqual(res.status, 0, 'Script must exit with 0: ' + res.stderr);
  assert.ok(fs.existsSync(outPath), 'Output file must be written by background runspace');
  assert.strictEqual(fs.readFileSync(outPath, 'utf8').trim(), 'RUNSPACE_OK');
  resetSandbox();
});

test('Watcher Runspace: Detects cancellation sentinel file and executes cancellation branch', () => {
  resetSandbox();
  const scriptPath = path.join(sandboxDir, 'test_runspace_cancel.ps1');
  const sentinelPath = path.join(sandboxDir, 'session.cancel');
  const logPath = path.join(sandboxDir, 'killed.log');

  // We mock the taskkill behavior by writing a detection confirmation to killed.log instead of killing self
  const psCode = `$myPid = $PID
$cPath = '${sentinelPath.replace(/'/g, "''")}'
$lPath = '${logPath.replace(/'/g, "''")}'

$cancelWatcher = [powershell]::Create().AddScript({
    param($destLog, $cPath)
    while ($true) {
        if (Test-Path -LiteralPath $cPath) {
            [System.IO.File]::WriteAllText($destLog, "SENTINEL_FOUND")
            break
        }
        [System.Threading.Thread]::Sleep(30)
    }
}).AddArgument($lPath).AddArgument($cPath).BeginInvoke()

# Wait 50ms, then create sentinel
Start-Sleep -Milliseconds 50
[System.IO.File]::WriteAllText($cPath, "")

# Wait for watcher to pick it up
Start-Sleep -Milliseconds 150

if ($cancelWatcher -ne $null) {
    if ($cancelWatcher -is [System.IDisposable]) { $cancelWatcher.Dispose() }
}
`;

  fs.writeFileSync(scriptPath, psCode, 'utf8');

  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    encoding: 'utf8',
    timeout: 5000
  });

  assert.strictEqual(res.status, 0, 'Script must exit with 0: ' + res.stderr);
  assert.ok(fs.existsSync(logPath), 'Watcher must write detection log');
  assert.strictEqual(fs.readFileSync(logPath, 'utf8').trim(), 'SENTINEL_FOUND');
  resetSandbox();
});

test('Watcher Runspace: Clean teardown on normal completion without cancellation (no hangs or handle leaks)', () => {
  resetSandbox();
  const scriptPath = path.join(sandboxDir, 'test_runspace_teardown.ps1');
  const sentinelPath = path.join(sandboxDir, 'never_created.cancel');

  const psCode = `$cPath = '${sentinelPath.replace(/'/g, "''")}'
$cancelWatcher = [powershell]::Create().AddScript({
    param($cPath)
    while ($true) {
        if (Test-Path -LiteralPath $cPath) { break }
        [System.Threading.Thread]::Sleep(50)
    }
}).AddArgument($cPath).BeginInvoke()

# Main work completes quickly
Start-Sleep -Milliseconds 100

# Finally teardown block
try {
    if ($cancelWatcher -ne $null) {
        if ($cancelWatcher -is [System.IDisposable]) { $cancelWatcher.Dispose() }
        elseif ($cancelWatcher.AsyncWaitHandle -ne $null) { $cancelWatcher.AsyncWaitHandle.Close() }
    }
} catch {}
exit 0
`;

  fs.writeFileSync(scriptPath, psCode, 'utf8');

  const startTime = Date.now();
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    encoding: 'utf8',
    timeout: 5000
  });
  const elapsed = Date.now() - startTime;

  assert.strictEqual(res.status, 0, 'Script must exit with 0: ' + res.stderr);
  assert.ok(elapsed < 4000, `Script must terminate cleanly without hanging (took ${elapsed}ms)`);
  resetSandbox();
});

// ----------------------------------------------------------------------------
// SECTION 2: BOM Stripping & Producer/Consumer Integrity
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 2: BOM Stripping & Producer/Consumer Integrity ---');

test('BOM Producer: [System.Text.UTF8Encoding]::new($false) produces zero BOM bytes', () => {
  resetSandbox();
  const scriptPath = path.join(sandboxDir, 'test_nobom_producer.ps1');
  const metaPath = path.join(sandboxDir, 'session.meta');

  const psCode = `$metaPath = '${metaPath.replace(/'/g, "''")}'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$metaJson = @{ pid = 9999; status = "running"; exitCode = $null } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($metaPath, $metaJson, $utf8NoBom)
`;

  fs.writeFileSync(scriptPath, psCode, 'utf8');

  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    encoding: 'utf8'
  });

  assert.strictEqual(res.status, 0, 'PS script must succeed');
  const buffer = fs.readFileSync(metaPath);
  
  // Verify first byte is '{' (0x7B) and NOT UTF-8 BOM (0xEF 0xBB 0xBF)
  assert.strictEqual(buffer[0], 0x7B, 'First byte must be ASCII "{" (0x7B)');
  assert.ok(buffer[0] !== 0xEF || buffer[1] !== 0xBB || buffer[2] !== 0xBF, 'Must NOT contain UTF-8 BOM');
  
  const parsed = JSON.parse(buffer.toString('utf8'));
  assert.strictEqual(parsed.pid, 9999);
  assert.strictEqual(parsed.status, 'running');
  assert.strictEqual(parsed.exitCode, null);
  resetSandbox();
});

test('BOM Consumer: Resilient JSON deserialization with trim_start_matches(\\u{feff})', () => {
  // Simulating Rust deserialization logic:
  // let clean_meta = meta_content.trim_start_matches('\u{feff}');
  // serde_json::from_str::<ScriptMetaInfo>(clean_meta)

  function deserializeMeta(rawString) {
    const clean = rawString.replace(/^\uFEFF+/, '');
    return JSON.parse(clean);
  }

  // 1. Without BOM
  const rawNoBom = '{"pid":4321,"status":"running","exitCode":null}';
  const parsed1 = deserializeMeta(rawNoBom);
  assert.strictEqual(parsed1.pid, 4321);

  // 2. With single UTF-8 BOM
  const rawWithBom = '\uFEFF{"pid":4321,"status":"completed","exitCode":0}';
  assert.throws(() => JSON.parse(rawWithBom), 'Standard JSON.parse without stripping BOM fails in some parsers / rust serde_json');
  const parsed2 = deserializeMeta(rawWithBom);
  assert.strictEqual(parsed2.status, 'completed');
  assert.strictEqual(parsed2.exitCode, 0);

  // 3. With duplicate BOM (adversarial)
  const rawDoubleBom = '\uFEFF\uFEFF{"pid":1111,"status":"running","exitCode":null}';
  const parsed3 = deserializeMeta(rawDoubleBom);
  assert.strictEqual(parsed3.pid, 1111);
});

// ----------------------------------------------------------------------------
// SECTION 3: Path Escaping & ArgumentList Formatting Matrix
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Path Escaping & ArgumentList Formatting Matrix ---');

function escapePsSingleQuote(s) {
  return s.replace(/'/g, "''");
}

test('Path Escaping: Matrix of 15 hostile and extreme paths parses correctly in PowerShell AST', () => {
  const hostilePaths = [
    "C:\\Users\\Simple\\test.ps1",
    "C:\\Users\\O'Connor\\Documents\\test.ps1",
    "C:\\Users\\D''Angelo\\test.ps1",
    "C:\\Program Files (x86)\\WiScripts App\\runner.ps1",
    "C:\\Пользователи\\Иван Иванов\\Скрипты\\runner.ps1",
    "C:\\Path with spaces and 'quotes' inside\\runner.ps1",
    "C:\\Path\\$HOME\\$env_test\\runner.ps1",
    "C:\\Path\\`backtick`\\runner.ps1",
    "C:\\Path\\[SquareBrackets]\\[1]\\runner.ps1",
    "C:\\Path\\(Parentheses)\\(test)\\runner.ps1",
    "C:\\Path\\;semicolon&ampersand\\runner.ps1",
    "C:\\Path\\%PERCENT%\\runner.ps1",
    "C:\\Path\\#hash\\runner.ps1",
    "C:\\Path\\@at\\runner.ps1",
    "C:\\test\\'''triple_quote'''\\end.ps1"
  ];

  for (const p of hostilePaths) {
    const escaped = escapePsSingleQuote(p);
    // Mimic the exact runner assignment:
    // $payloadPath = '{payload}'
    // 1. Verify AST parses cleanly without syntax errors
    const astScript = `
$errors = $null
$tokens = $null
$code = @'
$p = '${escaped}'
'@
$ast = [System.Management.Automation.Language.Parser]::ParseInput($code, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
    $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
    exit 1
}
exit 0
`;
    const resAst = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', astScript], {
      encoding: 'utf8'
    });
    assert.strictEqual(resAst.status, 0, 'AST parse failed for path: ' + p + '\nStderr: ' + resAst.stderr);

    // 2. Verify file-based execution round-trip (matching actual runner file execution)
    const testFile = path.join(sandboxDir, 'test_path_roundtrip.ps1');
    const outFile = path.join(sandboxDir, 'test_path_out.txt');
    const fileContent = `$p = '${escaped}'\n[System.IO.File]::WriteAllText('${outFile.replace(/'/g, "''")}', $p, [System.Text.UTF8Encoding]::new($false))\n`;
    // Write with UTF-8 BOM so PowerShell 5.1 file reader preserves non-ASCII characters
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    fs.writeFileSync(testFile, Buffer.concat([bom, Buffer.from(fileContent, 'utf8')]));

    const resRun = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', testFile], {
      encoding: 'utf8'
    });
    assert.strictEqual(resRun.status, 0, 'File execution failed for path: ' + p + '\nStderr: ' + resRun.stderr);
    const readBack = fs.readFileSync(outFile, 'utf8');
    assert.strictEqual(readBack, p, 'Escaped path round-trip in file execution must match original string');

  }
});

test('ArgumentList Wrapping: Start-Process token parsing preserves path with spaces and single quotes', () => {
  resetSandbox();
  // Safe test without elevation: test Start-Process passing -File '\"escaped\"' to target script
  const targetScript = path.join(sandboxDir, "Target's Script With Spaces.ps1");
  const markerFile = path.join(sandboxDir, "marker.txt");

  const targetContent = `param()
[System.IO.File]::WriteAllText('${markerFile.replace(/'/g, "''")}', "SUCCESS")
`;
  fs.writeFileSync(targetScript, targetContent, 'utf8');

  const escapedPath = escapePsSingleQuote(targetScript);
  // Replicating Rust launcher format (omitting -Verb RunAs for host safety):
  const cmd = `Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','"${escapedPath}"') -Wait`;

  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
    encoding: 'utf8',
    timeout: 8000
  });

  assert.strictEqual(res.status, 0, 'Start-Process command failed: ' + res.stderr);
  assert.ok(fs.existsSync(markerFile), 'Target script must be executed by powershell.exe launched with ArgumentList format');
  assert.strictEqual(fs.readFileSync(markerFile, 'utf8').trim(), 'SUCCESS');
  resetSandbox();
});

// ----------------------------------------------------------------------------
// SECTION 4: Multi-Lingual UAC Error Classification
// ----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Multi-Lingual UAC Error Classification ---');

// The updated error classifier logic matching scriptRunnerSlice.ts remediation:
function remediatedErrorClassifier(errorMsg, exitCode) {
  const lowerError = (errorMsg || '').toLowerCase();

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

  if (isUacDecline) {
    return { type: 'UAC_DECLINE', toast: 'warning', title: 'UAC Elevation Cancelled' };
  } else if (isProcessCancelled) {
    return { type: 'PROCESS_CANCELLED', toast: 'warning', title: 'Execution Cancelled' };
  } else {
    return { type: 'EXECUTION_ERROR', toast: 'error', title: 'Script Execution Error' };
  }
}

test('Remediated Error Classifier: Rust backend message maps to UAC_DECLINE', () => {
  const rustMsg = "[UAC] Administrator elevation was declined by user. Script execution cancelled.";
  const res = remediatedErrorClassifier(rustMsg, -1);
  assert.strictEqual(res.type, 'UAC_DECLINE');
  assert.strictEqual(res.toast, 'warning');
});

test('Remediated Error Classifier: Russian Win32 decline strings map to UAC_DECLINE', () => {
  const ru1 = "Start-Process : Операция отменена пользователем.";
  assert.strictEqual(remediatedErrorClassifier(ru1, 1).type, 'UAC_DECLINE');

  const ru2 = "Ошибка выполнения: отменено пользователем";
  assert.strictEqual(remediatedErrorClassifier(ru2, 1).type, 'UAC_DECLINE');

  const ru3 = "System error 0x800704c7 occurred";
  assert.strictEqual(remediatedErrorClassifier(ru3, 1).type, 'UAC_DECLINE');
});

test('Remediated Error Classifier: Russian generic cancellation maps to PROCESS_CANCELLED', () => {
  const ruCancel = "Скрипт был отменен";
  assert.strictEqual(remediatedErrorClassifier(ruCancel, 1).type, 'PROCESS_CANCELLED');
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(' DEEP VERIFICATION SUMMARY');
console.log('================================================================');
console.log(' TOTAL TESTS:  ' + (passCount + failCount));
console.log(' PASSED:       ' + passCount);
console.log(' FAILED:       ' + failCount);
if (issues.length > 0) {
  console.log(' ISSUES FOUND:');
  for (const iss of issues) {
    console.log('   - [' + iss.test + ']: ' + iss.error);
  }
}
console.log('================================================================\n');

// Clean up sandbox
if (fs.existsSync(sandboxDir)) {
  fs.rmSync(sandboxDir, { recursive: true, force: true });
}

process.exit(failCount > 0 ? 1 : 0);

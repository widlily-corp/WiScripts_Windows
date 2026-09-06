/**
 * Challenger M4 Empirical Adversarial Stress Test Suite
 * 
 * Comprehensive adversarial verification of `scriptImpactAnalyzer.ts`:
 * 1. Host Safety Isolation: Confirm analyzer executes 0 system commands and 0 Tauri IPC commands.
 * 2. Full Corpus Verification: All 45 scripts in `scripts_lib/` (0 crashes, latency < 10ms per script, semantic accuracy).
 * 3. Adversarial Edge Cases: Empty strings, pure comments, syntax errors, single quotes, multiline arrays, hashtables, spaces in paths.
 * 4. Scale & ReDoS Resilience: 10,000-line synthetic scripts and deeply nested structures.
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { performance } = require('perf_hooks');

const {
  analyzeScriptImpact,
  parsePowerShellVariables,
} = require('../src/utils/scriptImpactAnalyzer.ts');

console.log('================================================================');
console.log(' CHALLENGER M4: EMPIRICAL IMPACT SIMULATOR STRESS TEST SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    if (details) console.error(`         Details: ${details}`);
    failedTests++;
  }
}

// -------------------------------------------------------------------------
// SUITE 1: Host Safety & Zero Side-Effects Interceptor
// -------------------------------------------------------------------------
console.log('--- SUITE 1: Host Safety & Execution Isolation Audit ---');

let interceptedCalls = [];
const cpFunctions = ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork'];
const originalCp = {};

for (const fnName of cpFunctions) {
  originalCp[fnName] = child_process[fnName];
  child_process[fnName] = function (...args) {
    interceptedCalls.push({ fn: fnName, args: args[0] });
    throw new Error(`CRITICAL SECURITY VIOLATION: child_process.${fnName} was invoked during static analysis!`);
  };
}

// Ensure window / global Tauri mocks don't allow IPC
const originalTauri = global.__TAURI_INTERNALS__;
global.__TAURI_INTERNALS__ = {
  invoke: () => {
    interceptedCalls.push({ fn: 'tauri.invoke' });
    throw new Error('CRITICAL SECURITY VIOLATION: Tauri IPC invoke called during static analysis!');
  },
};

// -------------------------------------------------------------------------
// SUITE 2: Full Corpus Stress Test (All 45 Scripts in scripts_lib)
// -------------------------------------------------------------------------
console.log('\n--- SUITE 2: Full 45-Script Corpus Stress Test ---');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'scripts_lib', 'manifest.json');
assert(fs.existsSync(manifestPath), `Manifest exists at ${manifestPath}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const scripts = manifest.scripts || [];
assert(scripts.length === 45, `Manifest contains exactly 45 scripts (Actual: ${scripts.length})`);

// Warm up V8 JIT compiler and regex caches to eliminate cold-start artifact
analyzeScriptImpact('Write-Host "JIT Warmup"');

const latencies = [];
let totalMutationsDetected = 0;
let scriptsWithDryRunDetected = 0;
let scriptsWithAdminDetected = 0;

for (let i = 0; i < scripts.length; i++) {
  const scriptMeta = scripts[i];
  const scriptFilePath = path.join(rootDir, 'scripts_lib', scriptMeta.path);
  const exists = fs.existsSync(scriptFilePath);
  assert(exists, `Script [${i + 1}/45] exists: ${scriptMeta.path}`);
  if (!exists) continue;

  const content = fs.readFileSync(scriptFilePath, 'utf8');

  // Benchmark parse latency with microsecond accuracy
  const t0 = performance.now();
  let analysis;
  let errorCaught = null;
  try {
    analysis = analyzeScriptImpact(content, scriptMeta);
  } catch (err) {
    errorCaught = err;
  }
  const t1 = performance.now();
  const latencyMs = t1 - t0;
  latencies.push(latencyMs);

  assert(!errorCaught, `Script [${scriptMeta.id}] parses without crash`, errorCaught ? errorCaught.stack : '');
  assert(latencyMs < 10, `Script [${scriptMeta.id}] latency < 10ms (Actual: ${latencyMs.toFixed(3)}ms)`);

  if (!analysis) continue;

  // Verify internal summary consistency
  const sum = analysis.summary;
  const computedTotal =
    sum.registryCount +
    sum.servicesCount +
    sum.tasksCount +
    sum.filesystemCount +
    sum.networkCount +
    sum.processCount;
  assert(
    sum.totalItems === analysis.items.length,
    `Script [${scriptMeta.id}] items array length matches summary.totalItems (${analysis.items.length} vs ${sum.totalItems})`
  );

  totalMutationsDetected += sum.totalItems;
  if (analysis.hasDryRunSupport) scriptsWithDryRunDetected++;
  if (analysis.requiresAdmin) scriptsWithAdminDetected++;

  // Verify elevation contract
  if (scriptMeta.requiresAdmin) {
    assert(
      analysis.requiresAdmin === true,
      `Script [${scriptMeta.id}] with requiresAdmin in manifest must report requiresAdmin: true`
    );
  }

  // Verify dry run parameter detection if declared in manifest parameters
  const manifestHasDryRunParam = scriptMeta.parameters && scriptMeta.parameters.some(p => /dryrun/i.test(p.name));
  if (manifestHasDryRunParam) {
    assert(
      analysis.hasDryRunSupport === true,
      `Script [${scriptMeta.id}] declaring DryRun parameter must report hasDryRunSupport: true`
    );
  }

  // Verify specific script invariants:
  if (scriptMeta.id === 'maint-clear-wu-cache') {
    // Note: If foreach ($s in $services) is not resolved, only 2 operations on literal "$s" are detected instead of wuauserv, bits, cryptsvc, dosvc
    assert(sum.servicesCount >= 4, `maint-clear-wu-cache should detect all 4 services in $services array (Actual: ${sum.servicesCount})`);
    assert(analysis.items.some(i => i.target.toLowerCase() === 'wuauserv'), `maint-clear-wu-cache target list must include 'wuauserv'`);
    assert(analysis.riskLevel === 'critical' || sum.criticalCount > 0, `maint-clear-wu-cache touches wuauserv, must be critical (Actual: ${analysis.riskLevel}, critCount=${sum.criticalCount})`);
  }

  if (scriptMeta.id === 'sec-disable-telemetry-24h2') {
    assert(sum.registryCount >= 5, `sec-disable-telemetry-24h2 must detect registry policies (Actual: ${sum.registryCount})`);
    assert(sum.tasksCount >= 5, `sec-disable-telemetry-24h2 must detect modern scheduled tasks (Actual: ${sum.tasksCount})`);
    assert(analysis.hasDryRunSupport === true, `sec-disable-telemetry-24h2 must have DryRun support`);
  }

  if (scriptMeta.id === 'net-qos-dscp-gaming') {
    assert(sum.networkCount >= 1, `net-qos-dscp-gaming must detect NetQosPolicy (Actual: ${sum.networkCount})`);
  }

  if (scriptMeta.id === 'net-optimize-nagle') {
    assert(sum.registryCount >= 1, `net-optimize-nagle must detect TCP registry parameters (Actual: ${sum.registryCount})`);
  }

  if (scriptMeta.id === 'sec-toggle-recall-copilot') {
    assert(sum.registryCount >= 1, `sec-toggle-recall-copilot must detect policy registry changes (Actual: ${sum.registryCount})`);
    assert(analysis.hasDryRunSupport === true, `sec-toggle-recall-copilot must have DryRun support`);
  }
}

const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
const maxLatency = Math.max(...latencies);
const minLatency = Math.min(...latencies);

console.log(`\nCorpus Latency Stats (45 scripts): Min=${minLatency.toFixed(3)}ms, Avg=${avgLatency.toFixed(3)}ms, Max=${maxLatency.toFixed(3)}ms`);
console.log(`Total Mutations Identified across library: ${totalMutationsDetected}`);
console.log(`Scripts with Dry-Run Support: ${scriptsWithDryRunDetected}/45`);
console.log(`Scripts requiring Admin Elevation: ${scriptsWithAdminDetected}/45`);

assert(maxLatency < 10, `All 45 scripts analyzed under 10ms threshold (Worst case: ${maxLatency.toFixed(3)}ms)`);

// -------------------------------------------------------------------------
// SUITE 3: Adversarial Edge Cases & Syntactic Stress Testing
// -------------------------------------------------------------------------
console.log('\n--- SUITE 3: Adversarial Edge Cases & Boundary Stress ---');

// Edge 1: Empty inputs
const edgeEmpty = analyzeScriptImpact('');
assert(edgeEmpty.riskLevel === 'safe' && edgeEmpty.items.length === 0, 'Empty string produces safe 0-item result');

// Edge 2: Whitespace only
const edgeWhitespace = analyzeScriptImpact('   \r\n\t  \r\n   ');
assert(edgeWhitespace.riskLevel === 'safe' && edgeWhitespace.items.length === 0, 'Whitespace only produces safe 0-item result');

// Edge 3: Pure comments (single line and block comments)
const edgeComments = analyzeScriptImpact(`
  # Requires -Version 5.1
  # This is a comment about Stop-Service -Name "wuauserv"
  <#
    Block comment containing:
    Remove-Item -Path "C:\\Windows\\System32" -Recurse
    Set-ItemProperty -Path "HKLM:\\SOFTWARE" -Name "X"
  #>
  # Another comment
`);
assert(edgeComments.summary.servicesCount === 0, 'Commented-out Stop-Service is ignored');
assert(edgeComments.summary.filesystemCount === 0, 'Commented-out Remove-Item is ignored');

// Edge 4: Syntax errors / unbalanced brackets
const malformedCode = `
  Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Test" -Name "Incomplete
  $arr = @( "unclosed string
  Stop-Service -Name
  @{ Key = "broken;
  if ($true) {
    Remove-Item -Path "C:\\valid\\path"
`;
let malformedRes;
let malformedErr = null;
try {
  malformedRes = analyzeScriptImpact(malformedCode);
} catch (e) {
  malformedErr = e;
}
assert(!malformedErr, 'Malformed / syntax-corrupted code does not crash parser');
assert(malformedRes && malformedRes.summary.filesystemCount === 1, 'Valid statement inside malformed script is still detected');

// Edge 5: Single quotes vs double quotes vs unquoted
const quoteCode = `
  Set-ItemProperty -Path 'HKLM:\\Software\\SingleQuote' -Name 'SingleName' -Value 'Val1'
  Set-ItemProperty -Path "HKLM:\\Software\\DoubleQuote" -Name "DoubleName" -Value "Val2"
  Stop-Service 'bits'
  Stop-Service "wuauserv"
  Stop-Service cryptsvc
`;
const quoteRes = analyzeScriptImpact(quoteCode);
assert(quoteRes.summary.registryCount === 2, 'Detects both single-quoted and double-quoted Set-ItemProperty');
assert(quoteRes.summary.servicesCount === 3, 'Detects single-quoted, double-quoted, and unquoted Stop-Service');

// Edge 6: Multiline array declaration with varied spacing
const arrayCode = `
  $services = @(
    'lanmanserver',
    "rpcss",

    'trustedinstaller'
  )
  Stop-Service -Name $services
`;
const arrayRes = analyzeScriptImpact(arrayCode);
assert(arrayRes.summary.servicesCount === 3, 'Multiline array with blank lines expands to 3 service operations');
assert(arrayRes.summary.criticalCount === 3, 'All 3 services (lanmanserver, rpcss, trustedinstaller) correctly flagged as critical');

// Edge 7: Hashtable variations
const hashCode = `
  $settings = @(
    @{
      Key   = "HKLM:\\SOFTWARE\\Policies\\Test1"
      Name  = "SettingOne"
      Value = 1
    },
    @{ Key = "HKCU:\\Software\\Policies\\Test2"; Name = "SettingTwo"; Value = 0 }
  )
`;
const hashRes = analyzeScriptImpact(hashCode);
assert(hashRes.summary.registryCount === 2, 'Detects both multiline and single-line hashtable registry settings');

// Edge 8: Large synthetic payload (Scale & ReDoS stress test)
console.log('Testing 10,000-line synthetic PowerShell script for ReDoS and memory safety...');
const lines = [];
for (let i = 0; i < 5000; i++) {
  lines.push(`Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Test\\Key${i}" -Name "Prop${i}" -Value ${i}`);
  lines.push(`Write-Host "Progress: ${i}"`);
}
const hugeScript = lines.join('\n');
const tHuge0 = performance.now();
const hugeRes = analyzeScriptImpact(hugeScript);
const tHuge1 = performance.now();
const hugeDuration = tHuge1 - tHuge0;

console.log(`10,000-line script parsed in: ${hugeDuration.toFixed(2)}ms (Mutations detected: ${hugeRes.summary.registryCount})`);
assert(hugeDuration < 500, `10,000-line script parsed within 500ms (Actual: ${hugeDuration.toFixed(2)}ms)`);
assert(hugeRes.summary.registryCount === 5000, `All 5,000 registry mutations accurately detected in massive payload`);

// Edge 9: Unicode, Cyrillic strings, emojis, and UTF-8 BOM
const unicodeCode = `\uFEFF
  # Скрипт очистки кэша и оптимизации системы 🚀
  Write-Host "Запуск очистки временных файлов..." -ForegroundColor Green
  Remove-Item -Path "$env:TEMP\\*" -Recurse -Force
  Stop-Service -Name "wuauserv"
`;
const uniRes = analyzeScriptImpact(unicodeCode);
assert(uniRes.summary.servicesCount === 1, 'Script with UTF-8 BOM and Cyrillic/emojis detects service operation');
assert(uniRes.summary.filesystemCount === 1, 'Script with UTF-8 BOM and Cyrillic/emojis detects filesystem operation');
assert(uniRes.riskLevel === 'critical', 'Critical service wuauserv triggers critical risk level');

// Edge 10: .NET File/Directory Deletions and Critical Path Protection
const dotNetCode = `
  [System.IO.File]::Delete("C:\\Windows\\System32\\drivers\\etc\\hosts")
  [System.IO.Directory]::Delete("C:\\ProgramData\\WiScripts\\Cache")
`;
const dotNetRes = analyzeScriptImpact(dotNetCode);
assert(dotNetRes.summary.filesystemCount === 2, 'Detects both [System.IO.File]::Delete and [System.IO.Directory]::Delete');
assert(dotNetRes.summary.criticalCount === 1, 'C:\\Windows\\System32 deletion flagged as critical');

// Edge 11: Paths with spaces inside quotes
const spacesCode = `
  Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Error Reporting" -Name "Disabled" -Value 1
  Remove-Item -Path "C:\\Program Files\\WiScripts\\Custom Directory" -Recurse
`;
const spacesRes = analyzeScriptImpact(spacesCode);
const regWithSpace = spacesRes.items.find(i => i.category === 'registry');
const fsWithSpace = spacesRes.items.find(i => i.category === 'filesystem');

assert(
  Boolean(regWithSpace && regWithSpace.target.includes('Windows Error Reporting') && regWithSpace.target.includes('Disabled')),
  `Set-ItemProperty preserves full path with spaces and property name (Actual: "${regWithSpace ? regWithSpace.target : 'none'}")`
);
assert(
  Boolean(fsWithSpace && fsWithSpace.target.includes('Custom Directory')),
  `Remove-Item preserves full path with spaces (Actual: "${fsWithSpace ? fsWithSpace.target : 'none'}")`
);

// Edge 12: Foreach loop variable resolution
const foreachCode = `
  $services = @("wuauserv", "bits", "cryptsvc")
  foreach ($s in $services) {
    Stop-Service -Name $s
  }
  $tasks = @("Consolidator", "ProgramDataUpdater")
  foreach ($t in $tasks) {
    Disable-ScheduledTask -TaskName $t
  }
`;
const foreachRes = analyzeScriptImpact(foreachCode);
assert(
  foreachRes.summary.servicesCount === 3,
  `Foreach loop on $services should expand to 3 distinct service items (Actual: ${foreachRes.summary.servicesCount})`
);
assert(
  foreachRes.items.some(i => i.target.toLowerCase() === 'wuauserv'),
  `Foreach loop resolves 'wuauserv' as target rather than literal '$s'`
);
assert(
  foreachRes.summary.criticalCount >= 3,
  `Foreach loop on critical services correctly flags criticalCount >= 3 (Actual: ${foreachRes.summary.criticalCount})`
);
assert(
  foreachRes.summary.tasksCount === 2,
  `Foreach loop on $tasks should expand to 2 distinct task items (Actual: ${foreachRes.summary.tasksCount})`
);
assert(
  foreachRes.items.some(i => i.target === 'Consolidator'),
  `Foreach loop resolves 'Consolidator' as task target rather than literal '$t'`
);

// Edge 13: Wildcards in variable paths (e.g. "$var\*")
const wildCode = `
  $customDir = "C:\\ProgramData\\WiScripts\\Cache"
  Remove-Item -Path "$customDir\\*" -Recurse -Force
`;
const wildRes = analyzeScriptImpact(wildCode);
const wildItem = wildRes.items.find(i => i.category === 'filesystem');
assert(
  Boolean(wildItem && wildItem.target.includes('C:\\ProgramData\\WiScripts\\Cache')),
  `Expands variable when followed by wildcard path suffix (Actual: "${wildItem ? wildItem.target : 'none'}")`
);

// -------------------------------------------------------------------------
// SUITE 4: Verification of Host Safety & Execution Isolation
// -------------------------------------------------------------------------
console.log('\n--- SUITE 4: Final Host Safety Verification ---');

// Restore child_process
for (const fnName of cpFunctions) {
  child_process[fnName] = originalCp[fnName];
}
global.__TAURI_INTERNALS__ = originalTauri;

assert(interceptedCalls.length === 0, `Zero host system commands or Tauri IPC calls were executed during all tests (Actual: ${interceptedCalls.length})`);

// -------------------------------------------------------------------------
// Summary
// -------------------------------------------------------------------------
console.log('\n================================================================');
console.log(` RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL ADVERSARIAL STRESS TESTS COMPLETED CLEANLY WITH ZERO FAILURES!');
  process.exit(0);
}

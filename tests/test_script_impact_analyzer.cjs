/**
 * Test Suite: Static Script Impact Analyzer (Milestone 4)
 * 
 * Verifies pure in-memory AST and regex static analysis of scripts without host execution:
 * - Registry mutations, PSDrive paths, hashtable settings
 * - Service controls, array expansions, critical service detection
 * - Scheduled task disabling, enabling, deletion
 * - Filesystem mutations (.NET, Remove-Item)
 * - Network QoS policies, stack resets
 * - Elevation and Dry-Run detection
 * - Risk level classification ('safe' | 'elevated' | 'critical')
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  analyzeScriptImpact,
  parsePowerShellVariables,
} = require('../src/utils/scriptImpactAnalyzer.ts');

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
console.log(' WiScripts Windows — Script Impact Analyzer Test Suite');
console.log('===============================================================');

// 1. Variable Resolution
test('VARS_01: Resolves single strings, environment variables, and Join-Path', () => {
  const code = `
    $basePath = "HKLM:\\SOFTWARE\\Policies\\Microsoft"
    $fullPath = Join-Path -Path $env:windir -ChildPath "System32\\drivers\\etc"
    $customVar = 'C:\\WiScripts\\Temp'
  `;
  const vars = parsePowerShellVariables(code);
  assert.strictEqual(vars.get('basePath'), 'HKLM:\\SOFTWARE\\Policies\\Microsoft');
  assert.strictEqual(vars.get('fullPath'), 'C:\\Windows\\System32\\drivers\\etc');
  assert.strictEqual(vars.get('customVar'), 'C:\\WiScripts\\Temp');
});

test('VARS_02: Resolves array assignments and multiline array syntax', () => {
  const code = `
    $services = @("wuauserv", "bits", "cryptsvc")
    $tasks = @(
      "\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator",
      "\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater"
    )
  `;
  const vars = parsePowerShellVariables(code);
  const svcs = vars.get('services');
  assert.ok(Array.isArray(svcs));
  assert.strictEqual(svcs.length, 3);
  assert.strictEqual(svcs[0], 'wuauserv');

  const tks = vars.get('tasks');
  assert.ok(Array.isArray(tks));
  assert.strictEqual(tks.length, 2);
  assert.ok(tks[0].includes('Consolidator'));
});

// 2. Registry Mutations
test('REG_01: Detects Set-ItemProperty, New-ItemProperty, and Remove-ItemProperty', () => {
  const code = `
    Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "HideFileExt" -Value 0
    New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" -Name "TcpAckFrequency" -Value 1 -PropertyType DWord
    Remove-ItemProperty -Path "HKCU:\\Software\\Policies\\App" -Name "LegacyKey"
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.summary.registryCount, 3);

  const setItem = result.items.find((i) => i.action === 'modify' && i.target.includes('HideFileExt'));
  assert.ok(setItem, 'Should find Set-ItemProperty modification');
  assert.ok(setItem.detail.includes('0'));

  const newItem = result.items.find((i) => i.action === 'create' && i.target.includes('TcpAckFrequency'));
  assert.ok(newItem, 'Should find New-ItemProperty creation');

  const remItem = result.items.find((i) => i.action === 'delete' && i.target.includes('LegacyKey'));
  assert.ok(remItem, 'Should find Remove-ItemProperty deletion');
});

test('REG_02: Detects Registry Hashtable declarations (e.g. telemetry policies)', () => {
  const code = `
    $policyRegistrySettings = @(
      @{
        Key   = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection"
        Name  = "AllowTelemetry"
        Value = 0
      },
      @{
        Key   = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent"
        Name  = "DisableWindowsConsumerFeatures"
        Value = 1
      }
    )
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.summary.registryCount, 2);
  const allowTelemetry = result.items.find((i) => i.target.includes('AllowTelemetry'));
  assert.ok(allowTelemetry);
  assert.strictEqual(allowTelemetry.category, 'registry');
  assert.strictEqual(allowTelemetry.action, 'modify');
});

test('REG_03: Flags critical registry hives (SAM, SECURITY, Windows Defender)', () => {
  const code = `
    Set-ItemProperty -Path "HKLM:\\SAM\\SAM\\Domains\\Account" -Name "F" -Value "01"
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.riskLevel, 'critical');
  assert.ok(result.items.some((i) => i.isCritical));
});

// 3. Service Mutations
test('SVC_01: Detects Stop-Service, Start-Service, Set-Service with variable resolution', () => {
  const code = `
    $targetSvc = "DiagTrack"
    Stop-Service -Name $targetSvc -Force
    Set-Service -Name $targetSvc -StartupType Disabled
    Start-Service -Name "w32time"
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.summary.servicesCount, 3);
  const stopItem = result.items.find((i) => i.action === 'stop' && i.target === 'DiagTrack');
  assert.ok(stopItem);
  const disableItem = result.items.find((i) => i.action === 'disable' && i.target === 'DiagTrack');
  assert.ok(disableItem);
  const startItem = result.items.find((i) => i.action === 'start' && i.target === 'w32time');
  assert.ok(startItem);
});

test('SVC_02: Flags critical Windows OS services (wuauserv, bits, cryptsvc, windefend)', () => {
  const code = `
    $services = @("wuauserv", "bits")
    Stop-Service -Name "wuauserv" -Force
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.riskLevel, 'critical');
  const wuauserv = result.items.find((i) => i.target === 'wuauserv');
  assert.ok(wuauserv && wuauserv.isCritical);
});

// 4. Scheduled Tasks
test('TASK_01: Detects Disable-ScheduledTask and Unregister-ScheduledTask', () => {
  const code = `
    Disable-ScheduledTask -TaskName "Consolidator"
    Unregister-ScheduledTask -TaskName "ObsoleteTask" -Confirm:$false
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.summary.tasksCount, 2);
  const disTask = result.items.find((i) => i.action === 'disable' && i.target === 'Consolidator');
  assert.ok(disTask);

  const unregTask = result.items.find((i) => i.action === 'delete' && i.target === 'ObsoleteTask');
  assert.ok(unregTask);
  assert.ok(unregTask.isCritical, 'Unregistering a task must be flagged critical');
  assert.strictEqual(result.riskLevel, 'critical');
});

// 5. Filesystem Operations
test('FS_01: Detects Remove-Item on directories and disambiguates from registry PSDrives', () => {
  const code = `
    Remove-Item -Path "C:\\Temp\\cache\\*" -Recurse -Force
    Remove-Item -Path "HKCU:\\Software\\TestKey" -Recurse
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.summary.filesystemCount, 1);
  assert.strictEqual(result.summary.registryCount, 1);
  const fsItem = result.items.find((i) => i.category === 'filesystem');
  assert.ok(fsItem && fsItem.target.includes('C:\\Temp\\cache'));
  const regItem = result.items.find((i) => i.category === 'registry');
  assert.ok(regItem && regItem.target.includes('HKCU:'));
});

test('FS_02: Detects .NET File::Delete operations and flags critical paths', () => {
  const code = `
    [System.IO.File]::Delete("C:\\Windows\\System32\\catroot2\\test.cat")
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.summary.filesystemCount, 1);
  assert.strictEqual(result.riskLevel, 'critical');
  assert.ok(result.items[0].isCritical);
});

// 6. Network & QoS
test('NET_01: Detects QoS Policy configurations and netsh stack reset', () => {
  const code = `
    New-NetQosPolicy -Name "GamingDSCP" -AppPathNameMatchCondition "game.exe" -DSCPAction 46
    netsh winsock reset
  `;
  const result = analyzeScriptImpact(code);
  assert.strictEqual(result.summary.networkCount, 2);
  const qosItem = result.items.find((i) => i.target.includes('GamingDSCP'));
  assert.ok(qosItem && qosItem.action === 'create');

  const netshItem = result.items.find((i) => i.target.includes('winsock'));
  assert.ok(netshItem && netshItem.isCritical);
  assert.strictEqual(result.riskLevel, 'critical');
});

// 7. Elevation and Dry-Run Detection
test('ELEV_01: Detects elevation requirements via $isAdmin check and manifest', () => {
  const codeWithAdmin = `
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) { exit 1 }
  `;
  const res1 = analyzeScriptImpact(codeWithAdmin);
  assert.strictEqual(res1.requiresAdmin, true);

  const cleanReadCode = `Get-ComputerInfo | Select-Object WindowsProductName`;
  const res2 = analyzeScriptImpact(cleanReadCode, { requiresAdmin: true });
  assert.strictEqual(res2.requiresAdmin, true);
  assert.strictEqual(res2.riskLevel, 'elevated');
});

test('DRY_01: Detects native Dry-Run parameter support', () => {
  const scriptWithDryRun = `
    param(
      [switch]$DryRun
    )
    Write-Host "Running with DryRun=$DryRun"
  `;
  const res = analyzeScriptImpact(scriptWithDryRun);
  assert.strictEqual(res.hasDryRunSupport, true);

  const scriptWithoutDryRun = `Write-Host "No dry run param"`;
  const res2 = analyzeScriptImpact(scriptWithoutDryRun);
  assert.strictEqual(res2.hasDryRunSupport, false);
});

// 8. Safe / Read-Only Scripts
test('SAFE_01: Correctly classifies read-only diagnostic scripts as safe', () => {
  const code = `
    Get-Process | Sort-Object CPU -Descending | Select-Object -First 10
    Get-Service | Where-Object { $_.Status -eq 'Running' }
    Test-Connection -ComputerName 8.8.8.8 -Count 4
  `;
  const res = analyzeScriptImpact(code);
  assert.strictEqual(res.riskLevel, 'safe');
  assert.strictEqual(res.summary.totalItems, 0);
  assert.strictEqual(res.requiresAdmin, false);
});

// 9. Edge Cases & Safety
test('EDGE_01: Handles empty script, comments, whitespace gracefully', () => {
  const empty = analyzeScriptImpact('');
  assert.strictEqual(empty.riskLevel, 'safe');
  assert.strictEqual(empty.items.length, 0);

  const commentsOnly = analyzeScriptImpact('# Just a comment\n# Another line');
  assert.strictEqual(commentsOnly.riskLevel, 'safe');
  assert.strictEqual(commentsOnly.items.length, 0);
});

console.log('---------------------------------------------------------------');
console.log(`Results: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) {
  process.exit(1);
}

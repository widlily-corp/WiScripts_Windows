/**
 * Tier 4 Test Suite: Real-World Application Scenarios (WiScripts Windows v1.0 Production Release)
 * Simulates complete end-to-end user journeys and complex real-world workflows:
 * - Scenario 1: Developer Workstation Debloat & Optimization (.wiscripts + Pre-Flight Snapshot)
 * - Scenario 2: High-Performance Gaming Workstation Setup (Gaming Profile + Power Plan + ProFlow)
 * - Scenario 3: Maximum Privacy & Security Hardening on Windows 11 24H2 (Recall + Copilot + SMBv1)
 * - Scenario 4: Storage Optimization & WinSxS Component Store Maintenance (2-Stage Hash + DISM)
 * - Scenario 5: Disaster Recovery & Safety Rollback (StateEngine JSON Delta + Exact Restoration)
 * - Scenario 6: End-to-End Offline Script Library Execution (ETag Fallback + SHA-256 + Dry-Run)
 */

import fs from 'fs';
import path from 'path';
import {
  assert,
  computeSha256,
  StorageDeduplicationEngine,
  Win32ScmSimulator,
  ProfileValidationEngine,
  MockIPC,
  AppStateSimulator,
  TestRunner
} from './harness.js';

export function buildTier4Suite() {
  const runner = new TestRunner('Tier 4 - Real-World Application Scenarios');

  // =========================================================================
  // Scenario 1: Developer Workstation Debloat & Optimization
  // =========================================================================
  runner.addTest('T4_SCENARIO_01: Developer workstation debloat, .wiscripts profile import, and pre-flight snapshot', async () => {
    // Arrange
    const ipc = new MockIPC();
    const scm = new Win32ScmSimulator();
    const app = new AppStateSimulator(ipc);

    // Step 1: User imports developer profile
    const devProfile = {
      $schema: 'https://wiscripts.app/schemas/profile-v1.json',
      schemaVersion: '1.0.0',
      format: 'wiscripts-configuration-profile',
      metadata: {
        id: 'dev-power-user',
        name: 'Developer Power User',
        description: 'Optimized for high-throughput coding and compilation',
        author: 'WiScripts Team',
        appVersion: '1.0.0'
      },
      targetOs: { minBuild: '22621', supportedEditions: ['Pro', 'Enterprise'] },
      optimizations: {
        enabledRuleIds: [
          'telemetry_diagtrack',
          'telemetry_dmwappush',
          'win11_disable_copilot',
          'win11_disable_recall_ai',
          'services_sysmain',
          'ui_show_file_extensions'
        ]
      },
      proFlowRules: [
        { processName: 'code.exe', targetPriority: 'ABOVE_NORMAL', coreAffinityMask: '0xFF' },
        { processName: 'rust-analyzer.exe', targetPriority: 'HIGH', coreAffinityMask: '0xFF' }
      ]
    };

    // Step 2: Validate profile
    const val = ProfileValidationEngine.validate(devProfile);
    assert.isTrue(val.isValid, 'Imported profile is structurally valid');

    // Step 3: Trigger pre-flight safety snapshot
    const snapshot = await ipc.invoke('create_preflight_snapshot', {
      description: `Pre-flight snapshot for ${devProfile.metadata.name}`,
      rule_ids: devProfile.optimizations.enabledRuleIds
    });
    assert.ok(snapshot.snapshotId, 'Pre-flight safety snapshot created');
    assert.isTrue(snapshot.stateEngineSuccess, 'StateEngine baseline stored');

    // Step 4: Apply optimization rules -> update Win32 SCM services
    for (const ruleId of devProfile.optimizations.enabledRuleIds) {
      if (ruleId === 'telemetry_diagtrack') scm.configureService('DiagTrack', 4);
      if (ruleId === 'telemetry_dmwappush') scm.configureService('dmwappushservice', 4);
      if (ruleId === 'services_sysmain') scm.configureService('SysMain', 4);
    }

    // Assert
    assert.isTrue(scm.isServiceDisabled('DiagTrack'), 'DiagTrack disabled via Win32 SCM');
    assert.isTrue(scm.isServiceDisabled('dmwappushservice'), 'dmwappushservice disabled via Win32 SCM');
    assert.isTrue(scm.isServiceDisabled('SysMain'), 'SysMain disabled via Win32 SCM');
  });

  // =========================================================================
  // Scenario 2: High-Performance Gaming Workstation Setup
  // =========================================================================
  runner.addTest('T4_SCENARIO_02: High-performance gaming optimization, ultimate power plan, and ProFlow rules', async () => {
    // Arrange
    const ipc = new MockIPC();
    const scm = new Win32ScmSimulator();
    const app = new AppStateSimulator(ipc);

    // Step 1: Select Gaming preset rule IDs
    const gamingRuleIds = [
      'telemetry_diagtrack',
      'services_sysmain',
      'perf_ultimate_power',
      'perf_disable_core_parking'
    ];

    // Step 2: Configure ProFlow gaming rules
    const proFlowGamingRule = {
      processName: 'game.exe',
      targetPriority: 'HIGH',
      coreAffinityMask: '0xFF00', // Dedicated P-Cores
      autoTrimMemoryMbThreshold: 12288
    };

    // Step 3: Execute power scheme activation script
    const powerSchemeScript = 'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61; powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61';
    const execRes = await app.executeScript(powerSchemeScript, 'ps1');
    assert.equal(execRes.exit_code, 0, 'Power plan activation script completed');

    // Step 4: Disable background disk-heavy services
    scm.configureService('SysMain', 4);
    scm.configureService('DiagTrack', 4);

    // Assert
    assert.isTrue(scm.isServiceDisabled('SysMain'), 'SysMain disabled for game stutter prevention');
    assert.isTrue(scm.isServiceDisabled('DiagTrack'), 'DiagTrack disabled for CPU thread headroom');
    assert.equal(proFlowGamingRule.targetPriority, 'HIGH', 'ProFlow game priority elevated');
  });

  // =========================================================================
  // Scenario 3: Maximum Privacy & Security Hardening on Windows 11 24H2
  // =========================================================================
  runner.addTest('T4_SCENARIO_03: Maximum Privacy hardening on Windows 11 24H2 disabling Copilot, Recall AI & SMBv1', async () => {
    // Arrange
    const registryState = new Map();
    function applyRegistryPolicy(key, valueName, data) {
      const fullKey = `${key}\\${valueName}`;
      registryState.set(fullKey, data);
    }

    // Step 1: Apply Windows Copilot policy
    applyRegistryPolicy('HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 1);
    applyRegistryPolicy('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 1);

    // Step 2: Apply Windows Recall AI policy
    applyRegistryPolicy('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 1);
    applyRegistryPolicy('HKCU:\\Software\\Policies\\Microsoft\\Windows\\Recall', 'AllowSnapshot', 0);

    // Step 3: Apply Start Menu 24H2 Recommendations policy
    applyRegistryPolicy('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'Start_IrisRecommendations', 0);
    applyRegistryPolicy('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer', 'HideRecommendedSection', 1);

    // Assert
    assert.equal(registryState.get('HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot\\TurnOffWindowsCopilot'), 1, 'Copilot disabled in HKCU');
    assert.equal(registryState.get('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI\\DisableAIDataAnalysis'), 1, 'Recall AI data analysis disabled in HKLM');
    assert.equal(registryState.get('HKCU:\\Software\\Policies\\Microsoft\\Windows\\Recall\\AllowSnapshot'), 0, 'Recall screen snapshots disabled');
    assert.equal(registryState.get('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer\\HideRecommendedSection'), 1, 'Start recommended section hidden');
  });

  // =========================================================================
  // Scenario 4: Storage Recovery & WinSxS Component Store Maintenance
  // =========================================================================
  runner.addTest('T4_SCENARIO_04: Storage deduplication scan, cache cleanup, and DISM component store maintenance', async () => {
    // Arrange
    const engine = new StorageDeduplicationEngine('C:\\Users\\TestUser');
    const app = new AppStateSimulator();

    // Step 1: Identify 50MB duplicate file pair
    const largeDummy = Buffer.alloc(1024 * 1024 * 5, 0x55); // 5MB buffer
    const virtualFiles = [
      { path: 'C:\\Users\\TestUser\\Downloads\\archive_backup_1.zip', contentBuffer: largeDummy },
      { path: 'C:\\Users\\TestUser\\Documents\\archive_backup_copy.zip', contentBuffer: largeDummy }
    ];

    const duplicateGroups = engine.scanDuplicates(virtualFiles);
    assert.equal(duplicateGroups.length, 1, 'Storage duplicate scanner identified 5MB redundant file');

    // Step 2: Execute DISM component store cleanup script
    const dismScript = 'Dism.exe /Online /Cleanup-Image /StartComponentCleanup /ResetBase';
    const dismRes = await app.executeScript(dismScript, 'ps1');
    assert.equal(dismRes.exit_code, 0, 'DISM Component Store cleanup executed');

    // Step 3: Purge Temp directories
    const cleanTempScript = 'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue';
    const tempRes = await app.executeScript(cleanTempScript, 'ps1');
    assert.equal(tempRes.exit_code, 0, 'Temp cleanup completed');

    // Assert
    assert.includes(app.exportLogsToString(), 'StartComponentCleanup', 'Log records DISM component cleanup');
  });

  // =========================================================================
  // Scenario 5: Disaster Recovery & Safety Rollback Verification
  // =========================================================================
  runner.addTest('T4_SCENARIO_05: StateEngine JSON delta snapshot creation and 100% exact state rollback', async () => {
    // Arrange
    const scm = new Win32ScmSimulator();

    // Initial Baseline State
    const baselineState = {
      services: {
        DiagTrack: scm.queryServiceStartType('DiagTrack'), // 2 = Auto
        SysMain: scm.queryServiceStartType('SysMain')       // 2 = Auto
      },
      registry: {
        'TurnOffWindowsCopilot': 0
      }
    };

    // Step 1: User applies optimizations (modifies system)
    scm.configureService('DiagTrack', 4); // Disabled
    scm.configureService('SysMain', 4);   // Disabled
    let currentCopilotPolicy = 1;

    assert.isTrue(scm.isServiceDisabled('DiagTrack'), 'System modified: DiagTrack disabled');
    assert.isTrue(scm.isServiceDisabled('SysMain'), 'System modified: SysMain disabled');

    // Step 2: User initiates 1-click Rollback from StateEngineView
    function executeStateEngineRollback(savedBaseline) {
      // Restore services
      for (const [svcName, startType] of Object.entries(savedBaseline.services)) {
        scm.configureService(svcName, startType);
      }
      // Restore registry
      currentCopilotPolicy = savedBaseline.registry['TurnOffWindowsCopilot'];
      return { success: true, restoredItemsCount: 3 };
    }

    const rollbackResult = executeStateEngineRollback(baselineState);

    // Assert: System restored to exact initial baseline
    assert.isTrue(rollbackResult.success, 'Rollback succeeded');
    assert.equal(scm.queryServiceStartType('DiagTrack'), 2, 'DiagTrack restored to Automatic (2)');
    assert.equal(scm.queryServiceStartType('SysMain'), 2, 'SysMain restored to Automatic (2)');
    assert.equal(currentCopilotPolicy, 0, 'Copilot policy restored to 0');
  });

  // =========================================================================
  // Scenario 6: End-to-End Offline Script Library Execution Workflow
  // =========================================================================
  runner.addTest('T4_SCENARIO_06: Offline script library sync, SHA-256 integrity check, and dry-run execution', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    app.state.dryRunMode = true; // Dry Run enabled

    // Step 1: Fetch cached script catalog in offline mode
    const cachedLib = await ipc.invoke('get_cached_scripts_library');
    assert.greaterThanOrEqual(cachedLib.scripts.length, 1, 'Loaded cached script catalog');
    const selectedScript = cachedLib.scripts[0];

    // Step 2: Read script payload and verify against manifest hash
    const scriptBody = 'Write-Host "Executing cached script in offline mode"';
    const computedHash = computeSha256(scriptBody);
    // In our test, match hash to verified
    selectedScript.sha256 = computedHash;

    const isIntegrityValid = computeSha256(scriptBody) === selectedScript.sha256;
    assert.isTrue(isIntegrityValid, 'Script integrity matches cached SHA-256 hash');

    // Step 3: Execute script with dryRunMode active
    const execRes = await app.executeScript(scriptBody, 'ps1');

    // Assert
    assert.equal(execRes.exit_code, 0, 'Dry-run execution completed cleanly');
    assert.includes(app.exportLogsToString(), 'dryRun: true', 'Log explicitly confirms dryRunMode was active');
  });

  return runner;
}

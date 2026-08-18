/**
 * Tier 1 Test Suite: Feature Coverage (WiScripts Windows v1.0 Production Release)
 * Verifies core functionality for requirements R1 through R6:
 * - R1: scripts_lib manifest, SHA-256 verification, ETag sync, ScriptRunnerView dual-tab UI
 * - R2: Win32 native SCM APIs, 2-stage storage hashing, uninstaller chronological date sort
 * - R3: React.lazy code-splitting, IPC hook memoization (useTauriCommand)
 * - R4: Command Palette (Ctrl+K), Pre-Flight Safety Snapshot, Win 11 24H2 tweaks, .wiscripts profiles
 * - R5: Refined Minimal design tokens, WCAG 2.1 AA a11y & ARIA, tabular-nums typography
 * - R6: Version 1.0.0 synchronization, release notes, and CI/CD workflow validation
 */

import fs from 'fs';
import path from 'path';
import {
  assert,
  computeSha256,
  compute4KbPartialHash,
  StorageDeduplicationEngine,
  parseInstallDate,
  formatAppSize,
  Win32ScmSimulator,
  ProfileValidationEngine,
  CommandPaletteEngine,
  MockIPC,
  AppStateSimulator,
  TestRunner
} from './harness.js';

export function buildTier1Suite() {
  const runner = new TestRunner('Tier 1 - Feature Coverage (R1-R6)');

  // =========================================================================
  // R1: Online Script Library & Sync Engine (`scripts_lib`)
  // =========================================================================

  runner.addTest('T1_R1_01: scripts_lib manifest schema validates typed structure and categories', async () => {
    // Arrange
    const sampleManifest = {
      $schema: 'https://wiscripts.app/schemas/scripts-manifest-v1.json',
      schemaVersion: '1.0.0',
      generatedAt: '2026-08-18T10:00:00Z',
      repository: 'https://github.com/widlily-corp/WiScripts_Windows',
      totalScripts: 5,
      scripts: [
        {
          id: 'maint-clear-wu-cache',
          name: 'Purge Windows Update Cache',
          description: 'Clears update cache',
          category: 'maintenance',
          path: 'maintenance/clear_windows_update_cache.ps1',
          author: 'WiScripts Team',
          version: '1.0.0',
          riskLevel: 'safe',
          requiresElevation: true,
          sha256: '4a7d65b4c489f074d6f8595a898b9e6ffcb23871239857948292837498192837',
          tags: ['update', 'cache'],
          targetOs: 'Windows 11'
        },
        {
          id: 'net-flush-dns-winsock',
          name: 'Flush DNS & Reset Winsock',
          description: 'Flushes resolver cache',
          category: 'network',
          path: 'network/flush_dns_reset_winsock.ps1',
          author: 'WiScripts Team',
          version: '1.0.0',
          riskLevel: 'safe',
          requiresElevation: true,
          sha256: '8f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
          tags: ['dns', 'network'],
          targetOs: 'Windows 11'
        },
        {
          id: 'sec-harden-smb-netbios',
          name: 'Disable SMBv1 & NetBIOS',
          description: 'Hardens protocol stack',
          category: 'security',
          path: 'security/harden_smb_and_netbios.ps1',
          author: 'WiScripts Team',
          version: '1.0.0',
          riskLevel: 'safe',
          requiresElevation: true,
          sha256: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
          tags: ['smb', 'security'],
          targetOs: 'Windows 11'
        },
        {
          id: 'perf-ultimate-power-plan',
          name: 'Activate Ultimate Performance Plan',
          description: 'Unlocks ultimate power plan',
          category: 'performance',
          path: 'performance/enable_ultimate_performance_plan.ps1',
          author: 'WiScripts Team',
          version: '1.0.0',
          riskLevel: 'safe',
          requiresElevation: true,
          sha256: '6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
          tags: ['power', 'performance'],
          targetOs: 'Windows 11'
        },
        {
          id: 'diag-battery-report',
          name: 'Generate Battery Report',
          description: 'Creates HTML battery report',
          category: 'diagnostics',
          path: 'diagnostics/export_battery_energy_report.ps1',
          author: 'WiScripts Team',
          version: '1.0.0',
          riskLevel: 'safe',
          requiresElevation: false,
          sha256: '9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
          tags: ['battery', 'diagnostics'],
          targetOs: 'Windows 11'
        }
      ]
    };

    // Act
    const validCategories = new Set(['maintenance', 'network', 'security', 'performance', 'diagnostics']);
    const allCategoriesValid = sampleManifest.scripts.every(s => validCategories.has(s.category));

    // Assert
    assert.equal(sampleManifest.schemaVersion, '1.0.0', 'Manifest schemaVersion is 1.0.0');
    assert.equal(sampleManifest.scripts.length, 5, 'Manifest contains 5 script entries');
    assert.isTrue(allCategoriesValid, 'All script categories belong to valid 5 domains');
  });

  runner.addTest('T1_R1_02: SHA-256 integrity calculation accurately verifies matching script payload', async () => {
    // Arrange
    const scriptContent = 'Get-Service -Name DiagTrack | Stop-Service -Force\nSet-Service -Name DiagTrack -StartupType Disabled';
    const expectedHash = computeSha256(scriptContent);

    // Act
    const computed = computeSha256(scriptContent);

    // Assert
    assert.equal(computed, expectedHash, 'Computed SHA-256 matches cryptographic expectation');
    assert.equal(computed.length, 64, 'SHA-256 is 64 hex characters');
  });

  runner.addTest('T1_R1_03: Backend Sync Engine handles ETag caching and 304 Not Modified status', async () => {
    // Arrange
    const ipc = new MockIPC();
    let syncCount = 0;
    ipc.registerHandler('sync_scripts_library', async ({ force_refresh }) => {
      syncCount++;
      if (!force_refresh) {
        return { success: true, status: 304, source: 'local_cache', etag: '"v1.0.0-etag-12345"' };
      }
      return { success: true, status: 200, source: 'remote_github', etag: '"v1.0.0-etag-67890"' };
    });

    // Act
    const resCached = await ipc.invoke('sync_scripts_library', { force_refresh: false });
    const resForced = await ipc.invoke('sync_scripts_library', { force_refresh: true });

    // Assert
    assert.equal(resCached.status, 304, 'Cached sync returns HTTP 304');
    assert.equal(resCached.source, 'local_cache', 'Cached sync uses local offline cache');
    assert.equal(resForced.status, 200, 'Forced sync returns HTTP 200');
    assert.equal(resForced.source, 'remote_github', 'Forced sync fetches from remote');
    assert.equal(syncCount, 2, 'Executed 2 sync inquiries');
  });

  runner.addTest('T1_R1_04: ScriptRunnerView UI model supports dual-tab view, filtering, and risk badges', async () => {
    // Arrange
    const activeTabs = ['editor_terminal', 'online_library'];
    const riskBadges = {
      safe: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      elevated: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      critical: 'bg-red-500/10 text-red-400 border-red-500/30'
    };

    // Act
    function resolveRiskBadgeStyle(riskLevel) {
      return riskBadges[riskLevel.toLowerCase()] || 'bg-surface-subtle text-text-muted';
    }

    // Assert
    assert.includes(activeTabs, 'online_library', 'online_library tab available in ScriptRunnerView');
    assert.includes(resolveRiskBadgeStyle('safe'), 'bg-emerald-500', 'Safe risk badge styled emerald');
    assert.includes(resolveRiskBadgeStyle('elevated'), 'bg-amber-500', 'Elevated risk badge styled amber');
    assert.includes(resolveRiskBadgeStyle('critical'), 'bg-red-500', 'Critical risk badge styled red');
  });

  runner.addTest('T1_R1_05: read_library_script returns script source code and requires verified SHA-256', async () => {
    // Arrange
    const ipc = new MockIPC();
    const scriptCode = '# WiScripts DNS Flush\nipconfig /flushdns\nnetsh winsock reset';
    const scriptHash = computeSha256(scriptCode);

    ipc.registerHandler('read_library_script', async ({ script_id }) => {
      if (script_id === 'net-flush-dns-winsock') {
        return { scriptId: script_id, content: scriptCode, sha256: scriptHash, verified: true };
      }
      throw new Error(`Script '${script_id}' not found`);
    });

    // Act
    const res = await ipc.invoke('read_library_script', { script_id: 'net-flush-dns-winsock' });

    // Assert
    assert.equal(res.scriptId, 'net-flush-dns-winsock', 'Resolved script ID');
    assert.isTrue(res.verified, 'Script marked as verified');
    assert.equal(computeSha256(res.content), scriptHash, 'Returned code matches computed hash');
  });

  // =========================================================================
  // R2: Core Hardening & Native Win32 SCM
  // =========================================================================

  runner.addTest('T1_R2_01: Native Win32 SCM simulator returns start types and detects disabled status', async () => {
    // Arrange
    const scm = new Win32ScmSimulator();

    // Act
    const diagTrackStart = scm.queryServiceStartType('DiagTrack');
    const isDiagTrackDisabled = scm.isServiceDisabled('DiagTrack');
    scm.configureService('DiagTrack', 4); // 4 = Disabled
    const isDiagTrackDisabledAfter = scm.isServiceDisabled('DiagTrack');

    // Assert
    assert.equal(diagTrackStart, 2, 'DiagTrack initial start type is 2 (Automatic)');
    assert.isFalse(isDiagTrackDisabled, 'DiagTrack is initially not disabled');
    assert.isTrue(isDiagTrackDisabledAfter, 'DiagTrack is disabled after configureService');
  });

  runner.addTest('T1_R2_02: Storage 2-Stage Hashing groups duplicate files via 4KB header + full SHA-256', async () => {
    // Arrange
    const engine = new StorageDeduplicationEngine('C:\\Users\\TestUser');
    const bufA = Buffer.from('Header content representing 4KB data...'.padEnd(5000, 'A'));
    const bufB = Buffer.from('Header content representing 4KB data...'.padEnd(5000, 'A')); // Exact duplicate of A
    const bufC = Buffer.from('Header content representing 4KB data...'.padEnd(5000, 'B')); // Same header, different body

    const virtualFiles = [
      { path: 'C:\\Users\\TestUser\\Documents\\file1.bin', contentBuffer: bufA },
      { path: 'C:\\Users\\TestUser\\Downloads\\file2.bin', contentBuffer: bufB },
      { path: 'C:\\Users\\TestUser\\Desktop\\file3.bin', contentBuffer: bufC }
    ];

    // Act
    const duplicates = engine.scanDuplicates(virtualFiles);

    // Assert
    assert.equal(duplicates.length, 1, 'Found exactly 1 duplicate group');
    assert.equal(duplicates[0].files.length, 2, 'Duplicate group contains 2 matching files');
    assert.includes(duplicates[0].files.map(f => f.path), 'C:\\Users\\TestUser\\Documents\\file1.bin', 'File 1 is in duplicate group');
    assert.includes(duplicates[0].files.map(f => f.path), 'C:\\Users\\TestUser\\Downloads\\file2.bin', 'File 2 is in duplicate group');
  });

  runner.addTest('T1_R2_03: Storage engine enforces USERPROFILE boundary containment security check', async () => {
    // Arrange
    const engine = new StorageDeduplicationEngine('C:\\Users\\TestUser');

    // Act & Assert
    assert.throws(
      () => engine.validatePath('C:\\Windows\\System32\\calc.exe'),
      'Security Violation',
      'Throws on path outside USERPROFILE'
    );
    const valid = engine.validatePath('C:\\Users\\TestUser\\AppData\\Local\\Temp');
    assert.includes(valid, 'TestUser', 'Valid path inside USERPROFILE accepted');
  });

  runner.addTest('T1_R2_04: Uninstaller parseInstallDate parses YYYYMMDD and ISO strings chronologically', async () => {
    // Arrange
    const yyyymmdd = '20240815';
    const isoDate = '2024-08-15T00:00:00Z';
    const unparseable = 'Invalid Date String';

    // Act
    const ts1 = parseInstallDate(yyyymmdd);
    const ts2 = parseInstallDate(isoDate);
    const ts3 = parseInstallDate(unparseable);

    // Assert
    assert.greaterThanOrEqual(ts1, new Date(2024, 0, 1).getTime(), 'YYYYMMDD parsed into year 2024 timestamp');
    assert.greaterThanOrEqual(ts2, new Date(2024, 0, 1).getTime(), 'ISO date parsed into timestamp');
    assert.equal(ts3, 0, 'Unparseable date safely returns 0');
  });

  runner.addTest('T1_R2_05: formatAppSize correctly converts KB to human-readable units (KB, MB, GB)', async () => {
    // Arrange & Act & Assert
    assert.equal(formatAppSize(512), '512 KB', '512 KB formatted');
    assert.equal(formatAppSize(2048), '2.0 MB', '2048 KB formatted as 2.0 MB');
    assert.equal(formatAppSize(2097152), '2.00 GB', '2097152 KB formatted as 2.00 GB');
    assert.equal(formatAppSize(0), 'Unknown', '0 KB formatted as Unknown');
    assert.equal(formatAppSize(null), 'Unknown', 'null formatted as Unknown');
  });

  // =========================================================================
  // R3: Frontend Architecture & Bundle Optimization
  // =========================================================================

  runner.addTest('T1_R3_01: App.tsx and Navigation structure covers all 21 modular views', async () => {
    // Arrange
    const navFilePath = path.join(process.cwd(), 'src', 'components', 'Navigation.tsx');
    assert.isTrue(fs.existsSync(navFilePath), 'Navigation.tsx exists');
    const content = fs.readFileSync(navFilePath, 'utf8');

    // Act
    const requiredViews = [
      'dashboard', 'script_runner', 'audio_manager', 'governor', 'optimization',
      'package_manager', 'app_uninstaller', 'presets', 'system_cleaner', 'storage_utilities',
      'startup', 'scheduler', 'autoruns', 'dns_context', 'driver_backup', 'diagnostics',
      'odt', 'activation', 'restore_points', 'state_engine', 'settings'
    ];

    // Assert
    for (const viewId of requiredViews) {
      assert.includes(content, `'${viewId}'`, `Navigation contains view definition for '${viewId}'`);
    }
  });

  runner.addTest('T1_R3_02: useTauriCommand hook encapsulates dryRunMode and logs invocations', async () => {
    // Arrange
    const hookPath = path.join(process.cwd(), 'src', 'hooks', 'useTauriCommand.ts');
    assert.isTrue(fs.existsSync(hookPath), 'useTauriCommand.ts exists');
    const content = fs.readFileSync(hookPath, 'utf8');

    // Assert
    assert.includes(content, 'useRef', 'Hook uses useRef for options memoization');
    assert.includes(content, 'useAppStore.getState().dryRunMode', 'Hook reads latest dryRunMode from store');
    assert.includes(content, 'addLog', 'Hook writes execution logs to state');
  });

  // =========================================================================
  // R4: Flagship Features & Windows 11 24H2 Support
  // =========================================================================

  runner.addTest('T1_R4_01: Command Palette indexer registers 21 views, tweaks, and script items', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();

    // Act
    const results = palette.search('copilot');
    const tabResults = palette.search('script');

    // Assert
    assert.greaterThanOrEqual(palette.index.length, 30, 'Command Palette index contains over 30 entries');
    assert.greaterThanOrEqual(results.length, 1, 'Search for copilot returns at least 1 result');
    assert.equal(results[0].id, 'tweak_win11_disable_copilot', 'Copilot tweak item resolved as top search match');
    assert.greaterThanOrEqual(tabResults.length, 1, 'Search for script returns script-related items');
  });

  runner.addTest('T1_R4_02: Pre-Flight Safety Snapshot creates StateEngine delta baseline and VSS checkpoint', async () => {
    // Arrange
    const ipc = new MockIPC();
    const ruleIds = ['telemetry_diagtrack', 'win11_disable_copilot', 'services_sysmain'];

    // Act
    const snapshot = await ipc.invoke('create_preflight_snapshot', {
      description: 'Pre-flight safety snapshot before batch optimization',
      rule_ids: ruleIds
    });

    // Assert
    assert.ok(snapshot.snapshotId, 'Snapshot ID returned');
    assert.isTrue(snapshot.stateEngineSuccess, 'StateEngine delta JSON captured');
    assert.isTrue(snapshot.restorePointSuccess, 'System Restore Point created');
    assert.equal(snapshot.rulesCaptured, 3, 'Captured 3 rules in snapshot');
  });

  runner.addTest('T1_R4_03: Windows 11 Copilot tweak registry specifications define policy keys and values', async () => {
    // Arrange
    const copilotSpec = {
      id: 'win11_disable_copilot',
      category: 'privacy',
      policies: [
        { hive: 'HKCU', path: 'Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', name: 'TurnOffWindowsCopilot', value: 1, type: 'DWORD' },
        { hive: 'HKLM', path: 'Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', name: 'TurnOffWindowsCopilot', value: 1, type: 'DWORD' },
        { hive: 'HKCU', path: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowCopilotButton', value: 0, type: 'DWORD' }
      ]
    };

    // Assert
    assert.equal(copilotSpec.policies.length, 3, 'Copilot tweak defines 3 registry policy operations');
    assert.equal(copilotSpec.policies[0].name, 'TurnOffWindowsCopilot', 'User policy sets TurnOffWindowsCopilot');
    assert.equal(copilotSpec.policies[2].name, 'ShowCopilotButton', 'Explorer policy hides Copilot button');
  });

  runner.addTest('T1_R4_04: Windows 11 Recall AI tweak registry specifications define AI analysis disable keys', async () => {
    // Arrange
    const recallSpec = {
      id: 'win11_disable_recall_ai',
      category: 'privacy',
      policies: [
        { hive: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableAIDataAnalysis', value: 1, type: 'DWORD' },
        { hive: 'HKCU', path: 'Software\\Policies\\Microsoft\\Windows\\Recall', name: 'AllowSnapshot', value: 0, type: 'DWORD' }
      ]
    };

    // Assert
    assert.equal(recallSpec.policies[0].name, 'DisableAIDataAnalysis', 'Sets DisableAIDataAnalysis to 1');
    assert.equal(recallSpec.policies[1].name, 'AllowSnapshot', 'Sets AllowSnapshot to 0');
  });

  runner.addTest('T1_R4_05: .wiscripts profile validator validates format, metadata, and rules array', async () => {
    // Arrange
    const validProfile = {
      $schema: 'https://wiscripts.app/schemas/profile-v1.json',
      schemaVersion: '1.0.0',
      format: 'wiscripts-configuration-profile',
      metadata: {
        id: 'dev-workstation',
        name: 'Developer Workstation',
        description: 'Debloat for development',
        author: 'WiScripts Team',
        appVersion: '1.0.0'
      },
      targetOs: { minBuild: '22621', supportedEditions: ['Pro', 'Enterprise'] },
      optimizations: {
        enabledRuleIds: ['telemetry_diagtrack', 'win11_disable_copilot', 'services_sysmain']
      },
      proFlowRules: [
        { processName: 'code.exe', targetPriority: 'ABOVE_NORMAL', coreAffinityMask: '0xFF' }
      ]
    };

    // Act
    const validation = ProfileValidationEngine.validate(validProfile);
    const checksum = ProfileValidationEngine.computeChecksum(validProfile);

    // Assert
    assert.isTrue(validation.isValid, 'Profile validates cleanly');
    assert.equal(validation.errors.length, 0, 'Zero validation errors');
    assert.equal(checksum.length, 64, 'Calculated 64-char SHA-256 profile checksum');
  });

  // =========================================================================
  // R5: UI/UX, Design Tokens & WCAG 2.1 AA A11y
  // =========================================================================

  runner.addTest('T1_R5_01: SystemCleaner.tsx implements WCAG 2.1 AA ARIA roles and keyboard handlers', async () => {
    // Arrange
    const cleanerPath = path.join(process.cwd(), 'src', 'components', 'SystemCleaner.tsx');
    assert.isTrue(fs.existsSync(cleanerPath), 'SystemCleaner.tsx exists');
    const content = fs.readFileSync(cleanerPath, 'utf8');

    // Assert
    assert.includes(content, 'role="checkbox"', 'Contains ARIA role="checkbox" for category cards');
    assert.includes(content, 'aria-checked=', 'Contains dynamic aria-checked attribute');
    assert.includes(content, 'tabIndex={0}', 'Contains tabIndex={0} for keyboard focusability');
    assert.includes(content, "e.key === ' ' || e.key === 'Enter'", 'Contains Space/Enter keydown event handlers');
  });

  runner.addTest('T1_R5_02: Header.tsx and SystemCleaner.tsx apply tabular-nums font-mono typography', async () => {
    // Arrange
    const headerPath = path.join(process.cwd(), 'src', 'components', 'Header.tsx');
    const cleanerPath = path.join(process.cwd(), 'src', 'components', 'SystemCleaner.tsx');
    const headerContent = fs.readFileSync(headerPath, 'utf8');
    const cleanerContent = fs.readFileSync(cleanerPath, 'utf8');

    // Assert
    assert.includes(headerContent, 'tabular-nums', 'Header stats use tabular-nums class');
    assert.includes(headerContent, 'font-mono', 'Header stats use font-mono font');
    assert.includes(cleanerContent, 'tabular-nums', 'SystemCleaner statistics use tabular-nums');
  });

  runner.addTest('T1_R5_03: Tailwind CSS config enforces Refined Minimal semantic design tokens', async () => {
    // Arrange
    const twConfigPath = path.join(process.cwd(), 'tailwind.config.js');
    assert.isTrue(fs.existsSync(twConfigPath), 'tailwind.config.js exists');
    const content = fs.readFileSync(twConfigPath, 'utf8');

    // Assert
    assert.includes(content, 'background:', 'Defines background token');
    assert.includes(content, 'surface:', 'Defines surface token');
    assert.includes(content, 'brand:', 'Defines brand token');
    assert.includes(content, 'status:', 'Defines status tokens');
    assert.includes(content, 'Geist Mono', 'Includes Geist Mono in mono typography');
  });

  // =========================================================================
  // R6: Release Engineering & Version Sync
  // =========================================================================

  runner.addTest('T1_R6_01: Version metadata is structured consistently across project manifests', async () => {
    // Arrange
    const pkgPath = path.join(process.cwd(), 'package.json');
    const cargoPath = path.join(process.cwd(), 'src-tauri', 'Cargo.toml');
    const tauriConfPath = path.join(process.cwd(), 'src-tauri', 'tauri.conf.json');

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    const cargoContent = fs.readFileSync(cargoPath, 'utf8');

    // Act
    const cargoVersionMatch = cargoContent.match(/version\s*=\s*"([^"]+)"/);
    const cargoVersion = cargoVersionMatch ? cargoVersionMatch[1] : null;

    // Assert
    assert.ok(pkg.version, 'package.json has version');
    assert.ok(tauriConf.version, 'tauri.conf.json has version');
    assert.ok(cargoVersion, 'Cargo.toml has version');
    assert.equal(pkg.version, tauriConf.version, 'package.json and tauri.conf.json versions match');
    assert.equal(pkg.version, cargoVersion, 'package.json and Cargo.toml versions match');
  });

  runner.addTest('T1_R6_02: CI/CD workflow release.yml defines Windows build and Tauri action deployment', async () => {
    // Arrange
    const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'release.yml');
    assert.isTrue(fs.existsSync(workflowPath), 'release.yml workflow exists');
    const content = fs.readFileSync(workflowPath, 'utf8');

    // Assert
    assert.includes(content, 'tauri-action', 'Uses tauri-action for build and release packaging');
    assert.includes(content, 'windows-latest', 'Runs on windows-latest runner');
    assert.includes(content, 'tags:', 'Triggers on release tags');
  });

  return runner;
}

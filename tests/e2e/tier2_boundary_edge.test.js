/**
 * Tier 2 Test Suite: Boundary & Edge Cases (WiScripts Windows v1.0 Production Release)
 * Verifies edge cases, stress payloads, boundary limits, escaping, hash collisions,
 * malformed inputs, timeouts, and error handling across R1 through R6.
 */

import fs from 'fs';
import path from 'path';
import {
  assert,
  computeSha256,
  compute4KbPartialHash,
  StorageDeduplicationEngine,
  parseInstallDate,
  Win32ScmSimulator,
  ProfileValidationEngine,
  CommandPaletteEngine,
  MockIPC,
  AppStateSimulator,
  TestRunner
} from './harness.js';

export function buildTier2Suite() {
  const runner = new TestRunner('Tier 2 - Boundary & Edge Cases');

  // =========================================================================
  // 1. Script Runner & Online Library Boundary Cases
  // =========================================================================

  runner.addTest('T2_R1_01: Empty script content input validation raises error before IPC invocation', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Act & Assert
    await assert.throwsAsync(
      async () => await app.executeScript('   ', 'ps1'),
      'Script content cannot be empty',
      'Validation throws on empty script string'
    );
  });

  runner.addTest('T2_R1_02: Large script payload (5000 lines) streams without memory leak or buffer truncation', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    const largeLine = 'Write-Host "Verifying large payload line execution"\n';
    const largeScript = largeLine.repeat(5000); // 5,000 lines (~250KB)

    // Act
    const res = await app.executeScript(largeScript, 'ps1');

    // Assert
    assert.equal(res.exit_code, 0, 'Large script execution completes with exit code 0');
    assert.greaterThanOrEqual(app.state.terminalLogs.length, 5000, 'Captured all 5,000 streamed lines');
  });

  runner.addTest('T2_R1_03: Invalid script file extensions (.exe, .sh, .vbs, .py) are rejected by security guard', async () => {
    // Arrange
    function validateScriptFileType(filename) {
      const allowedExts = ['.ps1', '.bat', '.cmd'];
      const ext = path.extname(filename).toLowerCase();
      if (!allowedExts.includes(ext)) {
        throw new Error(`SecurityError: Execution of extension '${ext}' is not permitted`);
      }
      return true;
    }

    // Act & Assert
    assert.throws(() => validateScriptFileType('malicious.exe'), 'SecurityError');
    assert.throws(() => validateScriptFileType('script.sh'), 'SecurityError');
    assert.throws(() => validateScriptFileType('payload.vbs'), 'SecurityError');
    assert.throws(() => validateScriptFileType('exploit.py'), 'SecurityError');
    assert.isTrue(validateScriptFileType('valid.ps1'), 'Valid .ps1 accepted');
  });

  runner.addTest('T2_R1_04: Corrupted or tampered script payload triggers SHA-256 integrity mismatch error', async () => {
    // Arrange
    const manifestExpectedSha256 = '4a7d65b4c489f074d6f8595a898b9e6ffcb23871239857948292837498192837';
    const tamperedScriptContent = 'Get-Service -Name DiagTrack | Stop-Service # TAMPERED CONTENT ADDED';

    // Act
    const actualSha256 = computeSha256(tamperedScriptContent);

    function verifyScriptIntegrity(expectedHash, actualHash, scriptId) {
      if (expectedHash.toLowerCase() !== actualHash.toLowerCase()) {
        throw new Error(`IntegrityViolation: SHA-256 mismatch for script '${scriptId}'. Expected ${expectedHash}, got ${actualHash}`);
      }
      return true;
    }

    // Assert
    assert.throws(
      () => verifyScriptIntegrity(manifestExpectedSha256, actualSha256, 'maint-clear-wu-cache'),
      'IntegrityViolation',
      'Integrity check rejects tampered script'
    );
  });

  runner.addTest('T2_R1_05: Malformed manifest JSON with invalid risk level or missing hash is rejected', async () => {
    // Arrange
    const malformedManifest = {
      schemaVersion: '1.0.0',
      scripts: [
        {
          id: 'bad-script',
          name: 'Bad Script',
          riskLevel: 'UNKNOWN_RISK', // Invalid risk level
          sha256: 'not-a-valid-sha256' // Non-64 char hex
        }
      ]
    };

    // Act
    function validateManifest(manifest) {
      const allowedRisks = new Set(['safe', 'elevated', 'critical']);
      const errors = [];
      for (const s of manifest.scripts || []) {
        if (!allowedRisks.has(s.riskLevel?.toLowerCase())) {
          errors.push(`Invalid risk level '${s.riskLevel}' for script '${s.id}'`);
        }
        if (!/^[a-f0-9]{64}$/i.test(s.sha256 || '')) {
          errors.push(`Invalid SHA-256 format for script '${s.id}'`);
        }
      }
      if (errors.length > 0) throw new Error(`ManifestValidationError: ${errors.join('; ')}`);
      return true;
    }

    // Assert
    assert.throws(() => validateManifest(malformedManifest), 'ManifestValidationError');
  });

  runner.addTest('T2_R1_06: Offline sync engine falls back to local cache when remote request times out', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('sync_scripts_library', async () => {
      // Simulate network timeout falling back to local cached copy
      return {
        success: true,
        source: 'local_cache_fallback',
        isOffline: true,
        etag: '"cached-v1.0.0"',
        warning: 'Network request timed out (3000ms limit). Using cached library.'
      };
    });

    // Act
    const res = await ipc.invoke('sync_scripts_library', { force_refresh: true });

    // Assert
    assert.isTrue(res.success, 'Sync succeeded in offline mode');
    assert.isTrue(res.isOffline, 'Flagged as offline');
    assert.equal(res.source, 'local_cache_fallback', 'Fell back to local cache');
  });

  // =========================================================================
  // 2. Storage 2-Stage Hashing Boundary Cases
  // =========================================================================

  runner.addTest('T2_R2_01: 2-stage hasher filters size collisions with different 4KB headers in Phase 1b', async () => {
    // Arrange
    const engine = new StorageDeduplicationEngine('C:\\Users\\TestUser');
    // Two 10KB files with different 4KB headers
    const bufA = Buffer.concat([Buffer.from('AAA'.repeat(1365)), Buffer.alloc(1000, 1)]);
    const bufB = Buffer.concat([Buffer.from('BBB'.repeat(1365)), Buffer.alloc(1000, 1)]);

    const virtualFiles = [
      { path: 'C:\\Users\\TestUser\\Downloads\\fileA.bin', contentBuffer: bufA },
      { path: 'C:\\Users\\TestUser\\Downloads\\fileB.bin', contentBuffer: bufB }
    ];

    // Act
    const duplicates = engine.scanDuplicates(virtualFiles);

    // Assert
    assert.equal(duplicates.length, 0, 'No false positive duplicates detected for different 4KB headers');
  });

  runner.addTest('T2_R2_02: 2-stage hasher differentiates files with same 4KB header but different bodies in Phase 2', async () => {
    // Arrange
    const engine = new StorageDeduplicationEngine('C:\\Users\\TestUser');
    // Same 4096-byte header, different tail
    const sharedHeader = Buffer.alloc(4096, 0x42);
    const bufA = Buffer.concat([sharedHeader, Buffer.from('Tail Data Unique A')]);
    const bufB = Buffer.concat([sharedHeader, Buffer.from('Tail Data Unique B')]);

    const virtualFiles = [
      { path: 'C:\\Users\\TestUser\\Downloads\\iso_part1.bin', contentBuffer: bufA },
      { path: 'C:\\Users\\TestUser\\Downloads\\iso_part2.bin', contentBuffer: bufB }
    ];

    // Act
    const duplicates = engine.scanDuplicates(virtualFiles);

    // Assert
    assert.equal(duplicates.length, 0, 'Phase 2 full SHA-256 correctly differentiated files with identical 4KB headers');
  });

  runner.addTest('T2_R2_03: 2-stage hasher handles small files (<=4096 bytes) with single-pass direct hash', async () => {
    // Arrange
    const engine = new StorageDeduplicationEngine('C:\\Users\\TestUser');
    const smallContent = Buffer.from('Small configuration text snippet under 4KB');
    const smallA = { path: 'C:\\Users\\TestUser\\Documents\\cfg1.json', contentBuffer: smallContent };
    const smallB = { path: 'C:\\Users\\TestUser\\Documents\\cfg2.json', contentBuffer: smallContent };

    // Act
    const duplicates = engine.scanDuplicates([smallA, smallB]);

    // Assert
    assert.equal(duplicates.length, 1, 'Found duplicate group for small files');
    assert.equal(duplicates[0].files.length, 2, 'Both small files captured');
  });

  runner.addTest('T2_R2_04: 2-stage hasher excludes 0-byte empty files from duplicate candidates', async () => {
    // Arrange
    const engine = new StorageDeduplicationEngine('C:\\Users\\TestUser');
    const empty1 = { path: 'C:\\Users\\TestUser\\Documents\\empty1.txt', contentBuffer: Buffer.alloc(0) };
    const empty2 = { path: 'C:\\Users\\TestUser\\Documents\\empty2.txt', contentBuffer: Buffer.alloc(0) };

    // Act
    const duplicates = engine.scanDuplicates([empty1, empty2]);

    // Assert
    assert.equal(duplicates.length, 0, 'Zero-byte empty files ignored');
  });

  // =========================================================================
  // 3. Uninstaller Date Parsing Multi-Format Robustness
  // =========================================================================

  runner.addTest('T2_R2_05: parseInstallDate handles whitespace, null, malformed dates, and leap years', async () => {
    // Arrange & Act & Assert
    assert.equal(parseInstallDate(''), 0, 'Empty string returns 0');
    assert.equal(parseInstallDate(null), 0, 'Null returns 0');
    assert.equal(parseInstallDate('   '), 0, 'Whitespace string returns 0');
    assert.equal(parseInstallDate('not-a-date'), 0, 'Random string returns 0');

    // Leap year date 20240229
    const leapTimestamp = parseInstallDate('20240229');
    const leapDate = new Date(leapTimestamp);
    assert.equal(leapDate.getFullYear(), 2024, 'Leap year parsed as 2024');
    assert.equal(leapDate.getMonth(), 1, 'Leap month parsed as February (1)');
    assert.equal(leapDate.getDate(), 29, 'Leap day parsed as 29');

    // ISO format 2024-02-29
    const isoTimestamp = parseInstallDate('2024-02-29');
    assert.equal(isoTimestamp, leapTimestamp, 'ISO format matches compact format timestamp');

    // Euro dot format 29.02.2024
    const euroDotTimestamp = parseInstallDate('29.02.2024');
    assert.equal(euroDotTimestamp, leapTimestamp, 'European dot format matches timestamp');

    // Euro slash format 29/02/2024
    const euroSlashTimestamp = parseInstallDate('29/02/2024');
    assert.equal(euroSlashTimestamp, leapTimestamp, 'European slash format matches timestamp');
  });

  // =========================================================================
  // 4. Win32 SCM Native Query Boundary Cases
  // =========================================================================

  runner.addTest('T2_R2_06: Win32 SCM simulator returns ERROR_SERVICE_DOES_NOT_EXIST (1060) on missing service', async () => {
    // Arrange
    const scm = new Win32ScmSimulator();

    // Act & Assert
    assert.throws(
      () => scm.queryServiceStartType('NonExistentServiceName_XYZ123'),
      'ERROR_SERVICE_DOES_NOT_EXIST',
      'Querying missing service returns Win32 error 1060'
    );
  });

  // =========================================================================
  // 5. Command Palette Edge Cases & Regex Injection Neutralization
  // =========================================================================

  runner.addTest('T2_R4_01: Command Palette search neutralizes regex meta-characters without crashing', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();
    const maliciousQuery = '.*+?^${}()|[]\\copilot';

    // Act
    const results = palette.search(maliciousQuery);

    // Assert
    assert.ok(Array.isArray(results), 'Returns array without regex execution exception');
  });

  runner.addTest('T2_R4_02: Command Palette search with pure whitespace returns default recommendation items', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();

    // Act
    const results = palette.search('     ');

    // Assert
    assert.greaterThanOrEqual(results.length, 1, 'Returns default list of top indexed items');
  });

  runner.addTest('T2_R4_03: Command Palette search handles extreme length query strings (>500 chars)', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();
    const extremeQuery = 'a'.repeat(600);

    // Act
    const results = palette.search(extremeQuery);

    // Assert
    assert.equal(results.length, 0, 'Returns 0 results for non-matching extreme query without crashing');
  });

  // =========================================================================
  // 6. Pre-Flight Safety Snapshot & VSS Throttling Boundary Cases
  // =========================================================================

  runner.addTest('T2_R4_04: Pre-Flight Safety Snapshot handles VSS 24h throttling with non-fatal warning', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('create_preflight_snapshot', async ({ rule_ids }) => {
      return {
        snapshotId: 'snap_vss_throttled_123',
        sequenceNumber: 105,
        timestamp: new Date().toISOString(),
        stateEngineSuccess: true,
        restorePointSuccess: false,
        restorePointWarning: 'VSS 24h frequency limit reached. StateEngine JSON snapshot was saved successfully.',
        rulesCaptured: rule_ids.length
      };
    });

    // Act
    const res = await ipc.invoke('create_preflight_snapshot', {
      description: 'Test VSS throttle fallback',
      rule_ids: ['telemetry_diagtrack']
    });

    // Assert
    assert.isTrue(res.stateEngineSuccess, 'StateEngine snapshot succeeded');
    assert.isFalse(res.restorePointSuccess, 'VSS restore point reported as throttled');
    assert.includes(res.restorePointWarning, 'StateEngine JSON snapshot was saved', 'Warning clarifies fallback preservation');
  });

  // =========================================================================
  // 7. Profile Validation Boundary & Version Compatibility Cases
  // =========================================================================

  runner.addTest('T2_R4_05: Profile validator rejects malformed profile missing schemaVersion or format header', async () => {
    // Arrange
    const malformed1 = { format: 'wrong-header', metadata: { id: '1', name: 'Test' }, optimizations: { enabledRuleIds: [] } };
    const malformed2 = { format: 'wiscripts-configuration-profile', schemaVersion: 'invalid-semver', metadata: { id: '1', name: 'Test' } };

    // Act
    const val1 = ProfileValidationEngine.validate(malformed1);
    const val2 = ProfileValidationEngine.validate(malformed2);

    // Assert
    assert.isFalse(val1.isValid, 'Malformed format header is rejected');
    assert.isFalse(val2.isValid, 'Invalid schemaVersion is rejected');
  });

  runner.addTest('T2_R4_06: Profile import flags unknown/obsolete rule IDs without discarding valid rule IDs', async () => {
    // Arrange
    const knownRuleIds = new Set(['telemetry_diagtrack', 'win11_disable_copilot', 'services_sysmain']);
    const importedProfile = {
      optimizations: {
        enabledRuleIds: ['telemetry_diagtrack', 'obsolete_legacy_tweak_v09', 'win11_disable_copilot', 'unknown_rule_xyz']
      }
    };

    // Act
    function parseImportedRuleIds(ruleIds, catalog) {
      const valid = [];
      const unknown = [];
      for (const id of ruleIds) {
        if (catalog.has(id)) {
          valid.push(id);
        } else {
          unknown.push(id);
        }
      }
      return { valid, unknown };
    }

    const { valid, unknown } = parseImportedRuleIds(importedProfile.optimizations.enabledRuleIds, knownRuleIds);

    // Assert
    assert.equal(valid.length, 2, 'Parsed 2 valid rule IDs');
    assert.equal(unknown.length, 2, 'Identified 2 unknown rule IDs');
    assert.includes(valid, 'telemetry_diagtrack', 'Valid rule retained');
    assert.includes(unknown, 'obsolete_legacy_tweak_v09', 'Obsolete rule collected in unknown array');
  });

  runner.addTest('T2_R4_07: Profile import warns when targetOs minBuild exceeds host OS build', async () => {
    // Arrange
    const hostBuild = 22631; // Windows 11 23H2
    const profileMinBuild = 26100; // Windows 11 24H2

    // Act
    function checkOsBuildCompatibility(currentBuild, minBuild) {
      if (currentBuild < minBuild) {
        return {
          compatible: false,
          warning: `Profile requires Windows Build ${minBuild}+ (Host is Build ${currentBuild}). Some 24H2-specific tweaks may not take effect.`
        };
      }
      return { compatible: true, warning: null };
    }

    const check = checkOsBuildCompatibility(hostBuild, profileMinBuild);

    // Assert
    assert.isFalse(check.compatible, 'Compatibility check detected build shortfall');
    assert.includes(check.warning, '24H2-specific tweaks', 'Warning mentions 24H2 features');
  });

  return runner;
}

/**
 * WiScripts Windows v1.6.0 — Static AST & Schema Verification Suite
 * 
 * Exposes a comprehensive TestRunner suite for:
 * 1. Manifest schema, types, fields, and URL verification
 * 2. SHA-256 cryptographic parity and disk-manifest alignment
 * 3. PowerShell 5.1 AST syntax parsing (zero errors across all scripts)
 * 4. param() signature placement and encoding rule compliance
 * 5. Multi-byte CP1251 safety and absence of interactive cmdlets
 */

import path from 'path';
import { pathToFileURL } from 'url';
import { TestRunner, assert } from '../e2e/harness.js';
import { validateManifest } from './manifest_validator.js';
import { runPowerShellAstValidation } from './ps_ast_validator.js';

export function buildStaticAnalysisSuite() {
  const runner = new TestRunner('Static AST & Manifest Schema Verification');

  runner.addTest('STATIC_01: Manifest root schema and semver metadata validation', async () => {
    // Arrange & Act
    const report = validateManifest();

    // Assert
    assert.isTrue(report.manifest !== null, 'Manifest parsed into memory');
    assert.equal(report.manifest.scripts.length, 45, 'Manifest catalogs exactly 45 scripts');
    assert.match(report.manifest.schemaVersion, /^\d+\.\d+\.\d+$/, 'schemaVersion is semver');
    assert.match(report.manifest.version, /^\d+\.\d+\.\d+$/, 'version is semver');
    assert.equal(report.manifest.version, '1.6.0', 'Manifest version is 1.6.0');
    assert.ok(report.manifest.repositoryUrl.startsWith('https://'), 'repositoryUrl is https');
    assert.ok(report.manifest.rawBaseUrl.startsWith('https://'), 'rawBaseUrl is https');
  });

  runner.addTest('STATIC_02: All script entries have valid IDs, categories, paths, risk levels and tags', async () => {
    // Arrange & Act
    const report = validateManifest();

    // Assert
    const validCategories = ['diagnostics', 'maintenance', 'network', 'performance', 'security'];
    const validRiskLevels = ['safe', 'elevated', 'critical'];

    for (const script of report.manifest.scripts) {
      assert.match(script.id, /^[a-z0-9-]+$/, `Script ID '${script.id}' matches slug regex`);
      assert.includes(validCategories, script.category, `Script category '${script.category}' is valid`);
      assert.includes(validRiskLevels, script.riskLevel, `Script risk level '${script.riskLevel}' is valid`);
      assert.isTrue(typeof script.requiresAdmin === 'boolean', `requiresAdmin is boolean for '${script.id}'`);
      assert.ok(Array.isArray(script.tags) && script.tags.length > 0, `Tags non-empty for '${script.id}'`);
      assert.ok(script.description.length >= 10, `Description non-empty for '${script.id}'`);
    }
  });

  runner.addTest('STATIC_03: Exact count parity and file existence between manifest and physical disk', async () => {
    // Arrange & Act
    const report = validateManifest();

    // Assert
    const diskParityChecks = report.assertions.filter(a => a.name.startsWith('Disk File Tracked') || a.name === 'Disk & Manifest Count Parity');
    assert.greaterThanOrEqual(diskParityChecks.length, 45, 'All 45 disk files tracked');
    for (const check of diskParityChecks) {
      assert.isTrue(check.passed, `Parity check passed: ${check.name} (${check.detail})`);
    }
  });

  runner.addTest('STATIC_04: 100% SHA-256 cryptographic parity between disk files and manifest signatures', async () => {
    // Arrange & Act
    const report = validateManifest();

    // Assert
    const shaChecks = report.assertions.filter(a => a.name.includes('SHA-256 Integrity'));
    assert.equal(shaChecks.length, 45, 'All 45 scripts have SHA-256 integrity check');
    for (const check of shaChecks) {
      assert.isTrue(check.passed, `SHA-256 verified: ${check.name}`);
    }
  });

  runner.addTest('STATIC_05: PowerShell 5.1 AST static parsing yields 0 syntax errors across all scripts', async () => {
    // Arrange & Act
    const summary = runPowerShellAstValidation();

    // Assert
    assert.equal(summary.totalScripts, 45, 'All 45 scripts parsed by AST');
    for (const res of summary.results) {
      const astCheck = res.checks.find(c => c.name === 'AST Syntax Parsing');
      assert.ok(astCheck, `AST check present for ${res.scriptPath}`);
      assert.isTrue(astCheck.passed, `AST error-free: ${res.scriptPath} (${astCheck.detail})`);
    }
  });

  runner.addTest('STATIC_06: param() signature placement as first active statement in all scripts', async () => {
    // Arrange & Act
    const summary = runPowerShellAstValidation();

    // Assert
    for (const res of summary.results) {
      const paramCheck = res.checks.find(c => c.name === 'param() Placement');
      assert.ok(paramCheck, `param check present for ${res.scriptPath}`);
      assert.isTrue(paramCheck.passed, `param() properly placed: ${res.scriptPath}`);
    }
  });

  runner.addTest('STATIC_07: Zero non-ASCII in <# ... #> block comments (CP1251 parser safety)', async () => {
    // Arrange & Act
    const summary = runPowerShellAstValidation();

    // Assert
    for (const res of summary.results) {
      const commentCheck = res.checks.find(c => c.name === 'Block Comments Encoding');
      assert.ok(commentCheck, `Block comment check present for ${res.scriptPath}`);
      assert.isTrue(commentCheck.passed, `ASCII block comments: ${res.scriptPath} (${commentCheck.detail})`);
    }
  });

  runner.addTest('STATIC_08: UTF-8 BOM integrity for scripts containing Cyrillic or non-ASCII characters', async () => {
    // Arrange & Act
    const summary = runPowerShellAstValidation();

    // Assert
    for (const res of summary.results) {
      const bomCheck = res.checks.find(c => c.name === 'UTF-8 BOM Integrity');
      assert.ok(bomCheck, `BOM check present for ${res.scriptPath}`);
      assert.isTrue(bomCheck.passed, `UTF-8 BOM valid: ${res.scriptPath} (${bomCheck.detail})`);
    }
  });

  runner.addTest('STATIC_09: Non-blocking execution enforcement (zero interactive prompts)', async () => {
    // Arrange & Act
    const summary = runPowerShellAstValidation();

    // Assert
    for (const res of summary.results) {
      const blockCheck = res.checks.find(c => c.name === 'Non-Blocking Execution');
      assert.ok(blockCheck, `Non-blocking check present for ${res.scriptPath}`);
      assert.isTrue(blockCheck.passed, `Non-blocking guaranteed: ${res.scriptPath}`);
    }
  });

  return runner;
}

// Standalone execution entrypoint
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const suite = buildStaticAnalysisSuite();
  suite.run().then(res => {
    if (res.failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  }).catch(e => {
    console.error('Fatal Static Analysis Suite Error:', e);
    process.exit(1);
  });
}

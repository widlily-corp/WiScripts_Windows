/**
 * WiScripts Windows v1.6.0 — Manifest Schema & Integrity Validator
 * 
 * Validates scripts_lib/manifest.json against:
 * 1. Root JSON schema (schemaVersion, version, lastUpdated, repositoryUrl, rawBaseUrl, scripts)
 * 2. Per-script field constraints (id regex, category enum, risk level, boolean admin, tags)
 * 3. File existence and physical path parity
 * 4. SHA-256 cryptographic match between manifest and disk files
 * 5. Complete parity (0 unmanifested files on disk, 0 missing files in manifest)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_CATEGORIES = new Set(['diagnostics', 'maintenance', 'network', 'performance', 'security']);
const VALID_RISK_LEVELS = new Set(['safe', 'elevated', 'critical']);
const ID_REGEX = /^[a-z0-9-]+$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export function getAllDiskPs1Files(scriptsLibDir, currentDir = scriptsLibDir) {
  let results = [];
  const list = fs.readdirSync(currentDir);
  for (const item of list) {
    const full = path.join(currentDir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllDiskPs1Files(scriptsLibDir, full));
    } else if (item.toLowerCase().endsWith('.ps1')) {
      const rel = path.relative(scriptsLibDir, full).replace(/\\/g, '/');
      results.push({ relPath: rel, fullPath: full });
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

export function validateManifest(options = {}) {
  const manifestPath = options.manifestPath || path.resolve(__dirname, '../../scripts_lib/manifest.json');
  const scriptsLibDir = options.scriptsLibDir || path.resolve(__dirname, '../../scripts_lib');

  const assertions = [];
  let passedCount = 0;
  let failedCount = 0;

  function record(condition, name, detail) {
    if (condition) {
      passedCount++;
      assertions.push({ passed: true, name, detail });
    } else {
      failedCount++;
      assertions.push({ passed: false, name, detail });
    }
  }

  // 1. Manifest file existence
  if (!fs.existsSync(manifestPath)) {
    record(false, 'Manifest File Existence', `manifest.json not found at ${manifestPath}`);
    return {
      allPassed: false,
      totalAssertions: 1,
      passedCount: 0,
      failedCount: 1,
      assertions,
      manifest: null
    };
  }
  record(true, 'Manifest File Existence', `manifest.json exists at ${manifestPath}`);

  // 2. JSON Parse
  let manifest;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
    record(true, 'Manifest JSON Syntax', 'manifest.json parsed successfully');
  } catch (err) {
    record(false, 'Manifest JSON Syntax', `JSON parse error: ${err.message}`);
    return {
      allPassed: false,
      totalAssertions: assertions.length,
      passedCount,
      failedCount,
      assertions,
      manifest: null
    };
  }

  // 3. Root Schema
  record(
    typeof manifest.schemaVersion === 'string' && SEMVER_REGEX.test(manifest.schemaVersion),
    'Root Schema: schemaVersion',
    `schemaVersion is valid semver: ${manifest.schemaVersion}`
  );

  record(
    typeof manifest.version === 'string' && SEMVER_REGEX.test(manifest.version),
    'Root Schema: version',
    `version is valid semver: ${manifest.version}`
  );

  record(
    typeof manifest.lastUpdated === 'string' && !isNaN(Date.parse(manifest.lastUpdated)),
    'Root Schema: lastUpdated',
    `lastUpdated is valid ISO timestamp: ${manifest.lastUpdated}`
  );

  record(
    typeof manifest.repositoryUrl === 'string' && manifest.repositoryUrl.startsWith('https://'),
    'Root Schema: repositoryUrl',
    `repositoryUrl is valid HTTPS URL: ${manifest.repositoryUrl}`
  );

  record(
    typeof manifest.rawBaseUrl === 'string' && manifest.rawBaseUrl.startsWith('https://'),
    'Root Schema: rawBaseUrl',
    `rawBaseUrl is valid HTTPS URL: ${manifest.rawBaseUrl}`
  );

  record(
    Array.isArray(manifest.scripts) && manifest.scripts.length > 0,
    'Root Schema: scripts array',
    `scripts array contains ${manifest.scripts?.length || 0} entries`
  );

  if (!Array.isArray(manifest.scripts)) {
    return {
      allPassed: false,
      totalAssertions: assertions.length,
      passedCount,
      failedCount,
      assertions,
      manifest
    };
  }

  // 4. Per-script Validation
  const seenIds = new Set();
  const seenPaths = new Set();

  for (const script of manifest.scripts) {
    const sId = script.id || '<missing-id>';

    // ID Checks
    const idValid = typeof script.id === 'string' && ID_REGEX.test(script.id);
    record(idValid, `Script [${sId}] ID Format`, `Matches regex ^[a-z0-9-]+$: ${script.id}`);

    const idUnique = !seenIds.has(script.id);
    record(idUnique, `Script [${sId}] ID Uniqueness`, `ID is globally unique in manifest`);
    seenIds.add(script.id);

    // Name Checks
    const nameValid = typeof script.name === 'string' && script.name.length >= 3 && script.name.length <= 120;
    record(nameValid, `Script [${sId}] Name`, `Name length is 3..120 chars: "${script.name}"`);

    // Category Checks
    const categoryValid = typeof script.category === 'string' && VALID_CATEGORIES.has(script.category);
    record(categoryValid, `Script [${sId}] Category`, `Category is valid enum (${script.category})`);

    // Path Checks
    const pathNormalized = (script.path || '').replace(/\\/g, '/');
    const pathNoEscape = !pathNormalized.startsWith('/') && !pathNormalized.includes('..') && !pathNormalized.includes(':');
    const pathMatchesCategory = pathNormalized.startsWith(`${script.category}/`);
    record(
      pathNoEscape && pathMatchesCategory,
      `Script [${sId}] Path Format`,
      `Path is normalized relative category path: ${script.path}`
    );

    const pathUnique = !seenPaths.has(pathNormalized);
    record(pathUnique, `Script [${sId}] Path Uniqueness`, `Path is unique across manifest`);
    seenPaths.add(pathNormalized);

    // Description Checks
    const descValid = typeof script.description === 'string' && script.description.length >= 10;
    record(descValid, `Script [${sId}] Description`, `Description length is >= 10 chars`);

    // Risk Level Checks
    const riskValid = typeof script.riskLevel === 'string' && VALID_RISK_LEVELS.has(script.riskLevel);
    record(riskValid, `Script [${sId}] Risk Level`, `Risk level is valid enum: ${script.riskLevel}`);

    // requiresAdmin Checks
    record(typeof script.requiresAdmin === 'boolean', `Script [${sId}] requiresAdmin`, `requiresAdmin is boolean (${script.requiresAdmin})`);

    // author & version Checks
    record(typeof script.author === 'string' && script.author.length > 0, `Script [${sId}] Author`, `Author is specified: "${script.author}"`);
    record(typeof script.version === 'string' && SEMVER_REGEX.test(script.version), `Script [${sId}] Version`, `Version is semver: ${script.version}`);

    // tags Checks
    record(
      Array.isArray(script.tags) && script.tags.length >= 1 && script.tags.every(t => typeof t === 'string' && t.length > 0),
      `Script [${sId}] Tags`,
      `Tags array has ${script.tags?.length || 0} valid keywords`
    );

    // Parameters Checks (if present)
    if (script.parameters !== undefined) {
      const paramsValid = Array.isArray(script.parameters) && script.parameters.every(p => {
        return typeof p.name === 'string' && 
               ['string', 'number', 'boolean'].includes(p.type) && 
               p.default !== undefined && 
               typeof p.description === 'string';
      });
      record(paramsValid, `Script [${sId}] Parameters Schema`, `Parameters array matches Schema (${script.parameters.length} params)`);
    }

    // Disk File Existence & SHA-256 Parity
    const diskPath = path.resolve(scriptsLibDir, script.path);
    const fileExists = fs.existsSync(diskPath);
    record(fileExists, `Script [${sId}] File on Disk`, `File exists at physical path: ${script.path}`);

    if (fileExists) {
      const fileBytes = fs.readFileSync(diskPath);
      const computedSha = crypto.createHash('sha256').update(fileBytes).digest('hex');
      const shaMatches = computedSha === script.sha256;
      record(
        shaMatches,
        `Script [${sId}] SHA-256 Integrity`,
        `SHA-256 computed: ${computedSha.slice(0, 16)}... matches manifest: ${script.sha256?.slice(0, 16)}...`
      );
    }
  }

  // 5. Check Disk vs Manifest Parity
  const diskFiles = getAllDiskPs1Files(scriptsLibDir);
  record(
    diskFiles.length === manifest.scripts.length,
    'Disk & Manifest Count Parity',
    `Manifest scripts (${manifest.scripts.length}) === Disk scripts (${diskFiles.length})`
  );

  for (const diskFile of diskFiles) {
    const isManifested = seenPaths.has(diskFile.relPath);
    record(
      isManifested,
      `Disk File Tracked: ${diskFile.relPath}`,
      `File on disk is tracked in manifest.json`
    );
  }

  return {
    allPassed: failedCount === 0,
    totalAssertions: assertions.length,
    passedCount,
    failedCount,
    assertions,
    manifest,
    totalScripts: manifest.scripts.length
  };
}

// Standalone execution entrypoint
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log('================================================================');
  console.log(' WiScripts Windows v1.6.0 — Manifest Schema & Integrity Validator');
  console.log('================================================================\n');

  try {
    const report = validateManifest();
    console.log(`Validated manifest with ${report.totalAssertions} total assertions across ${report.totalScripts || 0} scripts.\n`);

    for (const a of report.assertions) {
      const icon = a.passed ? '✓' : '✗';
      console.log(`  [${icon}] ${a.name}: ${a.detail}`);
    }

    console.log('\n================================================================');
    console.log(` SUMMARY: Total: ${report.totalAssertions} | Passed: ${report.passedCount} | Failed: ${report.failedCount}`);
    console.log('================================================================');

    if (!report.allPassed) {
      console.error(`VERDICT: FAILED with ${report.failedCount} assertion failures.`);
      process.exit(1);
    } else {
      console.log('🎉 VERDICT: SUCCESS — Manifest schema and SHA-256 cryptographic integrity 100% verified!');
      process.exit(0);
    }
  } catch (e) {
    console.error('Fatal Manifest Validator Error:', e);
    process.exit(1);
  }
}

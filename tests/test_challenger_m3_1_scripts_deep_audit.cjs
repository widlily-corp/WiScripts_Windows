/**
 * CHALLENGER 1 (M3): Deep Script Library Audit
 * Verifies:
 * 1. All 27 scripts in scripts_lib/ match SHA-256 in manifest.json
 * 2. All 27 scripts start with valid param() header
 * 3. Zero non-ASCII characters inside <# ... #> block comments
 * 4. PowerShell 5.1 AST syntax validation on each script
 * 5. UTF-8 with BOM presence for Cyrillic / non-ASCII characters outside block comments
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('================================================================');
console.log(' CHALLENGER 1 (M3): SCRIPTS_LIB DEEP EMPIRICAL AUDIT');
console.log('================================================================\n');

const manifestPath = path.resolve(__dirname, '../scripts_lib/manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('[CRITICAL] manifest.json not found at:', manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`Manifest Version: ${manifest.version}, Total Scripts: ${manifest.scripts.length}`);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// 1. Script Count & Uniqueness
assert(manifest.scripts.length === 27, `Manifest contains exactly 27 scripts (got ${manifest.scripts.length})`);
const scriptIds = new Set();
const scriptPaths = new Set();

// Scan disk for all .ps1 files in scripts_lib
const scriptsLibDir = path.resolve(__dirname, '../scripts_lib');
function getPs1Files(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getPs1Files(full));
    } else if (item.endsWith('.ps1')) {
      const rel = path.relative(scriptsLibDir, full).replace(/\\/g, '/');
      results.push(rel);
    }
  }
  return results;
}

const onDiskPs1 = getPs1Files(scriptsLibDir);
assert(onDiskPs1.length === 27, `Physical scripts_lib directory contains exactly 27 .ps1 files (got ${onDiskPs1.length})`);

console.log('\n--- SECTION 1: SHA-256 Cryptographic & Path Verification ---');
for (const script of manifest.scripts) {
  scriptIds.add(script.id);
  scriptPaths.add(script.path);

  const fullPath = path.resolve(scriptsLibDir, script.path);
  assert(fs.existsSync(fullPath), `[${script.id}] File exists on disk: ${script.path}`);

  const fileBytes = fs.readFileSync(fullPath);
  const calculatedSha = crypto.createHash('sha256').update(fileBytes).digest('hex');
  assert(
    calculatedSha === script.sha256,
    `[${script.id}] SHA-256 matches manifest (computed: ${calculatedSha.slice(0, 16)}..., manifest: ${script.sha256.slice(0, 16)}...)`
  );
}

console.log('\n--- SECTION 2: param() Signature & AST Verification ---');
for (const script of manifest.scripts) {
  const fullPath = path.resolve(scriptsLibDir, script.path);
  const fileBytes = fs.readFileSync(fullPath);
  const utf8Text = fileBytes.toString('utf8');

  // Strip BOM if present
  const textWithoutBom = utf8Text.replace(/^\uFEFF/, '');
  const trimmed = textWithoutBom.trimStart();

  const startsWithParam = trimmed.startsWith('param(') || trimmed.startsWith('param (');
  assert(startsWithParam, `[${script.id}] Starts with param(...) header`);

  // Verify non-ASCII inside <# ... #> block comments
  const blockCommentRegex = /<#([\s\S]*?)#>/g;
  let blockMatch;
  let hasNonAsciiInBlock = false;
  let nonAsciiSamples = [];

  while ((blockMatch = blockCommentRegex.exec(utf8Text)) !== null) {
    const commentBody = blockMatch[1];
    const nonAscii = commentBody.match(/[^\x00-\x7F]/g);
    if (nonAscii) {
      hasNonAsciiInBlock = true;
      nonAsciiSamples.push(nonAscii[0]);
    }
  }

  assert(
    !hasNonAsciiInBlock,
    `[${script.id}] Zero non-ASCII inside <# ... #> block comments (Found: ${nonAsciiSamples.length === 0 ? '0' : nonAsciiSamples.join(', ')})`
  );

  // If script contains non-ASCII anywhere (e.g. string literals or line comments), ensure it has UTF-8 BOM
  const hasNonAsciiOverall = /[^\x00-\x7F]/.test(utf8Text);
  const hasBom = fileBytes[0] === 0xEF && fileBytes[1] === 0xBB && fileBytes[2] === 0xBF;
  if (hasNonAsciiOverall) {
    assert(hasBom, `[${script.id}] Contains non-ASCII and includes UTF-8 BOM (0xEF 0xBB 0xBF)`);
  }
}

console.log('\n--- SECTION 3: Live PowerShell 5.1 Syntax AST Validation ---');
for (const script of manifest.scripts) {
  const fullPath = path.resolve(scriptsLibDir, script.path);
  const escapedPath = fullPath.replace(/'/g, "''");
  const psCmd = `powershell -NoProfile -NonInteractive -Command "$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${escapedPath}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 } else { exit 0 }"`;

  try {
    execSync(psCmd, { stdio: 'pipe' });
    assert(true, `[${script.id}] PowerShell 5.1 AST parsed 0 syntax errors`);
  } catch (err) {
    assert(false, `[${script.id}] PowerShell 5.1 AST syntax error: ${err.stderr?.toString() || err.message}`);
  }
}

console.log('\n================================================================');
console.log(` AUDIT SUMMARY: Total Checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('================================================================\n');

if (failed > 0) {
  console.error(`VERDICT: FAILED with ${failed} issues`);
  process.exit(1);
} else {
  console.log('🎉 VERDICT: SUCCESS — All 27 scripts passed SHA-256, param(), ASCII comment, and AST checks.');
}

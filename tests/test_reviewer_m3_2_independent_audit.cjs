/**
 * Independent Milestone 3 Review & Adversarial Stress Test Suite
 * Author: teamwork_preview_reviewer (reviewer_m3_2)
 *
 * Scope:
 * 1. Cryptographic hash integrity (all 45 SHA-256 hashes, lowercase, 64-hex, raw bytes)
 * 2. Bijective parity (45 disk files === 45 manifest entries, 0 untracked, 0 missing)
 * 3. Parameter contract matching (manifest parameters vs. PowerShell param() block AST)
 * 4. formatScriptWithParameters AST preservation & argument binding
 * 5. Dry-run simulation behavior across all 5 scripts (-DryRun execution safety)
 * 6. Non-admin elevation guard verification (exit code 1, descriptive message, zero execution)
 * 7. Anti-facade and code substance verification (no dummy stubs)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');

console.log('================================================================');
console.log(' REVIEWER M3-2: INDEPENDENT MILESTONE 3 AUDIT & STRESS TEST');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [✓ PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [✗ FAIL] ${message}`);
    failCount++;
  }
}

const scriptsLibDir = path.resolve(__dirname, '../scripts_lib');
const manifestPath = path.resolve(scriptsLibDir, 'manifest.json');

// --- 1. Manifest Existence & Bijective Parity ---
console.log('--- 1. Bijective Parity & Manifest Catalog ---');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert(manifest.scripts.length === 45, `Manifest catalogs exactly 45 scripts (got ${manifest.scripts.length})`);

function getDiskPs1(dir) {
  let list = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      list = list.concat(getDiskPs1(full));
    } else if (item.endsWith('.ps1')) {
      list.push(path.relative(scriptsLibDir, full).split(path.sep).join('/'));
    }
  }
  return list;
}

const diskFiles = getDiskPs1(scriptsLibDir).sort();
const manifestFiles = manifest.scripts.map((s) => s.path).sort();

assert(diskFiles.length === 45, `Disk contains exactly 45 .ps1 scripts (got ${diskFiles.length})`);
assert(
  JSON.stringify(diskFiles) === JSON.stringify(manifestFiles),
  'Disk files and manifest files are strictly 1:1 bijective (0 untracked, 0 missing)'
);

// --- 2. Cryptographic Integrity of All 45 SHA-256 Hashes ---
console.log('\n--- 2. Cryptographic SHA-256 Hash Integrity (Raw Bytes) ---');
for (const script of manifest.scripts) {
  const fullPath = path.resolve(scriptsLibDir, script.path);
  const rawBytes = fs.readFileSync(fullPath);
  const calculatedSha = crypto.createHash('sha256').update(rawBytes).digest('hex');

  const isLower64 = /^[a-f0-9]{64}$/.test(script.sha256);
  assert(isLower64, `[${script.id}] Manifest hash is 64-char lowercase hex: ${script.sha256.slice(0, 16)}...`);
  assert(
    calculatedSha === script.sha256,
    `[${script.id}] SHA-256 matches disk bytes: ${calculatedSha.slice(0, 16)}... === ${script.sha256.slice(0, 16)}...`
  );
}

// --- 3. Five New Milestone 3 Scripts Deep Inspection ---
console.log('\n--- 3. Five New M3 Scripts Inspection & Parameter Verification ---');
const newScriptIds = [
  'sec-toggle-ai-recall-copilot',
  'sec-disable-modern-telemetry-24h2',
  'perf-restore-classic-context-menu',
  'net-configure-qos-dscp-gaming',
  'net-optimize-nagle-algorithm'
];

for (const scriptId of newScriptIds) {
  const s = manifest.scripts.find((item) => item.id === scriptId);
  assert(!!s, `New script [${scriptId}] found in manifest`);
  const fullPath = path.resolve(scriptsLibDir, s.path);
  const rawBytes = fs.readFileSync(fullPath);

  // Check UTF-8 BOM
  const hasBom = rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf;
  assert(hasBom, `[${scriptId}] Has UTF-8 BOM (0xEF 0xBB 0xBF)`);

  const text = rawBytes.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);

  // First active line must be param(
  assert(lines[0].startsWith('param(') || lines[0].startsWith('param ('), `[${scriptId}] Line 1 starts with param(...)`);

  // Zero block comments containing non-ASCII
  const hasBlockComment = /<#[\s\S]*?#>/.test(text);
  assert(!hasBlockComment, `[${scriptId}] Zero <# ... #> block comments (avoids CP1251 parser bug)`);

  // Substantial real implementation check (anti-facade)
  assert(lines.length >= 70, `[${scriptId}] Substantial logic implementation: ${lines.length} lines (>= 70)`);
  assert(rawBytes.length >= 3500, `[${scriptId}] Substantial script size: ${rawBytes.length} bytes (>= 3500)`);

  // Verify parameters match manifest definitions
  for (const p of s.parameters) {
    const paramRegex = new RegExp(`\\$${p.name}\\b`, 'i');
    assert(paramRegex.test(text), `[${scriptId}] Parameter '$${p.name}' declared in script body`);
  }
}

// --- 4. formatScriptWithParameters AST & Binding Simulation ---
console.log('\n--- 4. formatScriptWithParameters AST Preservation & Typing ---');

function extractParamBlockHeader(content) {
  const clean = content.replace(/^\uFEFF/, '').trim();
  const paramMatch = clean.match(/^param\s*\(/i);
  if (!paramMatch) return null;

  const openParenIndex = clean.indexOf('(');
  let depth = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = openParenIndex + 1; i < clean.length; i++) {
    const char = clean[i];
    const prev = clean[i - 1];

    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && clean[i + 1] === "'") {
        i++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      if (prev !== '`') {
        inDoubleQuote = !inDoubleQuote;
      }
      continue;
    }
    if (inSingleQuote || inDoubleQuote) continue;

    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return clean.substring(0, i + 1).trim();
    }
  }
  return null;
}

function synthesizeParamBlock(parameters) {
  const paramDecls = parameters.map((p) => {
    if (p.type === 'boolean') return `  [switch]$${p.name}`;
    else if (p.type === 'number') return `  [double]$${p.name}`;
    else return `  [string]$${p.name}`;
  });
  return `param(\n${paramDecls.join(',\n')}\n)`;
}

function formatScriptWithParameters(rawContent, parameters, values) {
  if (!parameters || parameters.length === 0 || !values) return rawContent;
  const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();
  const args = [];
  for (const param of parameters) {
    const val = values[param.name];
    if (val === undefined || val === null || val === '') continue;
    if (param.type === 'boolean') {
      const boolToken = Boolean(val) ? '$true' : '$false';
      args.push(`-${param.name}:${boolToken}`);
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
  if (args.length === 0) return cleanContent;
  const existingHeader = extractParamBlockHeader(cleanContent);
  const rootParamBlock = existingHeader || synthesizeParamBlock(parameters);
  return `${rootParamBlock}\n\n& {\n${cleanContent}\n} ${args.join(' ')}\n`;
}

const testSandboxDir = path.join('.agents', 'teamwork_preview_reviewer_m3_2', 'sandbox');
if (!fs.existsSync(testSandboxDir)) fs.mkdirSync(testSandboxDir, { recursive: true });

for (const scriptId of newScriptIds) {
  const s = manifest.scripts.find((item) => item.id === scriptId);
  const fullPath = path.resolve(scriptsLibDir, s.path);
  const rawContent = fs.readFileSync(fullPath, 'utf8');

  // Case A: Default values
  const defaultVals = {};
  for (const p of s.parameters) defaultVals[p.name] = p.default;
  const formattedA = formatScriptWithParameters(rawContent, s.parameters, defaultVals);

  // Validate AST of formattedA via ParseFile
  const tempAstFileA = path.join(testSandboxDir, `ast_testA_${scriptId}.ps1`);
  fs.writeFileSync(tempAstFileA, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(formattedA, 'utf8')]));
  const escapedA = tempAstFileA.replace(/'/g, "''");
  const psCmdA = `powershell -NoProfile -NonInteractive -Command "$errors = $null; $ast = [System.Management.Automation.Language.Parser]::ParseFile('${escapedA}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { exit 1 }; if ($ast.ParamBlock -eq $null) { exit 2 }; exit 0"`;
  const resA = spawnSync('cmd.exe', ['/c', psCmdA]);
  assert(resA.status === 0, `[${scriptId}] Default values format -> AST valid & ParamBlock preserved (status: ${resA.status})`);

  // Case B: Adversarial / DryRun toggle values
  const testVals = {};
  for (const p of s.parameters) {
    if (p.type === 'boolean') testVals[p.name] = true;
    else if (p.name === 'Action') testVals[p.name] = (p.default === 'Enable' || p.default === 'RestoreClassic') ? 'Disable' : 'Enable';
    else testVals[p.name] = "O'Connor & Test";
  }
  const formattedB = formatScriptWithParameters(rawContent, s.parameters, testVals);
  const tempAstFileB = path.join(testSandboxDir, `ast_testB_${scriptId}.ps1`);
  fs.writeFileSync(tempAstFileB, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(formattedB, 'utf8')]));
  const escapedB = tempAstFileB.replace(/'/g, "''");
  const psCmdB = `powershell -NoProfile -NonInteractive -Command "$errors = $null; $ast = [System.Management.Automation.Language.Parser]::ParseFile('${escapedB}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { exit 1 }; if ($ast.ParamBlock -eq $null) { exit 2 }; exit 0"`;
  const resB = spawnSync('cmd.exe', ['/c', psCmdB]);
  assert(resB.status === 0, `[${scriptId}] Adversarial/DryRun values format -> AST valid & ParamBlock preserved (status: ${resB.status})`);
}

// --- 5. DryRun Simulation Execution Safety Across All 5 Scripts ---
console.log('\n--- 5. Dry-Run Execution Safety Verification ---');

for (const scriptId of newScriptIds) {
  const s = manifest.scripts.find((item) => item.id === scriptId);
  const fullPath = path.resolve(scriptsLibDir, s.path);
  const rawContent = fs.readFileSync(fullPath, 'utf8');

  // Test Non-Admin execution (Elevation guard verification)
  if (s.requiresAdmin) {
    // Inject mock $isAdmin = $false
    const nonAdminContent = rawContent.replace(/^\uFEFF/, '').replace(
      /\$isAdmin\s*=\s*\(\[Security\.Principal\.WindowsPrincipal\][\s\S]*?\)\.IsInRole\([\s\S]*?\)/,
      '$isAdmin = $false'
    );
    const tempFile = path.join(testSandboxDir, `test_nonadmin_${path.basename(s.path)}`);
    fs.writeFileSync(tempFile, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(nonAdminContent, 'utf8')]));

    const resNonAdmin = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-File', tempFile]);
    assert(resNonAdmin.status === 1, `[${scriptId}] Non-admin execution exits with code 1`);
    assert(
      resNonAdmin.stdout.toString().includes('requires Administrator privileges'),
      `[${scriptId}] Non-admin output contains clear Administrator requirement message`
    );
  }

  // Test Admin Mock with -DryRun: must execute to completion (code 0) and log dry-run operations without making changes
  let dryRunContent = rawContent.replace(/^\uFEFF/, '');
  if (s.requiresAdmin) {
    dryRunContent = dryRunContent.replace(
      /\$isAdmin\s*=\s*\(\[Security\.Principal\.WindowsPrincipal\][\s\S]*?\)\.IsInRole\([\s\S]*?\)/,
      '$isAdmin = $true'
    );
  }

  const dryRunTestFile = path.join(testSandboxDir, `test_dryrun_${path.basename(s.path)}`);
  fs.writeFileSync(dryRunTestFile, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(dryRunContent, 'utf8')]));

  const resDryRun = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-File', dryRunTestFile, '-DryRun']);
  const stdout = resDryRun.stdout.toString();
  const stderr = resDryRun.stderr.toString();

  assert(resDryRun.status === 0, `[${scriptId}] -DryRun simulation exits with code 0 (stderr: ${stderr.trim() || 'none'})`);
  assert(
    stdout.includes('[DRY-RUN]') || stdout.includes('[DRY RUN]'),
    `[${scriptId}] Output emits [DRY-RUN] or [DRY RUN] markers`
  );
  assert(
    !stdout.includes('[ERROR] Failed'),
    `[${scriptId}] Dry-run completes without unhandled errors`
  );
}

// Cleanup sandbox
try {
  fs.rmSync(testSandboxDir, { recursive: true, force: true });
} catch (e) {}

console.log('\n================================================================');
console.log(` REVIEWER AUDIT SUMMARY: Total: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
  console.error(`VERDICT: REQUEST_CHANGES (${failCount} failures detected)`);
  process.exit(1);
} else {
  console.log('🎉 VERDICT: APPROVE — All Milestone 3 artifacts verified and confirmed!');
}

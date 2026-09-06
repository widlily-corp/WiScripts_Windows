/**
 * WiScripts Windows v1.6.0 — PowerShell AST & Encoding Static Validator
 * 
 * Performs static AST validation across all .ps1 scripts in scripts_lib/
 * without live execution on the host system (Safety Constraint R5).
 * 
 * Verifies:
 * 1. PowerShell 5.1 AST syntax validation via [System.Management.Automation.Language.Parser]::ParseFile (0 errors)
 * 2. param(...) is strictly the first non-comment statement
 * 3. Zero non-ASCII characters inside <# ... #> block comments (prevents CP1251 parser bug on Russian Windows)
 * 4. UTF-8 BOM presence for scripts containing non-ASCII character literals
 * 5. Absence of interactive blocking calls (Read-Host, pause, $host.UI.ReadLine)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedValidationSummary = null;

export function getAllPs1Files(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllPs1Files(full));
    } else if (item.toLowerCase().endsWith('.ps1')) {
      results.push(full);
    }
  }
  return results.sort();
}

export function batchParsePsAst(filePaths) {
  if (!filePaths || filePaths.length === 0) return {};
  
  const escapedList = filePaths.map(f => `'${f.replace(/'/g, "''")}'`).join(',');
  const psScript = `$files = @(${escapedList}); $map = @{}; foreach ($f in $files) { $errs = $null; $ast = [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$errs); $errList = @(); if ($errs) { foreach ($e in $errs) { $errList += "$($e.Message) at line $($e.Extent.StartLineNumber)" } }; $map[$f] = $errList; }; $map | ConvertTo-Json -Compress`;

  try {
    const output = execSync(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, {
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    return JSON.parse(output.trim());
  } catch (err) {
    return null;
  }
}

export function validateSingleScript(scriptFullPath, scriptsLibRoot, preParsedErrors = undefined) {
  const relPath = path.relative(scriptsLibRoot, scriptFullPath).replace(/\\/g, '/');
  const fileBytes = fs.readFileSync(scriptFullPath);
  const utf8Text = fileBytes.toString('utf8');
  const checkResults = [];

  // 1. AST Syntax Check via PowerShell Parser
  let astPassed = false;
  let astMessage = '';

  if (preParsedErrors !== undefined) {
    if (Array.isArray(preParsedErrors) && preParsedErrors.length > 0) {
      astPassed = false;
      astMessage = preParsedErrors.join('; ');
    } else {
      astPassed = true;
      astMessage = '0 AST syntax errors';
    }
  } else {
    const escapedPath = scriptFullPath.replace(/'/g, "''");
    const psCmd = `powershell -NoProfile -NonInteractive -Command "$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${escapedPath}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 } else { exit 0 }"`;

    try {
      execSync(psCmd, { stdio: 'pipe', encoding: 'utf8' });
      astPassed = true;
      astMessage = '0 AST syntax errors';
    } catch (err) {
      astPassed = false;
      astMessage = err.stderr ? err.stderr.toString().trim() : (err.message || 'Syntax error');
    }
  }
  checkResults.push({ name: 'AST Syntax Parsing', passed: astPassed, detail: astMessage });

  // 2. param() placement check
  const textWithoutBom = utf8Text.replace(/^\uFEFF/, '');
  const trimmed = textWithoutBom.trimStart();
  const startsWithParam = trimmed.startsWith('param(') || 
                          trimmed.startsWith('param (') || 
                          trimmed.startsWith('param\r\n') || 
                          trimmed.startsWith('param\n') ||
                          trimmed.startsWith('<#');
  
  const hasParamBlock = /^\s*(<#[\s\S]*?#>\s*)*param\s*\(/i.test(textWithoutBom);
  const paramValid = startsWithParam && hasParamBlock;
  checkResults.push({
    name: 'param() Placement',
    passed: paramValid,
    detail: paramValid ? 'param() is first active statement' : 'Script does not begin with param() header'
  });

  // 3. ASCII-only <# ... #> block comments
  const blockCommentRegex = /<#([\s\S]*?)#>/g;
  let blockMatch;
  let hasNonAsciiInBlock = false;
  const nonAsciiSamples = [];

  while ((blockMatch = blockCommentRegex.exec(utf8Text)) !== null) {
    const commentBody = blockMatch[1];
    const nonAscii = commentBody.match(/[^\x00-\x7F]/g);
    if (nonAscii) {
      hasNonAsciiInBlock = true;
      nonAsciiSamples.push(...nonAscii.slice(0, 3));
    }
  }
  checkResults.push({
    name: 'Block Comments Encoding',
    passed: !hasNonAsciiInBlock,
    detail: !hasNonAsciiInBlock 
      ? '100% ASCII inside <# ... #> (CP1251 safe)' 
      : `Non-ASCII detected in block comments: ${nonAsciiSamples.join(', ')}`
  });

  // 4. UTF-8 BOM check for non-ASCII characters
  const hasNonAsciiOverall = /[^\x00-\x7F]/.test(utf8Text);
  const hasBom = fileBytes.length >= 3 && fileBytes[0] === 0xEF && fileBytes[1] === 0xBB && fileBytes[2] === 0xBF;
  let bomPassed = true;
  let bomDetail = 'Script is pure ASCII';
  if (hasNonAsciiOverall) {
    bomPassed = hasBom;
    bomDetail = hasBom ? 'UTF-8 BOM present for Cyrillic/non-ASCII' : 'Missing UTF-8 BOM for non-ASCII literals';
  }
  checkResults.push({
    name: 'UTF-8 BOM Integrity',
    passed: bomPassed,
    detail: bomDetail
  });

  // 5. Interactive blocking cmdlets check
  const blockingRegex = /\b(Read-Host|pause)\b|\[System\.Console\]::ReadKey|\$host\.UI\.ReadLine/i;
  const hasBlocking = blockingRegex.test(utf8Text);
  checkResults.push({
    name: 'Non-Blocking Execution',
    passed: !hasBlocking,
    detail: !hasBlocking ? 'Zero interactive blocking prompts' : 'Interactive prompt detected (Read-Host/pause)'
  });

  const allPassed = checkResults.every(c => c.passed);
  return {
    scriptPath: relPath,
    fullPath: scriptFullPath,
    passed: allPassed,
    checks: checkResults
  };
}

export function runPowerShellAstValidation(options = {}) {
  const { scriptsLibDir, forceReload = false } = options;
  const targetDir = scriptsLibDir || path.resolve(__dirname, '../../scripts_lib');

  if (!forceReload && cachedValidationSummary && cachedValidationSummary.targetDir === targetDir) {
    return cachedValidationSummary;
  }

  if (!fs.existsSync(targetDir)) {
    throw new Error(`scripts_lib directory not found at: ${targetDir}`);
  }

  const ps1Files = getAllPs1Files(targetDir);
  const batchErrors = batchParsePsAst(ps1Files);

  const fileResults = [];
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;

  for (const file of ps1Files) {
    const preErrors = batchErrors ? (batchErrors[file] || batchErrors[file.replace(/\\/g, '/')] || []) : undefined;
    const res = validateSingleScript(file, targetDir, preErrors);
    fileResults.push(res);
    for (const chk of res.checks) {
      totalChecks++;
      if (chk.passed) {
        passedChecks++;
      } else {
        failedChecks++;
      }
    }
  }

  const summary = {
    targetDir,
    totalScripts: ps1Files.length,
    totalChecks,
    passedChecks,
    failedChecks,
    allPassed: failedChecks === 0,
    results: fileResults
  };

  cachedValidationSummary = summary;
  return summary;
}

// Standalone execution entrypoint
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log('================================================================');
  console.log(' WiScripts Windows v1.6.0 — PowerShell Static AST Validator');
  console.log('================================================================\n');

  try {
    const summary = runPowerShellAstValidation({ forceReload: true });
    console.log(`Validated ${summary.totalScripts} scripts with ${summary.totalChecks} total checks.`);

    for (const r of summary.results) {
      const icon = r.passed ? '✓' : '✗';
      console.log(`\n[${icon}] ${r.scriptPath}:`);
      for (const c of r.checks) {
        const subIcon = c.passed ? '  ✓' : '  ✗';
        console.log(`${subIcon} ${c.name}: ${c.detail}`);
      }
    }

    console.log('\n================================================================');
    console.log(` SUMMARY: Scripts: ${summary.totalScripts} | Passed: ${summary.passedChecks} | Failed: ${summary.failedChecks}`);
    console.log('================================================================');

    if (!summary.allPassed) {
      console.error(`VERDICT: FAILED with ${summary.failedChecks} check failures.`);
      process.exit(1);
    } else {
      console.log('🎉 VERDICT: SUCCESS — All scripts passed static AST and encoding verification cleanly!');
      process.exit(0);
    }
  } catch (e) {
    console.error('Fatal AST Validator Error:', e);
    process.exit(1);
  }
}

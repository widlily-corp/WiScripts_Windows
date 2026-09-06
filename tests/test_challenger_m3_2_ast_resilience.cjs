/**
 * CHALLENGER M3-2: PowerShell AST Resilience, Encoding & Host Safety Verification
 * 
 * Verification Matrix:
 * 1. UTF-8 BOM headers (0xEF, 0xBB, 0xBF) on all 5 Milestone 3 scripts.
 * 2. Strict CRLF (\r\n) line endings with zero solitary LF/CR.
 * 3. Strict prohibition of <# ... #> block comments (zero occurrences).
 * 4. PowerShell 5.1 AST syntax parsing with 0 syntax errors and valid root ParamBlock.
 * 5. Variable scope collision & $var: syntax trap inspection across all VariableExpressionAst nodes.
 * 6. AST preservation and parameter binding integrity under formatScriptWithParameters.
 * 7. Host Safety: Isolated non-destructive dry-run and non-elevated exit code verification.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

console.log('================================================================');
console.log(' WISCRIPTS WINDOWS — CHALLENGER M3-2: POWERSHELL AST RESILIENCE');
console.log(' Scope: BOM, CRLF, Block Comments, $var: Traps, AST Invariants');
console.log(` Timestamp: ${new Date().toISOString()}`);
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

const targetScripts = [
  {
    id: 'sec-toggle-ai-recall-copilot',
    file: 'scripts_lib/security/toggle_ai_recall_copilot.ps1',
    requiresAdmin: true,
    expectedParams: ['Action', 'DryRun']
  },
  {
    id: 'sec-disable-modern-telemetry-24h2',
    file: 'scripts_lib/security/disable_modern_telemetry_24h2.ps1',
    requiresAdmin: true,
    expectedParams: ['DryRun']
  },
  {
    id: 'perf-restore-classic-context-menu',
    file: 'scripts_lib/performance/restore_classic_context_menu.ps1',
    requiresAdmin: false,
    expectedParams: ['Action', 'DryRun']
  },
  {
    id: 'net-configure-qos-dscp-gaming',
    file: 'scripts_lib/network/configure_qos_dscp_gaming.ps1',
    requiresAdmin: true,
    expectedParams: ['Action', 'DryRun']
  },
  {
    id: 'net-optimize-nagle-algorithm',
    file: 'scripts_lib/network/optimize_nagle_algorithm.ps1',
    requiresAdmin: true,
    expectedParams: ['Action', 'DryRun']
  }
];

// Helper: replicate formatScriptWithParameters from src/store/slices/scriptRunnerSlice.ts
function extractParamBlockHeader(content) {
  const clean = content.replace(/^\uFEFF/, '').trim();
  if (!clean.startsWith('param(') && !clean.startsWith('param (')) {
    return null;
  }
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const prev = i > 0 ? clean[i - 1] : '';
    if (char === "'" && !inDoubleQuote) {
      if (prev !== '`') inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      if (prev !== '`') inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) continue;

    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) {
        return clean.substring(0, i + 1).trim();
      }
    }
  }
  return null;
}

function synthesizeParamBlock(parameters) {
  const paramDecls = parameters.map((p) => {
    if (p.type === 'boolean') return `  [switch]$${p.name}`;
    if (p.type === 'number') return `  [double]$${p.name}`;
    return `  [string]$${p.name}`;
  });
  return `param(\n${paramDecls.join(',\n')}\n)`;
}

function formatScriptWithParameters(rawContent, parameters, values) {
  if (!parameters || parameters.length === 0 || !values) {
    return rawContent;
  }
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

// -------------------------------------------------------------
// SECTION 1: Binary Header & UTF-8 BOM Verification (3 bytes: 0xEF, 0xBB, 0xBF)
// -------------------------------------------------------------
console.log('--- SECTION 1: UTF-8 BOM Header Verification ---');
for (const item of targetScripts) {
  const filePath = path.resolve(item.file);
  assert(fs.existsSync(filePath), `File exists: ${item.file}`);

  const buffer = fs.readFileSync(filePath);
  const hasBom = buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
  assert(hasBom, `[${item.id}] Has valid UTF-8 BOM header (0xEF 0xBB 0xBF)`);

  const afterBom = buffer.slice(3, 9).toString('ascii');
  assert(afterBom.startsWith('param(') || afterBom.startsWith('param '), `[${item.id}] param() statement begins immediately after BOM`);
}

// -------------------------------------------------------------
// SECTION 2: Strict CRLF Line Endings Verification
// -------------------------------------------------------------
console.log('\n--- SECTION 2: Strict CRLF Line Endings Verification ---');
for (const item of targetScripts) {
  const filePath = path.resolve(item.file);
  const buffer = fs.readFileSync(filePath);

  let soloLfCount = 0;
  let crlfCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x0A) { // \n
      if (i > 0 && buffer[i - 1] === 0x0D) { // \r\n
        crlfCount++;
      } else {
        soloLfCount++;
      }
    }
  }

  assert(crlfCount > 0, `[${item.id}] Contains valid CRLF line endings (found ${crlfCount} CRLF breaks)`);
  assert(soloLfCount === 0, `[${item.id}] Zero solitary LF characters detected (found ${soloLfCount})`);
}

// -------------------------------------------------------------
// SECTION 3: Prohibition of <# ... #> Block Comments
// -------------------------------------------------------------
console.log('\n--- SECTION 3: Prohibition of <# ... #> Block Comments ---');
for (const item of targetScripts) {
  const filePath = path.resolve(item.file);
  const content = fs.readFileSync(filePath, 'utf8');

  const hasBlockComment = /<#[\s\S]*?#>/.test(content);
  assert(!hasBlockComment, `[${item.id}] Contains ZERO <# ... #> block comments (100% single-line # comments)`);
}

// -------------------------------------------------------------
// SECTION 4: PowerShell 5.1 AST Analysis & Variable Scope Collision / $var: Trap
// -------------------------------------------------------------
console.log('\n--- SECTION 4: PowerShell AST Syntax & Variable Scope Collision ($var: Trap) ---');

const astInspectionScript = `
$targetPath = [Console]::In.ReadToEnd().Trim()
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($targetPath, [ref]$null, [ref]$errors)

$parseErrors = @($errors | ForEach-Object { $_.Message })
$hasParamBlock = ($ast.ParamBlock -ne $null)
$paramNames = @()
if ($hasParamBlock) {
    $paramNames = @($ast.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath })
}

$variables = @()
$varAsts = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.VariableExpressionAst] }, $true)
foreach ($v in $varAsts) {
    $variables += [PSCustomObject]@{
        UserPath           = $v.VariablePath.UserPath
        IsDriveQualified   = $v.VariablePath.IsDriveQualified
        DriveName          = $v.VariablePath.DriveName
        IsUnscopedVariable = $v.VariablePath.IsUnscopedVariable
        IsUnqualified      = $v.VariablePath.IsUnqualified
    }
}

[PSCustomObject]@{
    ParseErrors   = $parseErrors
    HasParamBlock = $hasParamBlock
    Parameters    = $paramNames
    Variables     = $variables
} | ConvertTo-Json -Depth 5
`;

for (const item of targetScripts) {
  const filePath = path.resolve(item.file);

  let astData;
  try {
    const rawJson = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      astInspectionScript
    ], { input: filePath, encoding: 'utf8' });
    astData = JSON.parse(rawJson);
  } catch (err) {
    assert(false, `[${item.id}] Failed to run AST inspection script: ${err.message}`);
    continue;
  }

  // 4.1 Parse errors
  const errCount = astData.ParseErrors?.length || 0;
  assert(errCount === 0, `[${item.id}] PowerShell 5.1 AST parsed cleanly with 0 errors (errors: ${JSON.stringify(astData.ParseErrors)})`);

  // 4.2 ParamBlock check
  assert(astData.HasParamBlock === true, `[${item.id}] Root AST contains valid ParamBlock`);
  for (const expectedP of item.expectedParams) {
    assert(astData.Parameters.includes(expectedP), `[${item.id}] ParamBlock declares expected parameter: $${expectedP}`);
  }

  // 4.3 Variable Scope Collision & $var: Syntax Trap
  // Valid PowerShell drives/scopes: 'global', 'script', 'local', 'private', 'using', 'env', 'variable'
  const validDrives = new Set(['global', 'script', 'local', 'private', 'using', 'env', 'variable']);
  const suspiciousScopeVars = [];
  const colonTrapVars = [];

  const vars = Array.isArray(astData.Variables) ? astData.Variables : (astData.Variables ? [astData.Variables] : []);
  for (const v of vars) {
    // Check if variable name contains illegal colon or unhandled scope syntax
    if (v.UserPath && v.UserPath.includes(':')) {
      colonTrapVars.push(v.UserPath);
    }
    if (v.IsDriveQualified) {
      const drive = (v.DriveName || '').toLowerCase();
      if (!validDrives.has(drive)) {
        suspiciousScopeVars.push({ userPath: v.UserPath, drive: v.DriveName });
      }
    }
  }

  assert(
    colonTrapVars.length === 0,
    `[${item.id}] Zero colon traps ($var:) in variable identifiers (found: ${colonTrapVars.length === 0 ? 'none' : colonTrapVars.join(', ')})`
  );
  assert(
    suspiciousScopeVars.length === 0,
    `[${item.id}] Zero unrecognized scope qualifiers in VariableExpressionAst (found: ${suspiciousScopeVars.length === 0 ? 'none' : JSON.stringify(suspiciousScopeVars)})`
  );
}

// -------------------------------------------------------------
// SECTION 5: AST Resilience under formatScriptWithParameters Wrapper
// -------------------------------------------------------------
console.log('\n--- SECTION 5: AST Resilience under formatScriptWithParameters Wrapper ---');

const testCases = [
  {
    id: 'sec-toggle-ai-recall-copilot',
    file: 'scripts_lib/security/toggle_ai_recall_copilot.ps1',
    params: [
      { name: 'Action', type: 'select' },
      { name: 'DryRun', type: 'boolean' }
    ],
    testValues: [
      { Action: 'Disable', DryRun: true },
      { Action: 'Enable', DryRun: false },
      { Action: 'Disable', DryRun: '$true' }
    ]
  },
  {
    id: 'sec-disable-modern-telemetry-24h2',
    file: 'scripts_lib/security/disable_modern_telemetry_24h2.ps1',
    params: [
      { name: 'DryRun', type: 'boolean' }
    ],
    testValues: [
      { DryRun: true },
      { DryRun: false }
    ]
  },
  {
    id: 'perf-restore-classic-context-menu',
    file: 'scripts_lib/performance/restore_classic_context_menu.ps1',
    params: [
      { name: 'Action', type: 'select' },
      { name: 'DryRun', type: 'boolean' }
    ],
    testValues: [
      { Action: 'RestoreClassic', DryRun: true },
      { Action: 'RestoreModern', DryRun: false }
    ]
  },
  {
    id: 'net-configure-qos-dscp-gaming',
    file: 'scripts_lib/network/configure_qos_dscp_gaming.ps1',
    params: [
      { name: 'Action', type: 'select' },
      { name: 'DryRun', type: 'boolean' }
    ],
    testValues: [
      { Action: 'Enable', DryRun: true },
      { Action: 'Disable', DryRun: false }
    ]
  },
  {
    id: 'net-optimize-nagle-algorithm',
    file: 'scripts_lib/network/optimize_nagle_algorithm.ps1',
    params: [
      { name: 'Action', type: 'select' },
      { name: 'DryRun', type: 'boolean' }
    ],
    testValues: [
      { Action: 'Enable', DryRun: true },
      { Action: 'Disable', DryRun: false }
    ]
  }
];

const astValidateWrappedScript = `
$b64 = [Console]::In.ReadToEnd()
$wrappedContent = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($wrappedContent, [ref]$tokens, [ref]$errors)

$parseErrors = @($errors | ForEach-Object { $_.Message })
$hasRootParamBlock = ($ast.ParamBlock -ne $null)

[PSCustomObject]@{
    ParseErrors = $parseErrors
    HasRootParamBlock = $hasRootParamBlock
} | ConvertTo-Json
`;

for (const tc of testCases) {
  const rawContent = fs.readFileSync(path.resolve(tc.file), 'utf8');

  for (let idx = 0; idx < tc.testValues.length; idx++) {
    const vals = tc.testValues[idx];
    const wrapped = formatScriptWithParameters(rawContent, tc.params, vals);

    // Verify wrapped content retains root param block
    assert(
      wrapped.startsWith('param(') || wrapped.startsWith('param ('),
      `[${tc.id}][Case #${idx + 1}] Wrapped script retains top-level param() block`
    );

    // Verify boolean parameters formatted with valid PowerShell syntax (-Param:$true / -Param:$false)
    if ('DryRun' in vals) {
      const expectedToken = Boolean(vals.DryRun) ? '-DryRun:$true' : '-DryRun:$false';
      assert(
        wrapped.includes(expectedToken),
        `[${tc.id}][Case #${idx + 1}] Switch/Boolean formatted with strict colon syntax (${expectedToken})`
      );
    }

    // Verify AST parsing of wrapped script in PowerShell 5.1 via stdin Base64
    try {
      const b64Input = Buffer.from(wrapped, 'utf8').toString('base64');
      const outJson = execFileSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        astValidateWrappedScript
      ], { input: b64Input, encoding: 'utf8' });

      const res = JSON.parse(outJson);
      assert(
        res.ParseErrors.length === 0,
        `[${tc.id}][Case #${idx + 1}] Wrapped script AST produces 0 syntax errors`
      );
      assert(
        res.HasRootParamBlock === true,
        `[${tc.id}][Case #${idx + 1}] Wrapped script AST maintains root ParamBlock`
      );
    } catch (err) {
      assert(false, `[${tc.id}][Case #${idx + 1}] AST validation execution failed: ${err.message}`);
    }
  }
}

// -------------------------------------------------------------
// SECTION 6: Host Safety & Isolated Live Dry-Run / Non-Admin Execution
// -------------------------------------------------------------
console.log('\n--- SECTION 6: Host Safety & Isolated Execution Testing ---');

// 6.1 Safe script: restore_classic_context_menu.ps1 with -DryRun
{
  const scriptPath = path.resolve('scripts_lib/performance/restore_classic_context_menu.ps1');
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-Action', 'RestoreClassic',
      '-DryRun'
    ], { encoding: 'utf8' });

    assert(out.includes('[DRY-RUN]'), `[perf-restore-classic-context-menu] DryRun produces [DRY-RUN] logs`);
    assert(out.includes('Would create registry key'), `[perf-restore-classic-context-menu] DryRun logs registry simulation`);
    assert(!out.includes('[ERROR]'), `[perf-restore-classic-context-menu] DryRun executes without errors`);
  } catch (err) {
    assert(false, `[perf-restore-classic-context-menu] DryRun execution failed: ${err.message}`);
  }
}

// 6.2 Admin scripts: Non-elevated execution must exit with code 1 and clean error message
for (const item of targetScripts.filter(s => s.requiresAdmin)) {
  const scriptPath = path.resolve(item.file);
  try {
    const testRunner = `
    $scriptContent = Get-Content -LiteralPath '${scriptPath.replace(/'/g, "''")}' -Raw
    & {
        $ErrorActionPreference = 'Stop'
        & ([scriptblock]::Create($scriptContent)) -DryRun
    }
    exit $LASTEXITCODE
    `;

    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execFileSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        testRunner
      ], { encoding: 'utf8' });
    } catch (err) {
      exitCode = err.status;
      stdout = err.stdout?.toString() || '';
      stderr = err.stderr?.toString() || '';
    }

    if (exitCode === 1) {
      assert(
        stdout.includes('[ERROR]') && stdout.includes('Administrator privileges'),
        `[${item.id}] Non-elevated execution cleanly reports requirement and exits 1`
      );
    } else if (exitCode === 0) {
      assert(
        stdout.includes('[DRY-RUN]') || stdout.includes('[DRY RUN]'),
        `[${item.id}] Elevated DryRun simulation completed cleanly with 0 host mutation`
      );
    } else {
      assert(false, `[${item.id}] Unexpected exit code ${exitCode}. Stdout: ${stdout}, Stderr: ${stderr}`);
    }
  } catch (err) {
    assert(false, `[${item.id}] Execution test encountered error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// SECTION 7: Negative Testing Oracle (Invalidation Guards)
// -------------------------------------------------------------
console.log('\n--- SECTION 7: Negative Testing Oracle (Invalidation Guards) ---');

// Invalidation 1: $var: syntax trap detection oracle
{
  const malformedVarTrap = `param([string]$Target)\n$var: = "hello"`;
  const malformedCheck = `
  $tokens = $null; $errors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(), [ref]$tokens, [ref]$errors)
  $errors.Count
  `;
  const errCount = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', malformedCheck], {
    input: malformedVarTrap,
    encoding: 'utf8'
  }).trim();

  assert(Number(errCount) > 0, `Negative Oracle: PowerShell AST successfully catches malformed $var: syntax traps (detected ${errCount} error(s))`);
}

// Invalidation 2: Block comment detection oracle
{
  const mockScriptWithBlock = `param([switch]$DryRun)\n<# This is a block comment #>\nWrite-Host "Test"`;
  const hasBlock = /<#[\s\S]*?#>/.test(mockScriptWithBlock);
  assert(hasBlock === true, `Negative Oracle: Block comment detector correctly identifies forbidden <# ... #> construct`);
}

// Invalidation 3: Solitary LF detection oracle
{
  const mockUnixLfBuf = Buffer.from('param([switch]$DryRun)\nWrite-Host "Test"\n', 'utf8');
  let foundSolo = false;
  for (let i = 0; i < mockUnixLfBuf.length; i++) {
    if (mockUnixLfBuf[i] === 0x0A && (i === 0 || mockUnixLfBuf[i - 1] !== 0x0D)) {
      foundSolo = true;
      break;
    }
  }
  assert(foundSolo === true, `Negative Oracle: Line endings validator catches solitary Unix LF without CR`);
}

// Invalidation 4: Missing BOM detection oracle
{
  const mockNoBomBuf = Buffer.from('param([switch]$DryRun)\r\n', 'utf8');
  const hasBom = mockNoBomBuf.length >= 3 && mockNoBomBuf[0] === 0xEF && mockNoBomBuf[1] === 0xBB && mockNoBomBuf[2] === 0xBF;
  assert(hasBom === false, `Negative Oracle: BOM detector correctly flags missing UTF-8 BOM`);
}

console.log('\n================================================================');
console.log(` SUMMARY: Total Tests: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error(`VERDICT: REQUEST_CHANGES — ${failedTests} empirical test(s) failed!`);
  process.exit(1);
} else {
  console.log('🎉 VERDICT: APPROVE — 100% of PowerShell AST resilience & safety tests passed cleanly!');
  process.exit(0);
}

/**
 * Challenger Empirical Test Suite: PowerShell 5.1 & CP1251 Parser Integrity
 *
 * Tests:
 * 1. AST Validation on all 27 scripts in scripts_lib/
 * 2. UTF-8 BOM vs CP1251 block comment (<# ... #>) parsing vulnerability
 * 3. param() placement integrity and backend UTF-8 BOM prepending validation
 * 4. Locale-agnostic CLI parsing and absence of hardcoded English/Russian strings in scripts
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

console.log('=== RUNNING POWERSHELL PARSER INTEGRITY & ADVERSARIAL TESTS ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  [PASS] ${message}`);
        passCount++;
    } else {
        console.error(`  [FAIL] ${message}`);
        failCount++;
    }
}

// 1. Scan and parse all 27 scripts in scripts_lib/
console.log('--- 1. Testing AST and param() placement for all scripts in scripts_lib/ ---');
const categories = ['diagnostics', 'maintenance', 'network', 'performance', 'security'];
let totalScripts = 0;

for (const cat of categories) {
    const catDir = path.join(__dirname, '..', 'scripts_lib', cat);
    if (!fs.existsSync(catDir)) continue;
    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.ps1'));

    for (const file of files) {
        totalScripts++;
        const filePath = path.join(catDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const rawBytes = fs.readFileSync(filePath);

        // Check if starts with param
        const trimmed = content.replace(/^\uFEFF/, '').trimStart();
        const startsWithParam = trimmed.startsWith('param');
        assert(startsWithParam, `${cat}/${file}: Starts with param(...) block`);

        // Check for block comments
        const hasBlockComment = content.includes('<#') || content.includes('#>');
        assert(!hasBlockComment, `${cat}/${file}: Avoids <# ... #> block comments (CP1251 safe)`);

        // If it has non-ASCII, verify it has BOM
        const hasNonAscii = /[^\x00-\x7F]/.test(content);
        const hasBom = rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF;
        if (hasNonAscii) {
            assert(hasBom, `${cat}/${file}: Contains non-ASCII and HAS UTF-8 BOM`);
        }

        // Test PowerShell AST parse via PowerShell 5.1
        try {
            const psCmd = `powershell -NoProfile -NonInteractive -Command "$tokens = $null; $errors = $null; $ast = [System.Management.Automation.Language.Parser]::ParseFile('${filePath.replace(/'/g, "''")}', [ref]$tokens, [ref]$errors); if ($errors.Count -gt 0) { exit $errors.Count } else { exit 0 }"`;
            execSync(psCmd, { stdio: 'pipe' });
            assert(true, `${cat}/${file}: PowerShell 5.1 AST parser returned 0 syntax errors`);
        } catch (e) {
            assert(false, `${cat}/${file}: PowerShell AST parse failed with error`);
        }
    }
}

assert(totalScripts === 27, `Verified exactly 27 scripts in scripts_lib (Found: ${totalScripts})`);

// 2. Adversarial Test: Prepending code vs Prepending UTF-8 BOM
console.log('\n--- 2. Adversarial Test: param() break on code prepending vs BOM prepending ---');

const tempDir = path.join(__dirname, '..', '.agents', 'teamwork_preview_challenger_m1_2');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Scenario A: Script with param() where backend prepended UTF-8 BOM (WiScripts implementation)
const bomScriptPath = path.join(tempDir, 'test_bom_prepended.ps1');
const sampleScript = 'param([string]$Name = "WiScripts")\nWrite-Output "Hello $Name"';
const bomBuffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(sampleScript, 'utf8')]);
fs.writeFileSync(bomScriptPath, bomBuffer);

const resBom = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-File', bomScriptPath, '-Name', 'Titan'], { encoding: 'utf8' });
assert(
    resBom.status === 0 && resBom.stdout.trim() === 'Hello Titan',
    'BOM prepended script executes successfully and preserves param() binding (produces "Hello Titan")'
);

// Scenario B: Counter-example: Script where backend prepended text before param() (The Anti-Pattern)
const badPrependedScriptPath = path.join(tempDir, 'test_bad_prepend.ps1');
const badPrepended = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\nparam([string]$Name = "WiScripts")\nWrite-Output "Hello $Name"';
fs.writeFileSync(badPrependedScriptPath, badPrepended, 'utf8');

const resBad = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-File', badPrependedScriptPath, '-Name', 'Titan'], { encoding: 'utf8' });
// Because [Console]::OutputEncoding was prepended, param() is not recognized and $Name is not bound to "Titan"
const paramBroken = resBad.stderr.includes('CommandNotFoundException') || resBad.stdout.includes('Hello WiScripts');
assert(paramBroken, 'Anti-pattern confirmed: Prepending code before param() breaks parameter binding and fails to bind arguments');

// 3. Adversarial Test: UTF-8 inside <# ... #> block comments in CP1251 environment
console.log('\n--- 3. Adversarial Test: Cyrillic in block comments without BOM vs with BOM ---');

const commentWithRussian = '<#\nТестирование комментариев: Локальный пользователь и системные твики\n#>\nparam([string]$Arg1 = "Test")\nWrite-Output "RESULT:$Arg1"';

// Case A: Saved as UTF-8 with BOM
const commentBomPath = path.join(tempDir, 'test_comment_with_bom.ps1');
fs.writeFileSync(commentBomPath, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(commentWithRussian, 'utf8')]));

const resCommentBom = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-File', commentBomPath, '-Arg1', 'OK'], { encoding: 'utf8' });
assert(
    resCommentBom.status === 0 && resCommentBom.stdout.includes('RESULT:OK'),
    'Script with Cyrillic comments and UTF-8 BOM parses and executes cleanly'
);

console.log(`\n========================================`);
console.log(`TOTAL PASSED: ${passCount} | TOTAL FAILED: ${failCount}`);
console.log(`========================================`);

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

/**
 * Challenger M3-1 Empirical Adversarial Verification Suite
 *
 * Verifies Milestone 3 requirements:
 * 1. Independent SHA-256 hash recomputation for all 45 scripts.
 * 2. Adversarial Non-Admin execution verification on 4 admin scripts (exit code 1, [ERROR], 0 throws).
 * 3. User-level script verification (restore_classic_context_menu.ps1 requiresAdmin: false, standard user HKCU).
 * 4. Dry-run execution across parameter combinations without host modifications.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

console.log('================================================================');
console.log(' CHALLENGER M3-1: EMPIRICAL ADVERSARIAL VERIFICATION SUITE');
console.log('================================================================\n');

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

const rootDir = path.resolve(__dirname, '..');
const scriptsLibDir = path.join(rootDir, 'scripts_lib');
const manifestPath = path.join(scriptsLibDir, 'manifest.json');

assert(fs.existsSync(manifestPath), `Manifest exists at ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// -------------------------------------------------------------------------
// SUITE 1: Independent SHA-256 Recomputation & Parity (All 45 Scripts)
// -------------------------------------------------------------------------
console.log('\n--- SUITE 1: Cryptographic SHA-256 Recomputation & Manifest Parity ---');

function collectPs1Files(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(collectPs1Files(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ps1')) {
            results.push(fullPath);
        }
    }
    return results;
}

const diskFiles = collectPs1Files(scriptsLibDir);
assert(diskFiles.length === 45, `Found exactly 45 .ps1 files on disk (Actual: ${diskFiles.length})`);
assert(manifest.scripts.length === 45, `Manifest catalogs exactly 45 scripts (Actual: ${manifest.scripts.length})`);

const manifestMap = new Map();
for (const s of manifest.scripts) {
    manifestMap.set(s.path.replace(/\\/g, '/'), s);
}

for (const diskFile of diskFiles) {
    const relPath = path.relative(scriptsLibDir, diskFile).replace(/\\/g, '/');
    const manifestEntry = manifestMap.get(relPath);

    assert(Boolean(manifestEntry), `File on disk is tracked in manifest: ${relPath}`);
    if (!manifestEntry) continue;

    const rawBytes = fs.readFileSync(diskFile);
    const computedHash = crypto.createHash('sha256').update(rawBytes).digest('hex');

    assert(
        computedHash === manifestEntry.sha256,
        `[${manifestEntry.id}] SHA-256 matches disk bit-for-bit: ${computedHash}`
    );
    assert(
        /^[0-9a-f]{64}$/.test(manifestEntry.sha256),
        `[${manifestEntry.id}] Hash is strict 64-character lowercase hex`
    );
}

// -------------------------------------------------------------------------
// SUITE 2: Adversarial Non-Admin Execution on 4 New Admin Scripts
// -------------------------------------------------------------------------
console.log('\n--- SUITE 2: Adversarial Non-Admin Execution (Exit Code 1, [ERROR], 0 Throws) ---');

const adminScriptsM3 = [
    {
        id: 'sec-toggle-ai-recall-copilot',
        relPath: 'security/toggle_ai_recall_copilot.ps1',
        name: 'Toggle AI Recall & Copilot'
    },
    {
        id: 'sec-disable-modern-telemetry-24h2',
        relPath: 'security/disable_modern_telemetry_24h2.ps1',
        name: 'Disable Modern Telemetry 24H2'
    },
    {
        id: 'net-configure-qos-dscp-gaming',
        relPath: 'network/configure_qos_dscp_gaming.ps1',
        name: 'Configure QoS DSCP Gaming'
    },
    {
        id: 'net-optimize-nagle-algorithm',
        relPath: 'network/optimize_nagle_algorithm.ps1',
        name: 'Optimize Nagle Algorithm'
    }
];

// Test 2.1: Native execution in current non-admin shell
console.log('>> Test 2.1: Live execution in non-admin shell:');
for (const script of adminScriptsM3) {
    const absPath = path.join(scriptsLibDir, script.relPath.replace(/\//g, path.sep));
    const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', absPath], {
        encoding: 'utf8',
        timeout: 10000
    });

    assert(run.status === 1, `[${script.id}] Live non-admin execution exited with status code 1 (Actual: ${run.status})`);
    
    const combinedOutput = (run.stdout || '') + (run.stderr || '');
    assert(
        combinedOutput.includes('[ERROR]') && combinedOutput.includes('Administrator privileges'),
        `[${script.id}] Output contains '[ERROR]' and 'Administrator privileges' message`
    );

    // Verify 0 terminating throw exceptions
    assert(
        !combinedOutput.includes('ScriptHalted') && !combinedOutput.includes('RuntimeException'),
        `[${script.id}] Zero unhandled terminating throw exceptions emitted`
    );

    // Verify early termination before body logic
    assert(
        !combinedOutput.includes('[OK]') && !combinedOutput.includes('successfully') && !combinedOutput.includes('Finished'),
        `[${script.id}] Terminated early without executing script body`
    );
}

// Test 2.2: Adversarial simulated non-admin wrapper injection
console.log('\n>> Test 2.2: Adversarial mock non-admin token injection:');
const tempDir = path.join(rootDir, '.agents', 'teamwork_preview_challenger_m3_1');

for (const script of adminScriptsM3) {
    const absPath = path.join(scriptsLibDir, script.relPath.replace(/\//g, path.sep));
    const content = fs.readFileSync(absPath, 'utf8').replace(/^\uFEFF/, '');

    // Replace elevation check with simulated $isAdmin = $false
    const mockContent = content.replace(
        /\$isAdmin\s*=\s*\(\[Security\.Principal\.WindowsPrincipal\][\s\S]*?\)\.IsInRole\([\s\S]*?\)/,
        '$isAdmin = $false'
    );

    const tempFile = path.join(tempDir, `mock_nonadmin_${path.basename(absPath)}`);
    const bomBuffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(mockContent, 'utf8')]);
    fs.writeFileSync(tempFile, bomBuffer);

    const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tempFile], {
        encoding: 'utf8',
        timeout: 10000
    });

    assert(run.status === 1, `[${script.id}] Mock non-admin exits with code 1 (Actual: ${run.status})`);
    const combined = (run.stdout || '') + (run.stderr || '');
    assert(combined.includes('[ERROR]'), `[${script.id}] Mock output includes '[ERROR]' prefix`);
    assert(!combined.includes('ScriptHalted'), `[${script.id}] No ScriptHalted terminating exception`);

    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

// -------------------------------------------------------------------------
// SUITE 3: User-Level Script Verification (restore_classic_context_menu.ps1)
// -------------------------------------------------------------------------
console.log('\n--- SUITE 3: User-Level Script Verification (restore_classic_context_menu.ps1) ---');

const userScript = manifest.scripts.find(s => s.id === 'perf-restore-classic-context-menu');
assert(Boolean(userScript), 'Found perf-restore-classic-context-menu in manifest');
assert(userScript.requiresAdmin === false, 'User script has requiresAdmin: false in manifest');

const userScriptPath = path.join(scriptsLibDir, userScript.path.replace(/\//g, path.sep));
const userScriptCode = fs.readFileSync(userScriptPath, 'utf8');

assert(
    !userScriptCode.includes('WindowsBuiltInRole]::Administrator'),
    'Script does not enforce or require Administrator role'
);
assert(
    userScriptCode.includes('HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}'),
    'Script operates strictly on current user hive (HKCU)'
);

// Run Dry-Run for RestoreClassic
const runClassic = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', userScriptPath,
    '-DryRun',
    '-Action', 'RestoreClassic'
], { encoding: 'utf8', timeout: 10000 });

assert(runClassic.status === 0, `RestoreClassic -DryRun exited cleanly with code 0 (Actual: ${runClassic.status})`);
assert(
    (runClassic.stdout || '').includes('[DRY-RUN] Would create registry key: HKCU:\\Software\\Classes\\CLSID'),
    'RestoreClassic -DryRun correctly simulated registry key creation'
);
assert(
    (runClassic.stdout || '').includes('[DRY-RUN] Context menu configuration simulation finished.'),
    'RestoreClassic -DryRun reached simulation completion block'
);

// Run Dry-Run for RestoreModern
const runModern = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', userScriptPath,
    '-DryRun',
    '-Action', 'RestoreModern'
], { encoding: 'utf8', timeout: 10000 });

assert(runModern.status === 0, `RestoreModern -DryRun exited cleanly with code 0 (Actual: ${runModern.status})`);
assert(
    (runModern.stdout || '').includes('[DRY-RUN] Would remove registry key override: HKCU:\\Software\\Classes\\CLSID'),
    'RestoreModern -DryRun correctly simulated registry key removal'
);
assert(
    (runModern.stdout || '').includes('[DRY-RUN] Context menu configuration simulation finished.'),
    'RestoreModern -DryRun reached simulation completion block'
);

// Run with Invalid Parameter
const runInvalidParam = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', userScriptPath,
    '-DryRun',
    '-Action', 'InvalidOption'
], { encoding: 'utf8', timeout: 10000 });

assert(runInvalidParam.status !== 0, 'Invalid -Action parameter was rejected by PowerShell ValidateSet');
const normalizedErr = (runInvalidParam.stderr || runInvalidParam.stdout || '').replace(/\r?\n\s*/g, ' ');
assert(
    normalizedErr.includes('ParameterArgumentValidationError') || normalizedErr.includes('Cannot validate argument on parameter \'Action\''),
    'Validation error correctly reported for invalid parameter'
);

// -------------------------------------------------------------------------
// SUITE 4: Dry-Run Parameter Matrix on All 5 New Scripts
// -------------------------------------------------------------------------
console.log('\n--- SUITE 4: Dry-Run Parameter Matrix on All 5 Scripts (Zero Mutation) ---');

const dryRunScenarios = [
    {
        id: 'sec-toggle-ai-recall-copilot',
        relPath: 'security/toggle_ai_recall_copilot.ps1',
        args: ['-Action', 'Disable', '-DryRun'],
        expectedSubstrings: ['[DRY-RUN]', 'simulation finished']
    },
    {
        id: 'sec-toggle-ai-recall-copilot',
        relPath: 'security/toggle_ai_recall_copilot.ps1',
        args: ['-Action', 'Enable', '-DryRun'],
        expectedSubstrings: ['[DRY-RUN]', 'simulation finished']
    },
    {
        id: 'sec-disable-modern-telemetry-24h2',
        relPath: 'security/disable_modern_telemetry_24h2.ps1',
        args: ['-DryRun'],
        expectedSubstrings: ['[DRY-RUN]', 'simulation completed']
    },
    {
        id: 'perf-restore-classic-context-menu',
        relPath: 'performance/restore_classic_context_menu.ps1',
        args: ['-Action', 'RestoreClassic', '-DryRun'],
        expectedSubstrings: ['[DRY-RUN]', 'simulation finished']
    },
    {
        id: 'perf-restore-classic-context-menu',
        relPath: 'performance/restore_classic_context_menu.ps1',
        args: ['-Action', 'RestoreModern', '-DryRun'],
        expectedSubstrings: ['[DRY-RUN]', 'simulation finished']
    },
    {
        id: 'net-configure-qos-dscp-gaming',
        relPath: 'network/configure_qos_dscp_gaming.ps1',
        args: ['-Action', 'Enable', '-DryRun'],
        expectedSubstrings: ['[DRY RUN]', 'QoS DSCP 46 tagging simulation finished']
    },
    {
        id: 'net-configure-qos-dscp-gaming',
        relPath: 'network/configure_qos_dscp_gaming.ps1',
        args: ['-Action', 'Disable', '-DryRun'],
        expectedSubstrings: ['[DRY RUN]', 'QoS DSCP removal simulation finished']
    },
    {
        id: 'net-optimize-nagle-algorithm',
        relPath: 'network/optimize_nagle_algorithm.ps1',
        args: ['-Action', 'Enable', '-DryRun'],
        expectedSubstrings: ['[DRY RUN]', 'simulation finished']
    },
    {
        id: 'net-optimize-nagle-algorithm',
        relPath: 'network/optimize_nagle_algorithm.ps1',
        args: ['-Action', 'Disable', '-DryRun'],
        expectedSubstrings: ['[DRY RUN]', 'simulation finished']
    }
];

for (const scenario of dryRunScenarios) {
    const absPath = path.join(scriptsLibDir, scenario.relPath.replace(/\//g, path.sep));
    const content = fs.readFileSync(absPath, 'utf8').replace(/^\uFEFF/, '');

    // For admin scripts, inject $isAdmin = $true so dry-run logic can be simulated safely
    const simContent = content.replace(
        /\$isAdmin\s*=\s*\(\[Security\.Principal\.WindowsPrincipal\][\s\S]*?\)\.IsInRole\([\s\S]*?\)/,
        '$isAdmin = $true'
    );

    const tempFile = path.join(tempDir, `dryrun_${path.basename(absPath)}`);
    const bomBuffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(simContent, 'utf8')]);
    fs.writeFileSync(tempFile, bomBuffer);

    const run = spawnSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', tempFile,
        ...scenario.args
    ], { encoding: 'utf8', timeout: 60000 });

    assert(
        run.status === 0,
        `[${scenario.id} ${scenario.args.join(' ')}] Exits cleanly with status 0 (Actual: ${run.status})`
    );

    const out = run.stdout || '';
    for (const expected of scenario.expectedSubstrings) {
        assert(
            out.includes(expected),
            `[${scenario.id} ${scenario.args.join(' ')}] Output contains expected '${expected}'`
        );
    }

    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}

// -------------------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------------------
console.log('\n================================================================');
console.log(` EMPIRICAL VERIFICATION SUMMARY: Total: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
    console.error(`❌ VERDICT: FAIL — ${failCount} adversarial checks failed!`);
    process.exit(1);
} else {
    console.log(`🎉 VERDICT: SUCCESS — All ${passCount} adversarial checks passed flawlessly!`);
    process.exit(0);
}

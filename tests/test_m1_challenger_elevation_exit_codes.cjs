/**
 * Challenger Empirical Test Suite: Elevation Exit Codes & Non-Admin Simulation
 *
 * Tests:
 * 1. Simulates non-admin execution across all 24 elevated scripts in scripts_lib/
 * 2. Verifies non-zero exit codes (exitCode === 1) upon elevation failure
 * 3. Verifies descriptive error messages containing "requires Administrator privileges"
 * 4. Verifies early termination (no destructive actions executed when non-admin)
 * 5. Verifies that the 3 non-admin scripts run safely without requiring admin privileges
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('=== RUNNING ELEVATION EXIT CODES & NON-ADMIN SIMULATION TESTS ===\n');

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

const manifest = JSON.parse(fs.readFileSync('scripts_lib/manifest.json', 'utf8'));
const adminScripts = manifest.scripts.filter(s => s.requiresAdmin);
const nonAdminScripts = manifest.scripts.filter(s => !s.requiresAdmin);

console.log(`Found ${adminScripts.length} scripts requiring admin and ${nonAdminScripts.length} non-admin scripts.\n`);
assert(adminScripts.length === 24, 'Exactly 24 scripts require admin privileges');
assert(nonAdminScripts.length === 3, 'Exactly 3 scripts do NOT require admin privileges');

console.log('--- 1. Testing Non-Admin Simulation on All 24 Admin Scripts ---');

for (const script of adminScripts) {
    const scriptPath = path.join('scripts_lib', script.path.split('/').join(path.sep));
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    // Simulate non-admin execution by injecting a mock IsInRole before script body
    // In PowerShell, we can run a wrapper that shadows the elevation check or overrides IsInRole
    // Or we replace the IsInRole line in the script with $isAdmin = $false in a temp file and execute it
    const nonAdminSimulatedContent = scriptContent.replace(
        /\$isAdmin\s*=\s*\(\[Security\.Principal\.WindowsPrincipal\][\s\S]*?\)\.IsInRole\([\s\S]*?\)/,
        '$isAdmin = $false'
    );

    const tempTestFile = path.join('.agents', 'teamwork_preview_challenger_m1_2', `sim_nonadmin_${path.basename(script.path)}`);
    const bomBuffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(nonAdminSimulatedContent, 'utf8')]);
    fs.writeFileSync(tempTestFile, bomBuffer);

    const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-File', tempTestFile], {
        encoding: 'utf8',
        timeout: 10000
    });

    // 1. Exit code must be non-zero (1)
    const exitCode = res.status;
    assert(
        exitCode === 1,
        `${script.id} (${script.path}): Exits with non-zero exit code 1 (Actual: ${exitCode})`
    );

    // 2. Error message must be descriptive
    const output = (res.stderr || '') + (res.stdout || '');
    const hasDescriptiveError = output.includes('requires Administrator privileges') || output.includes('Please run PowerShell as Administrator');
    assert(
        hasDescriptiveError,
        `${script.id}: Output contains descriptive admin requirement error`
    );

    // 3. Early exit verification: should NOT contain success messages or completion headers
    const reachedSuccess = output.includes('successfully') || output.includes('completed successfully') || output.includes('Status=Up');
    assert(
        !reachedSuccess,
        `${script.id}: Execution terminated immediately at elevation guard (did not execute body)`
    );

    // Cleanup temp file
    if (fs.existsSync(tempTestFile)) fs.unlinkSync(tempTestFile);
}

console.log('\n--- 2. Testing 3 Non-Admin Scripts Run Without Admin Checks ---');

for (const script of nonAdminScripts) {
    const scriptPath = path.join('scripts_lib', script.path.split('/').join(path.sep));
    const content = fs.readFileSync(scriptPath, 'utf8');
    const hasAdminCheck = content.includes('IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)');
    assert(
        !hasAdminCheck,
        `${script.id} (${script.path}): Safely marked non-admin and contains no blocking admin check`
    );
}

console.log(`\n========================================`);
console.log(`TOTAL PASSED: ${passCount} | TOTAL FAILED: ${failCount}`);
console.log(`========================================`);

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

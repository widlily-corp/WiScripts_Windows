/**
 * Challenger #1 - Adversarial Stress Test Suite for Milestone 2 (Gen3 Remediation)
 * Focus areas:
 * 1. Queue state calculations with edge cases (N=0, N>0, empty array, null/undefined array, unexpected object properties)
 * 2. Telemetry status badge, color, label, and description mapping under edge cases (null, undefined, invalid strings, mixed casing)
 * 3. i18n key existence and interpolation integrity for all banner & telemetry keys
 * 4. Script runner & dashboard state simulation under extreme boundary conditions
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log(' CHALLENGER #1: ADVERSARIAL STRESS TEST SUITE (MILESTONE 2)');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.log(`  ✗ FAIL: ${name}`);
    console.log(`    Error: ${err.message}`);
    failCount++;
  }
}

// 1. Load Locale files & Components
const rootDir = path.resolve(__dirname, '..');
const en = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/i18n/locales/en.json'), 'utf8'));
const ru = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/i18n/locales/ru.json'), 'utf8'));
const dashboardCode = fs.readFileSync(path.join(rootDir, 'src/components/Dashboard.tsx'), 'utf8');

function getNestedKey(obj, keyPath) {
  return keyPath.split('.').reduce((acc, curr) => (acc && acc[curr] !== undefined ? acc[curr] : undefined), obj);
}

// SECTION 1: Queue State Edge Cases
console.log('--- SECTION 1: Queue State Edge Cases ---');

function computeUnappliedCount(optimizations) {
  if (!Array.isArray(optimizations)) return 0;
  return optimizations.filter((o) => !o || !o.isApplied).length;
}

test('Queue state: N = 0 (empty array)', () => {
  const count = computeUnappliedCount([]);
  assert.strictEqual(count, 0);
  assert.strictEqual(count === 0, true);
});

test('Queue state: N = 0 (all optimizations applied)', () => {
  const opts = [{ isApplied: true }, { isApplied: true }, { isApplied: true }];
  const count = computeUnappliedCount(opts);
  assert.strictEqual(count, 0);
  assert.strictEqual(count === 0, true);
});

test('Queue state: N = 5 (all unapplied)', () => {
  const opts = [
    { isApplied: false },
    { isApplied: false },
    { isApplied: false },
    { isApplied: false },
    { isApplied: false }
  ];
  const count = computeUnappliedCount(opts);
  assert.strictEqual(count, 5);
  assert.strictEqual(count === 0, false);
});

test('Queue state: Mixed applied and unapplied items', () => {
  const opts = [
    { id: '1', isApplied: true },
    { id: '2', isApplied: false },
    { id: '3', isApplied: true },
    { id: '4', isApplied: false }
  ];
  const count = computeUnappliedCount(opts);
  assert.strictEqual(count, 2);
});

test('Queue state: Items with missing or invalid isApplied field', () => {
  const opts = [
    { id: '1', isApplied: undefined },
    { id: '2', isApplied: null },
    { id: '3', isApplied: 0 },
    { id: '4', isApplied: '' },
    { id: '5' }
  ];
  const count = computeUnappliedCount(opts);
  assert.strictEqual(count, 5, 'Items with falsy/missing isApplied must count as unapplied');
});

test('Queue state: null or undefined optimizations input handle gracefully', () => {
  assert.strictEqual(computeUnappliedCount(null), 0);
  assert.strictEqual(computeUnappliedCount(undefined), 0);
});

// SECTION 2: Telemetry Status Dynamic Mapping Stress Testing
console.log('\n--- SECTION 2: Telemetry Status Dynamic Mapping Stress Testing ---');

function resolveTelemetryDetails(systemInfo, enLocale, ruLocale) {
  const telemetryStatus = systemInfo?.telemetryStatus || 'Active';
  const statusLower = telemetryStatus.toLowerCase();

  let telemetryColor = 'text-amber-400';
  let telemetryLabelKey = 'dashboard.telemetryActive';
  let telemetryDescKey = 'dashboard.diagTrackActive';

  if (statusLower === 'disabled') {
    telemetryColor = 'text-emerald-400';
    telemetryLabelKey = 'dashboard.telemetryDisabled';
    telemetryDescKey = 'dashboard.diagTrackDisabled';
  } else if (statusLower === 'minimized') {
    telemetryColor = 'text-cyan-400';
    telemetryLabelKey = 'dashboard.telemetryMinimized';
    telemetryDescKey = 'dashboard.diagTrackMinimized';
  } else if (statusLower === 'blocked') {
    telemetryColor = 'text-red-400';
    telemetryLabelKey = 'dashboard.telemetryStatus.blocked';
    telemetryDescKey = 'dashboard.telemetryStatusDesc.blocked';
  } else if (statusLower === 'unknown') {
    telemetryColor = 'text-text-muted';
    telemetryLabelKey = 'dashboard.telemetryUnknown';
    telemetryDescKey = 'dashboard.diagTrackUnknown';
  }

  const enLabel = getNestedKey(enLocale, telemetryLabelKey);
  const ruLabel = getNestedKey(ruLocale, telemetryLabelKey);
  const enDesc = getNestedKey(enLocale, telemetryDescKey);
  const ruDesc = getNestedKey(ruLocale, telemetryDescKey);

  return { statusLower, telemetryColor, telemetryLabelKey, telemetryDescKey, enLabel, ruLabel, enDesc, ruDesc };
}

test('Telemetry status: "Disabled" / "disabled" / "DISABLED"', () => {
  ['Disabled', 'disabled', 'DISABLED'].forEach((st) => {
    const res = resolveTelemetryDetails({ telemetryStatus: st }, en, ru);
    assert.strictEqual(res.telemetryColor, 'text-emerald-400');
    assert.strictEqual(res.telemetryLabelKey, 'dashboard.telemetryDisabled');
    assert.strictEqual(res.enLabel, 'Disabled');
    assert.strictEqual(res.ruLabel, 'Отключена');
  });
});

test('Telemetry status: "Minimized" / "minimized"', () => {
  const res = resolveTelemetryDetails({ telemetryStatus: 'Minimized' }, en, ru);
  assert.strictEqual(res.telemetryColor, 'text-cyan-400');
  assert.strictEqual(res.telemetryLabelKey, 'dashboard.telemetryMinimized');
  assert.strictEqual(res.enLabel, 'Minimized');
  assert.strictEqual(res.ruLabel, 'Минимизирована');
});

test('Telemetry status: "Active" / "active"', () => {
  const res = resolveTelemetryDetails({ telemetryStatus: 'Active' }, en, ru);
  assert.strictEqual(res.telemetryColor, 'text-amber-400');
  assert.strictEqual(res.telemetryLabelKey, 'dashboard.telemetryActive');
  assert.strictEqual(res.enLabel, 'DiagTrack service active');
  assert.strictEqual(res.ruLabel, 'Служба DiagTrack активна');
});

test('Telemetry status: "Blocked" / "blocked"', () => {
  const res = resolveTelemetryDetails({ telemetryStatus: 'Blocked' }, en, ru);
  assert.strictEqual(res.telemetryColor, 'text-red-400');
  assert.strictEqual(res.telemetryLabelKey, 'dashboard.telemetryStatus.blocked');
  assert.strictEqual(res.telemetryDescKey, 'dashboard.telemetryStatusDesc.blocked');
  assert.strictEqual(res.enLabel, 'Blocked');
  assert.strictEqual(res.ruLabel, 'Заблокирована');
  assert.strictEqual(res.enDesc, 'Telemetry service blocked');
  assert.strictEqual(res.ruDesc, 'Служба телеметрии заблокирована');
});

test('Telemetry status: "Unknown" / "unknown"', () => {
  const res = resolveTelemetryDetails({ telemetryStatus: 'Unknown' }, en, ru);
  assert.strictEqual(res.telemetryColor, 'text-text-muted');
  assert.strictEqual(res.telemetryLabelKey, 'dashboard.telemetryUnknown');
  assert.strictEqual(res.enLabel, 'Unknown');
  assert.strictEqual(res.ruLabel, 'Неизвестно');
});

test('Telemetry status: null systemInfo or null status falls back to Active', () => {
  const res1 = resolveTelemetryDetails(null, en, ru);
  assert.strictEqual(res1.telemetryColor, 'text-amber-400');

  const res2 = resolveTelemetryDetails({ telemetryStatus: null }, en, ru);
  assert.strictEqual(res2.telemetryColor, 'text-amber-400');
});

test('Telemetry status: unrecognized string falls back to default Active state', () => {
  const res = resolveTelemetryDetails({ telemetryStatus: 'Unrecognized_Custom_Status' }, en, ru);
  assert.strictEqual(res.telemetryColor, 'text-amber-400');
  assert.strictEqual(res.telemetryLabelKey, 'dashboard.telemetryActive');
});

// SECTION 3: i18n Interpolation and Parity Checks
console.log('\n--- SECTION 3: i18n Interpolation & Parity Verification ---');

test('Banner i18n string placeholders evaluation', () => {
  const enReady = getNestedKey(en, 'dashboard.readyForOpt');
  const ruReady = getNestedKey(ru, 'dashboard.readyForOpt');
  assert.ok(enReady && enReady.includes('{{count}}'), 'EN readyForOpt missing {{count}}');
  assert.ok(ruReady && ruReady.includes('{{count}}'), 'RU readyForOpt missing {{count}}');

  const enStatusDesc = getNestedKey(en, 'dashboard.statusDesc');
  const ruStatusDesc = getNestedKey(ru, 'dashboard.statusDesc');
  assert.ok(enStatusDesc && enStatusDesc.includes('{{count}}'), 'EN statusDesc missing {{count}}');
  assert.ok(ruStatusDesc && ruStatusDesc.includes('{{count}}'), 'RU statusDesc missing {{count}}');
  assert.ok(enStatusDesc && enStatusDesc.includes('{{build}}'), 'EN statusDesc missing {{build}}');
  assert.ok(ruStatusDesc && ruStatusDesc.includes('{{build}}'), 'RU statusDesc missing {{build}}');
});

test('Banner celebratory i18n string existence', () => {
  const enOpt = getNestedKey(en, 'dashboard.systemFullyOptimized');
  const ruOpt = getNestedKey(ru, 'dashboard.systemFullyOptimized');
  assert.strictEqual(typeof enOpt, 'string');
  assert.strictEqual(typeof ruOpt, 'string');

  const enOptDesc = getNestedKey(en, 'dashboard.systemFullyOptimizedDesc');
  const ruOptDesc = getNestedKey(ru, 'dashboard.systemFullyOptimizedDesc');
  assert.ok(enOptDesc && enOptDesc.includes('{{build}}'));
  assert.ok(ruOptDesc && ruOptDesc.includes('{{build}}'));
});

// SECTION 4: Dashboard Source Code AST / Pattern Verification
console.log('\n--- SECTION 4: Dashboard Source Code Static Analysis ---');

test('Dashboard.tsx includes fetchOptimizationsStatus on mount', () => {
  const hasUseEffect = dashboardCode.includes('useEffect(() => {') && dashboardCode.includes('fetchOptimizationsStatus();');
  assert.ok(hasUseEffect, 'Dashboard.tsx must trigger fetchOptimizationsStatus() in useEffect on mount');
});

test('Dashboard.tsx uses unappliedCount === 0 for isFullyOptimized condition', () => {
  const hasCondition = dashboardCode.includes('const unappliedCount = optimizations.filter((o) => !o.isApplied).length;') &&
                        dashboardCode.includes('const isFullyOptimized = unappliedCount === 0;');
  assert.ok(hasCondition, 'Dashboard.tsx must compute unappliedCount based on !o.isApplied');
});

console.log('\n================================================================');
console.log(` ADVERSARIAL STRESS TEST SUMMARY`);
console.log(` Total Passed: ${passCount}`);
console.log(` Total Failed: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

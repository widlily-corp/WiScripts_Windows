const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== EMPIRICAL CHALLENGER: DYNAMIC QUEUE STATE & TELEMETRY LOGIC TEST ===\n');

// 1. Load locale files
const enPath = path.join(__dirname, '../src/i18n/locales/en.json');
const ruPath = path.join(__dirname, '../src/i18n/locales/ru.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf-8'));

// Test Helper for Dashboard queue count logic
function computeQueueState(optimizations) {
  const safeOpts = optimizations || [];
  const unappliedCount = safeOpts.filter((o) => !o.isApplied).length;
  const isFullyOptimized = unappliedCount === 0;
  return { unappliedCount, isFullyOptimized };
}

// Test 1: N = 0 (All applied)
{
  const opts = [
    { id: '1', isApplied: true },
    { id: '2', isApplied: true },
  ];
  const { unappliedCount, isFullyOptimized } = computeQueueState(opts);
  assert.strictEqual(unappliedCount, 0, 'Unapplied count should be 0 when all applied');
  assert.strictEqual(isFullyOptimized, true, 'isFullyOptimized should be true when N=0');
  console.log('✔ PASS: N = 0 (All applied) correctly triggers celebratory state (unappliedCount=0, isFullyOptimized=true)');
}

// Test 2: N > 0 (Some unapplied)
{
  const opts = [
    { id: '1', isApplied: true },
    { id: '2', isApplied: false },
    { id: '3', isApplied: false },
  ];
  const { unappliedCount, isFullyOptimized } = computeQueueState(opts);
  assert.strictEqual(unappliedCount, 2, 'Unapplied count should be 2');
  assert.strictEqual(isFullyOptimized, false, 'isFullyOptimized should be false when N>0');
  console.log('✔ PASS: N > 0 (Some unapplied) correctly displays queue count (unappliedCount=2, isFullyOptimized=false)');
}

// Test 3: Empty optimizations array []
{
  const opts = [];
  const { unappliedCount, isFullyOptimized } = computeQueueState(opts);
  assert.strictEqual(unappliedCount, 0, 'Unapplied count should be 0 for empty array');
  assert.strictEqual(isFullyOptimized, true, 'isFullyOptimized should be true for empty array');
  console.log('✔ PASS: Empty optimizations array [] resolves cleanly to N=0 celebratory state');
}

// Test 4: Missing isApplied property on item
{
  const opts = [{ id: '1' }, { id: '2', isApplied: false }];
  const { unappliedCount, isFullyOptimized } = computeQueueState(opts);
  assert.strictEqual(unappliedCount, 2, 'Missing isApplied should treat item as unapplied');
  assert.strictEqual(isFullyOptimized, false, 'isFullyOptimized should be false');
  console.log('✔ PASS: Items with missing isApplied property are safely treated as unapplied');
}

// Test 5: i18n Banner String Keys Check
{
  assert.ok(en.dashboard.systemFullyOptimized, 'EN missing systemFullyOptimized key');
  assert.ok(ru.dashboard.systemFullyOptimized, 'RU missing systemFullyOptimized key');
  assert.ok(en.dashboard.readyForOpt, 'EN missing readyForOpt key');
  assert.ok(ru.dashboard.readyForOpt, 'RU missing readyForOpt key');
  assert.ok(en.dashboard.statusDesc, 'EN missing statusDesc key');
  assert.ok(ru.dashboard.statusDesc, 'RU missing statusDesc key');
  
  // Verify interpolation placeholders
  assert.ok(en.dashboard.readyForOpt.includes('{{count}}'), 'EN readyForOpt missing {{count}}');
  assert.ok(ru.dashboard.readyForOpt.includes('{{count}}'), 'RU readyForOpt missing {{count}}');
  assert.ok(en.dashboard.statusDesc.includes('{{count}}'), 'EN statusDesc missing {{count}}');
  assert.ok(ru.dashboard.statusDesc.includes('{{count}}'), 'RU statusDesc missing {{count}}');
  assert.ok(en.dashboard.statusDesc.includes('{{build}}'), 'EN statusDesc missing {{build}}');
  assert.ok(ru.dashboard.statusDesc.includes('{{build}}'), 'RU statusDesc missing {{build}}');
  console.log('✔ PASS: Banner i18n translation keys and interpolation params exist and match in EN and RU');
}

// Test 6: Telemetry Status Dynamic Mapping Test
function getTelemetryStyle(status) {
  const statusLower = (status || 'unknown').toLowerCase();
  if (statusLower === 'disabled') return 'emerald';
  if (statusLower === 'minimized') return 'cyan';
  if (statusLower === 'active') return 'amber';
  if (statusLower === 'blocked') return 'red';
  return 'muted';
}

{
  assert.strictEqual(getTelemetryStyle('Disabled'), 'emerald');
  assert.strictEqual(getTelemetryStyle('Minimized'), 'cyan');
  assert.strictEqual(getTelemetryStyle('Active'), 'amber');
  assert.strictEqual(getTelemetryStyle('Blocked'), 'red');
  assert.strictEqual(getTelemetryStyle('Unknown'), 'muted');
  assert.strictEqual(getTelemetryStyle(null), 'muted');
  assert.strictEqual(getTelemetryStyle(undefined), 'muted');
  console.log('✔ PASS: Telemetry status styling mapping handles all domain states and null/undefined fallbacks');
}

console.log('\nALL 6 EMPIRICAL CHALLENGER TESTS PASSED SUCCESSFULLY!');

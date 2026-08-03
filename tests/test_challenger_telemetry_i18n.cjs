/**
 * Empirical Verification Script for Challenger 2 (Milestone 2)
 * Tests:
 * 1. Telemetry status badge color mappings in Dashboard.tsx ('Disabled', 'Minimized', 'Active', 'Blocked', 'Unknown')
 * 2. i18n key resolution across English (en.json) and Russian (ru.json) locales for all telemetry statuses
 * 3. Consistency between Dashboard.tsx implementation and E2E test harness
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const enPath = path.join(rootDir, 'src', 'i18n', 'locales', 'en.json');
const ruPath = path.join(rootDir, 'src', 'i18n', 'locales', 'ru.json');
const dashboardPath = path.join(rootDir, 'src', 'components', 'Dashboard.tsx');
const harnessPath = path.join(rootDir, 'tests', 'e2e', 'harness.js');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');
const harnessCode = fs.readFileSync(harnessPath, 'utf8');

function getNestedValue(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

console.log('=== EMPIRICAL VERIFICATION: TELEMETRY STATUS BADGE & I18N ===\n');

let passCount = 0;
let failCount = 0;
const findings = [];

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.log(`[FAIL] ${message}`);
    failCount++;
    findings.push(message);
  }
}

// --- TEST SECTION 1: Dashboard.tsx Telemetry Status Mapping Code Inspection ---
console.log('--- SECTION 1: Inspecting Dashboard.tsx Telemetry Logic ---');

const expectedStatuses = ['disabled', 'minimized', 'active', 'blocked', 'unknown'];
for (const status of expectedStatuses) {
  const hasStatusCheck = dashboardCode.includes(`statusLower === '${status}'`) || (status === 'active' && dashboardCode.includes("telemetryStatus || 'Active'"));
  assert(hasStatusCheck, `Dashboard.tsx handles '${status}' status state explicitly`);
}

// Check Dashboard.tsx color classes per status
const statusColorMap = {
  disabled: 'text-emerald-400',
  minimized: 'text-cyan-400',
  active: 'text-amber-400',
  blocked: 'text-red-400',
  unknown: 'text-text-muted',
};

for (const [status, expectedColor] of Object.entries(statusColorMap)) {
  const hasColor = dashboardCode.includes(expectedColor);
  assert(hasColor, `Dashboard.tsx includes expected text color class '${expectedColor}' for '${status}'`);
}

// --- TEST SECTION 2: i18n Key Resolution in en.json and ru.json ---
console.log('\n--- SECTION 2: i18n Telemetry Keys Resolution across en.json & ru.json ---');

const telemetryKeys = [
  'dashboard.telemetryService',
  'dashboard.telemetryDisabled',
  'dashboard.telemetryMinimized',
  'dashboard.telemetryActive',
  'dashboard.telemetryUnknown',
  'dashboard.diagTrackActive',
  'dashboard.diagTrackDisabled',
  'dashboard.diagTrackMinimized',
  'dashboard.diagTrackUnknown',
  'dashboard.telemetryStatus.active',
  'dashboard.telemetryStatus.minimized',
  'dashboard.telemetryStatus.disabled',
  'dashboard.telemetryStatus.unknown',
  'dashboard.telemetryStatusDesc.active',
  'dashboard.telemetryStatusDesc.minimized',
  'dashboard.telemetryStatusDesc.disabled',
  'dashboard.telemetryStatusDesc.unknown',
];

for (const key of telemetryKeys) {
  const enVal = getNestedValue(en, key);
  const ruVal = getNestedValue(ru, key);

  assert(enVal !== undefined, `EN locale has key: '${key}' => "${enVal}"`);
  assert(ruVal !== undefined, `RU locale has key: '${key}' => "${ruVal}"`);
}

// Check for missing 'blocked' key in telemetryStatus and telemetryStatusDesc
console.log('\n--- SECTION 3: Checking Missing Key Anomalies for "Blocked" Status ---');

const blockedLabelInDashboard = dashboardCode.includes("statusLower === 'blocked'");
assert(blockedLabelInDashboard, `Dashboard.tsx handles 'blocked' status case`);

// Check what label & desc keys are used for 'blocked' in Dashboard.tsx
// In Dashboard.tsx:
// else if (statusLower === 'blocked') {
//   telemetryColor = 'text-red-400';
//   TelemetryIcon = AlertTriangle;
//   telemetryLabel = t('dashboard.telemetryUnknown');
//   telemetryDesc = t('dashboard.diagTrackUnknown');
// }
const blockedUsesUnknownLabel = /statusLower\s*===\s*'blocked'[^}]*?telemetryLabel\s*=\s*t\('dashboard\.telemetryUnknown'\)/.test(dashboardCode);
const blockedUsesUnknownDesc = /statusLower\s*===\s*'blocked'[^}]*?telemetryDesc\s*=\s*t\('dashboard\.diagTrackUnknown'\)/.test(dashboardCode);

if (blockedUsesUnknownLabel) {
  assert(false, `[ANOMALY BUG] Dashboard.tsx 'blocked' telemetry status reuses 'dashboard.telemetryUnknown' key ("Unknown" / "Неизвестно") instead of a distinct blocked translation key ('dashboard.telemetryBlocked' or 'dashboard.telemetryStatus.blocked')`);
} else {
  assert(true, `Dashboard.tsx uses proper label key for 'blocked' status`);
}

if (blockedUsesUnknownDesc) {
  assert(false, `[ANOMALY BUG] Dashboard.tsx 'blocked' telemetry status reuses 'dashboard.diagTrackUnknown' key ("Telemetry service status unknown" / "Состояние службы телеметрии неизвестно") instead of a distinct blocked description key`);
} else {
  assert(true, `Dashboard.tsx uses proper description key for 'blocked' status`);
}

// Check if telemetryStatus.blocked exists in en.json / ru.json
const enBlockedKey = getNestedValue(en, 'dashboard.telemetryStatus.blocked');
const ruBlockedKey = getNestedValue(ru, 'dashboard.telemetryStatus.blocked');
assert(enBlockedKey !== undefined, `en.json contains 'dashboard.telemetryStatus.blocked'`);
assert(ruBlockedKey !== undefined, `ru.json contains 'dashboard.telemetryStatus.blocked'`);

// --- TEST SECTION 4: E2E Test Harness Consistency ---
console.log('\n--- SECTION 4: E2E Harness vs Dashboard.tsx Telemetry Color Mappings ---');

// In harness.js:
// Active -> bg-emerald-500
// Disabled -> bg-amber-500
// Blocked -> bg-red-500
// In Dashboard.tsx:
// Active -> text-amber-400
// Disabled -> text-emerald-400
// Blocked -> text-red-400
// Minimized -> text-cyan-400

const harnessActiveIsEmerald = /case\s+'active':[\s\S]*?bg-emerald-500/.test(harnessCode);
const dashboardActiveIsAmber = dashboardCode.includes("telemetryColor = 'text-amber-400'") && dashboardCode.includes("statusLower === 'disabled'");

if (harnessActiveIsEmerald && dashboardActiveIsAmber) {
  assert(false, `[INCONSISTENCY BUG] E2E Harness (harness.js) maps 'Active' status to emerald and 'Disabled' to amber, whereas Dashboard.tsx maps 'Active' status to amber and 'Disabled' to emerald`);
} else {
  assert(true, `E2E Harness and Dashboard.tsx have consistent telemetry status color mappings`);
}

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  console.log('\nDiscovered Findings:');
  findings.forEach((f, i) => console.log(` ${i + 1}. ${f}`));
}

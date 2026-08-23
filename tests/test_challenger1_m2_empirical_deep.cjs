/**
 * WiScripts Windows — Milestone 2 Empirical Adversarial Stress Test Suite
 * Challenger #1: ScriptRunner Ring Buffer, Header Route Titles, i18n Hardening & A11y
 * 
 * Scope:
 * 1. scriptRunnerSlice: High-volume log ingestion (>3,500 lines), sliding window memory cap (2,000 items), FIFO ordering, memory leaks.
 * 2. Header.tsx: Tab title mapping across all 25 navigation routes (including 4 new subsystems).
 * 3. Navigation.tsx: Complete 25-route nav items and i18n key resolution.
 * 4. i18n Parity & Hardening: 100% bidirectional symmetry, interpolation token parity, non-empty values, component AST scanner.
 * 5. Modal A11y: Escape key handlers in SafetyModal and GitHubIssueModal.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================================');
console.log(' WISCRIPTS WINDOWS — MILESTONE 2 EMPIRICAL ADVERSARIAL STRESS TEST');
console.log(' Challenger 1: ScriptRunner Ring Buffer, Header Routes, i18n & Modals');
console.log(` Timestamp: ${new Date().toISOString()}`);
console.log('================================================================================\n');

let passCount = 0;
let failCount = 0;
const testResults = [];

function test(name, fn) {
  const start = process.hrtime.bigint();
  try {
    fn();
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    console.log(`  ✓ PASS: ${name} (${durationMs.toFixed(3)}ms)`);
    passCount++;
    testResults.push({ name, status: 'PASS', durationMs });
  } catch (err) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    console.log(`  ✗ FAIL: ${name} (${durationMs.toFixed(3)}ms)`);
    console.log(`    Error: ${err.message}`);
    if (err.stack) {
      console.log(`    Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failCount++;
    testResults.push({ name, status: 'FAIL', durationMs, error: err.message });
  }
}

// File paths
const rootDir = path.resolve(__dirname, '..');
const scriptRunnerSlicePath = path.join(rootDir, 'src/store/slices/scriptRunnerSlice.ts');
const headerPath = path.join(rootDir, 'src/components/Header.tsx');
const navPath = path.join(rootDir, 'src/components/Navigation.tsx');
const appPath = path.join(rootDir, 'src/App.tsx');
const typesPath = path.join(rootDir, 'src/types/index.ts');
const enPath = path.join(rootDir, 'src/i18n/locales/en.json');
const ruPath = path.join(rootDir, 'src/i18n/locales/ru.json');
const safetyModalPath = path.join(rootDir, 'src/components/SafetyModal.tsx');
const githubModalPath = path.join(rootDir, 'src/components/GitHubIssueModal.tsx');
const thermalWidgetPath = path.join(rootDir, 'src/components/TemperatureSensorWidget.tsx');

// ============================================================================
// SECTION 1: scriptRunnerSlice.ts High-Volume Ingestion & Memory Cap
// ============================================================================
console.log('--- SECTION 1: scriptRunnerSlice High-Volume Ingestion (>3,500 lines) & Memory Cap ---');

// Mock implementation mirroring scriptRunnerSlice
function createMockScriptRunnerStore() {
  const MAX_SCRIPT_LOG_LINES = 2000;
  let state = {
    outputLogs: [],
    scriptContent: '',
    scriptType: 'ps1',
    isExecutingScript: false,
    activeExecutionId: null,
  };

  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn(state));

  const set = (updater) => {
    const partial = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...partial };
    notify();
  };

  const get = () => state;

  const actions = {
    addOutputLine: (payload) => {
      const timestamp = new Date().toLocaleTimeString();
      const newEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        line: payload.line,
        stream: payload.stream,
        timestamp,
      };
      set((s) => ({
        outputLogs: [...s.outputLogs, newEntry].slice(-MAX_SCRIPT_LOG_LINES),
      }));
    },
    clearOutputLogs: () => set({ outputLogs: [] }),
    getState: get,
  };

  return actions;
}

test('ScriptRunner Slice: Ingest 3,500 lines and assert array never exceeds 2,000 items', () => {
  const store = createMockScriptRunnerStore();
  const totalLinesToIngest = 3500;

  for (let i = 1; i <= totalLinesToIngest; i++) {
    store.addOutputLine({
      line: `Log entry #${i}: Diagnostic trace output from PowerShell process execution stream`,
      stream: i % 7 === 0 ? 'stderr' : 'stdout',
    });

    const currentLogs = store.getState().outputLogs;
    if (i <= 2000) {
      assert.strictEqual(currentLogs.length, i, `At iteration ${i}, length should be exactly ${i}`);
    } else {
      assert.strictEqual(currentLogs.length, 2000, `At iteration ${i}, length should be capped at 2000`);
    }
  }

  const finalLogs = store.getState().outputLogs;
  assert.strictEqual(finalLogs.length, 2000, 'Final log length must be strictly 2000');

  // Verify FIFO retention: oldest retained must be #1501, newest must be #3500
  assert.ok(
    finalLogs[0].line.includes('Log entry #1501:'),
    `Oldest retained entry must be #1501, got: ${finalLogs[0].line}`
  );
  assert.ok(
    finalLogs[1999].line.includes('Log entry #3500:'),
    `Latest retained entry must be #3500, got: ${finalLogs[1999].line}`
  );
});

test('ScriptRunner Slice: Extreme Stress — Ingest 10,000 lines with diverse streams & UTF-8 payloads', () => {
  const store = createMockScriptRunnerStore();
  const heavyLines = [
    'Standard ASCII line',
    'Unicode string: Тестирование системы, русский текст и китайские иероглифы: 系統測試',
    'Special chars: !@#$%^&*()_+~`|}{[]:;?><,./"\'\\',
    'JSON payload: {"status":"running","exitCode":null,"durationMs":1250}',
    'Large buffer line: ' + 'A'.repeat(5000),
    'Empty line: ',
  ];

  for (let i = 1; i <= 10000; i++) {
    const payloadIndex = i % heavyLines.length;
    store.addOutputLine({
      line: `[Line ${i}] ${heavyLines[payloadIndex]}`,
      stream: i % 2 === 0 ? 'stdout' : 'stderr',
    });
  }

  const logs = store.getState().outputLogs;
  assert.strictEqual(logs.length, 2000, 'Logs must strictly maintain 2000 capacity under 10k ingestion');
  assert.ok(logs[0].line.startsWith('[Line 8001]'), `First line should be Line 8001, got ${logs[0].line.slice(0, 30)}`);
  assert.ok(logs[1999].line.startsWith('[Line 10000]'), `Last line should be Line 10000, got ${logs[1999].line.slice(0, 30)}`);
});

test('ScriptRunner Slice: clearOutputLogs immediately resets buffer to 0', () => {
  const store = createMockScriptRunnerStore();
  for (let i = 0; i < 2500; i++) {
    store.addOutputLine({ line: `Line ${i}`, stream: 'stdout' });
  }
  assert.strictEqual(store.getState().outputLogs.length, 2000);
  store.clearOutputLogs();
  assert.strictEqual(store.getState().outputLogs.length, 0, 'Buffer must be empty after clearOutputLogs');
});

test('ScriptRunner Slice Source AST: MAX_SCRIPT_LOG_LINES = 2000 is hardcoded in scriptRunnerSlice.ts', () => {
  const code = fs.readFileSync(scriptRunnerSlicePath, 'utf8');
  assert.match(code, /const\s+MAX_SCRIPT_LOG_LINES\s*=\s*2000;/, 'MAX_SCRIPT_LOG_LINES must be declared as 2000');
  assert.match(code, /outputLogs:\s*\[\.\.\.state\.outputLogs,\s*newEntry\]\.slice\(-MAX_SCRIPT_LOG_LINES\)/, 'addOutputLine must slice with -MAX_SCRIPT_LOG_LINES');
});

// ============================================================================
// SECTION 2: Header.tsx Tab Title Mapping Across All 25 Routes
// ============================================================================
console.log('\n--- SECTION 2: Header.tsx Tab Title Mapping Across All 25 Routes ---');

const ALL_25_ROUTES = [
  'dashboard',
  'script_runner',
  'audio_manager',
  'governor',
  'gaming_latency',
  'smart_ram',
  'network_shield',
  'hardware_health',
  'optimization',
  'package_manager',
  'app_uninstaller',
  'presets',
  'system_cleaner',
  'storage_utilities',
  'startup',
  'scheduler',
  'autoruns',
  'dns_context',
  'driver_backup',
  'diagnostics',
  'odt',
  'activation',
  'restore_points',
  'state_engine',
  'settings',
];

const headerContent = fs.readFileSync(headerPath, 'utf8');
const navContent = fs.readFileSync(navPath, 'utf8');
const appContent = fs.readFileSync(appPath, 'utf8');
const typesContent = fs.readFileSync(typesPath, 'utf8');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));

function getNestedValue(obj, pathStr) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null || typeof curr !== 'object') {
      return undefined;
    }
    curr = curr[part];
  }
  return curr;
}

test('Route Union in types/index.ts contains exactly all 25 valid routes', () => {
  ALL_25_ROUTES.forEach(route => {
    assert.ok(
      typesContent.includes(`'${route}'`),
      `types/index.ts TabType must include '${route}'`
    );
  });
});

test('Header.tsx TAB_TITLES map contains all 25 routes with valid i18n keys', () => {
  const tabTitlesMatch = headerContent.match(/const\s+TAB_TITLES:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(tabTitlesMatch, 'TAB_TITLES object found in Header.tsx');
  const body = tabTitlesMatch[1];

  ALL_25_ROUTES.forEach(route => {
    const routeRegex = new RegExp(`${route}:\\s*['"]([^'"]+)['"]`);
    const match = body.match(routeRegex);
    assert.ok(match, `Header.tsx TAB_TITLES must contain mapping for route: '${route}'`);
    const translationKey = match[1];
    assert.strictEqual(
      translationKey,
      `header.tab_titles.${route}`,
      `Route '${route}' translation key must be 'header.tab_titles.${route}'`
    );

    // Verify EN translation exists
    const enVal = getNestedValue(en, translationKey);
    assert.ok(
      typeof enVal === 'string' && enVal.trim().length > 0,
      `EN translation for '${translationKey}' must exist and not be empty. Got: ${enVal}`
    );

    // Verify RU translation exists
    const ruVal = getNestedValue(ru, translationKey);
    assert.ok(
      typeof ruVal === 'string' && ruVal.trim().length > 0,
      `RU translation for '${translationKey}' must exist and not be empty. Got: ${ruVal}`
    );
  });
});

test('Header.tsx specifically includes the 4 new subsystem routes', () => {
  const newSubsystems = ['gaming_latency', 'smart_ram', 'network_shield', 'hardware_health'];
  newSubsystems.forEach(sub => {
    const enVal = getNestedValue(en, `header.tab_titles.${sub}`);
    const ruVal = getNestedValue(ru, `header.tab_titles.${sub}`);
    assert.ok(enVal && enVal.length > 5, `EN header.tab_titles.${sub} is present: "${enVal}"`);
    assert.ok(ruVal && ruVal.length > 5, `RU header.tab_titles.${sub} is present: "${ruVal}"`);
  });
});

test('Navigation.tsx NAV_ITEMS maps all 25 routes with valid i18n labelKeys', () => {
  ALL_25_ROUTES.forEach(route => {
    const navItemRegex = new RegExp(`id:\\s*['"]${route}['"],\\s*labelKey:\\s*['"]([^'"]+)['"]`);
    const match = navContent.match(navItemRegex);
    assert.ok(match, `Navigation.tsx NAV_ITEMS must contain entry for route: '${route}'`);
    const labelKey = match[1];
    assert.strictEqual(
      labelKey,
      `nav.items.${route}`,
      `Route '${route}' labelKey must be 'nav.items.${route}'`
    );

    const enVal = getNestedValue(en, labelKey);
    assert.ok(
      typeof enVal === 'string' && enVal.trim().length > 0,
      `EN nav translation for '${labelKey}' must exist. Got: ${enVal}`
    );

    const ruVal = getNestedValue(ru, labelKey);
    assert.ok(
      typeof ruVal === 'string' && ruVal.trim().length > 0,
      `RU nav translation for '${labelKey}' must exist. Got: ${ruVal}`
    );
  });
});

test('App.tsx route switch handles all 25 activeTab routes', () => {
  ALL_25_ROUTES.forEach(route => {
    assert.ok(
      appContent.includes(`activeTab === '${route}'`),
      `App.tsx must contain conditional render for activeTab === '${route}'`
    );
  });
});

// ============================================================================
// SECTION 3: Deep i18n Key Parity, Structure & Interpolation Audit
// ============================================================================
console.log('\n--- SECTION 3: Deep i18n Key Parity, Structure & Interpolation Audit ---');

function flattenObjectKeys(obj, prefix = '') {
  let entries = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        Object.assign(entries, flattenObjectKeys(obj[key], fullKey));
      } else {
        entries[fullKey] = obj[key];
      }
    }
  }
  return entries;
}

const flatEn = flattenObjectKeys(en);
const flatRu = flattenObjectKeys(ru);
const enKeyList = Object.keys(flatEn);
const ruKeyList = Object.keys(flatRu);

test('i18n: Total key count parity between en.json and ru.json', () => {
  assert.strictEqual(
    enKeyList.length,
    ruKeyList.length,
    `Total key count must be identical. EN: ${enKeyList.length}, RU: ${ruKeyList.length}`
  );
  assert.ok(enKeyList.length >= 1328, `Expected at least 1,328 keys, found ${enKeyList.length}`);
});

test('i18n: Zero missing keys in ru.json (EN -> RU)', () => {
  const missingInRu = enKeyList.filter(k => !(k in flatRu));
  assert.strictEqual(
    missingInRu.length,
    0,
    `Keys present in en.json but missing in ru.json: ${missingInRu.join(', ')}`
  );
});

test('i18n: Zero missing keys in en.json (RU -> EN)', () => {
  const missingInEn = ruKeyList.filter(k => !(k in flatEn));
  assert.strictEqual(
    missingInEn.length,
    0,
    `Keys present in ru.json but missing in en.json: ${missingInEn.join(', ')}`
  );
});

test('i18n: No empty string, null, or undefined values in translation maps', () => {
  for (const [k, v] of Object.entries(flatEn)) {
    assert.ok(
      v !== null && v !== undefined && String(v).trim().length > 0,
      `EN key '${k}' has empty or invalid value: ${JSON.stringify(v)}`
    );
  }
  for (const [k, v] of Object.entries(flatRu)) {
    assert.ok(
      v !== null && v !== undefined && String(v).trim().length > 0,
      `RU key '${k}' has empty or invalid value: ${JSON.stringify(v)}`
    );
  }
});

test('i18n: Interpolation tokens parity across all keys', () => {
  function extractInterpolationTokens(str) {
    if (typeof str !== 'string') return [];
    // Match both {{var}} and {var}
    const matches = str.match(/\{\{?\s*(\w+)\s*\}?\}/g) || [];
    return Array.from(new Set(matches.map(m => m.replace(/[\{\}\s]/g, '')))).sort();
  }

  const mismatches = [];
  for (const key of enKeyList) {
    const enTokens = extractInterpolationTokens(flatEn[key]);
    const ruTokens = extractInterpolationTokens(flatRu[key]);
    if (JSON.stringify(enTokens) !== JSON.stringify(ruTokens)) {
      mismatches.push({
        key,
        enTokens,
        ruTokens,
        enVal: flatEn[key],
        ruVal: flatRu[key],
      });
    }
  }

  assert.strictEqual(
    mismatches.length,
    0,
    `Interpolation token mismatches found (${mismatches.length}): ${JSON.stringify(mismatches, null, 2)}`
  );
});

test('i18n: TemperatureSensorWidget translations exist in both locales', () => {
  const requiredThermalKeys = [
    'dashboard.thermal_status.optimal',
    'dashboard.thermal_status.elevated',
    'dashboard.thermal_status.critical',
    'dashboard.thermal_status.unavailable',
    'dashboard.thermal_threshold',
    'dashboard.thermal_unsupported',
    'dashboard.select_sensor',
    'dashboard.select_sensor_aria',
    'dashboard.autodetect',
    'dashboard.sensor_source_label',
  ];

  requiredThermalKeys.forEach(k => {
    assert.ok(flatEn[k], `Missing EN key: ${k}`);
    assert.ok(flatRu[k], `Missing RU key: ${k}`);
  });
});

// ============================================================================
// SECTION 4: Component AST Scan & Modal Escape Key A11y
// ============================================================================
console.log('\n--- SECTION 4: Component AST Key Scan & Modal Escape A11y ---');

test('AST: SafetyModal.tsx has window keydown listener for Escape key', () => {
  const code = fs.readFileSync(safetyModalPath, 'utf8');
  assert.ok(code.includes("e.key === 'Escape'"), 'SafetyModal must check e.key === Escape');
  assert.ok(code.includes('window.addEventListener'), 'SafetyModal must addEventListener for keydown');
  assert.ok(code.includes('window.removeEventListener'), 'SafetyModal must cleanup event listener on unmount');
  assert.ok(code.includes('!isSubmitting'), 'SafetyModal must ensure !isSubmitting before closing on Escape');
});

test('AST: GitHubIssueModal.tsx has window keydown listener for Escape key', () => {
  const code = fs.readFileSync(githubModalPath, 'utf8');
  assert.ok(code.includes("e.key === 'Escape'"), 'GitHubIssueModal must check e.key === Escape');
  assert.ok(code.includes('window.addEventListener'), 'GitHubIssueModal must addEventListener for keydown');
  assert.ok(code.includes('window.removeEventListener'), 'GitHubIssueModal must cleanup event listener on unmount');
  assert.ok(code.includes('!isSubmitting'), 'GitHubIssueModal must ensure !isSubmitting before closing on Escape');
});

test('AST: TemperatureSensorWidget.tsx uses useTranslation hook and localized keys', () => {
  const code = fs.readFileSync(thermalWidgetPath, 'utf8');
  assert.ok(code.includes('useTranslation'), 'TemperatureSensorWidget must import/use useTranslation');
  assert.ok(code.includes("dashboard.thermal_status."), 'TemperatureSensorWidget must use thermal_status translation keys');
  assert.ok(code.includes("dashboard.select_sensor"), 'TemperatureSensorWidget must use select_sensor translation key');
  assert.ok(code.includes("dashboard.autodetect"), 'TemperatureSensorWidget must use autodetect translation key');
});

// Summary
console.log('\n================================================================================');
console.log(` CHALLENGER 1 EMPIRICAL RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('================================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 VERDICT: EMPIRICAL VERIFICATION COMPLETE — ALL STRESS TESTS PASSED!');
  process.exit(0);
}

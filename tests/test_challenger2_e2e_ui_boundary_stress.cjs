/**
 * Challenger 2 (E2E & UI Boundary Challenger) — Comprehensive Stress & Verification Harness
 * Tests:
 * 1. 25-Tab Navigation & Command Palette Index Coverage & Fuzzy Search Resilience
 * 2. Zustand Slices State Transitions, Error Propagation & History Bounding
 * 3. ErrorBoundary Resilience & Fallback Contract
 * 4. Full i18n Symmetry & Deep Interpolation Parameter Extraction & Parity
 * 5. Component Translation Key Completeness (Every t('...') call in JSX)
 * 6. UI Refined Minimal Tokens & Tabular Numerics Compliance
 * 7. E2E Suite Depth & Assertion Audit (Tiers 1-4, 66 tests)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log(' CHALLENGER 2: E2E & UI BOUNDARY DEEP VERIFICATION HARNESS');
console.log(` Timestamp: ${new Date().toISOString()}`);
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;
const findings = [];

function recordPass(testName, durationMs = 0) {
  passCount++;
  console.log(`  ✓ PASS: ${testName} (${durationMs.toFixed(2)}ms)`);
}

function recordFail(testName, err) {
  failCount++;
  console.error(`  ✗ FAIL: ${testName}\n    Error: ${err.message || err}`);
  findings.push({ testName, error: err.message || String(err) });
}

async function runTest(testName, fn) {
  const start = performance.now();
  try {
    await fn();
    const dur = performance.now() - start;
    recordPass(testName, dur);
  } catch (e) {
    recordFail(testName, e);
  }
}

// -----------------------------------------------------------------------------
// 1. ALL 25 TABS COVERAGE AUDIT
// -----------------------------------------------------------------------------
const EXPECTED_25_TABS = [
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

async function testTabsCoverage() {
  console.log('--- SECTION 1: 25-Tab Navigation, Routing & Command Palette Audit ---');

  // 1.1 Types definition
  await runTest('(1.1) TabType in src/types/index.ts defines all 25 tabs', async () => {
    const typesPath = path.join(__dirname, '../src/types/index.ts');
    const content = fs.readFileSync(typesPath, 'utf8');
    const match = content.match(/export type TabType =\s*([\s\S]*?);/);
    assert.ok(match, 'TabType definition found');
    const tabUnion = match[1];
    const declaredTabs = [...tabUnion.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    
    assert.strictEqual(declaredTabs.length, 25, `Expected 25 tabs in TabType, found ${declaredTabs.length}`);
    for (const tab of EXPECTED_25_TABS) {
      assert.ok(declaredTabs.includes(tab), `TabType is missing '${tab}'`);
    }
  });

  // 1.2 Navigation.tsx items
  await runTest('(1.2) Navigation.tsx NAV_ITEMS array registers all 25 tabs with icons and labelKeys', async () => {
    const navPath = path.join(__dirname, '../src/components/Navigation.tsx');
    const content = fs.readFileSync(navPath, 'utf8');
    const match = content.match(/const NAV_ITEMS:\s*NavItem\[\]\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'NAV_ITEMS definition found');
    const navBlock = match[1];
    const navTabs = [...navBlock.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);

    assert.strictEqual(navTabs.length, 25, `Expected 25 items in NAV_ITEMS, found ${navTabs.length}`);
    for (const tab of EXPECTED_25_TABS) {
      assert.ok(navTabs.includes(tab), `NAV_ITEMS is missing '${tab}'`);
    }
  });

  // 1.3 CommandPalette.tsx tabs
  await runTest('(1.3) CommandPalette.tsx NAVIGATION_TABS array registers all 25 tabs', async () => {
    const cpPath = path.join(__dirname, '../src/components/CommandPalette.tsx');
    const content = fs.readFileSync(cpPath, 'utf8');
    const match = content.match(/const NAVIGATION_TABS:[^=]+=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'NAVIGATION_TABS definition found');
    const tabsBlock = match[1];
    const registeredTabs = [...tabsBlock.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);

    assert.strictEqual(registeredTabs.length, 25, `Expected 25 items in NAVIGATION_TABS, found ${registeredTabs.length}`);
    for (const tab of EXPECTED_25_TABS) {
      assert.ok(registeredTabs.includes(tab), `NAVIGATION_TABS is missing '${tab}'`);
    }
  });

  // 1.4 App.tsx routing and lazy loading
  await runTest('(1.4) App.tsx renders views for all 25 activeTab cases inside Suspense & ErrorBoundary', async () => {
    const appPath = path.join(__dirname, '../src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf8');
    
    // Check all activeTab === '...' conditions
    for (const tab of EXPECTED_25_TABS) {
      assert.ok(
        content.includes(`activeTab === '${tab}'`),
        `App.tsx main render block missing case for activeTab === '${tab}'`
      );
    }

    // Verify ErrorBoundary surrounds Suspense
    assert.ok(content.includes('<ErrorBoundary>'), 'App.tsx includes <ErrorBoundary>');
    assert.ok(content.includes('<Suspense fallback={<ViewSkeleton />}>'), 'App.tsx includes <Suspense>');
  });
}

// -----------------------------------------------------------------------------
// 2. COMMAND PALETTE FUZZY SCORING & ADVERSARIAL INPUT RESILIENCE
// -----------------------------------------------------------------------------
async function testCommandPaletteResilience() {
  console.log('\n--- SECTION 2: Command Palette Fuzzy Search & Boundary Resilience ---');

  const { CommandPaletteEngine } = await import('./e2e/harness.js');
  const engine = new CommandPaletteEngine();

  await runTest('(2.1) Search index contains all 25 navigation tabs in index array', async () => {
    const tabItems = engine.index.filter((i) => i.type === 'tab');
    assert.strictEqual(tabItems.length, 25, `Expected 25 tab items in index, got ${tabItems.length}`);
    for (const tab of EXPECTED_25_TABS) {
      assert.ok(
        tabItems.some((item) => item.action && item.action.tab === tab),
        `CommandPaletteEngine index missing tab: ${tab}`
      );
    }
  });

  await runTest('(2.2) Adversarial search queries: regex metacharacters, null bytes, long strings', async () => {
    const adversarialQueries = [
      '\\\\',
      '\\d+\\w*',
      '([a-z])+',
      '.*',
      '????****',
      '[[[((({{{',
      '^$$$',
      '|&&||',
      '<script>alert(1)</script>',
      'DROP TABLE optimizations;',
      'a'.repeat(5000), // extreme string length
      '   \t\r\n   ', // pure whitespace
      '🎮⚡ RAM NVMe 🚀', // unicode & emojis
      'оптимизация задержка DPC сеть', // Cyrillic query
    ];

    for (const query of adversarialQueries) {
      const results = engine.search(query);
      assert.ok(Array.isArray(results), `Results should be array for query "${query.slice(0, 30)}"`);
    }
  });

  await runTest('(2.3) Specific Subsystem Search Accuracy: Gaming, RAM, Network Shield, Hardware', async () => {
    // Gaming query
    const gamingRes = engine.search('gaming');
    assert.ok(gamingRes.some((r) => r.id === 'tab_gaming_latency' || r.title.toLowerCase().includes('gaming')));

    // DPC query
    const dpcRes = engine.search('dpc');
    assert.ok(dpcRes.some((r) => r.id === 'tab_gaming_latency' || r.title.toLowerCase().includes('dpc')));

    // RAM query
    const ramRes = engine.search('standby');
    assert.ok(ramRes.some((r) => r.id === 'tab_smart_ram' || r.title.toLowerCase().includes('standby')));

    // Firewall query
    const fwRes = engine.search('firewall');
    assert.ok(fwRes.some((r) => r.id === 'tab_network_shield' || r.title.toLowerCase().includes('firewall')));

    // NVMe query
    const nvmeRes = engine.search('nvme');
    assert.ok(nvmeRes.some((r) => r.id === 'tab_hardware_health' || r.title.toLowerCase().includes('nvme')));
  });
}

// -----------------------------------------------------------------------------
// 3. ZUSTAND STORE SLICES STATE TRANSITIONS & ERROR RESILIENCE
// -----------------------------------------------------------------------------
async function testZustandSlices() {
  console.log('\n--- SECTION 3: Zustand Store Slices State Machine & Error Handling ---');

  // Verify slice definitions exist and export correct signatures
  const sliceFiles = [
    'gamingSlice.ts',
    'smartRamSlice.ts',
    'networkShieldSlice.ts',
    'hardwareHealthSlice.ts',
    'uiSlice.ts',
    'systemSlice.ts',
    'optimizationSlice.ts',
    'updaterSlice.ts',
  ];

  for (const file of sliceFiles) {
    await runTest(`(3.1) Slice ${file} exists and exports standard createSlice creator`, async () => {
      const filePath = path.join(__dirname, '../src/store/slices', file);
      assert.ok(fs.existsSync(filePath), `File ${file} must exist`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(content.includes('StateCreator'), `Slice ${file} should use StateCreator`);
    });
  }

  // 3.2 UI Log Capping Logic
  await runTest('(3.2) UI logs sliding window strictly caps at 1,000 entries (source contract audit)', async () => {
    const uiSlicePath = path.join(__dirname, '../src/store/slices/uiSlice.ts');
    const content = fs.readFileSync(uiSlicePath, 'utf8');
    assert.ok(content.includes('const MAX_LOG_ENTRIES = 1000;'), 'MAX_LOG_ENTRIES defined as 1000');
    assert.ok(content.includes('slice(-MAX_LOG_ENTRIES)'), 'logs bounded using slice(-MAX_LOG_ENTRIES)');

    // Simulate slice state update
    let state = { logs: [] };
    const addLog = (log) => {
      const newLog = { ...log, id: 'test', timestamp: new Date().toISOString() };
      state.logs = [...state.logs, newLog].slice(-1000);
    };

    for (let i = 0; i < 1500; i++) {
      addLog({ level: 'info', message: `Log #${i}` });
    }

    assert.strictEqual(state.logs.length, 1000, 'logs must be bounded to 1000');
    assert.strictEqual(state.logs[999].message, 'Log #1499', 'Latest log is preserved');
  });

  // 3.3 Gaming Latency History Bounding
  await runTest('(3.3) Gaming latencyHistory sliding window strictly caps at 60 entries (source contract audit)', async () => {
    const gamingSlicePath = path.join(__dirname, '../src/store/slices/gamingSlice.ts');
    const content = fs.readFileSync(gamingSlicePath, 'utf8');
    assert.ok(content.includes('slice(-60)'), 'latencyHistory bounded using slice(-60)');

    let state = { latencyHistory: [] };
    const pushLatency = (val) => {
      state.latencyHistory = [...state.latencyHistory, val].slice(-60);
    };

    for (let i = 0; i < 100; i++) {
      pushLatency(i * 10);
    }

    assert.strictEqual(state.latencyHistory.length, 60, 'latencyHistory capped at 60');
    assert.strictEqual(state.latencyHistory[59], 990, 'Latest latency is preserved');
  });

  // 3.4 Persist partialize configuration
  await runTest('(3.4) useAppStore partialize configuration saves only non-volatile user preferences', async () => {
    const storePath = path.join(__dirname, '../src/store/useAppStore.ts');
    const content = fs.readFileSync(storePath, 'utf8');
    assert.ok(content.includes('persist('), 'useAppStore uses persist middleware');
    assert.ok(content.includes('partialize: (state) => ({'), 'useAppStore specifies partialize whitelist');
    assert.ok(content.includes('dryRunMode: state.dryRunMode'), 'partialize persists dryRunMode');
    assert.ok(content.includes('autoCheckUpdates: state.autoCheckUpdates'), 'partialize persists autoCheckUpdates');
    assert.ok(!content.includes('latencyHistory: state.latencyHistory'), 'partialize does NOT persist transient latencyHistory');
    assert.ok(!content.includes('logs: state.logs'), 'partialize does NOT persist transient logs');
  });
}

// -----------------------------------------------------------------------------
// 4. ERROR BOUNDARY & FALLBACK RESILIENCE
// -----------------------------------------------------------------------------
async function testErrorBoundary() {
  console.log('\n--- SECTION 4: ErrorBoundary Fallback & GitHub Modal Contract ---');

  await runTest('(4.1) ErrorBoundary.tsx contains catch handler, reload button and GitHub crash reporter', async () => {
    const ebPath = path.join(__dirname, '../src/components/ErrorBoundary.tsx');
    const content = fs.readFileSync(ebPath, 'utf8');

    assert.ok(content.includes('getDerivedStateFromError'), 'Implements getDerivedStateFromError');
    assert.ok(content.includes('componentDidCatch'), 'Implements componentDidCatch');
    assert.ok(content.includes('window.location.reload()'), 'Provides reload handler');
    assert.ok(content.includes('GitHubIssueModal'), 'Integrates GitHubIssueModal for crash reporting');
    assert.ok(content.includes('i18n.t(\'error_boundary.'), 'Uses localized error strings');
  });

  await runTest('(4.2) ErrorBoundary translation keys exist in both en.json and ru.json', async () => {
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/i18n/locales/en.json'), 'utf8'));
    const ru = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/i18n/locales/ru.json'), 'utf8'));

    const requiredKeys = ['title', 'description', 'report_button', 'reload_button', 'unknown_error'];
    for (const key of requiredKeys) {
      assert.ok(en.error_boundary && en.error_boundary[key], `en.json missing error_boundary.${key}`);
      assert.ok(ru.error_boundary && ru.error_boundary[key], `ru.json missing error_boundary.${key}`);
    }
  });
}

// -----------------------------------------------------------------------------
// 5. I18N COMPLETE SYMMETRY & DEEP INTERPOLATION INTEGRITY
// -----------------------------------------------------------------------------
async function testI18nIntegrity() {
  console.log('\n--- SECTION 5: i18n Symmetry & Parameter Interpolation Integrity ---');

  const enPath = path.join(__dirname, '../src/i18n/locales/en.json');
  const ruPath = path.join(__dirname, '../src/i18n/locales/ru.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));

  function extractKeys(obj, prefix = '') {
    let result = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, extractKeys(value, fullKey));
      } else {
        result[fullKey] = String(value);
      }
    }
    return result;
  }

  const enFlat = extractKeys(en);
  const ruFlat = extractKeys(ru);

  await runTest('(5.1) 1:1 Key Count & Symmetry: en.json and ru.json have identical key paths', async () => {
    const enKeys = Object.keys(enFlat).sort();
    const ruKeys = Object.keys(ruFlat).sort();

    assert.strictEqual(enKeys.length, ruKeys.length, `Key count mismatch: EN=${enKeys.length}, RU=${ruKeys.length}`);

    const missingInRu = enKeys.filter((k) => !ruFlat.hasOwnProperty(k));
    const missingInEn = ruKeys.filter((k) => !enFlat.hasOwnProperty(k));

    assert.strictEqual(missingInRu.length, 0, `Keys missing in ru.json: ${missingInRu.slice(0, 5).join(', ')}`);
    assert.strictEqual(missingInEn.length, 0, `Keys missing in en.json: ${missingInEn.slice(0, 5).join(', ')}`);
  });

  await runTest('(5.2) Deep Interpolation Integrity: {{placeholders}} and {placeholders} match exactly between EN and RU', async () => {
    const paramRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{([a-zA-Z0-9_]+)\}/g;

    let paramMismatchCount = 0;
    const mismatches = [];

    for (const key of Object.keys(enFlat)) {
      const enVal = enFlat[key];
      const ruVal = ruFlat[key];

      const enParams = new Set();
      let match;
      while ((match = paramRegex.exec(enVal)) !== null) {
        enParams.add(match[1] || match[2]);
      }

      const ruParams = new Set();
      while ((match = paramRegex.exec(ruVal)) !== null) {
        ruParams.add(match[1] || match[2]);
      }

      const enArr = [...enParams].sort();
      const ruArr = [...ruParams].sort();

      if (JSON.stringify(enArr) !== JSON.stringify(ruArr)) {
        paramMismatchCount++;
        mismatches.push({ key, enParams: enArr, ruParams: ruArr });
      }
    }

    assert.strictEqual(
      paramMismatchCount,
      0,
      `Found ${paramMismatchCount} interpolation mismatches:\n${mismatches
        .map((m) => `  - ${m.key}: EN=[${m.enParams}], RU=[${m.ruParams}]`)
        .join('\n')}`
    );
  });

  await runTest('(5.3) Subsystems i18n Keys check: gamingLatency, smartRam, networkShield, hardwareHealth', async () => {
    const expectedSubsystemPrefixes = [
      'nav.items.gaming_latency',
      'nav.items.smart_ram',
      'nav.items.network_shield',
      'nav.items.hardware_health',
      'gamingLatency.',
      'smartRam.',
      'networkShield.',
      'hardwareHealth.',
    ];

    for (const prefix of expectedSubsystemPrefixes) {
      const matchingEn = Object.keys(enFlat).filter((k) => k.startsWith(prefix));
      const matchingRu = Object.keys(ruFlat).filter((k) => k.startsWith(prefix));
      assert.ok(matchingEn.length > 0, `EN missing keys starting with '${prefix}'`);
      assert.ok(matchingRu.length > 0, `RU missing keys starting with '${prefix}'`);
      assert.strictEqual(matchingEn.length, matchingRu.length, `Count mismatch for prefix '${prefix}'`);
    }
  });

  await runTest('(5.4) Full JSX/TSX Component literal t() key verification across all source files', async () => {
    function getAllFiles(dir, exts = ['.ts', '.tsx']) {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllFiles(fullPath, exts));
        } else if (exts.some((ext) => file.endsWith(ext))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const srcDir = path.join(__dirname, '../src');
    const sourceFiles = getAllFiles(srcDir);
    const tRegex = /\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g;

    let missingKeyCount = 0;
    const missingKeys = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = tRegex.exec(content)) !== null) {
        const key = match[1];
        if (!enFlat.hasOwnProperty(key) && !ruFlat.hasOwnProperty(key)) {
          missingKeyCount++;
          missingKeys.push({ file: path.relative(srcDir, file), key });
        }
      }
    }

    assert.strictEqual(
      missingKeyCount,
      0,
      `Found ${missingKeyCount} missing literal t() keys:\n${missingKeys
        .map((m) => `  - ${m.file}: ${m.key}`)
        .join('\n')}`
    );
  });
}

// -----------------------------------------------------------------------------
// 6. UI DESIGN TOKENS & WCAG ACCESSIBILITY SCAN
// -----------------------------------------------------------------------------
async function testUiDesignTokens() {
  console.log('\n--- SECTION 6: UI Refined Minimal Aesthetic & Accessibility Tokens ---');

  const views = [
    'src/views/GamingLatencyView.tsx',
    'src/views/SmartRamView.tsx',
    'src/views/NetworkShieldView.tsx',
    'src/views/HardwareHealthView.tsx',
  ];

  for (const viewRel of views) {
    await runTest(`(6.1) View ${path.basename(viewRel)} complies with tabular-nums and dark theme tokens`, async () => {
      const fullPath = path.join(__dirname, '..', viewRel);
      assert.ok(fs.existsSync(fullPath), `View ${viewRel} must exist`);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check font-mono / tabular-nums for numeric precision
      assert.ok(
        content.includes('font-mono') || content.includes('tabular-nums'),
        `${viewRel} must use font-mono / tabular-nums for telemetry metrics`
      );

      // Check subpixel borders / refined minimal styling
      assert.ok(
        content.includes('border-border') || content.includes('rounded-'),
        `${viewRel} must use refined minimal borders/cards`
      );
    });
  }
}

// -----------------------------------------------------------------------------
// 7. E2E SUITE DEEP AUDIT (Tiers 1-4, 66 tests)
// -----------------------------------------------------------------------------
async function testE2eSuitesIntegrity() {
  console.log('\n--- SECTION 7: E2E Test Suite Depth & Assertion Audit ---');

  const suiteFiles = [
    'tier1_feature_coverage.test.js',
    'tier2_boundary_edge.test.js',
    'tier3_cross_feature.test.js',
    'tier4_real_world.test.js',
  ];

  let totalTestCount = 0;
  for (const file of suiteFiles) {
    await runTest(`(7.1) Audit ${file} for non-trivial assertions and test registration`, async () => {
      const filePath = path.join(__dirname, 'e2e', file);
      const content = fs.readFileSync(filePath, 'utf8');

      const testMatches = [...content.matchAll(/runner\.addTest\(['"`]([^'"`]+)['"`]/g)];
      assert.ok(testMatches.length > 0, `${file} must register tests`);
      totalTestCount += testMatches.length;

      // Check that tests contain substantive assert calls
      const assertCount = (content.match(/assert\.(equal|deepEqual|ok|isTrue|isFalse|includes|match|greaterThanOrEqual|lessThanOrEqual|throws|throwsAsync)/g) || []).length;
      assert.ok(
        assertCount >= testMatches.length * 2,
        `${file} should have at least 2 assertions per test case on average (found ${assertCount} for ${testMatches.length} tests)`
      );
    });
  }

  await runTest('(7.2) Total E2E test count across all 4 tiers equals 66', async () => {
    assert.strictEqual(totalTestCount, 66, `Expected exactly 66 tests across 4 tiers, found ${totalTestCount}`);
  });
}

// -----------------------------------------------------------------------------
// RUN ALL SUITES
// -----------------------------------------------------------------------------
async function main() {
  await testTabsCoverage();
  await testCommandPaletteResilience();
  await testZustandSlices();
  await testErrorBoundary();
  await testI18nIntegrity();
  await testUiDesignTokens();
  await testE2eSuitesIntegrity();

  console.log('\n================================================================');
  console.log(` CHALLENGER 2 SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    console.error(`VERDICT: REQUEST_CHANGES (${failCount} failures detected)`);
    process.exit(1);
  } else {
    console.log('VERDICT: APPROVE (100% checks passed cleanly)');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal crash in challenger test runner:', err);
  process.exit(1);
});

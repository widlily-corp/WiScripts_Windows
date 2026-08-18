/**
 * Adversarial Challenger Test Suite: Milestone 3 (Frontend Architecture & Bundle Optimization)
 * 
 * Verifies:
 * 1. 21/21 Views lazy loading import contract & named export consistency
 * 2. Vite bundle chunking, vendor chunk separation, and entry point gzip size < 150KB
 * 3. 1:1 Navigation Tab to App.tsx Suspense route mapping completeness
 * 4. ViewSkeleton a11y, layout structure, and reduced motion styling
 * 5. useTauriCommand memoization, stable callbacks, and getState() isolation
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ts = require('typescript');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_ASSETS = path.join(PROJECT_ROOT, 'dist', 'assets');

let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedChecks++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedChecks++;
  }
}

console.log('================================================================');
console.log(' CHALLENGER 2: M3 FRONTEND ARCHITECTURE & BUNDLE OPTIMIZATION');
console.log('================================================================\n');

// -------------------------------------------------------------
// Suite 1: 21 Modular Views Lazy Import Contract Verification
// -------------------------------------------------------------
console.log('==================================================');
console.log(' Suite 1: 21 Modular Views Lazy Export Contracts');
console.log('==================================================');

const EXPECTED_VIEWS = [
  { tab: 'dashboard', name: 'Dashboard', file: 'src/components/Dashboard.tsx' },
  { tab: 'script_runner', name: 'ScriptRunnerView', file: 'src/components/ScriptRunnerView.tsx' },
  { tab: 'audio_manager', name: 'AudioView', file: 'src/components/AudioView.tsx' },
  { tab: 'governor', name: 'GovernorView', file: 'src/views/GovernorView.tsx' },
  { tab: 'optimization', name: 'OptimizationView', file: 'src/components/OptimizationView.tsx' },
  { tab: 'package_manager', name: 'PackageManagerView', file: 'src/components/PackageManagerView.tsx' },
  { tab: 'app_uninstaller', name: 'UninstallerView', file: 'src/views/UninstallerView.tsx' },
  { tab: 'presets', name: 'PresetsView', file: 'src/components/PresetsView.tsx' },
  { tab: 'system_cleaner', name: 'SystemCleaner', file: 'src/components/SystemCleaner.tsx' },
  { tab: 'storage_utilities', name: 'StorageUtilities', file: 'src/components/StorageUtilities.tsx' },
  { tab: 'startup', name: 'StartupView', file: 'src/components/StartupView.tsx' },
  { tab: 'scheduler', name: 'SchedulerView', file: 'src/components/SchedulerView.tsx' },
  { tab: 'autoruns', name: 'AutorunsView', file: 'src/views/AutorunsView.tsx' },
  { tab: 'dns_context', name: 'DnsContextMenuView', file: 'src/components/DnsContextMenuView.tsx' },
  { tab: 'driver_backup', name: 'DriverBackupView', file: 'src/components/DriverBackupView.tsx' },
  { tab: 'diagnostics', name: 'DiagnosticsView', file: 'src/components/DiagnosticsView.tsx' },
  { tab: 'odt', name: 'OdtView', file: 'src/components/OdtView.tsx' },
  { tab: 'activation', name: 'MasView', file: 'src/components/MasView.tsx' },
  { tab: 'restore_points', name: 'RestorePointsView', file: 'src/components/RestorePointsView.tsx' },
  { tab: 'state_engine', name: 'StateEngineView', file: 'src/views/StateEngineView.tsx' },
  { tab: 'settings', name: 'SettingsView', file: 'src/components/SettingsView.tsx' },
];

assert(EXPECTED_VIEWS.length === 21, `Catalog defines exactly 21 modular views (got ${EXPECTED_VIEWS.length})`);

const appTsxContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'App.tsx'), 'utf-8');

for (const view of EXPECTED_VIEWS) {
  const fullPath = path.join(PROJECT_ROOT, view.file);
  assert(fs.existsSync(fullPath), `View file exists on disk: ${view.file}`);

  const sourceCode = fs.readFileSync(fullPath, 'utf-8');
  const sourceFile = ts.createSourceFile(view.file, sourceCode, ts.ScriptTarget.Latest, true);

  let hasNamedExport = false;
  let hasDefaultExport = false;

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (node.name && node.name.text === view.name) {
        hasNamedExport = true;
      }
      if (node.modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        hasDefaultExport = true;
      }
    } else if (ts.isVariableStatement(node) && node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.name && decl.name.text === view.name) {
          hasNamedExport = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert(hasNamedExport || hasDefaultExport, `View component '${view.name}' is properly exported from ${view.file}`);

  // Verify App.tsx lazy dynamic import expression
  const importRelPath = view.file.replace('src/', './').replace('.tsx', '');
  const lazyPattern = new RegExp(`lazy\\(\\(\\)\\s*=>\\s*import\\(['"]${importRelPath.replace('.', '\\.')}['"]\\)\\.then\\(\\(m\\)\\s*=>\\s*\\(\\s*\\{\\s*default:\\s*m\\.${view.name}\\s*\\}\\s*\\)\\)`);
  assert(lazyPattern.test(appTsxContent), `App.tsx contains valid lazy dynamic import for ${view.name}`);

  // Verify App.tsx tab conditional rendering
  const tabRenderPattern = new RegExp(`activeTab\\s*===\\s*['"]${view.tab}['"]\\s*&&\\s*<${view.name}\\s*\\/>`);
  assert(tabRenderPattern.test(appTsxContent), `App.tsx renders <${view.name} /> for activeTab '${view.tab}'`);
}

// -------------------------------------------------------------
// Suite 2: Bundle Chunking & Gzip Footprint Analysis
// -------------------------------------------------------------
console.log('\n==================================================');
console.log(' Suite 2: Bundle Chunking & Gzip Footprint Analysis');
console.log('==================================================');

assert(fs.existsSync(DIST_ASSETS), `Production build assets directory exists at ${DIST_ASSETS}`);

const distFiles = fs.readdirSync(DIST_ASSETS);
const jsFiles = distFiles.filter(f => f.endsWith('.js'));

console.log(`Found ${jsFiles.length} JS chunk files in dist/assets/`);

// Verify all 21 views generated independent chunks
for (const view of EXPECTED_VIEWS) {
  const matchingChunk = jsFiles.find(f => f.startsWith(`${view.name}-`));
  assert(!!matchingChunk, `Generated separate bundle chunk for ${view.name}: ${matchingChunk || 'MISSING'}`);
  
  if (matchingChunk) {
    const chunkPath = path.join(DIST_ASSETS, matchingChunk);
    const stat = fs.statSync(chunkPath);
    const content = fs.readFileSync(chunkPath);
    const gzipped = zlib.gzipSync(content);
    assert(stat.size > 0 && gzipped.length > 0, `Chunk ${matchingChunk} has non-zero size (${(stat.size / 1024).toFixed(2)} KB, gzip ${(gzipped.length / 1024).toFixed(2)} KB)`);
  }
}

// Verify vendor chunks exist
const EXPECTED_VENDORS = ['vendor-react', 'vendor-icons', 'vendor-i18n', 'vendor-zustand', 'vendor-tauri'];
for (const vendor of EXPECTED_VENDORS) {
  const matchingVendor = jsFiles.find(f => f.startsWith(`${vendor}-`));
  assert(!!matchingVendor, `Manual vendor chunk generated: ${vendor} (${matchingVendor || 'MISSING'})`);
}

// Verify entry chunk size
const entryChunk = jsFiles.find(f => f.startsWith('index-'));
assert(!!entryChunk, `Entry chunk exists: ${entryChunk}`);

if (entryChunk) {
  const entryPath = path.join(DIST_ASSETS, entryChunk);
  const entrySize = fs.statSync(entryPath).size;
  const entryGzip = zlib.gzipSync(fs.readFileSync(entryPath)).length;

  const entrySizeKb = entrySize / 1024;
  const entryGzipKb = entryGzip / 1024;

  console.log(`Entry chunk: ${entryChunk} => Raw: ${entrySizeKb.toFixed(2)} KB, Gzip: ${entryGzipKb.toFixed(2)} KB`);
  assert(entryGzipKb < 150, `Initial entry bundle gzip size (${entryGzipKb.toFixed(2)} KB) is strictly under 150 KB target`);
  assert(entryGzipKb < 100, `Initial entry bundle gzip size (${entryGzipKb.toFixed(2)} KB) meets ultra-optimized <100 KB threshold`);
}

// -------------------------------------------------------------
// Suite 3: Navigation Tab Set Completeness & 1:1 Mapping
// -------------------------------------------------------------
console.log('\n==================================================');
console.log(' Suite 3: Navigation Tab Set Completeness');
console.log('==================================================');

const navTsxContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'components', 'Navigation.tsx'), 'utf-8');
const typesTsContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'types', 'index.ts'), 'utf-8');

// Parse TabType union
const tabTypeMatch = typesTsContent.match(/export type TabType =([\s\S]*?);/);
assert(!!tabTypeMatch, 'types/index.ts exports TabType union');

if (tabTypeMatch) {
  const unionMembers = tabTypeMatch[1]
    .split('|')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  assert(unionMembers.length === 21, `TabType has 21 members (found ${unionMembers.length})`);

  for (const view of EXPECTED_VIEWS) {
    assert(unionMembers.includes(view.tab), `TabType union includes '${view.tab}'`);
    assert(navTsxContent.includes(`id: '${view.tab}'`), `Navigation.tsx NAV_ITEMS registers tab '${view.tab}'`);
  }
}

// -------------------------------------------------------------
// Suite 4: ViewSkeleton Component & Suspense Architecture
// -------------------------------------------------------------
console.log('\n==================================================');
console.log(' Suite 4: ViewSkeleton & Suspense Architecture');
console.log('==================================================');

const skeletonPath = path.join(PROJECT_ROOT, 'src', 'components', 'ViewSkeleton.tsx');
assert(fs.existsSync(skeletonPath), 'ViewSkeleton.tsx component exists');

const skeletonContent = fs.readFileSync(skeletonPath, 'utf-8');
assert(skeletonContent.includes('role="status"'), 'ViewSkeleton has role="status" for accessibility');
assert(skeletonContent.includes('aria-label="Loading view content"'), 'ViewSkeleton has aria-label for screen readers');
assert(skeletonContent.includes('className="sr-only"'), 'ViewSkeleton has sr-only text for assistive technologies');
assert(skeletonContent.includes('animate-pulse motion-reduce:animate-none'), 'ViewSkeleton supports prefers-reduced-motion safety');
assert(skeletonContent.includes('bg-surface-subtle'), 'ViewSkeleton uses semantic background tokens');
assert(skeletonContent.includes('border-border'), 'ViewSkeleton uses semantic border tokens');

// App.tsx Suspense wrap
assert(appTsxContent.includes('<Suspense fallback={<ViewSkeleton />}>'), 'App.tsx wraps views in <Suspense fallback={<ViewSkeleton />}>');
assert(appTsxContent.includes('<ErrorBoundary>'), 'App.tsx encloses Suspense in <ErrorBoundary>');

// -------------------------------------------------------------
// Suite 5: useTauriCommand IPC Hook Optimization
// -------------------------------------------------------------
console.log('\n==================================================');
console.log(' Suite 5: useTauriCommand IPC Hook Optimization');
console.log('==================================================');

const hookPath = path.join(PROJECT_ROOT, 'src', 'hooks', 'useTauriCommand.ts');
assert(fs.existsSync(hookPath), 'useTauriCommand.ts exists');

const hookContent = fs.readFileSync(hookPath, 'utf-8');

assert(hookContent.includes('useRef(options)'), 'useTauriCommand memoizes options via useRef');
assert(hookContent.includes('useRef(commandName)'), 'useTauriCommand memoizes commandName via useRef');
assert(hookContent.includes('useAppStore.getState().dryRunMode'), 'useTauriCommand uses non-reactive useAppStore.getState().dryRunMode');
assert(hookContent.includes('useAppStore.getState().addLog'), 'useTauriCommand uses non-reactive useAppStore.getState().addLog');
assert(!hookContent.includes('const dryRunMode = useAppStore('), 'useTauriCommand does NOT subscribe reactively to dryRunMode in render scope');
assert(hookContent.includes('useCallback(\n    async (args?: TArgs): Promise<TResult | null> => {') ||
       hookContent.includes('useCallback('), 'useTauriCommand wraps execute in useCallback');
assert(hookContent.includes('[] // Stable reference across all component render cycles') ||
       hookContent.includes('[]\n  );') || hookContent.includes('[],\n  );'), 'useTauriCommand execute callback has stable empty dependency array');

// -------------------------------------------------------------
// Final Verdict Summary
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(' CHALLENGER 2 SUMMARY REPORT:');
console.log(` Total Checks: ${passedChecks + failedChecks}`);
console.log(` Passed:       ${passedChecks}`);
console.log(` Failed:       ${failedChecks}`);
console.log('================================================================');

if (failedChecks === 0) {
  console.log('\n🎉 EMPIRICAL VERDICT: APPROVE (100% checks passed)');
  process.exit(0);
} else {
  console.error(`\n❌ EMPIRICAL VERDICT: REQUEST_CHANGES (${failedChecks} check failures)`);
  process.exit(1);
}

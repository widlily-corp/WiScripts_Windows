import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ PASS: ${message}`);
  }
}

function verifyEmpiricalM4_2() {
  console.log('===============================================================');
  console.log(' CHALLENGER 2: MILESTONE 4 EMPIRICAL VERIFICATION HARNESS');
  console.log('===============================================================\n');

  const rootDir = path.resolve('c:/Users/Widlily/Documents/projects/WiScripts_Windows');

  // --- Step 1: Rust Commands Extraction ---
  console.log('[1] Extracting Rust Tauri Commands from src-tauri...');
  const libRsPath = path.join(rootDir, 'src-tauri/src/lib.rs');
  const libRsContent = fs.readFileSync(libRsPath, 'utf-8');

  // Parse generate_handler![...]
  const handlerMatch = libRsContent.match(/generate_handler!\[([\s\S]*?)\]/);
  assert(!!handlerMatch, 'generate_handler! macro found in lib.rs');
  const handlerBody = handlerMatch![1];
  const registeredCommands = handlerBody
    .split(',')
    .map((s) => s.trim().replace(/^commands::/, ''))
    .filter((s) => s.length > 0);

  console.log(`Found ${registeredCommands.length} registered IPC commands in Rust generate_handler!`);
  assert(registeredCommands.length === 20, 'Exactly 20 IPC commands registered in generate_handler!');

  const expected20Commands = [
    'get_system_info',
    'get_rule_catalog',
    'get_rules_by_category',
    'preview_optimizations',
    'execute_optimizations',
    'generate_odt_xml',
    'execute_odt_install',
    'execute_activation',
    'run_diagnostics',
    'winget_search',
    'winget_install',
    'winget_update',
    'get_uwp_apps',
    'remove_uwp_app',
    'get_optimization_profiles',
    'apply_optimization_profile',
    'set_dns_server',
    'get_classic_context_menu_status',
    'toggle_classic_context_menu',
    'backup_drivers',
  ];

  for (const cmd of expected20Commands) {
    assert(registeredCommands.includes(cmd), `Rust registers IPC command: ${cmd}`);
  }

  // --- Step 2: React Store & Components IPC Invocations ---
  console.log('\n[2] Verifying React Frontend IPC Invocations & Contract Alignment...');
  const storePath = path.join(rootDir, 'src/store/useAppStore.ts');
  const storeContent = fs.readFileSync(storePath, 'utf-8');

  const componentsDir = path.join(rootDir, 'src/components');
  const componentFiles = fs.readdirSync(componentsDir).map((f) => path.join(componentsDir, f));
  const appTsxPath = path.join(rootDir, 'src/App.tsx');
  
  const allTsxContent = [storeContent, fs.readFileSync(appTsxPath, 'utf-8'), ...componentFiles.map((p) => fs.readFileSync(p, 'utf-8'))].join('\n');

  // Match all invoke<'...'>('command_name'...) calls
  const invokeMatches = Array.from(allTsxContent.matchAll(/invoke(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g)).map((m) => m[1]);
  const uniqueInvokedCommands = Array.from(new Set(invokeMatches));

  console.log(`Found ${uniqueInvokedCommands.length} unique IPC command invocations in React frontend code.`);

  // Verify that frontend calls every expected IPC command
  const expectedFrontendCommands = [
    'get_system_info',
    'execute_optimizations',
    'generate_odt_xml',
    'execute_odt_install',
    'execute_activation',
    'run_diagnostics',
    'winget_search',
    'winget_install',
    'winget_update',
    'get_uwp_apps',
    'remove_uwp_app',
    'get_optimization_profiles',
    'apply_optimization_profile',
    'set_dns_server',
    'get_classic_context_menu_status',
    'toggle_classic_context_menu',
    'backup_drivers',
  ];

  for (const cmd of expectedFrontendCommands) {
    assert(uniqueInvokedCommands.includes(cmd), `React frontend invokes IPC command: ${cmd}`);
  }

  // --- Step 3: Elevation Warning & Button Enforcement ---
  console.log('\n[3] Verifying AdminElevationBanner & Action Button Elevation Requirements...');
  const bannerPath = path.join(componentsDir, 'AdminElevationBanner.tsx');
  const bannerContent = fs.readFileSync(bannerPath, 'utf-8');

  assert(bannerContent.includes('const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);'), 'AdminElevationBanner queries isElevated state');
  assert(bannerContent.includes('if (isElevated) {\n    return null;\n  }'), 'AdminElevationBanner hides (returns null) when elevated');
  assert(bannerContent.includes('Administrator Elevation Required'), 'AdminElevationBanner displays warning title when non-elevated');
  assert(bannerContent.includes('Enable Dry-Run Mode'), 'AdminElevationBanner provides Dry-Run mode toggle button');

  // Check elevation enforcement across action views
  const viewFiles = [
    'OptimizationView.tsx',
    'MasView.tsx',
    'OdtView.tsx',
    'DiagnosticsView.tsx',
    'PackageManagerView.tsx',
    'PresetsView.tsx',
    'DnsContextMenuView.tsx',
    'DriverBackupView.tsx',
  ];

  for (const viewFile of viewFiles) {
    const content = fs.readFileSync(path.join(componentsDir, viewFile), 'utf-8');
    const includesBanner = content.includes('<AdminElevationBanner');
    const enforcesElevation =
      content.includes('!isElevated && !dryRunMode') || content.includes('isDnsButtonDisabled');
    assert(includesBanner, `${viewFile} includes <AdminElevationBanner />`);
    assert(enforcesElevation, `${viewFile} enforces elevation constraint (!isElevated && !dryRunMode) on action execution`);
  }

  // --- Step 4: Bundle Verification ---
  console.log('\n[4] Verifying Build Bundle Generation (dist)...');
  const distDir = path.join(rootDir, 'dist');
  const distHtml = path.join(distDir, 'index.html');
  assert(fs.existsSync(distDir), 'dist/ directory exists');
  assert(fs.existsSync(distHtml), 'dist/index.html exists');

  const distAssets = path.join(distDir, 'assets');
  assert(fs.existsSync(distAssets), 'dist/assets/ directory exists');
  const assetFiles = fs.readdirSync(distAssets);
  const hasJsAsset = assetFiles.some((f) => f.endsWith('.js'));
  const hasCssAsset = assetFiles.some((f) => f.endsWith('.css'));
  assert(hasJsAsset, 'dist/assets/ contains compiled JavaScript bundle');
  assert(hasCssAsset, 'dist/assets/ contains compiled CSS bundle');

  console.log('\n===============================================================');
  console.log(' ALL EMPIRICAL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('===============================================================\n');
}

verifyEmpiricalM4_2();

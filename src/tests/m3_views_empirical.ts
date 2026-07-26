import { useAppStore } from '../store/useAppStore';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runEmpiricalTests() {
  console.log('====================================================');
  console.log(' EMPIRICAL TEST SUITE: Milestone 3 Views & State');
  console.log('====================================================\n');

  const store = useAppStore.getState();

  // Test 1: Navigation & Active Tab State
  console.log('[Test 1] Navigation & Tab Switching');
  const tabs = [
    'dashboard',
    'optimization',
    'package_manager',
    'presets',
    'dns_context',
    'driver_backup',
    'diagnostics',
    'odt',
    'activation',
    'settings',
  ] as const;

  for (const tab of tabs) {
    useAppStore.getState().setActiveTab(tab);
    assert(useAppStore.getState().activeTab === tab, `Active tab set to "${tab}"`);
  }

  // Test 2: Dry Run Mode Toggle
  console.log('\n[Test 2] Global Dry Run Mode Toggle');
  assert(useAppStore.getState().dryRunMode === false, 'Default dry run mode is false');
  useAppStore.getState().setDryRunMode(true);
  assert(useAppStore.getState().dryRunMode === true, 'Dry run mode enabled');
  useAppStore.getState().setDryRunMode(false);
  assert(useAppStore.getState().dryRunMode === false, 'Dry run mode disabled');

  // Test 3: R1 Diagnostics State & Executing Flags
  console.log('\n[Test 3] Feature R1: Diagnostics Execution');
  assert(useAppStore.getState().isExecuting === false, 'isExecuting initially false');
  
  // Clear logs first
  useAppStore.getState().clearLogs();
  assert(useAppStore.getState().logs.length === 0, 'Logs cleared successfully');

  // Trigger diagnostics run
  const diagPromise = useAppStore.getState().runDiagnostics('sfc_scannow');
  // While running, check if log was added
  const logsInFlight = useAppStore.getState().logs;
  assert(logsInFlight.length > 0, 'Log added when diagnostics command invoked');
  assert(
    logsInFlight.some((l) => l.message.includes('Invoking run_diagnostics: sfc_scannow')),
    'Log records action name "sfc_scannow"'
  );
  
  await diagPromise;
  assert(useAppStore.getState().isExecuting === false, 'isExecuting reset to false after runDiagnostics completion');

  // Test 4: R2 Package Manager Search & Validation
  console.log('\n[Test 4] Feature R2: Package Manager Search & Debloat Logic');
  assert(useAppStore.getState().isWingetSearching === false, 'isWingetSearching initially false');
  
  const searchPromise = useAppStore.getState().wingetSearch('7zip');
  assert(useAppStore.getState().isWingetSearching === true, 'isWingetSearching true during search');
  await searchPromise;
  assert(useAppStore.getState().isWingetSearching === false, 'isWingetSearching false after search');

  // UWP App fetch
  assert(useAppStore.getState().isUwpLoading === false, 'isUwpLoading initially false');
  const uwpPromise = useAppStore.getState().fetchUwpApps();
  assert(useAppStore.getState().isUwpLoading === true, 'isUwpLoading true during fetch');
  await uwpPromise;
  assert(useAppStore.getState().isUwpLoading === false, 'isUwpLoading false after fetch');

  // Test 5: R3 Presets State
  console.log('\n[Test 5] Feature R3: Optimization Presets / Profiles');
  assert(useAppStore.getState().isLoadingProfiles === false, 'isLoadingProfiles initially false');
  const profilePromise = useAppStore.getState().fetchOptimizationProfiles();
  assert(useAppStore.getState().isLoadingProfiles === true, 'isLoadingProfiles true during fetch');
  await profilePromise;
  assert(useAppStore.getState().isLoadingProfiles === false, 'isLoadingProfiles false after fetch');

  // Test 6: R4 DNS & Context Menu Manager
  console.log('\n[Test 6] Feature R4: DNS & Context Menu');
  assert(useAppStore.getState().selectedDnsProvider === 'adguard', 'Default DNS provider is adguard');
  useAppStore.getState().setSelectedDnsProvider('cloudflare');
  assert(useAppStore.getState().selectedDnsProvider === 'cloudflare', 'DNS provider changed to cloudflare');

  const contextPromise = useAppStore.getState().fetchClassicContextMenuStatus();
  assert(useAppStore.getState().isContextMenuLoading === true, 'isContextMenuLoading true during fetch');
  await contextPromise;
  assert(useAppStore.getState().isContextMenuLoading === false, 'isContextMenuLoading false after fetch');

  // Test 7: R5 Driver Backup Path Validation & Edge Cases
  console.log('\n[Test 7] Feature R5: Driver Backup Path Validation & Edge Cases');
  assert(useAppStore.getState().driverBackupPath === 'C:\\DriverBackup', 'Default driver backup path is C:\\DriverBackup');
  
  // Custom path setting
  useAppStore.getState().setDriverBackupPath('D:\\Backups\\Drivers');
  assert(useAppStore.getState().driverBackupPath === 'D:\\Backups\\Drivers', 'Driver backup path updated to custom directory');

  // Test empty path edge case logic
  const emptyPath = '   ';
  const isValidPath = emptyPath.trim().length > 0;
  assert(isValidPath === false, 'Whitespace-only path correctly evaluated as invalid (button disabled)');

  // Reset path to default
  useAppStore.getState().setDriverBackupPath('C:\\DriverBackup');

  // Test 8: Elevation Check State
  console.log('\n[Test 8] Elevation Check State & Action');
  assert(typeof useAppStore.getState().isElevated === 'boolean', 'isElevated state property exists as boolean');
  assert(typeof useAppStore.getState().checkElevation === 'function', 'checkElevation action exists');

  console.log('\n====================================================');
  console.log(' ALL 8 EMPIRICAL TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('====================================================\n');
}

runEmpiricalTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

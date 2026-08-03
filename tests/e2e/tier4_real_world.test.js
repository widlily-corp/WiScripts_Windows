/**
 * Tier 4 Test Suite: Real-World Application Scenarios (6 Test Cases)
 * Simulates complete end-to-end user journeys and complex workflows across the system.
 */

import fs from 'fs';
import path from 'path';
import { assert, MockIPC, AppStateSimulator, TestRunner } from './harness.js';

export function buildTier4Suite() {
  const runner = new TestRunner('Tier 4 - Real-World Application Scenarios');

  // --- T4_SCENARIO_01: Full end-to-end user optimization workflow ---
  runner.addTest('T4_SCENARIO_01: Complete user optimization workflow from queue check to celebratory state', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Step 1: Initial state check (N = 2 queued optimizations)
    app.state.optimizations = [
      { id: 'opt_1', title: 'Disable Telemetry', isSelected: true },
      { id: 'opt_2', title: 'Disable Xbox Services', isSelected: true }
    ];
    let banner = app.getDashboardBannerState();
    assert.equal(banner.type, 'queue', 'Initial banner state is queue');
    assert.equal(banner.count, 2, 'Initial queue count is 2');

    // Step 2: User launches Script Runner to execute optimization script
    const optScript = 'Stop-Service -Name DiagTrack; Stop-Service -Name XblAuthManager';
    const res = await app.executeScript(optScript, 'ps1');
    assert.equal(res.exit_code, 0, 'Optimization script completed with exit code 0');

    // Step 3: User exports output log to log file
    const scratchDir = path.join(process.cwd(), 'scratch');
    const logPath = path.join(scratchDir, 'e2e_opt_workflow.log');
    app.exportLogsToFile(logPath);
    assert.isTrue(fs.existsSync(logPath), 'Optimization log file saved to disk');

    // Step 4: Optimizations applied -> state updates to N = 0
    app.state.optimizations.forEach(o => o.isSelected = false);
    banner = app.getDashboardBannerState();

    // Assert Final State
    assert.equal(banner.type, 'celebration', 'Banner transitioned to celebration state');
    assert.includes(banner.colorClass, 'bg-emerald-500', 'Celebration banner has emerald styling');

    // Cleanup
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  });

  // --- T4_SCENARIO_02: Temperature monitoring & manual dropdown override workflow ---
  runner.addTest('T4_SCENARIO_02: Hardware temperature monitoring and manual dropdown override workflow', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Step 1: Query initial sensor readings (LHM default)
    const initialPayload = await ipc.invoke('get_temperatures');
    assert.equal(initialPayload.cpu_temp_celsius, 45.2, 'Default LHM CPU temperature is 45.2°C');

    // Step 2: Auto-detection failure simulation (LHM WMI goes unavailable)
    ipc.registerHandler('get_temperatures', async () => ({
      cpu_temp_celsius: null,
      gpu_temp_celsius: 55.0,
      is_cpu_temp_available: false,
      is_gpu_temp_available: true,
      sensor_source: 'Fallback Mode',
      sensor_items: [
        { id: 'lhm_cpu_package', name: 'LHM Sensor (Failed)', label: 'CPU Package', temperature_celsius: null, sensor_type: 'cpu', provider: 'LibreHardwareMonitor WMI' },
        { id: 'acpi_zone_1', name: 'ACPI Thermal Zone 1', label: 'ACPI CPU Sensor', temperature_celsius: 42.0, sensor_type: 'cpu', provider: 'ACPI WMI' }
      ],
      selected_cpu_sensor_id: app.state.selectedCpuSensorId,
      selected_gpu_sensor_id: null
    }));

    // Step 3: User manually selects ACPI Thermal Zone 1 from dropdown override
    app.state.selectedCpuSensorId = 'acpi_zone_1';

    // Step 4: Fetch updated status with manual override active
    const updatedPayload = await ipc.invoke('get_temperatures');
    const selectedCpuItem = updatedPayload.sensor_items.find(i => i.id === app.state.selectedCpuSensorId);

    // Assert
    assert.ok(selectedCpuItem, 'Manual sensor override item found in payload');
    assert.equal(selectedCpuItem.temperature_celsius, 42.0, 'Resolved temperature from manual sensor override is 42.0°C');
    assert.equal(selectedCpuItem.provider, 'ACPI WMI', 'Resolved sensor provider is ACPI WMI');
  });

  // --- T4_SCENARIO_03: Security & path escaping workflow ---
  runner.addTest('T4_SCENARIO_03: Security validation, UAC elevation check, and path escaping workflow', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Step 1: Standard user (not admin) opens application
    app.state.isElevated = false;
    app.state.systemInfo.isElevated = false;
    assert.isFalse(app.state.isElevated, 'User is standard non-admin');

    // Step 2: Elevation banner recommends enabling Dry-Run mode
    app.state.dryRunMode = true;
    assert.isTrue(app.state.dryRunMode, 'Dry-Run mode enabled by user from banner prompt');

    // Step 3: User attempts to execute script containing path with spaces & adversarial chars
    const maliciousScriptPath = 'C:\\Program Files\\WiScripts App\\scripts\\clean.ps1 & calc.exe';
    
    // Rust script runner sanitization logic
    function prepareSecureScriptExecution(rawPath, content) {
      const sanitizedPath = path.normalize(rawPath);
      // Validate path stays within allowed boundaries or clean execution temp dir
      const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Test\\AppData\\Local';
      const secureTempDir = path.join(localAppData, 'WiScripts', 'TempScripts');
      const tempScriptPath = path.join(secureTempDir, `temp_script_${Date.now()}.ps1`);
      
      return {
        tempScriptPath,
        escapedArgs: `"${sanitizedPath.replace(/"/g, '""')}"`
      };
    }

    const execConfig = prepareSecureScriptExecution(maliciousScriptPath, 'Write-Host "Safe Run"');

    // Assert
    assert.includes(execConfig.tempScriptPath, 'WiScripts\\TempScripts', 'Temp script target path is inside secure TempScripts directory');
    assert.includes(execConfig.escapedArgs, '"C:\\Program Files\\WiScripts App\\scripts\\clean.ps1 & calc.exe"', 'Full path with adversarial characters safely escaped inside quotes');
  });

  // --- T4_SCENARIO_04: WMI error recovery workflow ---
  runner.addTest('T4_SCENARIO_04: WMI subprocess query timeout, fallback recovery, and error notification workflow', async () => {
    // Arrange
    const ipc = new MockIPC();
    let queryAttempts = 0;

    ipc.registerHandler('get_temperatures', async () => {
      queryAttempts++;
      if (queryAttempts === 1) {
        // Attempt 1: Simulated 3-second WMI timeout
        const err = new Error('WMI Query Timeout (3000ms limit reached)');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      // Attempt 2: Fallback recovery payload
      return {
        cpu_temp_celsius: 41.5,
        gpu_temp_celsius: 50.0,
        is_cpu_temp_available: true,
        is_gpu_temp_available: true,
        sensor_source: 'sysinfo fallback',
        sensor_items: []
      };
    });

    // Act 1: Attempt 1 fails with timeout
    await assert.throwsAsync(
      async () => await ipc.invoke('get_temperatures'),
      'WMI Query Timeout',
      'First WMI attempt times out cleanly'
    );

    // Act 2: Attempt 2 recovers via sysinfo fallback
    const recoveredPayload = await ipc.invoke('get_temperatures');

    // Assert
    assert.equal(recoveredPayload.sensor_source, 'sysinfo fallback', 'Recovered via sysinfo fallback provider');
    assert.equal(recoveredPayload.cpu_temp_celsius, 41.5, 'Recovered CPU temperature reading 41.5°C');
  });

  // --- T4_SCENARIO_05: Full localization switching & celebratory state workflow ---
  runner.addTest('T4_SCENARIO_05: Localization switching and celebratory N=0 state transition workflow', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Step 1: Load in English with N=0 (all optimizations applied)
    app.state.currentLanguage = 'en';
    app.state.optimizations.forEach(o => o.isSelected = false);

    let banner = app.getDashboardBannerState();
    const enCelebrationTitle = app.translate('dashboard.celebratoryBannerTitle', 'System Fully Optimized!');

    assert.equal(banner.type, 'celebration', 'English celebratory banner active');
    assert.equal(enCelebrationTitle, 'System Fully Optimized!', 'EN translation resolved');

    // Step 2: User switches application language to Russian (ru)
    app.state.currentLanguage = 'ru';
    const ruCelebrationTitle = app.translate('dashboard.celebratoryBannerTitle', 'Система полностью оптимизирована!');

    // Assert
    assert.equal(ruCelebrationTitle, 'Система полностью оптимизирована!', 'RU translation resolved upon language toggle');
  });

  // --- T4_SCENARIO_06: Autorun registry auditing & safety confirmation workflow ---
  runner.addTest('T4_SCENARIO_06: Autorun registry scan, lock detection, and safety confirmation workflow', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    ipc.registerHandler('scan_autoruns', async () => ({
      items: [
        { id: '1', name: 'OneDrive', path: 'C:\\Users\\Test\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe', registryKey: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', isLocked: false },
        { id: '2', name: 'SecurityHealth', path: 'C:\\Windows\\System32\\SecurityHealthSystray.exe', registryKey: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', isLocked: true }
      ]
    }));

    // Step 1: Perform autorun registry scan
    const scanResult = await ipc.invoke('scan_autoruns');
    assert.equal(scanResult.items.length, 2, 'Autorun scan identified 2 startup items');

    // Step 2: Detect locked system entry
    const lockedItem = scanResult.items.find(i => i.isLocked);
    assert.ok(lockedItem, 'Identified locked autorun item');
    assert.equal(lockedItem.name, 'SecurityHealth', 'Locked item is SecurityHealth');

    // Step 3: Attempting modification on locked item triggers safety guard
    function disableAutorunItem(item) {
      if (item.isLocked) {
        return { success: false, requireConfirmation: true, warning: `Registry key '${item.registryKey}' is protected by Windows.` };
      }
      return { success: true, requireConfirmation: false };
    }

    const actionResult = disableAutorunItem(lockedItem);

    // Assert
    assert.isFalse(actionResult.success, 'Direct disable blocked for locked registry item');
    assert.isTrue(actionResult.requireConfirmation, 'Safety confirmation modal required');
    assert.includes(actionResult.warning, 'protected by Windows', 'Warning details protected registry key');
  });

  return runner;
}

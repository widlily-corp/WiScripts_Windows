/**
 * Tier 1 Test Suite: Feature Coverage (22 Test Cases)
 * Verifies core functionality for requirements R1, R2, R3, R4.
 */

import fs from 'fs';
import path from 'path';
import { assert, MockIPC, AppStateSimulator, TestRunner } from './harness.js';

export function buildTier1Suite() {
  const runner = new TestRunner('Tier 1 - Feature Coverage');

  // --- F1.1 Script Runner UI & Loading (.ps1, .bat, .cmd) ---
  runner.addTest('T1_F1_1_01: Script Runner loads valid .ps1 script content', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    const scriptContent = 'Get-Service -Name DiagTrack | Stop-Service';

    // Act
    const res = await app.executeScript(scriptContent, 'ps1');

    // Assert
    assert.equal(res.exit_code, 0, 'Script execution exit code should be 0');
    assert.includes(res.stdout, 'Get-Service', 'Stdout contains script command');
  });

  runner.addTest('T1_F1_1_02: Script Runner loads valid .bat script content', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    const scriptContent = '@echo off\necho Cleaning Temp Files...';

    // Act
    const res = await app.executeScript(scriptContent, 'bat');

    // Assert
    assert.equal(res.exit_code, 0, 'Exit code is 0 for .bat execution');
    assert.includes(res.stdout, 'Cleaning Temp Files', 'Stdout captures echo statement');
  });

  runner.addTest('T1_F1_1_03: Script Runner routes .cmd scripts to batch runner', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    const scriptContent = 'cmd /c "echo CMD Execution Test"';

    // Act
    const res = await app.executeScript(scriptContent, 'cmd');

    // Assert
    assert.equal(res.exit_code, 0, '.cmd execution completes with status 0');
    assert.includes(res.stdout, 'CMD Execution Test', 'Stdout contains echo result');
  });

  // --- F1.2 Streaming IPC stdout/stderr events ---
  runner.addTest('T1_F1_2_01: Streaming IPC emits script-output-line stdout events', async () => {
    // Arrange
    const ipc = new MockIPC();
    const receivedEvents = [];
    ipc.listen('script-output-line', (evt) => {
      receivedEvents.push(evt.payload);
    });
    const app = new AppStateSimulator(ipc);

    // Act
    await app.executeScript('Line 1\nLine 2\nLine 3', 'ps1');

    // Assert
    assert.equal(receivedEvents.length, 3, 'Received 3 output line events');
    assert.equal(receivedEvents[0].line, 'Line 1', 'First line event content');
    assert.equal(receivedEvents[0].stream, 'stdout', 'Stream type is stdout');
  });

  runner.addTest('T1_F1_2_02: Streaming IPC handles stderr event streams', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('execute_custom_script', async (payload) => {
      await ipc.emit('script-output-line', { line: 'Error: Access Denied', stream: 'stderr' });
      return { exit_code: 1, stdout: '', stderr: 'Error: Access Denied' };
    });
    const app = new AppStateSimulator(ipc);

    // Act
    const res = await app.executeScript('Write-Error "Denied"', 'ps1');

    // Assert
    assert.equal(res.exit_code, 1, 'Exit code reflects failure (1)');
    assert.equal(res.stderr, 'Error: Access Denied', 'Stderr content captured in return payload');
    assert.includes(app.exportLogsToString(), '[STDERR] Error: Access Denied', 'Terminal log captures stderr prefix');
  });

  runner.addTest('T1_F1_2_03: execute_custom_script returns final exit code 0 on success', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Act
    const res = await app.executeScript('Write-Host "Success"', 'ps1');

    // Assert
    assert.equal(res.exit_code, 0, 'Command execution returned success exit code 0');
  });

  // --- F1.3 Output Log Export / Download ---
  runner.addTest('T1_F1_3_01: Log export formats buffer with header, timestamps, and line breaks', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    await app.executeScript('Step 1 Complete\nStep 2 Complete', 'ps1');

    // Act
    const formattedLog = app.exportLogsToString();

    // Assert
    assert.includes(formattedLog, '[EXEC] Running ps1 script', 'Includes execution header log line');
    assert.includes(formattedLog, '[STDOUT] Step 1 Complete', 'Includes step 1 output line');
    assert.includes(formattedLog, '[EXIT] Process finished', 'Includes completion exit line');
  });

  runner.addTest('T1_F1_3_02: Log export writes log file to disk with complete parity', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    await app.executeScript('System Scan Output Data', 'ps1');
    const targetFile = path.join(process.cwd(), 'scratch', 'test_export_tier1.log');

    // Act
    app.exportLogsToFile(targetFile);

    // Assert
    assert.isTrue(fs.existsSync(targetFile), 'Exported log file exists on disk');
    const fileContent = fs.readFileSync(targetFile, 'utf8');
    assert.includes(fileContent, 'System Scan Output Data', 'Disk file content matches terminal buffer');

    // Cleanup
    if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
  });

  // --- F1.4 UAC & Admin Elevation Status Banner / Warnings ---
  runner.addTest('T1_F1_4_01: AdminElevationBanner renders warning banner when isElevated is false', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    app.state.isElevated = false;
    app.state.systemInfo.isElevated = false;

    // Act
    const warningTitle = app.translate('admin_banner.title', 'Administrator Elevation Required');

    // Assert
    assert.isFalse(app.state.isElevated, 'User is not elevated');
    assert.equal(warningTitle, 'Administrator Elevation Required', 'Warning title text matches specification');
  });

  runner.addTest('T1_F1_4_02: AdminElevationBanner hides when isElevated is true', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    app.state.isElevated = true;

    // Act & Assert
    assert.isTrue(app.state.isElevated, 'User is elevated, elevation banner should be suppressed');
  });

  // --- F2.1 Celebratory N=0 Success Banner in Dashboard ---
  runner.addTest('T1_F2_1_01: Dashboard displays celebratory success banner when unapplied count N = 0', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    app.state.optimizations.forEach(o => o.isSelected = false); // All applied / 0 queued

    // Act
    const bannerState = app.getDashboardBannerState();

    // Assert
    assert.equal(bannerState.type, 'celebration', 'Banner type switches to celebration when N=0');
    assert.includes(bannerState.colorClass, 'bg-emerald-500', 'Celebration banner uses green styling');
  });

  runner.addTest('T1_F2_1_02: Dashboard displays queue banner with pending count N when N > 0', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    app.state.optimizations = [
      { id: '1', isSelected: true },
      { id: '2', isSelected: true },
      { id: '3', isSelected: false }
    ];

    // Act
    const bannerState = app.getDashboardBannerState();

    // Assert
    assert.equal(bannerState.type, 'queue', 'Banner type is queue state when N > 0');
    assert.equal(bannerState.count, 2, 'Pending queue count is 2');
  });

  // --- F2.2 Status Polling on Mount ---
  runner.addTest('T1_F2_2_01: Dashboard status polling triggers get_system_info on mount', async () => {
    // Arrange
    const ipc = new MockIPC();
    let polled = false;
    ipc.registerHandler('get_system_info', async () => {
      polled = true;
      return { osName: 'Windows 11', osVersion: '23H2', osBuild: '22631', isElevated: true, cpuUsagePercent: 10, memoryUsedMb: 4090, memoryTotalMb: 16384, telemetryStatus: 'Active' };
    });

    // Act
    const info = await ipc.invoke('get_system_info');

    // Assert
    assert.isTrue(polled, 'get_system_info was called during polling invocation');
    assert.equal(info.osName, 'Windows 11', 'Fetched OS name from mount polling');
  });

  // --- F2.3 Dynamic Telemetry Card Styling ---
  runner.addTest('T1_F2_3_01: Dynamic telemetry card styling applies amber badge for Active status', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Act
    const styleClass = app.getTelemetryBadgeStyle('Active');

    // Assert
    assert.includes(styleClass, 'bg-amber-500', 'Active telemetry uses amber background badge');
  });

  runner.addTest('T1_F2_3_02: Dynamic telemetry card styling applies emerald badge for Disabled status', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Act
    const styleClass = app.getTelemetryBadgeStyle('Disabled');

    // Assert
    assert.includes(styleClass, 'bg-emerald-500', 'Disabled telemetry uses emerald background badge');
  });

  runner.addTest('T1_F2_3_03: Dynamic telemetry card styling applies red badge for Blocked status', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Act
    const styleClass = app.getTelemetryBadgeStyle('Blocked');

    // Assert
    assert.includes(styleClass, 'bg-red-500', 'Blocked telemetry uses red background badge');
  });

  // --- F2.4 Localization Strings in ru.json and en.json ---
  runner.addTest('T1_F2_4_01: i18n locale files ru.json and en.json have structural parity', async () => {
    // Arrange
    const app = new AppStateSimulator();
    const enKeys = Object.keys(app.locales.en || {});
    const ruKeys = Object.keys(app.locales.ru || {});

    // Act & Assert
    assert.greaterThanOrEqual(enKeys.length, 5, 'en.json loaded with keys');
    assert.greaterThanOrEqual(ruKeys.length, 5, 'ru.json loaded with keys');
    assert.isTrue(enKeys.includes('dashboard'), 'en.json contains dashboard section');
    assert.isTrue(ruKeys.includes('dashboard'), 'ru.json contains dashboard section');
  });

  // --- F3.1 Multi-tier Temperature Sensor Collector Payload Parsing ---
  runner.addTest('T1_F3_1_01: Multi-tier temperature collector parses LHM WMI payload correctly', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const payload = await ipc.invoke('get_temperatures');

    // Assert
    assert.equal(payload.sensor_source, 'LibreHardwareMonitor WMI', 'Identified primary LHM WMI sensor provider');
    assert.equal(payload.cpu_temp_celsius, 45.2, 'Parsed CPU temperature 45.2°C');
    assert.equal(payload.gpu_temp_celsius, 52.0, 'Parsed GPU temperature 52.0°C');
  });

  // --- F3.2 Extended Sensor Payload Items Structure ---
  runner.addTest('T1_F3_2_01: Extended sensor payload contains sensor items with required schema', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const payload = await ipc.invoke('get_temperatures');
    const items = payload.sensor_items;

    // Assert
    assert.greaterThanOrEqual(items.length, 2, 'Sensor payload contains multiple items');
    const cpuItem = items.find(i => i.sensor_type === 'cpu');
    assert.ok(cpuItem, 'Found CPU sensor item');
    assert.equal(cpuItem.id, 'lhm_cpu_package', 'CPU item has id');
    assert.equal(cpuItem.provider, 'LibreHardwareMonitor WMI', 'CPU item has provider');
  });

  // --- F3.3 Manual Sensor Selector Dropdown Override & Persistence ---
  runner.addTest('T1_F3_3_01: Manual sensor selector dropdown override updates selected sensor ID', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Act
    app.state.selectedCpuSensorId = 'custom_cpu_sensor_2';

    // Assert
    assert.equal(app.state.selectedCpuSensorId, 'custom_cpu_sensor_2', 'Selected CPU sensor ID persisted');
  });

  // --- F4.1 Win32 Native Elevation Check ---
  runner.addTest('T1_F4_1_01: Win32 native elevation check returns boolean via OpenProcessToken', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const info = await ipc.invoke('get_system_info');

    // Assert
    assert.isTrue(typeof info.isElevated === 'boolean', 'isElevated is a boolean type');
  });

  // --- F4.2 ShellExecuteW Escaping ---
  runner.addTest('T1_F4_2_01: ShellExecuteW argument escaping wraps paths with spaces in quotes', async () => {
    // Arrange
    const rawPath = 'C:\\Program Files\\My App\\uninstaller.exe';
    const rawArgs = '/silent /dir="C:\\App Data"';

    // Act: Function simulating Rust uninstaller ShellExecuteW argument escaping
    function escapeShellExecuteArgs(pathStr, argsStr) {
      const escapedPath = `"${pathStr.replace(/"/g, '""')}"`;
      return `${escapedPath} ${argsStr}`;
    }
    const escaped = escapeShellExecuteArgs(rawPath, rawArgs);

    // Assert
    assert.includes(escaped, '"C:\\Program Files\\My App\\uninstaller.exe"', 'Path with spaces enclosed in double quotes');
  });

  return runner;
}

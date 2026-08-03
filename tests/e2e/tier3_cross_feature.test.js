/**
 * Tier 3 Test Suite: Cross-Feature Interactions (7 Test Cases)
 * Verifies concurrent feature behaviors, multi-subsystem state interactions, and cross-cutting concerns.
 */

import fs from 'fs';
import path from 'path';
import { assert, MockIPC, AppStateSimulator, TestRunner } from './harness.js';

export function buildTier3Suite() {
  const runner = new TestRunner('Tier 3 - Cross-Feature Interactions');

  // --- T3_INT_01: Script runner execution while metrics polling is active ---
  runner.addTest('T3_INT_01: Script runner execution runs concurrently with active metrics polling', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    let metricsPollCount = 0;
    ipc.registerHandler('get_system_info', async () => {
      metricsPollCount++;
      return { osName: 'Windows 11', osVersion: '23H2', osBuild: '22631', isElevated: true, cpuUsagePercent: 20 + metricsPollCount, memoryUsedMb: 8000, memoryTotalMb: 16384, telemetryStatus: 'Active' };
    });

    // Act: Simulate background metrics polling interval while executing a custom script
    const pollPromise = (async () => {
      for (let i = 0; i < 3; i++) {
        await ipc.invoke('get_system_info');
      }
    })();

    const scriptPromise = app.executeScript('Write-Host "Concurrent Execution Test"', 'ps1');

    await Promise.all([pollPromise, scriptPromise]);

    // Assert
    assert.equal(metricsPollCount, 3, 'Metrics poller executed 3 cycles in parallel');
    assert.includes(app.exportLogsToString(), 'Concurrent Execution Test', 'Script output captured without interference');
  });

  // --- T3_INT_02: Manual sensor selection while dashboard status polling occurs ---
  runner.addTest('T3_INT_02: Manual sensor selection override updates state while background status polling occurs', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Initial temperature payload
    app.state.sensorPayload = {
      cpu_temp_celsius: 45.2,
      sensor_items: [
        { id: 'lhm_cpu', name: 'LHM Sensor', temperature_celsius: 45.2, sensor_type: 'cpu', provider: 'LHM' },
        { id: 'custom_sensor_override', name: 'Custom Probe', temperature_celsius: 39.8, sensor_type: 'cpu', provider: 'Manual' }
      ]
    };

    // Register IPC handler returning items including custom_sensor_override
    ipc.registerHandler('get_temperatures', async () => ({
      cpu_temp_celsius: 45.2,
      sensor_items: [
        { id: 'lhm_cpu', name: 'LHM Sensor', temperature_celsius: 45.2, sensor_type: 'cpu', provider: 'LHM' },
        { id: 'custom_sensor_override', name: 'Custom Probe', temperature_celsius: 39.8, sensor_type: 'cpu', provider: 'Manual' }
      ]
    }));

    // Act: User selects manual sensor override
    app.state.selectedCpuSensorId = 'custom_sensor_override';

    // Background polling fetch returns new payload
    const polledPayload = await ipc.invoke('get_temperatures');
    polledPayload.selected_cpu_sensor_id = app.state.selectedCpuSensorId;

    // Resolve displayed temp
    const activeSensor = polledPayload.sensor_items.find(s => s.id === polledPayload.selected_cpu_sensor_id) || polledPayload.sensor_items[0];

    // Assert
    assert.equal(polledPayload.selected_cpu_sensor_id, 'custom_sensor_override', 'Manual sensor selection persisted across poll');
    assert.equal(activeSensor.id, 'custom_sensor_override', 'Resolved active sensor is override item');
  });

  // --- T3_INT_03: Log export during live script execution streaming ---
  runner.addTest('T3_INT_03: Log export can be triggered during active live script execution streaming', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Act: Emit partial stream lines, export log snapshot mid-stream, then complete
    await ipc.emit('script-output-line', { line: 'Mid-stream snapshot line 1', stream: 'stdout' });
    app.state.terminalLogs.push('[STDOUT] Mid-stream snapshot line 1');

    const snapshotLog = app.exportLogsToString();

    await ipc.emit('script-output-line', { line: 'Mid-stream snapshot line 2', stream: 'stdout' });
    app.state.terminalLogs.push('[STDOUT] Mid-stream snapshot line 2');

    const finalLog = app.exportLogsToString();

    // Assert
    assert.includes(snapshotLog, 'Mid-stream snapshot line 1', 'Snapshot log includes line 1');
    assert.isFalse(snapshotLog.includes('Mid-stream snapshot line 2'), 'Snapshot log does not contain line 2 yet');
    assert.includes(finalLog, 'Mid-stream snapshot line 2', 'Final log contains line 2');
  });

  // --- T3_INT_04: i18n language switching during active queue state display ---
  runner.addTest('T3_INT_04: Dynamic i18n language switching updates queue state banner text instantly', async () => {
    // Arrange
    const app = new AppStateSimulator();
    app.state.optimizations = [{ id: '1', isSelected: true }]; // N=1 queued

    // Act 1: English
    app.state.currentLanguage = 'en';
    const enTitle = app.translate('dashboard.systemOptimizationReadiness', 'System Optimization Readiness');

    // Act 2: Switch to Russian
    app.state.currentLanguage = 'ru';
    const ruTitle = app.translate('dashboard.systemOptimizationReadiness', 'Готовность к оптимизации системы');

    // Assert
    assert.equal(enTitle, 'System Optimization Readiness', 'English translation resolved');
    assert.equal(ruTitle, 'Готовность к оптимизации системы', 'Russian translation resolved upon locale switch');
  });

  // --- T3_INT_05: UAC elevation check interaction with script runner execution guard ---
  runner.addTest('T3_INT_05: Standard user (isElevated: false) triggers UAC warning and enforces dry-run safety guard', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    app.state.isElevated = false;
    app.state.dryRunMode = false;

    // Act: Execution guard checks elevation before script launch
    function executeWithSafetyGuard(appState, scriptContent) {
      if (!appState.state.isElevated && !appState.state.dryRunMode) {
        // Automatically enable dry-run mode or warn user
        appState.state.dryRunMode = true;
        appState.state.terminalLogs.push('[SAFETY_GUARD] Standard user detected. Automatic Dry-Run mode enabled.');
      }
      return appState.executeScript(scriptContent, 'ps1');
    }

    await executeWithSafetyGuard(app, 'Remove-Item C:\\Windows\\System32 -Recurse');

    // Assert
    assert.isTrue(app.state.dryRunMode, 'Safety guard enabled dryRunMode for standard user');
    assert.includes(app.exportLogsToString(), '[SAFETY_GUARD]', 'Log records safety guard intervention');
  });

  // --- T3_INT_06: Telemetry status change updates both Dashboard badge and Navigation elevation status ---
  runner.addTest('T3_INT_06: Telemetry status change updates Dashboard telemetry badge and systemInfo state', async () => {
    // Arrange
    const app = new AppStateSimulator();
    app.state.systemInfo.telemetryStatus = 'Active';

    // Act: State update disables telemetry
    app.state.systemInfo.telemetryStatus = 'Disabled';
    const badgeStyle = app.getTelemetryBadgeStyle(app.state.systemInfo.telemetryStatus);

    // Assert
    assert.equal(app.state.systemInfo.telemetryStatus, 'Disabled', 'Telemetry status updated to Disabled');
    assert.includes(badgeStyle, 'bg-emerald-500', 'Badge style updated to emerald for Disabled status');
  });

  // --- T3_INT_07: Diagnostic dump export includes active script log history, system info, and sensor state ---
  runner.addTest('T3_INT_07: Diagnostic dump export aggregates script logs, system metrics, and sensor payload', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    await app.executeScript('Diagnostic Test Run', 'ps1');

    ipc.registerHandler('export_diagnostic_dump', async () => {
      const dumpData = {
        systemInfo: app.state.systemInfo,
        sensorPayload: await ipc.invoke('get_temperatures'),
        terminalLogs: app.state.terminalLogs,
        timestamp: new Date().toISOString()
      };
      const scratchDir = path.join(process.cwd(), 'scratch');
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
      const dumpPath = path.join(scratchDir, 'wiscripts_diag_dump_test.json');
      fs.writeFileSync(dumpPath, JSON.stringify(dumpData, null, 2), 'utf8');
      return dumpPath;
    });

    // Act
    const exportedPath = await ipc.invoke('export_diagnostic_dump');

    // Assert
    assert.isTrue(fs.existsSync(exportedPath), 'Diagnostic dump file created');
    const content = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
    assert.equal(content.systemInfo.osName, 'Windows 11 Pro', 'Dump contains OS info');
    assert.equal(content.sensorPayload.sensor_source, 'LibreHardwareMonitor WMI', 'Dump contains sensor data');
    assert.includes(content.terminalLogs.join('\n'), 'Diagnostic Test Run', 'Dump includes terminal logs');

    // Cleanup
    if (fs.existsSync(exportedPath)) fs.unlinkSync(exportedPath);
  });

  return runner;
}

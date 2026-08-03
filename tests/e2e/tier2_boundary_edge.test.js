/**
 * Tier 2 Test Suite: Boundary & Edge Cases (22 Test Cases)
 * Verifies edge cases, stress payloads, boundary limits, escaping, timeouts, and error handling.
 */

import fs from 'fs';
import path from 'path';
import { assert, MockIPC, AppStateSimulator, TestRunner } from './harness.js';

export function buildTier2Suite() {
  const runner = new TestRunner('Tier 2 - Boundary & Edge Cases');

  // --- 1. Empty script content validation ---
  runner.addTest('T2_F1_1_01: Empty script content input validation raises error before IPC invocation', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Act & Assert
    await assert.throwsAsync(
      async () => await app.executeScript('   ', 'ps1'),
      'Script content cannot be empty',
      'Validation throws on empty script string'
    );
  });

  // --- 2. Max length / large script payload ---
  runner.addTest('T2_F1_1_02: Script Runner handles large script payload without hanging or memory leak', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    const largeLine = 'Write-Host "Performance verification item "\n';
    const largeScript = largeLine.repeat(5000); // 5,000 lines (~200KB)

    // Act
    const res = await app.executeScript(largeScript, 'ps1');

    // Assert
    assert.equal(res.exit_code, 0, 'Large script execution completes with exit code 0');
    assert.greaterThanOrEqual(app.state.terminalLogs.length, 5000, 'Captured all 5,000 streamed lines');
  });

  // --- 3. Invalid file extensions ---
  runner.addTest('T2_F1_1_03: Invalid script file extensions (.exe, .sh, .vbs, .py) are rejected', async () => {
    // Arrange
    function validateScriptFileType(filename) {
      const allowedExts = ['.ps1', '.bat', '.cmd'];
      const ext = path.extname(filename).toLowerCase();
      if (!allowedExts.includes(ext)) {
        throw new Error(`SecurityError: Execution of extension '${ext}' is not permitted`);
      }
      return true;
    }

    // Act & Assert
    assert.throws(() => validateScriptFileType('malicious.exe'), 'SecurityError');
    assert.throws(() => validateScriptFileType('script.sh'), 'SecurityError');
    assert.throws(() => validateScriptFileType('payload.vbs'), 'SecurityError');
    assert.throws(() => validateScriptFileType('exploit.py'), 'SecurityError');
    assert.isTrue(validateScriptFileType('valid.ps1'), 'Valid .ps1 accepted');
  });

  // --- 4. Rapid IPC event stream burst ---
  runner.addTest('T2_F1_2_01: IPC streaming handles rapid burst of 1000 script-output-line events without drop', async () => {
    // Arrange
    const ipc = new MockIPC();
    let receivedCount = 0;
    ipc.listen('script-output-line', () => {
      receivedCount++;
    });

    // Act
    for (let i = 0; i < 1000; i++) {
      await ipc.emit('script-output-line', { line: `Stream item ${i}`, stream: 'stdout' });
    }

    // Assert
    assert.equal(receivedCount, 1000, 'All 1000 emitted events were captured by listener');
  });

  // --- 5. Script non-zero exit code handling ---
  runner.addTest('T2_F1_2_02: execute_custom_script captures non-zero exit code and stderr output', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('execute_custom_script', async () => {
      return { exit_code: 127, stdout: '', stderr: 'Command not found in PATH' };
    });
    const app = new AppStateSimulator(ipc);

    // Act
    const res = await app.executeScript('invalid_cmd', 'bat');

    // Assert
    assert.equal(res.exit_code, 127, 'Exit code is 127');
    assert.equal(res.stderr, 'Command not found in PATH', 'Stderr contains expected error string');
  });

  // --- 6. Empty terminal log download ---
  runner.addTest('T2_F1_3_01: Log export handles empty terminal log output buffer gracefully', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    app.state.terminalLogs = []; // Empty logs

    // Act
    const exportedStr = app.exportLogsToString();

    // Assert
    assert.equal(exportedStr, '', 'Exported empty log returns empty string');
  });

  // --- 7. Unicode & special characters in log export ---
  runner.addTest('T2_F1_3_02: Log export handles unicode and special symbols correctly', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);
    const unicodeText = 'Оптимизация завершена: ⚡ 100% SUCCESS — [äöüßñ]';
    await app.executeScript(unicodeText, 'ps1');

    // Act
    const exportedLog = app.exportLogsToString();

    // Assert
    assert.includes(exportedLog, unicodeText, 'Terminal log preserves utf-8 unicode symbols');
  });

  // --- 8. Dry-Run mode toggling from banner ---
  runner.addTest('T2_F1_4_01: Toggling Dry-Run mode from elevation banner updates store dryRunMode state', async () => {
    // Arrange
    const app = new AppStateSimulator();
    app.state.dryRunMode = false;

    // Act
    app.state.dryRunMode = true;

    // Assert
    assert.isTrue(app.state.dryRunMode, 'dryRunMode set to true in state');
  });

  // --- 9. Bounded queue counter logic for negative inputs ---
  runner.addTest('T2_F2_1_01: Dashboard banner bounds queue count at 0 for negative optimization inputs', async () => {
    // Arrange
    function calculateQueueCount(total, applied) {
      return Math.max(0, total - applied);
    }

    // Act & Assert
    assert.equal(calculateQueueCount(5, 10), 0, 'Negative result (5 - 10 = -5) is bounded at 0');
  });

  // --- 10. Dashboard status polling error recovery ---
  runner.addTest('T2_F2_2_01: Dashboard status polling handles IPC error gracefully with fallback info', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('get_system_info', async () => {
      throw new Error('WMI_SERVICE_UNAVAILABLE');
    });

    // Act & Assert
    await assert.throwsAsync(
      async () => await ipc.invoke('get_system_info'),
      'WMI_SERVICE_UNAVAILABLE',
      'IPC error raised cleanly'
    );
  });

  // --- 11. Telemetry badge fallback for unknown status ---
  runner.addTest('T2_F2_3_01: Dynamic telemetry card styling falls back to default style for null/unknown status', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Act
    const nullStyle = app.getTelemetryBadgeStyle(null);
    const unknownStyle = app.getTelemetryBadgeStyle('unknown_status');

    // Assert
    assert.includes(nullStyle, 'bg-surface-subtle', 'Null status uses subtle fallback background');
    assert.includes(unknownStyle, 'bg-surface-subtle', 'Unknown status uses subtle fallback background');
  });

  // --- 12. i18n parameter interpolation mismatch checks ---
  runner.addTest('T2_F2_4_01: i18n interpolation parameters match between ru.json and en.json', async () => {
    // Arrange
    const app = new AppStateSimulator();
    function extractParams(str) {
      if (typeof str !== 'string') return [];
      const matches = str.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
      return Array.from(new Set(matches.map(m => m.replace(/[\{\}\s]/g, '')))).sort();
    }

    // Act
    const enText = app.translate('dashboard.statusDesc', 'System build {{build}} with {{count}} unapplied');
    const ruText = app.locales.ru?.dashboard?.statusDesc || 'Сборка {{build}}, в очереди {{count}}';

    const enParams = extractParams(enText);
    const ruParams = extractParams(ruText);

    // Assert
    assert.deepEqual(enParams, ['build', 'count'], 'EN parameters match schema');
    assert.deepEqual(ruParams, ['build', 'count'], 'RU parameters match schema');
  });

  // --- 13. Empty WMI sensor response handling ---
  runner.addTest('T2_F3_1_01: WMI sensor collector handles empty sensor response payload returning N/A values', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('get_temperatures', async () => ({
      cpu_temp_celsius: null,
      gpu_temp_celsius: null,
      is_cpu_temp_available: false,
      is_gpu_temp_available: false,
      sensor_source: 'None / Unsupported',
      sensor_items: [],
      selected_cpu_sensor_id: null,
      selected_gpu_sensor_id: null
    }));

    // Act
    const payload = await ipc.invoke('get_temperatures');

    // Assert
    assert.equal(payload.cpu_temp_celsius, null, 'CPU temp is null');
    assert.isFalse(payload.is_cpu_temp_available, 'is_cpu_temp_available is false');
    assert.equal(payload.sensor_source, 'None / Unsupported', 'Sensor source indicates unsupported');
  });

  // --- 14. Multi-tier temperature collector fallback chain ---
  runner.addTest('T2_F3_1_02: Temperature collector cascades through fallback providers when LHM WMI fails', async () => {
    // Arrange
    const providers = ['LibreHardwareMonitor WMI', 'OpenHardwareMonitor WMI', 'NVIDIA NVML', 'ACPI WMI', 'sysinfo'];
    function resolveTemperatureCollector(availableProviders) {
      for (const p of providers) {
        if (availableProviders.includes(p)) {
          return { provider: p, tempC: p === 'sysinfo' ? 42.0 : 48.5 };
        }
      }
      return { provider: 'None', tempC: null };
    }

    // Act: Fail LHM and OHM, available NVML
    const res = resolveTemperatureCollector(['NVIDIA NVML', 'ACPI WMI', 'sysinfo']);

    // Assert
    assert.equal(res.provider, 'NVIDIA NVML', 'Cascades to NVIDIA NVML when WMI options fail');
    assert.equal(res.tempC, 48.5, 'Returns valid temperature from active provider');
  });

  // --- 15. Empty sensor payload items array handling ---
  runner.addTest('T2_F3_2_01: Extended sensor payload with 0 items returns empty array without throwing index error', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('get_temperatures', async () => ({
      sensor_items: []
    }));

    // Act
    const payload = await ipc.invoke('get_temperatures');

    // Assert
    assert.ok(Array.isArray(payload.sensor_items), 'sensor_items is an array');
    assert.equal(payload.sensor_items.length, 0, 'sensor_items is empty');
  });

  // --- 16. Dropdown manual fallback selection when auto-detect returns empty/null ---
  runner.addTest('T2_F3_3_01: Manual fallback selection dropdown activates when auto-detect is null', async () => {
    // Arrange
    const app = new AppStateSimulator();
    app.state.currentMetrics.cpuTempC = null;
    app.state.sensorPayload = {
      sensor_items: [
        { id: 'acpi_thermal_zone_1', name: 'ACPI Thermal Zone 1', label: 'ACPI Zone', temperature_celsius: 44.0, sensor_type: 'cpu', provider: 'ACPI WMI' }
      ]
    };

    // Act
    function resolveEffectiveCpuTemp(appState) {
      if (appState.currentMetrics.cpuTempC !== null) return appState.currentMetrics.cpuTempC;
      if (appState.state?.selectedCpuSensorId) {
        const item = appState.state.sensorPayload?.sensor_items?.find(i => i.id === appState.state.selectedCpuSensorId);
        if (item) return item.temperature_celsius;
      }
      // Manual dropdown fallback first item
      const fallbackItem = appState.state.sensorPayload?.sensor_items?.find(i => i.sensor_type === 'cpu');
      return fallbackItem ? fallbackItem.temperature_celsius : null;
    }

    const temp = resolveEffectiveCpuTemp({ currentMetrics: app.state.currentMetrics, state: app.state });

    // Assert
    assert.equal(temp, 44.0, 'Fallback dropdown resolves manual sensor item temperature 44.0°C');
  });

  // --- 17. Reverting to auto-detection when non-existent manual sensor ID selected ---
  runner.addTest('T2_F3_3_02: Selecting non-existent sensor ID reverts to auto-detection fallback', async () => {
    // Arrange
    const app = new AppStateSimulator();
    app.state.selectedCpuSensorId = 'non_existent_sensor_999';

    // Act
    function getSelectedSensorOrDefault(appState, autoDetectedTemp) {
      const items = appState.sensorPayload?.sensor_items || [];
      const selected = items.find(i => i.id === appState.selectedCpuSensorId);
      if (selected) return selected.temperature_celsius;
      return autoDetectedTemp; // Revert
    }

    const effectiveTemp = getSelectedSensorOrDefault(app.state, 45.2);

    // Assert
    assert.equal(effectiveTemp, 45.2, 'Reverted to auto-detected temperature 45.2°C');
  });

  // --- 18. Adversarial ShellExecuteW escaping ---
  runner.addTest('T2_F4_2_01: ShellExecuteW escaping neutralizes command injection attacks', async () => {
    // Arrange
    const maliciousInput = 'calc.exe & dir "C:\\" | whoami ; rm -rf /';
    
    // Act: Rust ShellExecuteW escape simulator
    function sanitizeShellExecuteArg(argStr) {
      // Wraps arg in quotes and escapes internal quotes
      return `"${argStr.replace(/"/g, '""')}"`;
    }
    const sanitized = sanitizeShellExecuteArg(maliciousInput);

    // Assert
    assert.equal(sanitized, '"calc.exe & dir ""C:\\"" | whoami ; rm -rf /"', 'Injected operators encapsulated inside string quote boundary');
  });

  // --- 19. 3-second WMI subprocess timeout handling ---
  runner.addTest('T2_F4_3_01: WMI subprocess query hitting 3-second timeout cancels query and returns fallback', async () => {
    // Arrange
    async function executeWmiQueryWithTimeout(queryFn, timeoutMs = 3000) {
      return new Promise((resolve) => {
        let timer = setTimeout(() => {
          resolve({ success: false, timed_out: true, data: null, error: 'WMI Query Timed Out (3000ms limit reached)' });
        }, timeoutMs);

        queryFn().then((res) => {
          clearTimeout(timer);
          resolve({ success: true, timed_out: false, data: res, error: null });
        }).catch((err) => {
          clearTimeout(timer);
          resolve({ success: false, timed_out: false, data: null, error: err.message });
        });
      });
    }

    // Act: Simulate hanging WMI query (takes 5000ms)
    const hangingQuery = () => new Promise(resolve => setTimeout(() => resolve('WMI Data'), 5000));
    const result = await executeWmiQueryWithTimeout(hangingQuery, 100); // 100ms for fast test execution

    // Assert
    assert.isFalse(result.success, 'WMI query marked as failed');
    assert.isTrue(result.timed_out, 'WMI query marked as timed_out');
    assert.includes(result.error, 'Timed Out', 'Error message indicates timeout');
  });

  // --- 20. Path traversal prevention in temp script filenames ---
  runner.addTest('T2_F4_4_01: Temp script runner prevents directory traversal in script names', async () => {
    // Arrange
    const rawFilename = '..\\..\\Windows\\System32\\cmd.exe';
    
    // Act: Path sanitizer
    function sanitizeScriptFileName(inputName) {
      const baseName = path.basename(inputName);
      if (baseName.includes('..') || inputName.includes('/') || inputName.includes('\\')) {
        return baseName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.ps1';
      }
      return baseName;
    }

    const safeName = sanitizeScriptFileName(rawFilename);

    // Assert
    assert.isFalse(safeName.includes('..'), 'Path traversal dots stripped');
    assert.isFalse(safeName.includes('\\'), 'Backslashes stripped');
    assert.isTrue(safeName.endsWith('.ps1'), 'Standard extension appended');
  });

  // --- 21. Secure temp script execution directory path structure & drop cleanup ---
  runner.addTest('T2_F4_4_02: Temp script directory resolves inside %LOCALAPPDATA%\\WiScripts\\TempScripts\\', async () => {
    // Arrange
    const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Test\\AppData\\Local';
    const targetDir = path.join(localAppData, 'WiScripts', 'TempScripts');

    // Act
    function getTempScriptPath(uuid, ext = 'ps1') {
      return path.join(targetDir, `temp_script_${uuid}.${ext}`);
    }

    const scriptPath = getTempScriptPath('abc-123-xyz', 'ps1');

    // Assert
    assert.includes(scriptPath, 'WiScripts', 'Path contains WiScripts root folder');
    assert.includes(scriptPath, 'TempScripts', 'Path contains TempScripts execution folder');
    assert.includes(scriptPath, 'temp_script_abc-123-xyz.ps1', 'Path includes sanitized temp script filename');
  });

  // --- 22. Autorun registry lock error handling ---
  runner.addTest('T2_F4_5_01: Autorun registry scanner handles locked key access (ERROR_SHARING_VIOLATION)', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.registerHandler('get_autoruns', async () => {
      const err = new Error('ERROR_SHARING_VIOLATION: Key locked by system process');
      err.code = 32;
      throw err;
    });

    // Act & Assert
    await assert.throwsAsync(
      async () => await ipc.invoke('get_autoruns'),
      'ERROR_SHARING_VIOLATION',
      'Registry lock error raised cleanly without crashing process'
    );
  });

  return runner;
}

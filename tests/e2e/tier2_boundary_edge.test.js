/**
 * Tier 2 Test Suite: Boundary Value Analysis & Edge Cases (WiScripts Windows v1.3.0)
 * Verifies edge cases, stress payloads, boundary limits, escaping, unprivileged elevation errors,
 * extreme thresholds, path traversal security, and missing hardware handling across R1 through R5.
 */

import {
  assert,
  KernelLatencySimulator,
  NativeMemoryPurgerSimulator,
  NetworkFirewallSimulator,
  HardwareTelemetrySimulator,
  CommandPaletteEngine,
  MockIPC,
  AppStateSimulator,
  TestRunner
} from './harness.js';

export function buildTier2Suite() {
  const runner = new TestRunner('Tier 2 - Boundary & Edge Cases');

  // =========================================================================
  // 1. Gaming & Latency Subsystem Boundaries (R1)
  // =========================================================================

  runner.addTest('T2_R1_01: Timer resolution clamps between platform min (156250) and max precision (5000)', async () => {
    // Arrange
    const kernel = new KernelLatencySimulator();

    // Act 1: Below 0.5ms (e.g. 1000 = 0.1ms) -> Clamps to 5000 (0.5ms)
    const clampedMax = kernel.setResolution(1000);
    assert.equal(clampedMax.currentResolution100ns, 5000, 'Clamps sub-0.5ms requests to 5000');

    // Act 2: Above 15.625ms (e.g. 300000 = 30ms) -> Clamps to 156250 (15.625ms)
    const clampedMin = kernel.setResolution(300000);
    assert.equal(clampedMin.currentResolution100ns, 156250, 'Clamps super-15.625ms requests to 156250');
  });

  runner.addTest('T2_R1_02: Game Boost handles negative or zero target PID with validation error', async () => {
    // Arrange
    const kernel = new KernelLatencySimulator();

    // Act & Assert
    assert.throws(
      () => kernel.toggleGameBoost(-5, true),
      'InvalidProcessId',
      'Throws on negative PID'
    );
    assert.throws(
      () => kernel.toggleGameBoost(0, true),
      'InvalidProcessId',
      'Throws on PID 0'
    );
  });

  runner.addTest('T2_R1_03: Unprivileged user invocation for timer resolution/Game Boost throws AccessDenied', async () => {
    // Arrange: unprivileged IPC instance (isElevated = false)
    const unprivilegedIpc = new MockIPC(false);

    // Act & Assert 1: set_timer_resolution
    await assert.throwsAsync(
      async () => await unprivilegedIpc.invoke('set_timer_resolution', { resolution_100ns: 5000 }),
      'AccessDenied',
      'Unprivileged timer adjustment rejected'
    );

    // Act & Assert 2: toggle_game_boost
    await assert.throwsAsync(
      async () => await unprivilegedIpc.invoke('toggle_game_boost', { target_pid: 1234, enable: true }),
      'AccessDenied',
      'Unprivileged Game Boost rejected'
    );
  });

  runner.addTest('T2_R1_04: Rapid toggle of Game Boost (10x in succession) maintains state consistency', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act: rapidly enable and disable
    for (let i = 0; i < 10; i++) {
      await ipc.invoke('toggle_game_boost', { target_pid: 4000 + i, enable: true });
      await ipc.invoke('toggle_game_boost', { target_pid: null, enable: false });
    }

    // Assert: final state is completely clean
    const status = await ipc.invoke('get_game_boost_status');
    assert.isFalse(status.isActive, 'Game boost is cleanly deactivated');
    assert.equal(status.boostedPid, null, 'Boosted PID is null');
    assert.equal(status.suspendedServices.length, 0, 'No suspended services remain');
    assert.equal(status.currentResolution100ns, 156250, 'Timer resolution restored to default');
    assert.equal(ipc.kernelLatency.toggleHistory.length, 20, 'All 20 toggle events recorded');
  });

  runner.addTest('T2_R1_05: Latency metrics computation handles empty/zero driver telemetry without NaN', async () => {
    // Arrange
    const kernel = new KernelLatencySimulator();
    kernel.driverTelemetry = []; // Zero drivers loaded

    // Act
    const metrics = kernel.getLatencyMetrics();

    // Assert
    assert.equal(metrics.currentLatencyUs, 0, 'Average latency is 0 without division by zero');
    assert.equal(metrics.maxLatencyUs, 0, 'Max latency is 0');
    assert.isFalse(isNaN(metrics.currentLatencyUs), 'No NaN values generated');
  });

  // =========================================================================
  // 2. Smart RAM Purger Boundaries (R2)
  // =========================================================================

  runner.addTest('T2_R2_01: Memory auto-trimmer handles 0% and 100% threshold boundary values safely', async () => {
    // Arrange
    const purger = new NativeMemoryPurgerSimulator();

    // Act 1: 0% threshold
    const cfg0 = purger.configureAutoTrimmer({ enabled: true, thresholdPercent: 0 });
    assert.equal(cfg0.thresholdPercent, 0, '0% threshold accepted');
    const trim0 = purger.checkAndAutoTrim();
    assert.isTrue(trim0.triggered, '0% threshold immediately triggers auto-trim');

    // Act 2: 100% threshold
    const cfg100 = purger.configureAutoTrimmer({ enabled: true, thresholdPercent: 100 });
    assert.equal(cfg100.thresholdPercent, 100, '100% threshold accepted');
    const trim100 = purger.checkAndAutoTrim();
    assert.isFalse(trim100.triggered, '100% threshold does not trigger on normal load');
  });

  runner.addTest('T2_R2_02: Empty or malformed whitelist automatically preserves hardcoded system essentials', async () => {
    // Arrange
    const purger = new NativeMemoryPurgerSimulator();

    // Act: pass null / empty excluded PIDs
    const res = purger.purgeWorkingSets(null);

    // Assert: system whitelisted processes (csrss, lsass, smss, services, explorer) are preserved
    assert.isTrue(res.success, 'Purge succeeds');
    assert.greaterThanOrEqual(res.excludedCount, 5, 'Hardcoded system essentials protected');
  });

  runner.addTest('T2_R2_03: Unprivileged user invocation for standby purge throws AccessDenied', async () => {
    // Arrange
    const unprivilegedIpc = new MockIPC(false);

    // Act & Assert
    await assert.throwsAsync(
      async () => await unprivilegedIpc.invoke('purge_standby_memory'),
      'AccessDenied',
      'Unprivileged standby purge rejected'
    );
  });

  runner.addTest('T2_R2_04: Unprivileged user invocation for working sets purge throws AccessDenied', async () => {
    // Arrange
    const unprivilegedIpc = new MockIPC(false);

    // Act & Assert
    await assert.throwsAsync(
      async () => await unprivilegedIpc.invoke('purge_working_sets'),
      'AccessDenied',
      'Unprivileged working set trim rejected'
    );
  });

  runner.addTest('T2_R2_05: Purge history buffer is capped at 1,000 entries preventing memory leaks', async () => {
    // Arrange
    const purger = new NativeMemoryPurgerSimulator();

    // Act: simulate 1,050 purge operations
    for (let i = 0; i < 1050; i++) {
      purger.addHistory({ timestamp: new Date().toISOString(), type: 'standby_list', freedMb: 100 });
    }

    // Assert
    assert.equal(purger.purgeHistory.length, 1000, 'History buffer bounded at max 1,000 entries');
  });

  // =========================================================================
  // 3. Network & Firewall Subsystem Boundaries (R3)
  // =========================================================================

  runner.addTest('T2_R3_01: Sockets with PID 0 (System Idle) or unknown processes are handled safely', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const conns = await ipc.invoke('get_active_network_connections');
    const idleConn = conns.find(c => c.pid === 0);

    // Assert
    assert.ok(idleConn, 'Connection for PID 0 exists');
    assert.equal(idleConn.processName, 'System Idle Process', 'PID 0 resolved safely');
    assert.equal(idleConn.uploadBps, 0, 'No bandwidth for idle process');
  });

  runner.addTest('T2_R3_02: Path traversal attempts in firewall executable paths are strictly rejected', async () => {
    // Arrange
    const firewall = new NetworkFirewallSimulator();
    const maliciousPaths = [
      '..\\..\\malware.exe',
      'C:\\Windows\\System32\\..\\..\\payload.exe',
      'C:/Temp/../../malicious.exe'
    ];

    // Act & Assert
    for (const badPath of maliciousPaths) {
      assert.throws(
        () => firewall.blockProcess(badPath),
        'PathTraversalDetected',
        `Rejects path traversal: ${badPath}`
      );
    }
  });

  runner.addTest('T2_R3_03: Empty or whitespace process path for firewall block is rejected', async () => {
    // Arrange
    const firewall = new NetworkFirewallSimulator();

    // Act & Assert
    assert.throws(
      () => firewall.blockProcess('   '),
      'InvalidPath',
      'Rejects whitespace process path'
    );
    assert.throws(
      () => firewall.blockProcess(''),
      'InvalidPath',
      'Rejects empty process path'
    );
  });

  runner.addTest('T2_R3_04: Duplicate firewall block for already blocked process is handled idempotently', async () => {
    // Arrange
    const ipc = new MockIPC();
    const procPath = 'C:\\Program Files\\App\\app.exe';

    // Act: Block twice
    const res1 = await ipc.invoke('block_process_firewall', { process_path: procPath });
    const res2 = await ipc.invoke('block_process_firewall', { process_path: procPath });

    // Assert
    assert.isTrue(res1.success, 'First block succeeded');
    assert.isTrue(res2.success, 'Second block succeeded idempotently');
    const rules = await ipc.invoke('get_firewall_rules');
    const matching = rules.filter(r => r.processPath === procPath);
    assert.equal(matching.length, 1, 'Only one rule maintained without duplicate duplication');
  });

  runner.addTest('T2_R3_05: Unblock for process with no existing firewall rules returns clean zero-count result', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const res = await ipc.invoke('unblock_process_firewall', { rule_name: 'NonExistentRule' });

    // Assert
    assert.isTrue(res.success, 'Unblock call succeeds cleanly');
    assert.equal(res.removedRulesCount, 0, 'Zero rules removed');
    assert.includes(res.message, 'No active rule found', 'Informative message returned');
  });

  runner.addTest('T2_R3_06: Unprivileged firewall rule modification throws AccessDenied', async () => {
    // Arrange
    const unprivilegedIpc = new MockIPC(false);

    // Act & Assert
    await assert.throwsAsync(
      async () => await unprivilegedIpc.invoke('block_process_firewall', { process_path: 'C:\\App\\app.exe' }),
      'AccessDenied',
      'Unprivileged firewall block rejected'
    );
    await assert.throwsAsync(
      async () => await unprivilegedIpc.invoke('unblock_process_firewall', { rule_name: 'WiScripts_Block_app.exe' }),
      'AccessDenied',
      'Unprivileged firewall unblock rejected'
    );
  });

  // =========================================================================
  // 4. Hardware Telemetry Boundaries (R4)
  // =========================================================================

  runner.addTest('T2_R4_01: Desktop systems without battery return batteryPresent: false without error', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.hardwareTelemetry.setSystemType('desktop');

    // Act
    const battery = await ipc.invoke('get_battery_health_analytics');

    // Assert
    assert.isFalse(battery.batteryPresent, 'Battery not present on desktop');
    assert.equal(battery.powerSource, 'AC', 'Power source is AC');
    assert.equal(battery.wearLevelPercent, 0, 'Wear level is 0');
    assert.equal(battery.cycleCount, 0, 'Cycle count is 0');
  });

  runner.addTest('T2_R4_02: Non-NVMe / SATA drives fall back to generic SMART metrics without error', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const devices = await ipc.invoke('get_storage_devices_health');
    const sataDrive = devices.find(d => d.interfaceType === 'SATA');

    // Assert
    assert.ok(sataDrive, 'Found secondary SATA drive');
    assert.equal(sataDrive.interfaceType, 'SATA', 'Interface identified as SATA');
    assert.greaterThanOrEqual(sataDrive.healthPercentage, 90, 'SATA health reported');
    assert.isTrue(sataDrive.isHealthy, 'SATA drive is healthy');
  });

  runner.addTest('T2_R4_03: Battery wear level calculation handles 0 design capacity without divide-by-zero', async () => {
    // Arrange
    const hw = new HardwareTelemetrySimulator();
    hw.battery.designCapacityMwh = 0;
    hw.battery.fullChargeCapacityMwh = 0;

    // Act
    const analytics = hw.getBatteryAnalytics();

    // Assert
    assert.equal(analytics.wearLevelPercent, 0, 'Wear level is 0 without divide-by-zero NaN');
    assert.isFalse(isNaN(analytics.wearLevelPercent), 'wearLevelPercent is not NaN');
  });

  runner.addTest('T2_R4_04: Multiple physical drives are correctly enumerated and indexed', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const devices = await ipc.invoke('get_storage_devices_health');

    // Assert
    assert.equal(devices.length, 2, 'Enumerated exactly 2 physical drives');
    assert.equal(devices[0].deviceId, '\\\\.\\PhysicalDrive0', 'First drive is PhysicalDrive0');
    assert.equal(devices[1].deviceId, '\\\\.\\PhysicalDrive1', 'Second drive is PhysicalDrive1');
  });

  runner.addTest('T2_R4_05: Temperature sensors reporting extreme out-of-bound values are flagged with warnings', async () => {
    // Arrange
    const hw = new HardwareTelemetrySimulator();
    hw.devices[0].temperatureC = 88; // > 80°C threshold

    // Act
    const devices = hw.getStorageDevices();

    // Assert
    assert.ok(devices[0].sensorWarning, 'Sensor warning flagged for high temperature');
    assert.includes(devices[0].sensorWarning, 'Abnormal temperature detected', 'Warning message present');
  });

  runner.addTest('T2_R4_06: Invalid power scheme GUID returns PowerSchemeNotFound error', async () => {
    // Arrange
    const ipc = new MockIPC();
    const badGuid = '00000000-0000-0000-0000-000000000000';

    // Act & Assert
    await assert.throwsAsync(
      async () => await ipc.invoke('set_active_power_scheme', { scheme_guid: badGuid }),
      'PowerSchemeNotFound',
      'Rejects invalid power scheme GUID'
    );
  });

  // =========================================================================
  // 5. UI & Command Palette Boundaries (R5)
  // =========================================================================

  runner.addTest('T2_R5_01: Command Palette search neutralizes regex meta-characters without crashing', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();
    const specialQueries = ['[dpc]', '(ram)', '.*', 'power+', 'firewall?'];

    // Act & Assert
    for (const q of specialQueries) {
      const results = palette.search(q);
      assert.isTrue(Array.isArray(results), `Search succeeded for meta-character query: ${q}`);
    }
  });

  runner.addTest('T2_R5_02: Command Palette search handles extreme length query strings (>500 chars)', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();
    const extremeQuery = 'superlongquery'.repeat(50); // 700 chars

    // Act
    const results = palette.search(extremeQuery);

    // Assert
    assert.isTrue(Array.isArray(results), 'Returns array for extreme length query');
    assert.equal(results.length, 0, 'No items match nonsensical 700-char query');
  });

  runner.addTest('T2_R5_03: Command Palette search with pure whitespace returns default recommendations', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();

    // Act
    const results = palette.search('     ');

    // Assert
    assert.greaterThanOrEqual(results.length, 5, 'Returns default top navigation recommendations');
  });

  runner.addTest('T2_R5_04: AppStateSimulator handles missing translation keys by returning fallback safely', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Act
    const missingKey = app.translate('non.existent.key.name', 'Fallback Value');

    // Assert
    assert.equal(missingKey, 'Fallback Value', 'Returns explicit fallback value');
  });

  return runner;
}

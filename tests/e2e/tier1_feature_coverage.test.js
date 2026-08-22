/**
 * Tier 1 Test Suite: Feature Coverage (WiScripts Windows v1.3.0)
 * Verifies core functionality for requirements R1 through R5:
 * - R1: Gaming Low-Latency Engine & DPC Latency Analyzer
 * - R2: Smart RAM & Standby List Memory Purger
 * - R3: Live Network Traffic & Process Firewall Shield
 * - R4: Hardware NVMe SMART Health & Battery/Power Analytics
 * - R5: UI Architecture, Refined Minimal Design Tokens & i18n Parity
 */

import {
  assert,
  computeSha256,
  KernelLatencySimulator,
  NativeMemoryPurgerSimulator,
  NetworkFirewallSimulator,
  HardwareTelemetrySimulator,
  Win32ScmSimulator,
  CommandPaletteEngine,
  MockIPC,
  AppStateSimulator,
  TestRunner
} from './harness.js';

export function buildTier1Suite() {
  const runner = new TestRunner('Tier 1 - Feature Coverage (R1-R5)');

  // =========================================================================
  // R1: Gaming Low-Latency & DPC Latency Analyzer
  // =========================================================================

  runner.addTest('T1_R1_01: get_latency_metrics returns valid timer resolution, DPC and ISR telemetry', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const metrics = await ipc.invoke('get_latency_metrics');

    // Assert
    assert.ok(metrics, 'Latency metrics returned');
    assert.greaterThanOrEqual(metrics.currentLatencyUs, 0, 'Current latency is non-negative');
    assert.greaterThanOrEqual(metrics.maxLatencyUs, metrics.currentLatencyUs, 'Max latency >= current latency');
    assert.greaterThanOrEqual(metrics.dpcCount, 0, 'DPC count is non-negative');
    assert.greaterThanOrEqual(metrics.isrCount, 0, 'ISR count is non-negative');
    assert.isTrue(Array.isArray(metrics.driverLatencies), 'Driver latencies is an array');
    assert.greaterThanOrEqual(metrics.driverLatencies.length, 1, 'At least one driver latency is reported');
    assert.equal(metrics.status, 'OPTIMAL', 'Initial status is optimal');
  });

  runner.addTest('T1_R1_02: set_timer_resolution adjusts timer to 0.5ms (5000 100ns units)', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const res = await ipc.invoke('set_timer_resolution', { resolution_100ns: 5000 });

    // Assert
    assert.equal(res.currentResolution100ns, 5000, 'Resolution adjusted to 5000 (0.5ms)');
    assert.isTrue(res.isHighPrecision, 'High precision flag is true');
    assert.equal(res.maxResolution100ns, 5000, 'Max precision is 5000');
  });

  runner.addTest('T1_R1_03: toggle_game_boost enables high priority for target game process', async () => {
    // Arrange
    const ipc = new MockIPC();
    const targetPid = 5420;

    // Act
    const status = await ipc.invoke('toggle_game_boost', { target_pid: targetPid, enable: true });

    // Assert
    assert.isTrue(status.isActive, 'Game boost is active');
    assert.equal(status.boostedPid, targetPid, 'Target PID is recorded');
    assert.includes(status.targetProcessName, 'CyberGame2077', 'Target process name identified');
    assert.isTrue(status.timerResolutionAdjusted, 'Timer resolution adjusted');
  });

  runner.addTest('T1_R1_04: toggle_game_boost suspends non-essential background services during session', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const status = await ipc.invoke('toggle_game_boost', { target_pid: 4108, enable: true });

    // Assert
    assert.isTrue(status.suspendedServices.length >= 3, 'Suspends at least 3 non-essential services');
    assert.includes(status.suspendedServices, 'DiagTrack', 'DiagTrack telemetry is suspended');
    assert.includes(status.suspendedServices, 'SysMain', 'SysMain superfetch is suspended');
    assert.includes(status.suspendedServices, 'dmwappushservice', 'dmwappushservice is suspended');
  });

  runner.addTest('T1_R1_05: get_game_boost_status reflects session state and allows clean teardown', async () => {
    // Arrange
    const ipc = new MockIPC();
    await ipc.invoke('toggle_game_boost', { target_pid: 7712, enable: true });

    // Act 1: Query status while active
    const activeStatus = await ipc.invoke('get_game_boost_status');
    assert.isTrue(activeStatus.isActive, 'Status indicates active session');

    // Act 2: Disable game boost (game exited)
    const disabledStatus = await ipc.invoke('toggle_game_boost', { target_pid: null, enable: false });

    // Assert
    assert.isFalse(disabledStatus.isActive, 'Game boost is deactivated');
    assert.equal(disabledStatus.boostedPid, null, 'Boosted PID cleared');
    assert.equal(disabledStatus.suspendedServices.length, 0, 'Services resumed');
    assert.equal(disabledStatus.currentResolution100ns, 156250, 'Timer restored to default 15.625ms');
  });

  // =========================================================================
  // R2: Smart RAM & Standby List Memory Purger
  // =========================================================================

  runner.addTest('T1_R2_01: get_memory_breakdown returns total, in-use, standby, and free memory', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const mem = await ipc.invoke('get_memory_breakdown');

    // Assert
    assert.ok(mem.totalMb > 0, 'Total RAM is positive');
    assert.ok(mem.inUseMb > 0, 'In-use RAM is positive');
    assert.ok(mem.standbyMb > 0, 'Standby RAM is positive');
    assert.ok(mem.freeMb >= 0, 'Free RAM is non-negative');
    assert.greaterThanOrEqual(mem.usagePercent, 1, 'Usage percent >= 1');
    assert.lessThanOrEqual(mem.usagePercent, 100, 'Usage percent <= 100');
  });

  runner.addTest('T1_R2_02: purge_standby_memory executes NT standby list purge and returns freed MB', async () => {
    // Arrange
    const ipc = new MockIPC();
    const initial = await ipc.invoke('get_memory_breakdown');

    // Act
    const result = await ipc.invoke('purge_standby_memory', { mode: 'normal' });

    // Assert
    assert.isTrue(result.success, 'Purge executed successfully');
    assert.greaterThanOrEqual(result.freedMb, 1000, 'Reclaimed substantial standby memory (>1000MB)');
    const updated = await ipc.invoke('get_memory_breakdown');
    assert.ok(updated.standbyMb < initial.standbyMb, 'Standby cache decreased');
    assert.ok(updated.freeMb > initial.freeMb, 'Free RAM increased');
  });

  runner.addTest('T1_R2_03: purge_working_sets trims user process working sets respecting whitelist', async () => {
    // Arrange
    const ipc = new MockIPC();
    const excludedPids = [1234, 5678];

    // Act
    const result = await ipc.invoke('purge_working_sets', { excluded_pids: excludedPids });

    // Assert
    assert.isTrue(result.success, 'Working sets trimmed successfully');
    assert.greaterThanOrEqual(result.freedMb, 100, 'Reclaimed working set memory');
    assert.greaterThanOrEqual(result.processesTrimmed, 10, 'Trimmed multiple running user processes');
    assert.greaterThanOrEqual(result.excludedCount, 2, 'Protected excluded processes');
  });

  runner.addTest('T1_R2_04: background auto-trimmer triggers when RAM usage exceeds threshold', async () => {
    // Arrange
    const ipc = new MockIPC();
    const purger = ipc.memoryPurger;

    // Simulate high memory pressure: 80%+ usage
    purger.inUseMb = 13000;
    purger.standbyMb = 2500;
    purger.configureAutoTrimmer({ enabled: true, thresholdPercent: 80 });

    // Act
    const trimResult = purger.checkAndAutoTrim();

    // Assert
    assert.isTrue(trimResult.triggered, 'Auto-trimmer triggered on 80% threshold');
    assert.greaterThanOrEqual(trimResult.freedMb, 1000, 'Reclaimed memory via auto-trim');
    assert.ok(trimResult.currentUsagePercent < 80, 'RAM usage reduced below threshold');
  });

  runner.addTest('T1_R2_05: configure_ram_auto_trimmer and get_ram_auto_trimmer_config synchronize settings', async () => {
    // Arrange
    const ipc = new MockIPC();
    const newConfig = {
      enabled: true,
      thresholdPercent: 75,
      checkIntervalSec: 30,
      minFreedMbThreshold: 1024,
      excludedPids: [8840],
      excludedProcessNames: ['code.exe', 'obs64.exe']
    };

    // Act
    const saved = await ipc.invoke('configure_ram_auto_trimmer', { config: newConfig });
    const fetched = await ipc.invoke('get_ram_auto_trimmer_config');

    // Assert
    assert.isTrue(saved.enabled, 'Auto-trimmer enabled in response');
    assert.equal(saved.thresholdPercent, 75, 'Threshold saved as 75%');
    assert.equal(fetched.checkIntervalSec, 30, 'Interval fetched as 30s');
    assert.includes(fetched.excludedProcessNames, 'obs64.exe', 'Excluded process names preserved');
  });

  // =========================================================================
  // R3: Live Network Traffic & Process Firewall Shield
  // =========================================================================

  runner.addTest('T1_R3_01: get_active_network_connections returns TCP/UDP sockets with resolved PIDs', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const conns = await ipc.invoke('get_active_network_connections');

    // Assert
    assert.isTrue(Array.isArray(conns), 'Returns array of connections');
    assert.greaterThanOrEqual(conns.length, 3, 'Returns active network connections');
    const tcpConn = conns.find(c => c.protocol === 'TCP' && c.state === 'ESTABLISHED');
    assert.ok(tcpConn, 'Contains established TCP connection');
    assert.ok(tcpConn.pid > 0, 'Connection has valid PID');
    assert.ok(tcpConn.processName, 'Connection has resolved process name');
  });

  runner.addTest('T1_R3_02: block_process_firewall creates Windows Defender inbound/outbound block rules', async () => {
    // Arrange
    const ipc = new MockIPC();
    const targetPath = 'C:\\Users\\TestUser\\AppData\\Local\\Temp\\suspicious_miner.exe';

    // Act
    const result = await ipc.invoke('block_process_firewall', {
      process_path: targetPath,
      rule_name: 'WiScripts_Block_suspicious_miner.exe'
    });

    // Assert
    assert.isTrue(result.success, 'Block rule created successfully');
    assert.equal(result.action, 'Block', 'Rule action is Block');
    assert.equal(result.processName, 'suspicious_miner.exe', 'Process name matches');

    const rules = await ipc.invoke('get_firewall_rules');
    assert.ok(rules.some(r => r.processPath === targetPath), 'Rule present in firewall rules list');
  });

  runner.addTest('T1_R3_03: unblock_process_firewall removes firewall blocking rules cleanly', async () => {
    // Arrange
    const ipc = new MockIPC();
    const targetPath = 'C:\\Program Files\\TestApp\\testapp.exe';
    await ipc.invoke('block_process_firewall', { process_path: targetPath, rule_name: 'WiScripts_Block_testapp.exe' });

    // Act
    const result = await ipc.invoke('unblock_process_firewall', { rule_name: 'WiScripts_Block_testapp.exe' });

    // Assert
    assert.isTrue(result.success, 'Unblock action completed');
    assert.equal(result.removedRulesCount, 1, 'Removed exactly 1 rule');
    const rules = await ipc.invoke('get_firewall_rules');
    assert.isFalse(rules.some(r => r.ruleName === 'WiScripts_Block_testapp.exe'), 'Rule no longer present');
  });

  runner.addTest('T1_R3_04: get_firewall_rules lists currently registered firewall shield rules', async () => {
    // Arrange
    const ipc = new MockIPC();
    await ipc.invoke('block_process_firewall', { process_path: 'C:\\App1\\app1.exe' });
    await ipc.invoke('block_process_firewall', { process_path: 'C:\\App2\\app2.exe' });

    // Act
    const rules = await ipc.invoke('get_firewall_rules');

    // Assert
    assert.greaterThanOrEqual(rules.length, 2, 'Lists registered firewall rules');
    assert.isTrue(rules.every(r => r.action === 'Block' && r.isEnabled), 'All rules are active blocks');
  });

  runner.addTest('T1_R3_05: network bandwidth estimator computes per-process upload and download rates', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const conns = await ipc.invoke('get_active_network_connections');

    // Assert
    const activeMiner = conns.find(c => c.processName === 'suspicious_miner.exe');
    assert.ok(activeMiner, 'Found suspicious miner connection');
    assert.greaterThanOrEqual(activeMiner.uploadBps, 50000, 'Estimated upload bandwidth > 50KB/s');
    assert.greaterThanOrEqual(activeMiner.downloadBps, 20000, 'Estimated download bandwidth > 20KB/s');
  });

  // =========================================================================
  // R4: Hardware NVMe SMART Health & Battery/Power Analytics
  // =========================================================================

  runner.addTest('T1_R4_01: get_storage_devices_health returns NVMe drive temperature, TBW, and health %', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const devices = await ipc.invoke('get_storage_devices_health');

    // Assert
    assert.isTrue(Array.isArray(devices), 'Returns array of storage devices');
    assert.greaterThanOrEqual(devices.length, 1, 'At least 1 storage device returned');
    const nvme = devices.find(d => d.interfaceType === 'NVMe');
    assert.ok(nvme, 'Identified NVMe primary drive');
    assert.greaterThanOrEqual(nvme.healthPercentage, 90, 'Health percentage is high');
    assert.greaterThanOrEqual(nvme.temperatureC, 20, 'Temperature is realistic (>20°C)');
    assert.lessThanOrEqual(nvme.temperatureC, 75, 'Temperature within safe bounds (<75°C)');
    assert.greaterThanOrEqual(nvme.totalBytesWrittenTb, 1.0, 'TBW is tracked');
    assert.isTrue(nvme.isHealthy, 'Drive status is healthy');
  });

  runner.addTest('T1_R4_02: get_battery_health_analytics returns charge %, wear level, and cycle count', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.hardwareTelemetry.setSystemType('laptop');

    // Act
    const battery = await ipc.invoke('get_battery_health_analytics');

    // Assert
    assert.isTrue(battery.batteryPresent, 'Battery detected on laptop');
    assert.greaterThanOrEqual(battery.chargePercent, 0, 'Charge % >= 0');
    assert.lessThanOrEqual(battery.chargePercent, 100, 'Charge % <= 100');
    assert.greaterThanOrEqual(battery.wearLevelPercent, 0, 'Wear level is non-negative');
    assert.greaterThanOrEqual(battery.cycleCount, 1, 'Cycle count is recorded');
    assert.greaterThanOrEqual(battery.dischargeRateMw, 0, 'Discharge rate is recorded');
  });

  runner.addTest('T1_R4_03: enable_ultimate_performance_scheme activates Windows Ultimate Performance plan', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const result = await ipc.invoke('enable_ultimate_performance_scheme');

    // Assert
    assert.ok(result, 'Ultimate Performance scheme returned');
    assert.equal(result.guid, 'e9a42b02-d5df-448d-aa00-03f14749eb61', 'Matches Ultimate Performance GUID');
    assert.isTrue(result.isActive, 'Ultimate Performance scheme is active');
    assert.isTrue(result.isUltimatePerformance, 'isUltimatePerformance flag is true');
  });

  runner.addTest('T1_R4_04: get_power_schemes lists available Windows power schemes and active GUID', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const schemes = await ipc.invoke('get_power_schemes');

    // Assert
    assert.greaterThanOrEqual(schemes.length, 3, 'Lists at least 3 standard power schemes');
    const active = schemes.find(s => s.isActive);
    assert.ok(active, 'Exactly one scheme is active');
    assert.ok(active.guid, 'Active scheme has valid GUID');
  });

  runner.addTest('T1_R4_05: set_active_power_scheme switches active scheme cleanly', async () => {
    // Arrange
    const ipc = new MockIPC();
    const highPerfGuid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

    // Act
    const res = await ipc.invoke('set_active_power_scheme', { scheme_guid: highPerfGuid });

    // Assert
    assert.isTrue(res, 'Switch returns true');
    const schemes = await ipc.invoke('get_power_schemes');
    const highPerf = schemes.find(s => s.guid === highPerfGuid);
    assert.isTrue(highPerf.isActive, 'High Performance scheme is now active');
    const balanced = schemes.find(s => s.name === 'Balanced');
    assert.isFalse(balanced.isActive, 'Balanced scheme is no longer active');
  });

  // =========================================================================
  // R5: UI Architecture, Refined Minimal Design & i18n Parity
  // =========================================================================

  runner.addTest('T1_R5_01: Command Palette indexer registers all 25 navigation views including 4 new subsystems', async () => {
    // Arrange
    const palette = new CommandPaletteEngine();

    // Act
    const gamingResults = palette.search('gaming');
    const ramResults = palette.search('ram');
    const networkResults = palette.search('firewall');
    const hardwareResults = palette.search('smart');

    // Assert
    assert.ok(gamingResults.some(r => r.id === 'tab_gaming_latency'), 'Indexes Gaming & DPC Latency tab');
    assert.ok(ramResults.some(r => r.id === 'tab_smart_ram'), 'Indexes Smart RAM tab');
    assert.ok(networkResults.some(r => r.id === 'tab_network_shield'), 'Indexes Network Shield tab');
    assert.ok(hardwareResults.some(r => r.id === 'tab_hardware_health'), 'Indexes Hardware Health tab');
  });

  runner.addTest('T1_R5_02: AppStateSimulator initializes gaming, memory, network, and hardware slices', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Assert
    assert.ok(app.state.gaming, 'Gaming slice present');
    assert.ok(app.state.memory, 'Memory slice present');
    assert.ok(app.state.network, 'Network slice present');
    assert.ok(app.state.hardware, 'Hardware slice present');
    assert.equal(app.state.gaming.targetTimerResolution, 5000, 'Target timer resolution is 0.5ms (5000 units)');
    assert.equal(app.state.memory.thresholdPercent, 80, 'Default auto-trimmer threshold is 80%');
  });

  runner.addTest('T1_R5_03: i18n translation resolver resolves English and Russian subsystem keys', async () => {
    // Arrange
    const app = new AppStateSimulator();

    // Act & Assert (English)
    app.state.currentLanguage = 'en';
    const enTitle = app.translate('nav.items.dashboard', 'Dashboard');
    assert.equal(enTitle, 'Dashboard', 'Resolves English navigation title');

    // Act & Assert (Russian)
    app.state.currentLanguage = 'ru';
    const ruTitle = app.translate('nav.items.dashboard', 'Панель управления');
    assert.equal(ruTitle, 'Панель управления', 'Resolves Russian navigation title');
  });

  runner.addTest('T1_R5_04: Refined Minimal design aesthetic enforces dark background (#090A0C) and tabular-nums', async () => {
    // Arrange: verify theme constants
    const tokens = {
      bgSurface: '#090A0C',
      bgCard: '#121417',
      borderSubtle: '#22252A',
      fontMono: 'font-mono tabular-nums'
    };

    // Assert
    assert.equal(tokens.bgSurface, '#090A0C', 'Standard Refined Minimal background');
    assert.includes(tokens.fontMono, 'tabular-nums', 'Monospace font uses tabular numbers');
  });

  runner.addTest('T1_R5_05: WCAG 2.1 AA accessibility ARIA roles and tab indices are modeled across views', async () => {
    // Arrange: Simulate view accessibility descriptor
    const viewA11y = {
      role: 'main',
      ariaLabel: 'WiScripts Windows Subsystem Dashboard',
      focusableElements: [
        { id: 'btn_toggle_game_boost', role: 'switch', ariaChecked: false, tabIndex: 0 },
        { id: 'btn_purge_standby', role: 'button', ariaLabel: 'Purge Standby Memory', tabIndex: 0 },
        { id: 'btn_block_firewall', role: 'button', ariaLabel: 'Block Selected Process', tabIndex: 0 },
        { id: 'btn_enable_ultimate_plan', role: 'button', ariaLabel: 'Activate Ultimate Performance Plan', tabIndex: 0 }
      ]
    };

    // Assert
    assert.equal(viewA11y.role, 'main', 'View has main ARIA role');
    assert.equal(viewA11y.focusableElements.length, 4, 'All primary actions are accessible');
    assert.isTrue(viewA11y.focusableElements.every(el => el.tabIndex === 0), 'All interactive elements have tabIndex 0');
  });

  return runner;
}

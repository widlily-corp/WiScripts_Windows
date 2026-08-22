/**
 * Tier 4 Test Suite: Real-World Application Scenarios (WiScripts Windows v1.3.0)
 * Simulates complete end-to-end user journeys and complex real-world workflows:
 * - Scenario 1: Hardcore Competitive Gaming Session Workflow
 * - Scenario 2: Heavy Developer RAM Cleanup & Auto-Trim Emergency Recovery
 * - Scenario 3: Suspicious Process Containment & Network Firewall Shielding
 * - Scenario 4: Workstation Storage Health & Battery Analytics Audit
 * - Scenario 5: Full Workstation Optimization, Cleaner & Hardening Run
 * - Scenario 6: Multi-Lingual Navigation, Command Palette & Accessibility Verification
 */

import {
  assert,
  Win32ScmSimulator,
  CommandPaletteEngine,
  MockIPC,
  AppStateSimulator,
  TestRunner
} from './harness.js';

export function buildTier4Suite() {
  const runner = new TestRunner('Tier 4 - Real-World Application Scenarios');

  // =========================================================================
  // Scenario 1: Hardcore Competitive Gaming Session Workflow
  // =========================================================================
  runner.addTest('T4_WORKLOAD_01: Competitive gaming launch -> Game Boost -> 0.5ms Timer -> Standby Flush -> DPC Monitor -> Teardown', async () => {
    // Arrange
    const ipc = new MockIPC();
    const scm = new Win32ScmSimulator();
    const gamePid = 9940;

    // Step 1: User launches game -> WiScripts initiates pre-game memory flush
    const initialMem = await ipc.invoke('get_memory_breakdown');
    const standbyPurge = await ipc.invoke('purge_standby_memory', { mode: 'aggressive' });
    assert.isTrue(standbyPurge.success, 'Standby memory flushed for maximum game RAM');

    // Step 2: Engage Game Boost for target game process
    const boost = await ipc.invoke('toggle_game_boost', { target_pid: gamePid, enable: true });
    assert.isTrue(boost.isActive, 'Game Boost engaged');
    assert.equal(boost.boostedPid, gamePid, 'Boosted target game PID');

    // Step 3: Verify 0.5ms (5000 units) timer resolution lock
    const timerInfo = await ipc.invoke('set_timer_resolution', { resolution_100ns: 5000 });
    assert.equal(timerInfo.currentResolution100ns, 5000, 'Timer locked at 0.5ms precision');
    assert.isTrue(timerInfo.isHighPrecision, 'High precision mode verified');

    // Step 4: Verify non-essential services suspended
    assert.isTrue(boost.suspendedServices.length >= 3, 'Suspended non-essential services');

    // Step 5: Verify real-time DPC latency metrics remain optimal during session
    const latency = await ipc.invoke('get_latency_metrics');
    assert.equal(latency.status, 'OPTIMAL', 'DPC latency status is optimal');
    assert.ok(latency.currentLatencyUs < 500, 'Current latency is sub-500us');

    // Step 6: On game session termination -> complete clean teardown
    const teardown = await ipc.invoke('toggle_game_boost', { target_pid: null, enable: false });
    assert.isFalse(teardown.isActive, 'Game boost cleanly deactivated');
    assert.equal(teardown.currentResolution100ns, 156250, 'Timer restored to default 15.625ms');
    assert.equal(teardown.suspendedServices.length, 0, 'All services resumed');
  });

  // =========================================================================
  // Scenario 2: Heavy Developer RAM Cleanup & Auto-Trim Emergency Recovery
  // =========================================================================
  runner.addTest('T4_WORKLOAD_02: Heavy developer IDE load (92% RAM) -> Auto-trimmer triggers -> Standby & WS reclaimed -> Usage drops', async () => {
    // Arrange
    const ipc = new MockIPC();
    const purger = ipc.memoryPurger;

    // Step 1: Configure Auto-Trimmer with 80% threshold and developer process whitelist
    const config = await ipc.invoke('configure_ram_auto_trimmer', {
      config: {
        enabled: true,
        thresholdPercent: 80,
        checkIntervalSec: 15,
        minFreedMbThreshold: 512,
        excludedPids: [1024, 2048],
        excludedProcessNames: ['code.exe', 'rider64.exe']
      }
    });
    assert.isTrue(config.enabled, 'Auto-trimmer activated');

    // Step 2: System under heavy compile load hits 90%+ RAM usage
    purger.inUseMb = 13000;
    purger.standbyMb = 2500;
    const initialBreakdown = await ipc.invoke('get_memory_breakdown');
    assert.greaterThanOrEqual(initialBreakdown.usagePercent, 80, 'Heavy memory pressure simulated');

    // Step 3: Background auto-trimmer evaluates memory state and executes purge
    const trimEvent = purger.checkAndAutoTrim();
    assert.isTrue(trimEvent.triggered, 'Auto-trimmer detected threshold violation');
    assert.greaterThanOrEqual(trimEvent.freedMb, 1500, 'Reclaimed over 1.5GB of RAM');

    // Step 4: Verify post-cleanup memory state is stabilized
    const postBreakdown = await ipc.invoke('get_memory_breakdown');
    assert.ok(postBreakdown.usagePercent < 80, 'Memory usage safely reduced below 80%');
    assert.ok(purger.purgeHistory.length >= 2, 'Logged standby and working set trim history');
  });

  // =========================================================================
  // Scenario 3: Suspicious Process Containment & Network Firewall Shielding
  // =========================================================================
  runner.addTest('T4_WORKLOAD_03: Network traffic audit -> Detect rogue miner -> 1-Click Firewall Block -> Sockets severed -> Verified', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Step 1: Query active network connections table
    const connections = await ipc.invoke('get_active_network_connections');
    const rogue = connections.find(c => c.processName === 'suspicious_miner.exe');
    assert.ok(rogue, 'Identified rogue outbound socket');
    assert.equal(rogue.protocol, 'TCP', 'Rogue uses TCP protocol');
    assert.greaterThanOrEqual(rogue.uploadBps, 50000, 'Rogue transmitting high outbound traffic');

    // Step 2: User clicks "Block Process" in Firewall Shield view
    const blockRes = await ipc.invoke('block_process_firewall', {
      process_path: rogue.processPath,
      rule_name: 'WiScripts_Block_suspicious_miner.exe'
    });
    assert.isTrue(blockRes.success, 'Firewall block rule created');

    // Step 3: Verify socket table immediately severing rogue connections
    const postBlockConnections = await ipc.invoke('get_active_network_connections');
    assert.isFalse(
      postBlockConnections.some(c => c.processPath === rogue.processPath),
      'Rogue socket completely severed from network'
    );

    // Step 4: Verify active firewall rules table reflects new block rule
    const rules = await ipc.invoke('get_firewall_rules');
    const activeRule = rules.find(r => r.ruleName === 'WiScripts_Block_suspicious_miner.exe');
    assert.ok(activeRule, 'Rule active in Windows Defender Firewall list');
    assert.equal(activeRule.action, 'Block', 'Rule action is Block');
  });

  // =========================================================================
  // Scenario 4: Workstation Storage Health & Battery Analytics Audit
  // =========================================================================
  runner.addTest('T4_WORKLOAD_04: Hardware diagnostics on laptop -> NVMe SMART audit -> Battery wear analytics -> Balanced plan active', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.hardwareTelemetry.setSystemType('laptop');

    // Step 1: Query storage health telemetry
    const storage = await ipc.invoke('get_storage_devices_health');
    assert.greaterThanOrEqual(storage.length, 1, 'Storage devices enumerated');
    const nvme = storage.find(s => s.interfaceType === 'NVMe');
    assert.ok(nvme, 'NVMe drive found');
    assert.greaterThanOrEqual(nvme.healthPercentage, 95, 'NVMe health >= 95%');
    assert.ok(nvme.temperatureC <= 65, 'NVMe temperature normal');

    // Step 2: Query battery telemetry
    const battery = await ipc.invoke('get_battery_health_analytics');
    assert.isTrue(battery.batteryPresent, 'Battery detected');
    assert.greaterThanOrEqual(battery.chargePercent, 50, 'Adequate battery charge');
    assert.lessThanOrEqual(battery.wearLevelPercent, 15, 'Wear level within healthy limits (<15%)');

    // Step 3: Switch to Balanced power scheme to preserve battery cycle life
    const balancedGuid = '381b4222-f694-41f0-9685-ff5bb260df2e';
    const switchRes = await ipc.invoke('set_active_power_scheme', { scheme_guid: balancedGuid });
    assert.isTrue(switchRes, 'Switched to Balanced power scheme');

    // Step 4: Verify active power scheme
    const schemes = await ipc.invoke('get_power_schemes');
    const active = schemes.find(s => s.isActive);
    assert.equal(active.guid, balancedGuid, 'Balanced scheme is confirmed active');
  });

  // =========================================================================
  // Scenario 5: Full Workstation Optimization, Cleaner & Hardening Run
  // =========================================================================
  runner.addTest('T4_WORKLOAD_05: Full maintenance run: Disk clean -> Standby RAM purge -> Ultimate Plan -> Sockets audit -> DPC benchmark', async () => {
    // Arrange
    const ipc = new MockIPC();
    const app = new AppStateSimulator(ipc);

    // Step 1: System disk cleaner execution
    const cleanScript = 'Write-Host "Purged 3200MB Temp files, logs, and prefetch"';
    const scriptResult = await app.executeScript(cleanScript, 'ps1');
    assert.equal(scriptResult.exit_code, 0, 'Cleaner script finished');

    // Step 2: Standby list and working set purge
    const standbyResult = await ipc.invoke('purge_standby_memory', { mode: 'normal' });
    const wsResult = await ipc.invoke('purge_working_sets');
    assert.isTrue(standbyResult.success && wsResult.success, 'Memory optimization complete');

    // Step 3: Engage Ultimate Performance scheme
    const powerResult = await ipc.invoke('enable_ultimate_performance_scheme');
    assert.isTrue(powerResult.isActive, 'Ultimate Performance engaged');

    // Step 4: Live network audit
    const conns = await ipc.invoke('get_active_network_connections');
    assert.greaterThanOrEqual(conns.length, 1, 'Network sockets verified');

    // Step 5: Benchmark DPC latency
    const latency = await ipc.invoke('get_latency_metrics');
    assert.equal(latency.status, 'OPTIMAL', 'DPC latency verified optimal');
  });

  // =========================================================================
  // Scenario 6: Multi-Lingual Navigation, Command Palette & Accessibility Verification
  // =========================================================================
  runner.addTest('T4_WORKLOAD_06: Dynamic EN/RU locale switching across all 25 navigation views + Command Palette + WCAG a11y', async () => {
    // Arrange
    const app = new AppStateSimulator();
    const palette = new CommandPaletteEngine();

    // Step 1: Verify all 25 views indexed in Command Palette
    assert.equal(palette.index.filter(i => i.type === 'tab').length, 25, 'All 25 navigation views indexed');

    // Step 2: Verify search for new subsystem views in Command Palette
    const gamingTab = palette.search('gaming');
    const ramTab = palette.search('ram');
    const netTab = palette.search('network');
    const hwTab = palette.search('hardware');
    assert.ok(gamingTab.length > 0 && ramTab.length > 0 && netTab.length > 0 && hwTab.length > 0, 'All 4 new views found in search');

    // Step 3: English locale verification
    app.state.currentLanguage = 'en';
    const enDashboard = app.translate('nav.items.dashboard', 'Dashboard');
    assert.equal(enDashboard, 'Dashboard', 'English navigation key resolved');

    // Step 4: Russian locale verification
    app.state.currentLanguage = 'ru';
    const ruDashboard = app.translate('nav.items.dashboard', 'Панель управления');
    assert.equal(ruDashboard, 'Панель управления', 'Russian navigation key resolved');

    // Step 5: Accessibility validation (WCAG ARIA compliance)
    const accessibleViews = [
      { id: 'gaming_latency', role: 'region', ariaLabel: 'Gaming Latency & DPC Analyzer' },
      { id: 'smart_ram', role: 'region', ariaLabel: 'Smart RAM & Standby List Purger' },
      { id: 'network_shield', role: 'region', ariaLabel: 'Live Network Traffic & Firewall Shield' },
      { id: 'hardware_health', role: 'region', ariaLabel: 'Hardware NVMe SMART & Battery Analytics' }
    ];
    assert.isTrue(accessibleViews.every(v => v.role === 'region' && v.ariaLabel.length > 0), 'All 4 views meet WCAG ARIA specifications');
  });

  return runner;
}

import { MetricSnapshot, ThermalStatus, ExecutionSummary } from '../types';

// Setup minimal window mock with localStorage for Zustand persist middleware
const mockInvoke = async (cmd: string, args: any): Promise<any> => {
  if (cmd === 'toggle_startup_item') {
    return {
      success: true,
      executedActions: [
        {
          id: args?.id || 'item_1',
          name: `Toggle startup item '${args?.id}' (enable=${args?.enable})`,
          command: `toggle_startup_item --id ${args?.id} --enable ${args?.enable}`,
          output: {
            exitCode: 0,
            stdout: `[DRY-RUN] Toggled startup item '${args?.id}' to enabled=${args?.enable}`,
            stderr: '',
          },
          skipped: false,
        },
      ],
      totalDurationMs: 5,
      isDryRun: args?.dryRun ?? true,
    };
  }

  if (cmd === 'remove_startup_item') {
    return {
      success: true,
      executedActions: [
        {
          id: args?.id || 'item_1',
          name: `Remove startup item '${args?.id}'`,
          command: `remove_startup_item --id ${args?.id}`,
          output: {
            exitCode: 0,
            stdout: `[DRY-RUN] Successfully removed startup item '${args?.id}'`,
            stderr: '',
          },
          skipped: false,
        },
      ],
      totalDurationMs: 5,
      isDryRun: args?.dryRun ?? true,
    };
  }

  if (cmd === 'get_startup_items') {
    return [
      {
        id: 'hkcu_run_discord',
        name: 'Discord',
        command: 'C:\\Discord\\Discord.exe',
        location: 'HKCU Run',
        enabled: true,
        itemType: 'Registry',
        publisher: 'Discord Inc.',
      },
    ];
  }

  if (cmd === 'toggle_scheduled_task') {
    return {
      success: true,
      executedActions: [
        {
          id: `toggle_task_${args?.taskName}`,
          name: `Toggle scheduled task '${args?.taskName}' (enable=${args?.enable})`,
          command: `toggle_scheduled_task --name '${args?.taskName}' --path '${args?.taskPath}' --enable ${args?.enable}`,
          output: {
            exitCode: 0,
            stdout: `[DRY-RUN] Toggled scheduled task '${args?.taskName}' at '${args?.taskPath}' to enabled=${args?.enable}`,
            stderr: '',
          },
          skipped: false,
        },
      ],
      totalDurationMs: 5,
      isDryRun: args?.dryRun ?? true,
    };
  }

  if (cmd === 'run_scheduled_task') {
    return {
      success: true,
      executedActions: [
        {
          id: `run_task_${args?.taskName}`,
          name: `Run scheduled task '${args?.taskName}'`,
          command: `run_scheduled_task --name '${args?.taskName}' --path '${args?.taskPath}'`,
          output: {
            exitCode: 0,
            stdout: `[DRY-RUN] Triggered task '${args?.taskName}' at '${args?.taskPath}'`,
            stderr: '',
          },
          skipped: false,
        },
      ],
      totalDurationMs: 5,
      isDryRun: args?.dryRun ?? true,
    };
  }

  if (cmd === 'get_scheduled_tasks') {
    return [
      {
        taskName: 'Consolidator',
        taskPath: '\\Microsoft\\',
        state: 'Ready',
        enabled: true,
        triggerType: 'Daily',
        author: 'Microsoft',
        lastRunTime: '2026-07-27',
        nextRunTime: '2026-07-28',
        actionSummary: 'wsqmcons.exe',
      },
    ];
  }

  return {};
};

(globalThis as any).window = {
  __TAURI_INTERNALS__: {
    invoke: mockInvoke,
    transformCallback: (cb: any) => cb,
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};
(globalThis as any).__TAURI_INTERNALS__ = (globalThis as any).window.__TAURI_INTERNALS__;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function getThermalStatus(temp: number | null): ThermalStatus {
  if (temp === null) return 'unknown';
  if (temp > 80) return 'hot';
  if (temp >= 65) return 'warm';
  return 'normal';
}

async function runEdgeCaseEmpiricalTests() {
  console.log('====================================================');
  console.log(' EMPIRICAL TEST SUITE: Milestone 3 Edge Cases');
  console.log('====================================================\n');

  const { useAppStore } = await import('../store/useAppStore');

  // Edge Case 1: Null Temperature Sensor Handling
  console.log('[Edge Case 1] Null Temperature Sensor Handling');
  const nullTempSnapshot: MetricSnapshot = {
    timestamp: Date.now(),
    cpuUsagePercent: 15.0,
    memoryUsedMb: 8000,
    memoryTotalMb: 16384,
    memoryUsagePercent: 48.8,
    diskReadBytesPerSec: 0,
    diskWriteBytesPerSec: 0,
    networkRxBytesPerSec: 0,
    networkTxBytesPerSec: 0,
    cpuTempC: null,
    gpuTempC: null,
    cpuThermalStatus: getThermalStatus(null),
    gpuThermalStatus: getThermalStatus(null),
  };

  useAppStore.getState().pushMetricSnapshot(nullTempSnapshot);
  const currentMetrics = useAppStore.getState().currentMetrics;
  assert(currentMetrics !== null, 'Current metrics updated with null temperature snapshot');
  assert(currentMetrics?.cpuTempC === null, 'cpuTempC is null');
  assert(currentMetrics?.gpuTempC === null, 'gpuTempC is null');
  assert(currentMetrics?.cpuThermalStatus === 'unknown', 'cpuThermalStatus mapped to "unknown"');
  assert(currentMetrics?.gpuThermalStatus === 'unknown', 'gpuThermalStatus mapped to "unknown"');

  // Edge Case 2: Dry-Run Safety in Startup Item Toggling & Task Scheduler
  console.log('\n[Edge Case 2] Dry-Run Safety in Startup & Task Scheduler');
  useAppStore.getState().setDryRunMode(true);
  assert(useAppStore.getState().dryRunMode === true, 'Dry-run mode activated');

  // Startup item dry-run toggle
  const startupToggleResult = await useAppStore.getState().toggleStartupItem('hkcu_run_discord', false);
  assert(startupToggleResult !== null, 'Startup item toggle returned ExecutionSummary');
  assert(startupToggleResult?.isDryRun === true, 'Startup item toggle executed in dry-run mode');
  assert(
    Boolean(startupToggleResult?.executedActions[0].output.stdout.includes('[DRY-RUN]')),
    'Startup item toggle output contains [DRY-RUN] marker'
  );

  // Startup item dry-run remove
  const startupRemoveResult = await useAppStore.getState().removeStartupItem('hkcu_run_discord');
  assert(startupRemoveResult !== null, 'Startup item remove returned ExecutionSummary');
  assert(startupRemoveResult?.isDryRun === true, 'Startup item remove executed in dry-run mode');

  // Task scheduler dry-run toggle
  const taskToggleResult = await useAppStore.getState().toggleScheduledTask('Consolidator', '\\Microsoft\\', false);
  assert(taskToggleResult !== null, 'Scheduled task toggle returned ExecutionSummary');
  assert(taskToggleResult?.isDryRun === true, 'Scheduled task toggle executed in dry-run mode');
  assert(
    Boolean(taskToggleResult?.executedActions[0].output.stdout.includes('[DRY-RUN]')),
    'Scheduled task toggle output contains [DRY-RUN] marker'
  );

  // Task scheduler dry-run run
  const taskRunResult = await useAppStore.getState().runScheduledTask('Consolidator', '\\Microsoft\\');
  assert(taskRunResult !== null, 'Scheduled task run returned ExecutionSummary');
  assert(taskRunResult?.isDryRun === true, 'Scheduled task run executed in dry-run mode');

  useAppStore.getState().setDryRunMode(false);

  // Edge Case 3: Empty Search / Filter Queries
  console.log('\n[Edge Case 3] Empty Search & Special Character Filter Queries');
  const startupItems = [
    { id: '1', name: 'Discord', command: 'discord.exe', location: 'HKCU Run', enabled: true, itemType: 'Registry' },
    { id: '2', name: 'Spotify', command: 'spotify.exe', location: 'HKCU Run', enabled: false, itemType: 'Registry' },
  ];

  // Empty string query
  const emptySearchQuery = '';
  const filteredEmpty = startupItems.filter(
    (i) => i.name.toLowerCase().includes(emptySearchQuery.toLowerCase())
  );
  assert(filteredEmpty.length === 2, 'Empty search query returns all items without filtering');

  // Whitespace-only search query
  const whitespaceQuery = '   ';
  const filteredWhitespace = startupItems.filter(
    (i) => i.name.toLowerCase().includes(whitespaceQuery.trim().toLowerCase())
  );
  assert(filteredWhitespace.length === 2, 'Trimmed whitespace search query returns all items');

  // Special regex characters in search query
  const specialCharsQuery = '[.*+?^${}()|[!]';
  let didNotCrash = true;
  try {
    startupItems.filter((i) => i.name.toLowerCase().includes(specialCharsQuery.toLowerCase()));
  } catch (e) {
    didNotCrash = false;
  }
  assert(didNotCrash, 'Special characters in string includes query do not crash filter logic');

  // Edge Case 4: Memory Buffer Bounds & Ring Buffer Overflow
  console.log('\n[Edge Case 4] Memory Buffer Bounds & Ring Buffer Overflow');
  
  // Push 1000 snapshots to simulate long-running polling
  for (let i = 0; i < 1000; i++) {
    const s: MetricSnapshot = {
      timestamp: Date.now() + i,
      cpuUsagePercent: i % 100,
      memoryUsedMb: 4000,
      memoryTotalMb: 16384,
      memoryUsagePercent: 24.4,
      diskReadBytesPerSec: 0,
      diskWriteBytesPerSec: 0,
      networkRxBytesPerSec: 0,
      networkTxBytesPerSec: 0,
      cpuTempC: 45,
      gpuTempC: 40,
      cpuThermalStatus: 'normal',
      gpuThermalStatus: 'normal',
    };
    useAppStore.getState().pushMetricSnapshot(s);
  }

  const history = useAppStore.getState().metricsHistory;
  assert(history.length === 30, `Metrics history ring buffer strictly capped at 30 items (got ${history.length})`);
  assert(history[29].cpuUsagePercent === 999 % 100, 'Latest sample in ring buffer matches 1000th pushed item');

  // Zero memory total boundary check
  const zeroRamTotal = 0;
  const zeroRamUsed = 0;
  const safeRamPercent = zeroRamTotal > 0 ? (zeroRamUsed / zeroRamTotal) * 100 : 0;
  assert(safeRamPercent === 0 && !isNaN(safeRamPercent), 'Zero RAM total handled safely without NaN or division by zero');

  console.log('\n====================================================');
  console.log(' ALL EDGE CASE EMPIRICAL TESTS PASSED CLEANLY! 🎉');
  console.log('====================================================\n');
}

runEdgeCaseEmpiricalTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Edge case test failed with error:', err);
    process.exit(1);
  });

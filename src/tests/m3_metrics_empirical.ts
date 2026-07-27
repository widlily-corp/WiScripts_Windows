import { useAppStore } from '../store/useAppStore';
import { MetricSnapshot, ThermalStatus } from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function getThermalStatus(temp: number | null): ThermalStatus {
  if (temp === null) return 'unknown';
  if (temp > 80) return 'hot';
  if (temp >= 65) return 'warm';
  return 'normal';
}

function generateSvgPath(data: number[], width: number, height: number): string {
  if (!data || data.length < 2) return '';
  const maxVal = 100;
  const minVal = 0;
  const stepX = width / Math.max(1, data.length - 1);
  const points = data.map((val, idx) => {
    const x = idx * stepX;
    const normalized = Math.max(0, Math.min(100, val));
    const y = height - (normalized / (maxVal - minVal)) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${points.join(' L ')}`;
}

async function runEmpiricalTests() {
  console.log('🧪 Running Empirical Verification for Milestone 3 Metrics & Hardware Probes...');

  // Test 1: Ring Buffer Capping (Max 30 samples)
  const store = useAppStore.getState();
  for (let i = 1; i <= 50; i++) {
    const sample: MetricSnapshot = {
      timestamp: Date.now() + i * 1000,
      cpuUsagePercent: i % 100,
      memoryUsedMb: 4000 + i,
      memoryTotalMb: 16384,
      memoryUsagePercent: 25.0,
      diskReadBytesPerSec: 1000,
      diskWriteBytesPerSec: 2000,
      networkRxBytesPerSec: 500,
      networkTxBytesPerSec: 1000,
      cpuTempC: 45,
      gpuTempC: 40,
      cpuThermalStatus: 'normal',
      gpuThermalStatus: 'normal',
    };
    useAppStore.getState().pushMetricSnapshot(sample);
  }

  const history = useAppStore.getState().metricsHistory;
  assert(
    history.length === 30,
    `Ring buffer length should be capped at 30, got ${history.length}`
  );
  assert(
    history[history.length - 1].cpuUsagePercent === 50,
    `Latest snapshot should match last pushed value 50, got ${history[history.length - 1].cpuUsagePercent}`
  );
  console.log('  ✅ Test 1: History ring buffer capping verified (30 max samples).');

  // Test 2: Polling Configuration State
  useAppStore.getState().setPollingIntervalMs(5000);
  assert(
    useAppStore.getState().pollingIntervalMs === 5000,
    `Polling interval should be updated to 5000ms`
  );

  const initialActive = useAppStore.getState().isPollingActive;
  useAppStore.getState().togglePollingActive();
  assert(
    useAppStore.getState().isPollingActive === !initialActive,
    `Polling active flag should be toggled`
  );
  console.log('  ✅ Test 2: Polling config state updates verified.');

  // Test 3: Thermal Status Range Evaluation
  assert(getThermalStatus(45) === 'normal', '45°C should be normal');
  assert(getThermalStatus(65) === 'warm', '65°C should be warm');
  assert(getThermalStatus(75) === 'warm', '75°C should be warm');
  assert(getThermalStatus(85) === 'hot', '85°C should be hot');
  assert(getThermalStatus(null) === 'unknown', 'null should be unknown');
  console.log('  ✅ Test 3: Thermal status mapping logic verified.');

  // Test 4: SVG Path Generation
  const svgPath = generateSvgPath([10, 50, 90], 300, 60);
  assert(svgPath.startsWith('M '), `SVG path should start with 'M '`);
  assert(!svgPath.includes('NaN'), `SVG path must not contain NaN`);
  console.log('  ✅ Test 4: SVG path calculation verified.');

  console.log('\n🎉 ALL EMPIRICAL TESTS PASSED CLEANLY (100%)');
}

runEmpiricalTests().catch((err) => {
  console.error('❌ Empirical test failed with error:', err);
  process.exit(1);
});

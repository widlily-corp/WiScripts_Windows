import { execSync } from 'child_process';
import { DEFAULT_OPTIMIZATIONS as DEFAULT_OPTIMIZATIONS_DIRECT } from '../constants/optimizations';
import { DEFAULT_OPTIMIZATIONS as DEFAULT_OPTIMIZATIONS_INDEX } from '../constants';
import {
  MOCK_AUDIO_PAYLOAD as MOCK_AUDIO_PAYLOAD_DIRECT,
  MOCK_APP_SESSIONS as MOCK_APP_SESSIONS_DIRECT,
} from '../mocks/audioMocks';
import {
  MOCK_AUDIO_PAYLOAD as MOCK_AUDIO_PAYLOAD_INDEX,
  MOCK_APP_SESSIONS as MOCK_APP_SESSIONS_INDEX,
} from '../mocks';
import { useAppStore } from '../store/useAppStore';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

console.log('====================================================');
console.log('Challenger 2 Empirical Stress Test Harness');
console.log('Milestone 1: Extracted Constants & Mocks Verification');
console.log('====================================================\n');

// ----------------------------------------------------
// Step 1: Re-export Consistency & Direct vs Index Check
// ----------------------------------------------------
console.log('--- Test Group 1: Index Re-export Structural Equality ---');
assert(
  JSON.stringify(DEFAULT_OPTIMIZATIONS_DIRECT) === JSON.stringify(DEFAULT_OPTIMIZATIONS_INDEX),
  'DEFAULT_OPTIMIZATIONS index re-export matches direct export exactly'
);
assert(
  JSON.stringify(MOCK_AUDIO_PAYLOAD_DIRECT) === JSON.stringify(MOCK_AUDIO_PAYLOAD_INDEX),
  'MOCK_AUDIO_PAYLOAD index re-export matches direct export exactly'
);
assert(
  JSON.stringify(MOCK_APP_SESSIONS_DIRECT) === JSON.stringify(MOCK_APP_SESSIONS_INDEX),
  'MOCK_APP_SESSIONS index re-export matches direct export exactly'
);

// ----------------------------------------------------
// Step 2: Extraction vs HEAD (Pre-refactor) Comparison
// ----------------------------------------------------
console.log('\n--- Test Group 2: Comparison against git HEAD (Pre-refactor) ---');

let rawHeadContent = '';
try {
  rawHeadContent = execSync('git show HEAD:src/store/useAppStore.ts', { encoding: 'utf-8' });
  console.log('  Successfully retrieved HEAD:src/store/useAppStore.ts');
} catch (e) {
  console.error('  Failed to execute git show HEAD:src/store/useAppStore.ts', e);
}

if (rawHeadContent) {
  // Extract DEFAULT_OPTIMIZATIONS from HEAD string
  const optMatch = rawHeadContent.match(/const DEFAULT_OPTIMIZATIONS:\s*OptimizationItem\[\]\s*=\s*(\[\s*[\s\S]*?\n\];)/);
  if (optMatch) {
    const parsedHeadOpt = eval(`(function() { return ${optMatch[1].slice(0, -1)}; })()`);
    assert(
      JSON.stringify(parsedHeadOpt) === JSON.stringify(DEFAULT_OPTIMIZATIONS_DIRECT),
      'DEFAULT_OPTIMIZATIONS is 100% structurally identical to pre-refactor HEAD definition'
    );
    assert(parsedHeadOpt.length === 18, `Pre-refactor count (18) matches extracted count (${DEFAULT_OPTIMIZATIONS_DIRECT.length})`);
  } else {
    assert(false, 'Could not parse DEFAULT_OPTIMIZATIONS from HEAD');
  }

  // Extract MOCK_AUDIO_PAYLOAD from HEAD string
  const audioPayloadMatch = rawHeadContent.match(/const MOCK_AUDIO_PAYLOAD:\s*AudioDevicesPayload\s*=\s*(\{\s*[\s\S]*?\n\};)/);
  if (audioPayloadMatch) {
    const parsedHeadAudioPayload = eval(`(function() { return ${audioPayloadMatch[1].slice(0, -1)}; })()`);
    assert(
      JSON.stringify(parsedHeadAudioPayload) === JSON.stringify(MOCK_AUDIO_PAYLOAD_DIRECT),
      'MOCK_AUDIO_PAYLOAD is 100% structurally identical to pre-refactor HEAD definition'
    );
  } else {
    assert(false, 'Could not parse MOCK_AUDIO_PAYLOAD from HEAD');
  }

  // Extract MOCK_APP_SESSIONS from HEAD string
  const appSessionsMatch = rawHeadContent.match(/const MOCK_APP_SESSIONS:\s*AppAudioSession\[\]\s*=\s*(\[\s*[\s\S]*?\n\];)/);
  if (appSessionsMatch) {
    const parsedHeadAppSessions = eval(`(function() { return ${appSessionsMatch[1].slice(0, -1)}; })()`);
    assert(
      JSON.stringify(parsedHeadAppSessions) === JSON.stringify(MOCK_APP_SESSIONS_DIRECT),
      'MOCK_APP_SESSIONS is 100% structurally identical to pre-refactor HEAD definition'
    );
    assert(parsedHeadAppSessions.length === 3, `Pre-refactor count (3) matches extracted count (${MOCK_APP_SESSIONS_DIRECT.length})`);
  } else {
    assert(false, 'Could not parse MOCK_APP_SESSIONS from HEAD');
  }
}

// ----------------------------------------------------
// Step 3: Data Integrity & Property Field Validation
// ----------------------------------------------------
console.log('\n--- Test Group 3: Data Integrity & Property Field Validation ---');

// Validate DEFAULT_OPTIMIZATIONS
const optIds = new Set<string>();
let allOptValid = true;
const validCategories = new Set(['telemetry', 'bloatware', 'privacy', 'services', 'ui_tweaks', 'disk_cleanup']);
const validRiskLevels = new Set(['low', 'medium', 'high']);

DEFAULT_OPTIMIZATIONS_DIRECT.forEach((item) => {
  if (optIds.has(item.id)) {
    console.error(`  Duplicate ID found in DEFAULT_OPTIMIZATIONS: ${item.id}`);
    allOptValid = false;
  }
  optIds.add(item.id);

  if (!validCategories.has(item.category)) {
    console.error(`  Invalid category in item ${item.id}: ${item.category}`);
    allOptValid = false;
  }
  if (!validRiskLevels.has(item.riskLevel)) {
    console.error(`  Invalid riskLevel in item ${item.id}: ${item.riskLevel}`);
    allOptValid = false;
  }
  if (typeof item.title !== 'string' || item.title.trim() === '') {
    allOptValid = false;
  }
  if (typeof item.powershellCommand !== 'string' || item.powershellCommand.trim() === '') {
    allOptValid = false;
  }
});
assert(allOptValid, 'All 18 DEFAULT_OPTIMIZATIONS items possess unique IDs, valid categories, risk levels, and non-empty commands');

// Validate MOCK_AUDIO_PAYLOAD
let audioPayloadValid = true;
if (!Array.isArray(MOCK_AUDIO_PAYLOAD_DIRECT.renderDevices) || MOCK_AUDIO_PAYLOAD_DIRECT.renderDevices.length !== 2) {
  audioPayloadValid = false;
}
if (!Array.isArray(MOCK_AUDIO_PAYLOAD_DIRECT.captureDevices) || MOCK_AUDIO_PAYLOAD_DIRECT.captureDevices.length !== 2) {
  audioPayloadValid = false;
}
if (MOCK_AUDIO_PAYLOAD_DIRECT.defaultRenderId !== '{0.0.0.00000000}.{dev-speakers-1}') {
  audioPayloadValid = false;
}
if (MOCK_AUDIO_PAYLOAD_DIRECT.defaultCaptureId !== '{0.0.1.00000000}.{dev-mic-1}') {
  audioPayloadValid = false;
}
assert(audioPayloadValid, 'MOCK_AUDIO_PAYLOAD possesses valid render/capture arrays and correct default IDs');

// Validate MOCK_APP_SESSIONS
let appSessionsValid = true;
MOCK_APP_SESSIONS_DIRECT.forEach(sess => {
  if (typeof sess.pid !== 'number' || typeof sess.name !== 'string' || typeof sess.volume !== 'number') {
    appSessionsValid = false;
  }
});
assert(appSessionsValid, 'MOCK_APP_SESSIONS items possess valid PIDs, names, and volume numbers');

// ----------------------------------------------------
// Step 4: Adversarial Mutation & Reference Leak Testing
// ----------------------------------------------------
console.log('\n--- Test Group 4: Adversarial State Mutation & Reference Isolation ---');

// Capture snapshot of original constant before state manipulation
const optOriginalSnapshot = JSON.stringify(DEFAULT_OPTIMIZATIONS_DIRECT);
const audioPayloadSnapshot = JSON.stringify(MOCK_AUDIO_PAYLOAD_DIRECT);
const appSessionsSnapshot = JSON.stringify(MOCK_APP_SESSIONS_DIRECT);

// Store initialization and action triggering
const store = useAppStore.getState();

// Action 1: Toggle an optimization in store
store.toggleOptimizationSelected('telemetry_diagtrack');
const afterToggleStoreOpts = useAppStore.getState().optimizations;
assert(
  afterToggleStoreOpts.find(o => o.id === 'telemetry_diagtrack')?.isSelected === false,
  'Store state reflects toggled optimization'
);
assert(
  JSON.stringify(DEFAULT_OPTIMIZATIONS_DIRECT) === optOriginalSnapshot,
  'toggleOptimizationSelected() in store DOES NOT mutate exported DEFAULT_OPTIMIZATIONS constant'
);

// Action 2: Select all optimizations in store
store.selectAllOptimizations();
assert(
  JSON.stringify(DEFAULT_OPTIMIZATIONS_DIRECT) === optOriginalSnapshot,
  'selectAllOptimizations() in store DOES NOT mutate exported DEFAULT_OPTIMIZATIONS constant'
);

// Action 3: Deselect all optimizations in store
store.deselectAllOptimizations();
assert(
  JSON.stringify(DEFAULT_OPTIMIZATIONS_DIRECT) === optOriginalSnapshot,
  'deselectAllOptimizations() in store DOES NOT mutate exported DEFAULT_OPTIMIZATIONS constant'
);

// Action 4: App Audio Session volume mutation test
if (typeof store.setAppVolume === 'function') {
  store.setAppVolume(4120, 0.25, true, true);
}
assert(
  JSON.stringify(MOCK_APP_SESSIONS_DIRECT) === appSessionsSnapshot,
  'setAppVolume() in store DOES NOT mutate exported MOCK_APP_SESSIONS constant'
);

assert(
  JSON.stringify(MOCK_AUDIO_PAYLOAD_DIRECT) === audioPayloadSnapshot,
  'MOCK_AUDIO_PAYLOAD constant remains 100% unmutated after store operations'
);

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('\n====================================================');
console.log(`Test Execution Summary: ${passedTests} / ${totalTests} tests passed`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}

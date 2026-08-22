/**
 * WiScripts Windows v1.3.0 — Comprehensive E2E Master Test Runner
 * Executes Tier 1 (Feature Coverage R1-R5), Tier 2 (Boundary & Edge Cases),
 * Tier 3 (Cross-Feature Interactions), and Tier 4 (Real-World Application Scenarios)
 * test suites with full diagnostics and exit code reporting.
 */

import path from 'path';
import { pathToFileURL } from 'url';
import { buildTier1Suite } from './tier1_feature_coverage.test.js';
import { buildTier2Suite } from './tier2_boundary_edge.test.js';
import { buildTier3Suite } from './tier3_cross_feature.test.js';
import { buildTier4Suite } from './tier4_real_world.test.js';

export async function runAllE2ETests() {
  console.log(`================================================================`);
  console.log(` WiScripts Windows v1.3.0 — Comprehensive E2E Test Runner`);
  console.log(` Date: ${new Date().toISOString()}`);
  console.log(` Architecture: Rust Tauri v2 + React 18 + TypeScript + Refined Minimal`);
  console.log(` Subsystems: Gaming Latency, Smart RAM, Network Shield, Hardware Health`);
  console.log(`================================================================\n`);

  const suites = [
    buildTier1Suite(),
    buildTier2Suite(),
    buildTier3Suite(),
    buildTier4Suite()
  ];

  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  const suiteResults = [];

  const overallStart = Date.now();

  for (const suite of suites) {
    const result = await suite.run();
    suiteResults.push(result);
    grandTotal += result.total;
    grandPassed += result.passed;
    grandFailed += result.failed;
  }

  const overallDuration = Date.now() - overallStart;

  console.log(`================================================================`);
  console.log(` OVERALL E2E TEST SUITE RESULTS (v1.3.0 SUBSYSTEMS RELEASE)`);
  console.log(`================================================================`);
  for (const res of suiteResults) {
    const status = res.failed === 0 ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${status}] ${res.suiteName.padEnd(42)} : ${res.passed}/${res.total} passed`);
  }
  console.log(`----------------------------------------------------------------`);
  console.log(` TOTAL TEST CASES  : ${grandTotal}`);
  console.log(` TOTAL PASSED      : ${grandPassed}`);
  console.log(` TOTAL FAILED      : ${grandFailed}`);
  console.log(` EXECUTION TIME    : ${overallDuration}ms`);
  console.log(`================================================================\n`);

  if (grandFailed > 0) {
    console.error(`FAILED: ${grandFailed} test(s) failed out of ${grandTotal}.`);
    process.exit(1);
  } else {
    console.log(`SUCCESS: All ${grandTotal} E2E tests passed cleanly with exit code 0!`);
    return { grandTotal, grandPassed, grandFailed, overallDuration };
  }
}

// Auto-run if executed directly
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runAllE2ETests().catch((err) => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
  });
}

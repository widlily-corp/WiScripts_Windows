/**
 * WiScripts Windows v1.6.0 — Comprehensive Master Test & Verification Runner
 * 
 * Executes:
 * - Static Analysis: PowerShell 5.1 AST syntax parser, manifest schema, SHA-256 parity & CP1251 encoding checks
 * - Unit Tests: Multi-TB / PB binary scaling, 64-bit tabular formatting, OS guardrails, tree mutations
 * - Tier 1: Feature Coverage (R1-R5 subsystems)
 * - Tier 2: Boundary, Edge Cases, and Guardrail Violations
 * - Tier 3: Cross-Feature Interactions & Workflows
 * - Tier 4: Real-World Application Workload Scenarios
 * - Disk Space Analyzer & Filesystem Tree Explorer Suite
 */

import path from 'path';
import { pathToFileURL } from 'url';
import { buildStaticAnalysisSuite } from '../static_analysis/static_analysis_suite.js';
import { buildUnitDiskAnalyzerSuite } from '../unit/disk_analyzer_format.test.js';
import { buildTier1Suite } from './tier1_feature_coverage.test.js';
import { buildTier2Suite } from './tier2_boundary_edge.test.js';
import { buildTier3Suite } from './tier3_cross_feature.test.js';
import { buildTier4Suite } from './tier4_real_world.test.js';
import { buildDiskSpaceAnalyzerSuite } from './disk_space_analyzer.test.js';

export async function runAllE2ETests() {
  console.log(`================================================================`);
  console.log(` WiScripts Windows v1.6.0 — Master Test & Verification Runner`);
  console.log(` Date: ${new Date().toISOString()}`);
  console.log(` Architecture: Rust Tauri v2 + React 18 + TypeScript + Refined Minimal`);
  console.log(` Subsystems: Disk Analyzer, Script Library, Gaming, RAM, Network, Hardware`);
  console.log(` Verification: Static AST, Schema Hashes, Mock IPC, Unit & E2E Suites`);
  console.log(`================================================================\n`);

  const suites = [
    buildStaticAnalysisSuite(),
    buildUnitDiskAnalyzerSuite(),
    buildTier1Suite(),
    buildTier2Suite(),
    buildTier3Suite(),
    buildTier4Suite(),
    buildDiskSpaceAnalyzerSuite()
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
  console.log(` OVERALL TEST & VERIFICATION RESULTS (v1.6.0 RELEASE)`);
  console.log(`================================================================`);
  for (const res of suiteResults) {
    const status = res.failed === 0 ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${status}] ${res.suiteName.padEnd(46)} : ${res.passed}/${res.total} passed`);
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
    console.log(`SUCCESS: All ${grandTotal} tests passed cleanly with exit code 0!`);
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

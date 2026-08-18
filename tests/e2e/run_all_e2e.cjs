/**
 * WiScripts Windows v1.0 Production Release — Automated CommonJS E2E Test Suite Runner
 * Runnable via: node tests/e2e/run_all_e2e.cjs
 * Integrates Tiers 1 through 4 with diagnostic reporting and exit codes.
 */

async function main() {
  try {
    const { runAllE2ETests } = await import('./runner.js');
    await runAllE2ETests();
  } catch (err) {
    console.error('Fatal E2E Test Suite Execution Error:', err);
    process.exit(1);
  }
}

main();

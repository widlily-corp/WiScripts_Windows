import { runAudioViewStressTests } from './AudioViewEdgeCases.test';

async function main() {
  console.log('=== Running Audio UI & Store Stress Tests ===\n');
  const results = await runAudioViewStressTests();
  for (const entry of results.log) {
    console.log(entry);
  }
  console.log(`\nSummary: Passed ${results.passed}, Failed ${results.failed}`);
  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

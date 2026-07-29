import { useAppStore } from '../store/useAppStore';
import { parseMarkdownBlocks, parseInline } from '../components/MarkdownRenderer';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runUpdaterEmpiricalTests() {
  console.log('====================================================');
  console.log(' EMPIRICAL TEST SUITE: Milestone 3 Rich UI Updater');
  console.log('====================================================\n');

  const store = useAppStore.getState();

  // ---------------------------------------------------------
  // Test 1: Dev Mock Update Trigger
  // ---------------------------------------------------------
  console.log('[Test 1] Triggering Mock Update Payload');
  store.triggerMockUpdate({
    version: '0.4.5',
    body: '# Release v0.4.5\n- **Feature**: Markdown Modal\n> Note: Instant update',
  });

  const updatedState = useAppStore.getState();
  assert(updatedState.updateStatus === 'available', 'updateStatus is "available" after triggerMockUpdate');
  assert(updatedState.updateInfo !== null, 'updateInfo is populated');
  assert(updatedState.updateInfo?.version === '0.4.5', 'updateInfo version is "0.4.5"');
  assert(updatedState.bannerDismissed === false, 'bannerDismissed is reset to false');
  assert(updatedState.updateError === null, 'updateError is cleared');

  // ---------------------------------------------------------
  // Test 2: Markdown Parsing Verification
  // ---------------------------------------------------------
  console.log('\n[Test 2] MarkdownRenderer Parsing Engine');
  const blocks = parseMarkdownBlocks(updatedState.updateInfo?.body || '');
  assert(blocks.length === 3, 'Parsed 3 blocks from mock update body');
  assert(blocks[0].type === 'heading' && blocks[0].text === 'Release v0.4.5', 'Heading block correctly extracted');
  assert(blocks[1].type === 'list', 'List block correctly extracted');
  assert(blocks[2].type === 'blockquote' && blocks[2].text === 'Note: Instant update', 'Blockquote block correctly extracted');

  // ---------------------------------------------------------
  // Test 3: Release Notes Modal Toggle State
  // ---------------------------------------------------------
  console.log('\n[Test 3] Release Notes Modal Visibility Handlers');
  store.dismissUpdateBanner();
  assert(useAppStore.getState().bannerDismissed === true, 'bannerDismissed is true after dismiss');
  store.openReleaseNotesModal();
  assert(useAppStore.getState().bannerDismissed === false, 'bannerDismissed is false after openReleaseNotesModal()');

  console.log('\n====================================================');
  console.log(' ALL EMPIRICAL UPDATER TESTS PASSED SUCCESSFULLY! (100%)');
  console.log('====================================================\n');
}

runUpdaterEmpiricalTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});

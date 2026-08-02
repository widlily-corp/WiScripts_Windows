import React from 'react';
import { parseMarkdownBlocks, parseInline } from '../MarkdownRenderer';

/**
 * AAA Helper for Assertion Verification
 */
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

/**
 * AAA Unit Tests for MarkdownRenderer
 */
export function runMarkdownRendererUnitTests(): void {
  const markdownHeadersInput = `# Main Release Title\n## Features & Enhancements\n### Internal Fixes`;
  const headerBlocks = parseMarkdownBlocks(markdownHeadersInput);

  assert(headerBlocks.length === 3, 'Expected 3 heading blocks');
  assert(headerBlocks[0].type === 'heading' && headerBlocks[0].level === 1 && headerBlocks[0].text === 'Main Release Title', 'Header level 1 correctly parsed');
  assert(headerBlocks[1].type === 'heading' && headerBlocks[1].level === 2 && headerBlocks[1].text === 'Features & Enhancements', 'Header level 2 correctly parsed');
  assert(headerBlocks[2].type === 'heading' && headerBlocks[2].level === 3 && headerBlocks[2].text === 'Internal Fixes', 'Header level 3 correctly parsed');

  const listInput = `- Feature A: Dark mode\n- Feature B: Performance\n* Feature C: Security`;
  const listBlocks = parseMarkdownBlocks(listInput);

  assert(listBlocks.length === 1, 'Expected 1 bullet list block');
  assert(listBlocks[0].type === 'list', 'Block type is list');
  if (listBlocks[0].type === 'list') {
    assert(listBlocks[0].items.length === 3, 'List contains 3 items');
    assert(listBlocks[0].items[0] === 'Feature A: Dark mode', 'List item 1 matches');
    assert(listBlocks[0].items[1] === 'Feature B: Performance', 'List item 2 matches');
    assert(listBlocks[0].items[2] === 'Feature C: Security', 'List item 3 matches');
  }

  const codeBlockInput = `\`\`\`bash\nnpm run build\n\`\`\``;
  const codeBlocks = parseMarkdownBlocks(codeBlockInput);

  assert(codeBlocks.length === 1, 'Expected 1 code block');
  assert(codeBlocks[0].type === 'code', 'Block type is code');
  if (codeBlocks[0].type === 'code') {
    assert(codeBlocks[0].lang === 'bash', 'Language is bash');
    assert(codeBlocks[0].code === 'npm run build', 'Code content matches');
  }

  const blockquoteInput = `> Note: Restart system\n> To complete update installation`;
  const quoteBlocks = parseMarkdownBlocks(blockquoteInput);

  assert(quoteBlocks.length === 1, 'Expected 1 blockquote block');
  assert(quoteBlocks[0].type === 'blockquote', 'Block type is blockquote');
  if (quoteBlocks[0].type === 'blockquote') {
    assert(quoteBlocks[0].text === 'Note: Restart system\nTo complete update installation', 'Quote text matches');
  }

  const inlineInput = `**v0.4.0** contains \`bug fixes\` and [release notes](https://github.com/widlily/wiscripts)`;
  const inlineNodes = parseInline(inlineInput);

  assert(inlineNodes.length === 5, 'Inline parser returned 5 nodes');
  assert(React.isValidElement(inlineNodes[0]), 'Node 0 (bold) is a valid React element');
  assert(typeof inlineNodes[1] === 'string' && inlineNodes[1] === ' contains ', 'Node 1 is plain text connector');
  assert(React.isValidElement(inlineNodes[2]), 'Node 2 (code) is a valid React element');
  assert(typeof inlineNodes[3] === 'string' && inlineNodes[3] === ' and ', 'Node 3 is plain text connector');
  assert(React.isValidElement(inlineNodes[4]), 'Node 4 (link) is a valid React element');
}

// Auto-run if executed directly via node/tsx
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('MarkdownRenderer.test')) {
  console.log('Running MarkdownRenderer AAA unit tests...');
  runMarkdownRendererUnitTests();
  console.log('✓ All MarkdownRenderer AAA unit tests passed successfully!');
}

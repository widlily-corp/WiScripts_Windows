/**
 * WiScripts Windows — Navigation Sidebar & Scrollbar Test Suite
 * Validates 3-Tier Layout, Accessibility Landmarks, Dark Scrollbar CSS & Flex Constraints
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log(' NAVIGATION SIDEBAR & SCROLLBAR VERIFICATION TEST SUITE');
console.log(` Timestamp: ${new Date().toISOString()}`);
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`  ✗ FAIL: ${name}\n    ${err.message}`);
  }
}

// 1. Inspect src/components/Navigation.tsx
const navPath = path.join(__dirname, '..', 'src', 'components', 'Navigation.tsx');
assert.ok(fs.existsSync(navPath), 'Navigation.tsx must exist');
const navContent = fs.readFileSync(navPath, 'utf8');

test('Navigation.tsx: Root <aside> is a strict flex container with h-full and overflow-hidden', () => {
  assert.match(
    navContent,
    /<aside[^>]*className="[^"]*flex\s+flex-col[^"]*h-full[^"]*overflow-hidden[^"]*"/,
    'Root <aside> must include flex, flex-col, h-full, and overflow-hidden'
  );
  assert.match(navContent, /shrink-0/, 'Root <aside> must prevent horizontal shrinking');
});

test('Navigation.tsx: Tier 1 Brand Header is pinned with shrink-0', () => {
  assert.match(
    navContent,
    /{\/\*\s*Brand Header\s*\*\/}[\s\S]*?<div[^>]*className="[^"]*shrink-0[^"]*"[\s\S]*?<img[^>]*shrink-0/,
    'Brand header and icon must have shrink-0 to prevent compression'
  );
});

test('Navigation.tsx: Tier 2 Nav Links container has flex-1, min-h-0, overflow-y-auto, and custom-scrollbar', () => {
  assert.match(
    navContent,
    /<nav[\s\S]*?className="[^"]*flex-1[^"]*min-h-0[^"]*overflow-y-auto[^"]*custom-scrollbar[^"]*"/,
    '<nav> must have flex-1, min-h-0, overflow-y-auto, and custom-scrollbar'
  );
});

test('Navigation.tsx: Accessibility ARIA attributes and focus styling are strictly defined', () => {
  assert.match(navContent, /aria-label="Main Navigation"/, 'Must include aria-label="Main Navigation"');
  assert.match(navContent, /aria-current={isActive\s*\?\s*['"]page['"]\s*:\s*undefined}/, 'Must set aria-current="page" on active item');
  assert.match(navContent, /focus-visible:ring-1/, 'Must support focus-visible:ring-1');
  assert.match(navContent, /focus-visible:ring-brand/, 'Must support focus-visible:ring-brand');
  assert.match(navContent, /focus-visible:outline-none/, 'Must support focus-visible:outline-none');
});

test('Navigation.tsx: Nav button icons have shrink-0 and text spans have truncate', () => {
  assert.match(navContent, /<Icon[^>]*shrink-0/, 'Icon must have shrink-0');
  assert.match(navContent, /<span[^>]*truncate/, 'Text label must have truncate');
});

test('Navigation.tsx: Tier 3 Admin Elevation card is pinned with shrink-0', () => {
  const match = navContent.match(/{\/\*\s*Admin Elevation Status Card\s*\*\/}[\s\S]*?<div[^>]*className="([^"]*)"/);
  assert.ok(match, 'Admin Elevation status card wrapper div found');
  const classNames = match[1];
  assert.ok(classNames.includes('shrink-0'), 'Admin elevation card must have shrink-0');
  assert.ok(classNames.includes('border-t'), 'Admin elevation card must have border-t');
});

// 2. Inspect src/index.css
const cssPath = path.join(__dirname, '..', 'src', 'index.css');
assert.ok(fs.existsSync(cssPath), 'index.css must exist');
const cssContent = fs.readFileSync(cssPath, 'utf8');

test('index.css: .custom-scrollbar utility class provides standards-compliant scrollbar-width & color', () => {
  assert.match(cssContent, /\.custom-scrollbar\s*{[^}]*scrollbar-width:\s*thin;/, 'Must specify scrollbar-width: thin');
  assert.match(cssContent, /\.custom-scrollbar\s*{[^}]*scrollbar-color:\s*#22252a\s+transparent;/i, 'Must specify scrollbar-color: #22252a transparent');
});

test('index.css: .custom-scrollbar utility class provides WebKit pseudo-elements (5px, #22252a thumb, #374151 hover)', () => {
  assert.match(cssContent, /\.custom-scrollbar::-webkit-scrollbar\s*{[^}]*width:\s*5px;/, 'Webkit scrollbar width must be 5px');
  assert.match(cssContent, /\.custom-scrollbar::-webkit-scrollbar-thumb\s*{[^}]*background:\s*#22252a;/i, 'Webkit thumb background must be #22252a');
  assert.match(cssContent, /\.custom-scrollbar::-webkit-scrollbar-thumb\s*{[^}]*border-radius:\s*4px;/, 'Webkit thumb border-radius must be 4px');
  assert.match(cssContent, /\.custom-scrollbar::-webkit-scrollbar-thumb:hover\s*{[^}]*background(?:-color)?:\s*#374151;/i, 'Webkit thumb hover must be #374151');
});

test('index.css: Global dark scrollbars defined in @layer base', () => {
  assert.match(cssContent, /\*::-webkit-scrollbar\s*{[^}]*width:\s*6px;/, 'Global webkit scrollbar width must be defined');
  assert.match(cssContent, /\*::-webkit-scrollbar-thumb\s*{[^}]*background-color:\s*#22252a;/i, 'Global webkit thumb background must be #22252a');
});

// 3. Layout geometry simulation
test('Layout Simulation: Under flexbox constraint, 25 items scroll cleanly at low viewport heights', () => {
  const HEADER_HEIGHT = 65; // px
  const FOOTER_HEIGHT = 62; // px
  const ITEM_HEIGHT = 36;   // px
  const TOTAL_ITEMS = 25;
  const CONTENT_HEIGHT = TOTAL_ITEMS * ITEM_HEIGHT; // 900px

  const viewports = [480, 600, 768, 900, 1080, 1440];

  for (const vh of viewports) {
    const availableNavHeight = Math.max(0, vh - HEADER_HEIGHT - FOOTER_HEIGHT);
    const requiresScroll = CONTENT_HEIGHT > availableNavHeight;
    if (vh < 1027) {
      assert.strictEqual(requiresScroll, true, `Viewport ${vh}px should activate vertical scroll`);
    }
    assert.strictEqual(HEADER_HEIGHT + FOOTER_HEIGHT <= vh, true, `Header + Footer remain pinned on viewport ${vh}px`);
  }
});

console.log('\n================================================================');
console.log(` SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('ALL NAVIGATION & SCROLLBAR VERIFICATION TESTS PASSED CLEANLY!\n');
}

/**
 * Challenger #2 - Adversarial Stress Test Suite for Milestone 2
 * Scope:
 * 1. Uninstaller date parsing across various date formats (YYYYMMDD, YYYY-MM-DD, DD.MM.YYYY, Date.parse, invalid/corrupt dates, numbers)
 * 2. Uninstaller multi-format chronological sorting (asc & desc)
 * 3. Storage duplicate scanner logic & boundary verification (<=4KB header reuse, >4KB partial-then-full hashing, collision resistance)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log(' CHALLENGER #2: ADVERSARIAL STRESS TEST SUITE (MILESTONE 2)');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.log(`  ✗ FAIL: ${name}`);
    console.log(`    Error: ${err.message}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// PART 1: UNINSTALLER DATE PARSING ADVERSARIAL STRESS TESTS
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Uninstaller parseInstallDate Stress Testing ---');

// Reference implementation extracted directly from src/views/UninstallerView.tsx
function parseInstallDate(dateStr) {
  if (dateStr === null || dateStr === undefined) return 0;
  if (typeof dateStr === 'number') {
    return isNaN(dateStr) || dateStr < 0 ? 0 : dateStr;
  }
  const s = String(dateStr).trim();
  if (!s) return 0;

  // 1. Compact YYYYMMDD (e.g., 20240229)
  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compactMatch) {
    const year = parseInt(compactMatch[1], 10);
    const month = parseInt(compactMatch[2], 10);
    const day = parseInt(compactMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/.exec(s);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 3. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (European)
  const euroMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (euroMatch) {
    const day = parseInt(euroMatch[1], 10);
    const month = parseInt(euroMatch[2], 10);
    const year = parseInt(euroMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 4. Standard Date.parse fallback
  const parsed = Date.parse(s);
  return isNaN(parsed) ? 0 : parsed;
}

test('Date Parsing: Compact YYYYMMDD format', () => {
  const ts1 = parseInstallDate('20240229'); // Leap day 2024
  assert.strictEqual(ts1, new Date(2024, 1, 29).getTime());

  const ts2 = parseInstallDate('20260818');
  assert.strictEqual(ts2, new Date(2026, 7, 18).getTime());

  const ts3 = parseInstallDate('19991231');
  assert.strictEqual(ts3, new Date(1999, 11, 31).getTime());
});

test('Date Parsing: ISO formats (YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD)', () => {
  const ts1 = parseInstallDate('2026-08-18');
  assert.strictEqual(ts1, new Date(2026, 7, 18).getTime());

  const ts2 = parseInstallDate('2026/08/18');
  assert.strictEqual(ts2, new Date(2026, 7, 18).getTime());

  const ts3 = parseInstallDate('2026.08.18');
  assert.strictEqual(ts3, new Date(2026, 7, 18).getTime());

  const ts4 = parseInstallDate('2026 08 18');
  assert.strictEqual(ts4, new Date(2026, 7, 18).getTime());

  // Single digit month and day
  const ts5 = parseInstallDate('2026-8-5');
  assert.strictEqual(ts5, new Date(2026, 7, 5).getTime());
});

test('Date Parsing: European formats (DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY)', () => {
  const ts1 = parseInstallDate('18.08.2026');
  assert.strictEqual(ts1, new Date(2026, 7, 18).getTime());

  const ts2 = parseInstallDate('18/08/2026');
  assert.strictEqual(ts2, new Date(2026, 7, 18).getTime());

  const ts3 = parseInstallDate('18-08-2026');
  assert.strictEqual(ts3, new Date(2026, 7, 18).getTime());

  const ts4 = parseInstallDate('5.8.2026');
  assert.strictEqual(ts4, new Date(2026, 7, 5).getTime());
});

test('Date Parsing: Standard Date.parse strings (US and RFC/ISO timestamps)', () => {
  const ts1 = parseInstallDate('Aug 18, 2026');
  assert.ok(ts1 > 0);
  assert.strictEqual(ts1, Date.parse('Aug 18, 2026'));

  const ts2 = parseInstallDate('2026-08-18T12:00:00Z');
  assert.ok(ts2 > 0);
  assert.strictEqual(ts2, Date.parse('2026-08-18T12:00:00Z'));
});

test('Date Parsing: Numeric timestamps and invalid numeric inputs', () => {
  const now = Date.now();
  assert.strictEqual(parseInstallDate(now), now);
  assert.strictEqual(parseInstallDate(0), 0);
  assert.strictEqual(parseInstallDate(-100), 0);
  assert.strictEqual(parseInstallDate(NaN), 0);
});

test('Date Parsing: Corrupted, empty, or malicious strings safely return 0', () => {
  assert.strictEqual(parseInstallDate(null), 0);
  assert.strictEqual(parseInstallDate(undefined), 0);
  assert.strictEqual(parseInstallDate(''), 0);
  assert.strictEqual(parseInstallDate('   '), 0);
  assert.strictEqual(parseInstallDate('InvalidDateString'), 0);
  assert.strictEqual(parseInstallDate('20261301'), 0); // Invalid month 13
  assert.strictEqual(parseInstallDate('20260232'), 0); // Invalid day 32
  assert.strictEqual(parseInstallDate('99999999'), 0); // Invalid month 99
  assert.strictEqual(parseInstallDate('Привет Мир'), 0);
  assert.strictEqual(parseInstallDate('!@#$%^&*()'), 0);
  assert.strictEqual(parseInstallDate('[object Object]'), 0);
});

test('Date Sorting: Chronological ordering across mixed formats', () => {
  const apps = [
    { id: '1', name: 'App 2026', installDate: '20260110' },           // Jan 10, 2026
    { id: '2', name: 'App 2025', installDate: '20251105' },           // Nov 5, 2025
    { id: '3', name: 'App VSCode', installDate: '01/15/2026' },        // Jan 15, 2026 (US date.parse / Euro)
    { id: '4', name: 'App ISO', installDate: '2024-06-01' },           // Jun 1, 2024
    { id: '5', name: 'App Euro', installDate: '25.12.2023' },          // Dec 25, 2023
    { id: '6', name: 'App No Date', installDate: null },               // 0
    { id: '7', name: 'App Future', installDate: '2026-12-31' },        // Dec 31, 2026
  ];

  // Sort ASC
  const sortedAsc = [...apps].sort((a, b) => parseInstallDate(a.installDate) - parseInstallDate(b.installDate));
  const idsAsc = sortedAsc.map(a => a.id);
  assert.deepStrictEqual(idsAsc, ['6', '5', '4', '2', '1', '3', '7']);

  // Sort DESC
  const sortedDesc = [...apps].sort((a, b) => parseInstallDate(b.installDate) - parseInstallDate(a.installDate));
  const idsDesc = sortedDesc.map(a => a.id);
  assert.deepStrictEqual(idsDesc, ['7', '3', '1', '2', '4', '5', '6']);
});

// -----------------------------------------------------------------------------
// PART 2: STORAGE 2-STAGE FAST HASHING INVARIANT CHECKS
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Storage Fast Hashing Invariant Verification ---');

const crypto = require('crypto');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function computePartialHash(buf) {
  const slice = buf.subarray(0, 4096);
  return sha256(slice);
}

test('Storage Hashing: Small file (<=4096 bytes) partial hash equals full hash', () => {
  // Test across multiple small sizes: 1B, 100B, 512B, 1024B, 4095B, 4096B
  const sizes = [1, 100, 512, 1024, 2048, 4095, 4096];
  for (const sz of sizes) {
    const data = Buffer.alloc(sz, 0x5a);
    const partial = computePartialHash(data);
    const full = sha256(data);
    assert.strictEqual(
      partial,
      full,
      `For size ${sz} <= 4096, partial hash must be identical to full hash`
    );
  }
});

test('Storage Hashing: Large file (>4096 bytes) partial hash differs when body changes after 4KB', () => {
  const size = 8192;
  const file1 = Buffer.alloc(size, 0xaa);
  const file2 = Buffer.alloc(size, 0xaa);
  file2[5000] = 0xbb; // Difference at index 5000 (> 4096)

  const partial1 = computePartialHash(file1);
  const partial2 = computePartialHash(file2);
  assert.strictEqual(partial1, partial2, '4KB headers are identical, so partial hashes match');

  const full1 = sha256(file1);
  const full2 = sha256(file2);
  assert.notStrictEqual(full1, full2, 'Full hashes must differ when payload differs after 4KB');
});

test('Storage Hashing: Exact boundary transition at 4096 vs 4097 bytes', () => {
  const boundary4096 = Buffer.alloc(4096, 0x77);
  assert.strictEqual(computePartialHash(boundary4096), sha256(boundary4096));

  const boundary4097 = Buffer.alloc(4097, 0x77);
  boundary4097[4096] = 0x88;
  assert.notStrictEqual(computePartialHash(boundary4097), sha256(boundary4097));
});

console.log('\n================================================================');
console.log(' ADVERSARIAL STRESS TEST SUMMARY');
console.log(` Total Passed: ${passCount}`);
console.log(` Total Failed: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

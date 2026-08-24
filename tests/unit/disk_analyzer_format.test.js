/**
 * WiScripts Windows v1.5.1 — Unit Test Suite: Multi-TB / PB Binary Format Scaling
 * 
 * Verifies formatBytes and formatTabularBytes behavior:
 * - 0 B, negative, NaN
 * - 1 B .. 1023 B
 * - 1 KB .. 1023 KB
 * - 1 MB .. 1023 MB
 * - 1 GB .. 1000 GB, 1023 GB
 * - 1024 GB (1.00 TB) -> R1 Bug Fix Verification (no 1024.0 GB rollover or counter reset)
 * - 1.5 TB, 1000 TB, 1023 TB
 * - 1024 TB (1.00 PB), 1.5 PB, 1000 PB
 * - formatTabularBytes comma-separated integer output
 */

import { TestRunner, assert } from '../e2e/harness.js';
import {
  formatBytes,
  formatTabularBytes,
  isSystemProtectedPath,
  syncTreeAfterDeletion,
  filterFsTree
} from '../../src/utils/diskAnalyzer.ts';

export function buildUnitDiskAnalyzerSuite() {
  const runner = new TestRunner('Unit Tests - Multi-TB Format & Disk Utilities');

  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;
  const TB = 1024 * GB;
  const PB = 1024 * TB;

  // 1. Zero & Falsy Bounds
  runner.addTest('UNIT_FORMAT_01: Zero, negative, and NaN inputs return 0 B', async () => {
    assert.equal(formatBytes(0), '0 B', '0 bytes -> 0 B');
    assert.equal(formatBytes(-1), '0 B', '-1 bytes -> 0 B');
    assert.equal(formatBytes(-1048576), '0 B', '-1 MB -> 0 B');
    assert.equal(formatBytes(NaN), '0 B', 'NaN -> 0 B');
    assert.equal(formatTabularBytes(0), '0 B', '0 tabular bytes -> 0 B');
    assert.equal(formatTabularBytes(-5), '0 B', 'negative tabular bytes -> 0 B');
    assert.equal(formatTabularBytes(NaN), '0 B', 'NaN tabular bytes -> 0 B');
  });

  // 2. Byte Tier
  runner.addTest('UNIT_FORMAT_02: Byte tier scaling (1 B to 1023 B)', async () => {
    assert.equal(formatBytes(1), '1 B', '1 B');
    assert.equal(formatBytes(512), '512 B', '512 B');
    assert.equal(formatBytes(1023), '1023 B', '1023 B');
  });

  // 3. KB Tier
  runner.addTest('UNIT_FORMAT_03: Kilobyte tier scaling (1.00 KB to 1023.0 KB)', async () => {
    assert.equal(formatBytes(KB), '1.00 KB', '1024 B is 1.00 KB');
    assert.equal(formatBytes(1.5 * KB), '1.50 KB', '1.50 KB');
    assert.equal(formatBytes(99.9 * KB), '99.90 KB', '99.90 KB');
    assert.equal(formatBytes(100 * KB), '100.0 KB', '100.0 KB (1 decimal threshold >= 100)');
    assert.equal(formatBytes(1023 * KB), '1023.0 KB', '1023.0 KB');
  });

  // 4. MB Tier
  runner.addTest('UNIT_FORMAT_04: Megabyte tier scaling (1.00 MB to 1023.0 MB)', async () => {
    assert.equal(formatBytes(MB), '1.00 MB', '1048576 B is 1.00 MB');
    assert.equal(formatBytes(1.5 * MB), '1.50 MB', '1.50 MB');
    assert.equal(formatBytes(100 * MB), '100.0 MB', '100.0 MB');
    assert.equal(formatBytes(1023 * MB), '1023.0 MB', '1023.0 MB');
  });

  // 5. GB Tier & Multi-Hundred GB Handling
  runner.addTest('UNIT_FORMAT_05: Gigabyte tier scaling and 1000 GB handling', async () => {
    assert.equal(formatBytes(GB), '1.00 GB', '1.00 GB');
    assert.equal(formatBytes(4.82 * GB), '4.82 GB', '4.82 GB');
    assert.equal(formatBytes(100 * GB), '100.0 GB', '100.0 GB');
    assert.equal(formatBytes(500 * GB), '500.0 GB', '500.0 GB');
    assert.equal(formatBytes(1000 * GB), '1000.0 GB', '1000.0 GB (Accurate decimal representation)');
    assert.equal(formatBytes(1023 * GB), '1023.0 GB', '1023.0 GB (Upper boundary before 1 TB)');
  });

  // 6. Terabyte Tier (> 1000 GB R1 Fix)
  runner.addTest('UNIT_FORMAT_06: Multi-Terabyte tier scaling (1.00 TB to 1000 TB)', async () => {
    assert.equal(formatBytes(TB), '1.00 TB', '1024 GB transitions cleanly to 1.00 TB without rollover');
    assert.equal(formatBytes(1.5 * TB), '1.50 TB', '1.50 TB');
    assert.equal(formatBytes(2.1 * TB), '2.10 TB', '2.10 TB');
    assert.equal(formatBytes(4 * TB), '4.00 TB', '4.00 TB');
    assert.equal(formatBytes(100 * TB), '100.0 TB', '100.0 TB');
    assert.equal(formatBytes(1000 * TB), '1000.0 TB', '1000.0 TB (Enterprise multi-TB storage arrays)');
    assert.equal(formatBytes(1023 * TB), '1023.0 TB', '1023.0 TB');
  });

  // 7. Petabyte Tier
  runner.addTest('UNIT_FORMAT_07: Petabyte tier scaling without undefined rollover', async () => {
    assert.equal(formatBytes(PB), '1.00 PB', '1024 TB transitions cleanly to 1.00 PB');
    assert.equal(formatBytes(1.5 * PB), '1.50 PB', '1.50 PB');
    assert.equal(formatBytes(100 * PB), '100.0 PB', '100.0 PB');
    assert.equal(formatBytes(1000 * PB), '1000.0 PB', '1000.0 PB');
    assert.equal(formatBytes(1023 * PB), '1023.0 PB', '1023.0 PB');
  });

  // 8. Tabular Bytes Comma Formatting
  runner.addTest('UNIT_FORMAT_08: Tabular bytes formatting with comma separators', async () => {
    assert.equal(formatTabularBytes(1024), '1,024 B', '1,024 B');
    assert.equal(formatTabularBytes(1048576), '1,048,576 B', '1,048,576 B');
    assert.equal(formatTabularBytes(1073741824000), '1,073,741,824,000 B', '1,073,741,824,000 B');
    assert.equal(formatTabularBytes(4398046511104), '4,398,046,511,104 B', '4,398,046,511,104 B');
  });

  // 9. OS Guardrail Path Protection
  runner.addTest('UNIT_FORMAT_09: System protected paths detection across casing and slashes', async () => {
    assert.isTrue(isSystemProtectedPath('C:\\'), 'C:\\ protected');
    assert.isTrue(isSystemProtectedPath('c:\\windows\\system32'), 'Windows/System32 protected');
    assert.isTrue(isSystemProtectedPath('C:/Windows/System32'), 'Forward slashes normalized and protected');
    assert.isTrue(isSystemProtectedPath('C:\\ProgramData\\Microsoft\\Windows Defender'), 'Defender protected');
    assert.isTrue(isSystemProtectedPath('C:\\pagefile.sys'), 'pagefile.sys protected');
    assert.isFalse(isSystemProtectedPath('C:\\Users\\TestUser\\Downloads'), 'User downloads not protected');
    assert.isFalse(isSystemProtectedPath('D:\\Projects\\WiScripts_Windows'), 'Project folder not protected');
  });

  // 10. Tree Synchronization and Filtering
  runner.addTest('UNIT_FORMAT_10: syncTreeAfterDeletion and filterFsTree functional correctness', async () => {
    const testTree = {
      id: 'root',
      name: 'Root',
      path: 'C:\\Test',
      sizeBytes: 100 * MB,
      fileCount: 2,
      dirCount: 2,
      isDir: true,
      children: [
        {
          id: 'ca',
          name: 'FolderA',
          path: 'C:\\Test\\FolderA',
          sizeBytes: 60 * MB,
          fileCount: 1,
          dirCount: 0,
          isDir: true,
          children: []
        },
        {
          id: 'cb',
          name: 'FolderB',
          path: 'C:\\Test\\FolderB',
          sizeBytes: 40 * MB,
          fileCount: 1,
          dirCount: 0,
          isDir: true,
          children: []
        }
      ]
    };

    const synced = syncTreeAfterDeletion(testTree, 'C:\\Test\\FolderB', 40 * MB, 1);
    assert.equal(synced.sizeBytes, 60 * MB, 'Size reduced to 60MB');
    assert.equal(synced.children.length, 1, 'FolderB removed');
    assert.equal(synced.children[0].percentageOfParent, 100, 'Percentage updated to 100%');

    const filtered = filterFsTree(synced, { query: 'FolderA' });
    assert.ok(filtered, 'Filtered tree found');
    assert.equal(filtered.children.length, 1, 'FolderA retained');
  });

  return runner;
}

// Standalone execution entrypoint
if (process.argv[1] && import.meta.url === (await import('url')).pathToFileURL(process.argv[1]).href) {
  const runner = buildUnitDiskAnalyzerSuite();
  runner.run().then(res => {
    if (res.failed > 0) {
      console.error(`FAIL: ${res.failed} tests failed.`);
      process.exit(1);
    } else {
      console.log(`SUCCESS: All ${res.total} tests passed!`);
      process.exit(0);
    }
  });
}

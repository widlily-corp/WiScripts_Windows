/**
 * WiScripts Windows v1.6.0 — Disk Space Analyzer Unit & Multi-TB Scaling Test Suite
 * 
 * Validates:
 * 1. formatBytes binary scaling across 0 B, 1 KB, 1 MB, 1 GB, 1000 GB, 1023 GB, 1024 GB (1.00 TB),
 *    1.5 TB, 1000 TB, 1024 TB (1.00 PB), 1.5 PB, 1000 PB without rollover, NaN, or undefined.
 * 2. formatTabularBytes comma-separated integer formatting for 64-bit byte counts.
 * 3. isSystemProtectedPath Windows OS guardrail protection against destructive deletions.
 * 4. syncTreeAfterDeletion recursive structural sharing and percentage rescaling.
 * 5. filterFsTree multi-criteria search filtering (query, minBytes, extension).
 */

import {
  formatBytes,
  formatTabularBytes,
  isSystemProtectedPath,
  syncTreeAfterDeletion,
  filterFsTree,
} from '../diskAnalyzer.ts';
import type { FsTreeNode } from '../../types/diskAnalyzer.ts';

// AAA Assertion Helpers
function assertEqual<T>(actual: T, expected: T, msg = '') {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg} (Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function assertTrue(val: boolean, msg = '') {
  if (!val) {
    throw new Error(`Assertion failed: ${msg} (Expected true, got ${val})`);
  }
}

function assertFalse(val: boolean, msg = '') {
  if (val) {
    throw new Error(`Assertion failed: ${msg} (Expected false, got ${val})`);
  }
}

export function runDiskAnalyzerUnitTests() {
  console.log('Running Disk Analyzer Unit & Multi-TB Scaling Tests...');

  // =========================================================================
  // 1. formatBytes Unit & Boundary Scaling Tests
  // =========================================================================

  // 1.1 Zero, Negative & NaN Edge Cases
  assertEqual(formatBytes(0), '0 B', 'Zero bytes');
  assertEqual(formatBytes(-1), '0 B', 'Negative 1 byte');
  assertEqual(formatBytes(-1048576), '0 B', 'Negative 1 MB');
  assertEqual(formatBytes(NaN), '0 B', 'NaN input');

  // 1.2 Byte Tier (0 B .. 1023 B)
  assertEqual(formatBytes(1), '1 B', '1 Byte');
  assertEqual(formatBytes(512), '512 B', '512 Bytes');
  assertEqual(formatBytes(999), '999 B', '999 Bytes');
  assertEqual(formatBytes(1023), '1023 B', '1023 Bytes (upper byte boundary)');

  // 1.3 Kilobyte Tier (1 KB .. 1023 KB)
  const KB = 1024;
  assertEqual(formatBytes(KB), '1.00 KB', 'Exact 1.00 KB');
  assertEqual(formatBytes(1.5 * KB), '1.50 KB', '1.50 KB');
  assertEqual(formatBytes(10 * KB), '10.00 KB', '10.00 KB');
  assertEqual(formatBytes(99.9 * KB), '99.90 KB', '99.90 KB');
  assertEqual(formatBytes(100 * KB), '100.0 KB', '100.0 KB (1 decimal threshold >= 100)');
  assertEqual(formatBytes(512 * KB), '512.0 KB', '512.0 KB');
  assertEqual(formatBytes(1023 * KB), '1023.0 KB', '1023.0 KB (upper KB boundary)');

  // 1.4 Megabyte Tier (1 MB .. 1023 MB)
  const MB = 1024 * KB;
  assertEqual(formatBytes(MB), '1.00 MB', 'Exact 1.00 MB');
  assertEqual(formatBytes(1.5 * MB), '1.50 MB', '1.50 MB');
  assertEqual(formatBytes(1572864), '1.50 MB', '1572864 bytes is 1.50 MB');
  assertEqual(formatBytes(100 * MB), '100.0 MB', '100.0 MB');
  assertEqual(formatBytes(750.25 * MB), '750.3 MB', '750.3 MB');
  assertEqual(formatBytes(1023 * MB), '1023.0 MB', '1023.0 MB (upper MB boundary)');

  // 1.5 Gigabyte Tier (1 GB .. 1023 GB)
  const GB = 1024 * MB;
  assertEqual(formatBytes(GB), '1.00 GB', 'Exact 1.00 GB');
  assertEqual(formatBytes(4.82 * GB), '4.82 GB', '4.82 GB');
  assertEqual(formatBytes(5175492198), '4.82 GB', '5175492198 bytes is 4.82 GB');
  assertEqual(formatBytes(50 * GB), '50.00 GB', '50.00 GB');
  assertEqual(formatBytes(100 * GB), '100.0 GB', '100.0 GB');
  assertEqual(formatBytes(500 * GB), '500.0 GB', '500.0 GB');
  assertEqual(formatBytes(1000 * GB), '1000.0 GB', '1000.0 GB (Multi-hundred GB without premature wrap)');
  assertEqual(formatBytes(1023 * GB), '1023.0 GB', '1023.0 GB (upper GB boundary)');

  // 1.6 Terabyte Tier (1 TB .. 1023 TB) — R1 Fix Verification
  const TB = 1024 * GB;
  assertEqual(formatBytes(TB), '1.00 TB', 'Exact 1.00 TB (1024 GB transitions cleanly to 1.00 TB)');
  assertEqual(formatBytes(1.5 * TB), '1.50 TB', '1.50 TB');
  assertEqual(formatBytes(2.1 * TB), '2.10 TB', '2.10 TB');
  assertEqual(formatBytes(2308974418944), '2.10 TB', '2308974418944 bytes is 2.10 TB');
  assertEqual(formatBytes(4 * TB), '4.00 TB', '4.00 TB');
  assertEqual(formatBytes(10 * TB), '10.00 TB', '10.00 TB');
  assertEqual(formatBytes(100 * TB), '100.0 TB', '100.0 TB');
  assertEqual(formatBytes(1000 * TB), '1000.0 TB', '1000.0 TB (1000 TB multi-drive array)');
  assertEqual(formatBytes(1023 * TB), '1023.0 TB', '1023.0 TB (upper TB boundary)');

  // 1.7 Petabyte Tier (1 PB .. 1023 PB)
  const PB = 1024 * TB;
  assertEqual(formatBytes(PB), '1.00 PB', 'Exact 1.00 PB (1024 TB transitions cleanly to 1.00 PB)');
  assertEqual(formatBytes(1.5 * PB), '1.50 PB', '1.50 PB');
  assertEqual(formatBytes(100 * PB), '100.0 PB', '100.0 PB');
  assertEqual(formatBytes(500 * PB), '500.0 PB', '500.0 PB');
  assertEqual(formatBytes(1000 * PB), '1000.0 PB', '1000.0 PB');
  assertEqual(formatBytes(1023 * PB), '1023.0 PB', '1023.0 PB');

  // 1.8 Exabyte Tier & Boundary Rollover Tests
  const EB = 1024 * PB;
  assertEqual(formatBytes(EB), '1.00 EB', 'Exact 1.00 EB');
  assertEqual(formatBytes(2.5 * EB), '2.50 EB', '2.50 EB');

  // Boundary rollover verification: 1023.996 GB should roll over to 1.00 TB instead of displaying 1024.0 GB
  const justBelowTB = 1023.996 * GB;
  assertEqual(formatBytes(justBelowTB), '1.00 TB', '1023.996 GB rolls over cleanly to 1.00 TB');

  // Verify zero 'undefined' or 'NaN' in returned unit strings
  const testSamples = [0, 1, 1023, 1024, 1048576, 1073741824, 1099511627776, 1125899906842624, EB, 2.5 * EB];
  for (const s of testSamples) {
    const formatted = formatBytes(s);
    assertFalse(formatted.includes('undefined'), `formatBytes(${s}) must not contain undefined`);
    assertFalse(formatted.includes('NaN'), `formatBytes(${s}) must not contain NaN`);
  }

  // =========================================================================
  // 2. formatTabularBytes Tests
  // =========================================================================
  assertEqual(formatTabularBytes(0), '0 B', 'Tabular 0 bytes');
  assertEqual(formatTabularBytes(-5), '0 B', 'Tabular negative bytes');
  assertEqual(formatTabularBytes(NaN), '0 B', 'Tabular NaN');
  assertEqual(formatTabularBytes(1024), '1,024 B', 'Tabular 1KB');
  assertEqual(formatTabularBytes(1048576), '1,048,576 B', 'Tabular 1MB');
  assertEqual(formatTabularBytes(1073741824000), '1,073,741,824,000 B', 'Tabular 1000 GB');
  assertEqual(formatTabularBytes(4398046511104), '4,398,046,511,104 B', 'Tabular 4 TB');

  // =========================================================================
  // 3. isSystemProtectedPath Guardrail Tests
  // =========================================================================
  // Drive Roots
  assertTrue(isSystemProtectedPath('C:\\'), 'C:\\ is protected drive root');
  assertTrue(isSystemProtectedPath('C:'), 'C: is protected drive root');
  assertTrue(isSystemProtectedPath('D:\\'), 'D:\\ is protected drive root');
  assertTrue(isSystemProtectedPath('z:\\'), 'Z:\\ is protected drive root');

  // System Protected Folders
  assertTrue(isSystemProtectedPath('C:\\Windows'), 'C:\\Windows is protected');
  assertTrue(isSystemProtectedPath('C:\\Windows\\System32'), 'System32 is protected');
  assertTrue(isSystemProtectedPath('C:\\WINDOWS\\SYSTEM32\\DRIVERS'), 'System32 subfolder is protected');
  assertTrue(isSystemProtectedPath('C:\\Boot'), 'Boot folder is protected');
  assertTrue(isSystemProtectedPath('C:\\System Volume Information'), 'System Volume Information is protected');
  assertTrue(isSystemProtectedPath('C:\\$Recycle.Bin'), 'Recycle bin root is protected');
  assertTrue(isSystemProtectedPath('C:\\Recovery'), 'Recovery folder is protected');
  assertTrue(isSystemProtectedPath('C:\\Program Files\\Windows Defender'), 'Windows Defender is protected');
  assertTrue(isSystemProtectedPath('C:\\Program Files (x86)\\Windows Defender'), 'Windows Defender x86 is protected');
  assertTrue(isSystemProtectedPath('C:\\ProgramData\\Microsoft\\Windows Defender'), 'ProgramData Defender is protected');

  // Critical Core OS Binaries
  assertTrue(isSystemProtectedPath('C:\\pagefile.sys'), 'pagefile.sys is protected');
  assertTrue(isSystemProtectedPath('C:\\hiberfil.sys'), 'hiberfil.sys is protected');
  assertTrue(isSystemProtectedPath('C:\\swapfile.sys'), 'swapfile.sys is protected');
  assertTrue(isSystemProtectedPath('C:\\bootmgr'), 'bootmgr is protected');
  assertTrue(isSystemProtectedPath('C:\\bootstat.dat'), 'bootstat.dat is protected');

  // Safe Deletable Paths
  assertFalse(isSystemProtectedPath('C:\\Users\\TestUser\\Downloads'), 'Downloads is not protected');
  assertFalse(isSystemProtectedPath('C:\\Users\\TestUser\\AppData\\Local\\Temp'), 'Temp is not protected');
  assertFalse(isSystemProtectedPath('D:\\Projects\\WiScripts_Windows'), 'Projects is not protected');
  assertFalse(isSystemProtectedPath('E:\\Games\\SteamLibrary'), 'SteamLibrary is not protected');

  // =========================================================================
  // 4. syncTreeAfterDeletion Tests
  // =========================================================================
  const testTree: FsTreeNode = {
    id: 'root',
    name: 'Root',
    path: 'C:\\Test',
    sizeBytes: 100 * MB,
    fileCount: 3,
    dirCount: 2,
    isDir: true,
    modifiedTimestamp: Date.now(),
    percentageOfParent: 100,
    percentageOfRoot: 100,
    children: [
      {
        id: 'child_a',
        name: 'FolderA',
        path: 'C:\\Test\\FolderA',
        sizeBytes: 60 * MB,
        fileCount: 2,
        dirCount: 0,
        isDir: true,
        modifiedTimestamp: Date.now(),
        percentageOfParent: 60,
        percentageOfRoot: 60,
        children: [],
      },
      {
        id: 'child_b',
        name: 'FolderB',
        path: 'C:\\Test\\FolderB',
        sizeBytes: 40 * MB,
        fileCount: 1,
        dirCount: 0,
        isDir: true,
        modifiedTimestamp: Date.now(),
        percentageOfParent: 40,
        percentageOfRoot: 40,
        children: [],
      },
    ],
  };

  const updated = syncTreeAfterDeletion(testTree, 'C:\\Test\\FolderB', 40 * MB, 1);
  assertEqual(updated.sizeBytes, 60 * MB, 'Root size subtracted accurately');
  assertEqual(updated.children?.length, 1, 'FolderB removed from children array');
  assertEqual(updated.children?.[0].name, 'FolderA', 'FolderA remains');
  assertEqual(updated.children?.[0].percentageOfParent, 100, 'FolderA rescaled to 100% of remaining parent');

  // =========================================================================
  // 5. filterFsTree Multi-Criteria Tests
  // =========================================================================
  const treeToFilter: FsTreeNode = {
    id: 'root',
    name: 'Root',
    path: 'C:\\Users\\TestUser',
    sizeBytes: 150 * MB,
    fileCount: 3,
    dirCount: 1,
    isDir: true,
    modifiedTimestamp: Date.now(),
    children: [
      {
        id: 'f1',
        name: 'report_2026.docx',
        path: 'C:\\Users\\TestUser\\report_2026.docx',
        sizeBytes: 10 * MB,
        fileCount: 1,
        dirCount: 0,
        isDir: false,
        extension: 'docx',
        modifiedTimestamp: Date.now(),
      },
      {
        id: 'f2',
        name: 'backup_archive.zip',
        path: 'C:\\Users\\TestUser\\backup_archive.zip',
        sizeBytes: 100 * MB,
        fileCount: 1,
        dirCount: 0,
        isDir: false,
        extension: 'zip',
        modifiedTimestamp: Date.now(),
      },
      {
        id: 'f3',
        name: 'notes.txt',
        path: 'C:\\Users\\TestUser\\notes.txt',
        sizeBytes: 40 * MB,
        fileCount: 1,
        dirCount: 0,
        isDir: false,
        extension: 'txt',
        modifiedTimestamp: Date.now(),
      },
    ],
  };

  // Filter by query substring
  const filteredQuery = filterFsTree(treeToFilter, { query: 'report' });
  assertTrue(filteredQuery !== null, 'filter query found result');
  assertEqual(filteredQuery?.children?.length, 1, 'Only 1 child matched query');
  assertEqual(filteredQuery?.children?.[0].name, 'report_2026.docx', 'Matched report_2026.docx');

  // Filter by minBytes
  const filteredSize = filterFsTree(treeToFilter, { minBytes: 50 * MB });
  assertTrue(filteredSize !== null, 'filter size found result');
  assertEqual(filteredSize?.children?.length, 1, 'Only 1 child >= 50MB');
  assertEqual(filteredSize?.children?.[0].name, 'backup_archive.zip', 'Matched backup_archive.zip');

  // Filter by extension
  const filteredExt = filterFsTree(treeToFilter, { extension: 'txt' });
  assertTrue(filteredExt !== null, 'filter extension found result');
  assertEqual(filteredExt?.children?.length, 1, 'Only 1 child with .txt extension');
  assertEqual(filteredExt?.children?.[0].name, 'notes.txt', 'Matched notes.txt');

  // Filter with no match
  const filteredNone = filterFsTree(treeToFilter, { query: 'nonexistent_file_pattern_999' });
  assertEqual(filteredNone, null, 'Unmatched filter returns null');

  console.log('All Disk Analyzer Unit & Multi-TB Scaling Tests Passed cleanly!');
}

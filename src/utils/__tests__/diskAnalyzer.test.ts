import {
  formatBytes,
  formatTabularBytes,
  isSystemProtectedPath,
  syncTreeAfterDeletion,
  filterFsTree,
} from '../diskAnalyzer.ts';
import type { FsTreeNode } from '../../types/diskAnalyzer.ts';

// Simple assertion helper for TypeScript unit tests
function assertEqual<T>(actual: T, expected: T, msg = '') {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg} (Expected ${expected}, got ${actual})`);
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
  console.log('Running Disk Analyzer Unit Tests...');

  // 1. formatBytes tests
  assertEqual(formatBytes(0), '0 B', 'formatBytes(0)');
  assertEqual(formatBytes(-50), '0 B', 'formatBytes negative');
  assertEqual(formatBytes(NaN), '0 B', 'formatBytes NaN');
  assertEqual(formatBytes(512), '512 B', 'formatBytes bytes');
  assertEqual(formatBytes(1024), '1.00 KB', 'formatBytes 1KB');
  assertEqual(formatBytes(1572864), '1.50 MB', 'formatBytes 1.5MB');
  assertEqual(formatBytes(5175492198), '4.82 GB', 'formatBytes 4.82GB');
  assertEqual(formatBytes(2308974418944), '2.10 TB', 'formatBytes 2.1TB');

  // 2. formatTabularBytes tests
  assertEqual(formatTabularBytes(0), '0 B', 'formatTabularBytes(0)');
  assertEqual(formatTabularBytes(1048576), '1,048,576 B', 'formatTabularBytes 1MB');

  // 3. isSystemProtectedPath tests
  assertTrue(isSystemProtectedPath('C:\\'), 'C:\\ is protected drive root');
  assertTrue(isSystemProtectedPath('D:\\'), 'D:\\ is protected drive root');
  assertTrue(isSystemProtectedPath('C:\\Windows'), 'C:\\Windows is protected');
  assertTrue(isSystemProtectedPath('C:\\Windows\\System32'), 'System32 is protected');
  assertTrue(isSystemProtectedPath('C:\\Boot'), 'Boot is protected');
  assertTrue(isSystemProtectedPath('C:\\$Recycle.Bin'), 'Recycle bin root is protected');
  assertTrue(isSystemProtectedPath('C:\\pagefile.sys'), 'pagefile.sys is protected');
  assertTrue(isSystemProtectedPath('C:\\Program Files\\Windows Defender'), 'Defender is protected');

  assertFalse(isSystemProtectedPath('C:\\Users\\TestUser\\Downloads'), 'Downloads is not protected');
  assertFalse(isSystemProtectedPath('D:\\Projects\\WiScripts_Windows'), 'Projects is not protected');

  // 4. syncTreeAfterDeletion tests
  const testTree: FsTreeNode = {
    id: 'root',
    name: 'Root',
    path: 'C:\\Test',
    sizeBytes: 100 * 1024 * 1024,
    fileCount: 2,
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
        sizeBytes: 60 * 1024 * 1024,
        fileCount: 1,
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
        sizeBytes: 40 * 1024 * 1024,
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

  const updated = syncTreeAfterDeletion(testTree, 'C:\\Test\\FolderB', 40 * 1024 * 1024, 1);
  assertEqual(updated.sizeBytes, 60 * 1024 * 1024, 'Root size subtracted');
  assertEqual(updated.children?.length, 1, 'FolderB removed');
  assertEqual(updated.children?.[0].name, 'FolderA', 'FolderA remaining');
  assertEqual(updated.children?.[0].percentageOfParent, 100, 'FolderA rescaled to 100%');

  // 5. filterFsTree tests
  const treeToFilter: FsTreeNode = {
    id: 'root',
    name: 'Root',
    path: 'C:\\Users\\TestUser',
    sizeBytes: 150 * 1024 * 1024,
    fileCount: 3,
    dirCount: 1,
    isDir: true,
    modifiedTimestamp: Date.now(),
    children: [
      {
        id: 'f1',
        name: 'report.docx',
        path: 'C:\\Users\\TestUser\\report.docx',
        sizeBytes: 10 * 1024 * 1024,
        fileCount: 1,
        dirCount: 0,
        isDir: false,
        extension: 'docx',
        modifiedTimestamp: Date.now(),
      },
      {
        id: 'f2',
        name: 'archive.zip',
        path: 'C:\\Users\\TestUser\\archive.zip',
        sizeBytes: 100 * 1024 * 1024,
        fileCount: 1,
        dirCount: 0,
        isDir: false,
        extension: 'zip',
        modifiedTimestamp: Date.now(),
      },
    ],
  };

  const filteredQuery = filterFsTree(treeToFilter, { query: 'report' });
  assertTrue(filteredQuery !== null, 'filter query found');
  assertEqual(filteredQuery?.children?.length, 1, 'Only 1 child matched query');
  assertEqual(filteredQuery?.children?.[0].name, 'report.docx', 'Matched report.docx');

  const filteredSize = filterFsTree(treeToFilter, { minBytes: 50 * 1024 * 1024 });
  assertTrue(filteredSize !== null, 'filter size found');
  assertEqual(filteredSize?.children?.length, 1, 'Only 1 child >= 50MB');
  assertEqual(filteredSize?.children?.[0].name, 'archive.zip', 'Matched archive.zip');

  console.log('All Disk Analyzer Unit Tests Passed!');
}

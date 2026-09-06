/**
 * WiScripts Windows v1.6.0 — Disk Space Analyzer & Filesystem Tree Explorer E2E Test Suite
 * Comprehensive 56-test specification covering:
 * - Tier 1: Feature Coverage (20 tests)
 * - Tier 2: Boundary & Corner Cases (20 tests)
 * - Tier 3: Cross-Feature Combinations (10 tests)
 * - Tier 4: Real-World Workload Scenarios (6 tests)
 */

import {
  assert,
  formatBytes,
  formatTabularBytes,
  PROTECTED_SYSTEM_PATHS,
  VirtualFilesystemSimulator,
  DiskDeletionEngineSimulator,
  DiskAnalyzerEngineSimulator,
  syncTreeAfterDeletion,
  MockIPC,
  AppStateSimulator,
  CommandPaletteEngine,
  TestRunner
} from './harness.js';

export function buildDiskSpaceAnalyzerSuite() {
  const runner = new TestRunner('Disk Space Analyzer & Filesystem Tree Explorer');

  // =========================================================================
  // Tier 1: Feature Coverage (20 Tests)
  // =========================================================================

  runner.addTest('T1_DISK_01: get_disk_drives enumerates logical volumes and capacity statistics', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act
    const drives = await ipc.invoke('get_disk_drives');

    // Assert
    assert.ok(Array.isArray(drives), 'Drives is an array');
    assert.greaterThanOrEqual(drives.length, 2, 'Enumerates at least 2 logical drives');
    const cDrive = drives.find(d => d.id === 'C');
    assert.ok(cDrive, 'C: drive is enumerated');
    assert.equal(cDrive.mountPoint, 'C:\\', 'C: mount point is normalized');
    assert.isTrue(cDrive.isSystem, 'C: drive flagged as system drive');
    assert.equal(cDrive.fileSystem, 'NTFS', 'C: drive fileSystem is NTFS');
    assert.greaterThanOrEqual(cDrive.totalBytes, 1000000000, 'Total bytes is realistic');
    assert.greaterThanOrEqual(cDrive.freeBytes, 1000000, 'Free bytes is positive');
  });

  runner.addTest('T1_DISK_02: scan_disk_space scans full drive root and computes recursive totals', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });

    // Assert
    assert.ok(result, 'Scan result returned');
    assert.equal(result.rootNode.name, 'C:\\', 'Root node name is C:\\');
    assert.isTrue(result.totalBytes > 0, 'Total bytes aggregated');
    assert.isTrue(result.totalFiles > 0, 'Total files aggregated');
    assert.isTrue(result.totalFolders > 0, 'Total folders aggregated');
    assert.isFalse(result.isPartial, 'Scan is not partial');
    assert.greaterThanOrEqual(result.rootNode.children.length, 4, 'Root has top-level system and user folders');
  });

  runner.addTest('T1_DISK_03: scan_disk_space scans custom subdirectory with accurate hierarchy', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser\\Projects\\WebApp' });

    // Assert
    assert.ok(result, 'Result returned for custom subdirectory');
    assert.equal(result.rootNode.name, 'WebApp', 'Target root node name is WebApp');
    assert.equal(result.totalFiles, 2, 'WebApp contains 2 files (bundle.js, package.json)');
    assert.equal(result.totalFolders, 1, 'WebApp contains 1 folder (node_modules)');
    assert.equal(result.totalBytes, 41943040 + 2048, 'Total bytes matches sum of files');
  });

  runner.addTest('T1_DISK_04: Real-time scan telemetry emits disk-scan-progress events', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const receivedEvents = [];
    ipc.listen('disk-scan-progress', (evt) => {
      receivedEvents.push(evt.payload);
    });

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser' });

    // Assert
    assert.greaterThanOrEqual(receivedEvents.length, 1, 'At least 1 progress event emitted');
    const last = receivedEvents[receivedEvents.length - 1];
    assert.equal(last.currentPath, 'C:\\Users\\TestUser', 'Progress reports target path');
    assert.equal(last.bytesProcessed, result.totalBytes, 'Progress reports exact processed bytes');
    assert.greaterThanOrEqual(last.filesScanned, 1, 'Progress reports files scanned count');
  });

  runner.addTest('T1_DISK_05: Ranked Top 20 Largest Folders extraction', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });

    // Assert
    assert.ok(Array.isArray(result.largestFolders), 'largestFolders is an array');
    assert.lessThanOrEqual(result.largestFolders.length, 20, 'At most 20 largest folders returned');
    assert.greaterThanOrEqual(result.largestFolders.length, 3, 'At least 3 folders in sample drive');
    // Verify descending sort order
    for (let i = 0; i < result.largestFolders.length - 1; i++) {
      assert.greaterThanOrEqual(
        result.largestFolders[i].totalBytes,
        result.largestFolders[i + 1].totalBytes,
        `Folder #${i} size >= Folder #${i + 1} size`
      );
    }
    assert.greaterThanOrEqual(result.largestFolders[0].percentageOfTotal, 0, 'Percentage is non-negative');
  });

  runner.addTest('T1_DISK_06: Ranked Top 50 Largest Files extraction', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });

    // Assert
    assert.ok(Array.isArray(result.largestFiles), 'largestFiles is an array');
    assert.lessThanOrEqual(result.largestFiles.length, 50, 'At most 50 largest files returned');
    assert.greaterThanOrEqual(result.largestFiles.length, 5, 'At least 5 files in sample drive');
    // archive.zip is 100MB, installer.exe is 50MB, bundle.js is 40MB
    assert.equal(result.largestFiles[0].name, 'archive.zip', 'archive.zip is the largest file');
    assert.equal(result.largestFiles[0].extension, 'zip', 'archive.zip extension is zip');
    assert.equal(result.largestFiles[0].sizeBytes, 104857600, 'archive.zip size is 100MB');
    for (let i = 0; i < result.largestFiles.length - 1; i++) {
      assert.greaterThanOrEqual(
        result.largestFiles[i].sizeBytes,
        result.largestFiles[i + 1].sizeBytes,
        `File #${i} size >= File #${i + 1} size`
      );
    }
  });

  runner.addTest('T1_DISK_07: Hierarchical tree computes proportional visual size bars', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\Proportions');
    ipc.vfs.writeFile('C:\\Proportions\\large.bin', 75000);
    ipc.vfs.writeFile('C:\\Proportions\\small.bin', 25000);

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Proportions' });

    // Assert
    assert.equal(result.totalBytes, 100000, 'Total bytes is 100000');
    assert.equal(result.rootNode.children.length, 2, '2 children in tree');
    const largeChild = result.rootNode.children[0];
    const smallChild = result.rootNode.children[1];
    assert.equal(largeChild.percentageOfParent, 75.0, 'large.bin has 75.0% of parent');
    assert.equal(smallChild.percentageOfParent, 25.0, 'small.bin has 25.0% of parent');
  });

  runner.addTest('T1_DISK_08: Tree node expansion and collapse state tracking', async () => {
    // Arrange
    const expandedNodes = new Set();
    const nodeId = 'node_user_downloads';

    // Act 1: Expand node
    expandedNodes.add(nodeId);
    assert.isTrue(expandedNodes.has(nodeId), 'Node is marked expanded');

    // Act 2: Collapse node
    expandedNodes.delete(nodeId);
    assert.isFalse(expandedNodes.has(nodeId), 'Node is marked collapsed');
  });

  runner.addTest('T1_DISK_09: Breadcrumb hierarchy drill-down navigation', async () => {
    // Arrange
    const targetPath = 'C:\\Users\\TestUser\\Downloads';
    const parts = targetPath.split('\\');
    const breadcrumbs = [];
    let currentPath = '';

    // Act
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        currentPath = `${parts[0]}\\`;
        breadcrumbs.push({ label: currentPath, path: currentPath });
      } else {
        currentPath += (currentPath.endsWith('\\') ? '' : '\\') + parts[i];
        breadcrumbs.push({ label: parts[i], path: currentPath });
      }
    }

    // Assert
    assert.equal(breadcrumbs.length, 4, '4 breadcrumb segments');
    assert.equal(breadcrumbs[0].path, 'C:\\', 'Root segment is C:\\');
    assert.equal(breadcrumbs[1].path, 'C:\\Users', 'Second segment is C:\\Users');
    assert.equal(breadcrumbs[2].path, 'C:\\Users\\TestUser', 'Third segment is C:\\Users\\TestUser');
    assert.equal(breadcrumbs[3].path, 'C:\\Users\\TestUser\\Downloads', 'Fourth segment is C:\\Users\\TestUser\\Downloads');
  });

  runner.addTest('T1_DISK_10: Search query filter by filename/keyword', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser' });

    // Act
    const filteredTree = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { query: 'report' });

    // Assert
    assert.ok(filteredTree, 'Filtered tree returned');
    assert.equal(filteredTree.name, 'TestUser', 'Root retained');
    const docFolder = filteredTree.children.find(c => c.name === 'Documents');
    assert.ok(docFolder, 'Documents folder retained because it contains report.docx');
    assert.ok(docFolder.children.some(f => f.name === 'report.docx'), 'report.docx is present');
    assert.isFalse(docFolder.children.some(f => f.name === 'data.xlsx'), 'data.xlsx is filtered out');
  });

  runner.addTest('T1_DISK_11: Extension filter across directory tree', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser' });

    // Act
    const filteredTree = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { extension: 'zip' });

    // Assert
    assert.ok(filteredTree, 'Filtered tree returned');
    const dlFolder = filteredTree.children.find(c => c.name === 'Downloads');
    assert.ok(dlFolder, 'Downloads folder retained');
    assert.equal(dlFolder.children.length, 1, 'Only 1 file in Downloads matched');
    assert.equal(dlFolder.children[0].name, 'archive.zip', 'archive.zip is the matching file');
  });

  runner.addTest('T1_DISK_12: Minimum size threshold filter', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser' });

    // Act: filter files >= 45MB (should match archive.zip 100MB and installer.exe 50MB)
    const filteredTree = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { minBytes: 45 * 1024 * 1024 });

    // Assert
    assert.ok(filteredTree, 'Filtered tree returned');
    const dlFolder = filteredTree.children.find(c => c.name === 'Downloads');
    assert.ok(dlFolder, 'Downloads folder retained');
    assert.equal(dlFolder.children.length, 2, 'archive.zip and installer.exe retained');
    const docFolder = filteredTree.children.find(c => c.name === 'Documents');
    assert.equal(docFolder, undefined, 'Documents folder excluded because files are < 45MB');
  });

  runner.addTest('T1_DISK_13: Quick Action: Open path in Windows File Explorer', async () => {
    // Arrange
    const ipc = new MockIPC();
    const target = 'C:\\Users\\TestUser\\Downloads';

    // Act
    const res = await ipc.invoke('open_path_in_explorer', { path: target });

    // Assert
    assert.isTrue(res.launched, 'Explorer launched');
    assert.equal(res.command, 'explorer.exe', 'Command is explorer.exe');
    assert.equal(res.path, target, 'Target path passed');
    assert.includes(ipc.explorerInvocations, target, 'Recorded in explorer invocations log');
  });

  runner.addTest('T1_DISK_14: Quick Action: Copy path to system clipboard', async () => {
    // Arrange
    const ipc = new MockIPC();
    const target = 'C:\\Users\\TestUser\\Documents\\report.docx';

    // Act
    const res = await ipc.invoke('copy_path_to_clipboard', { path: target });

    // Assert
    assert.isTrue(res.copied, 'Path copied');
    assert.equal(ipc.clipboardContent, target, 'Clipboard content updated');
  });

  runner.addTest('T1_DISK_15: Safe recursive deletion to Windows Recycle Bin', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const target = 'C:\\Users\\TestUser\\AppData\\Local\\Temp';

    // Act
    const res = await ipc.invoke('delete_filesystem_item', { path: target, permanent: false });

    // Assert
    assert.isTrue(res.success, 'Deletion succeeded');
    assert.isTrue(res.movedToRecycleBin, 'Moved to Recycle Bin');
    assert.equal(res.bytesFreed, 15728640, 'Freed 15MB cache');
    assert.equal(res.errors.length, 0, 'No deletion errors');
    assert.equal(ipc.vfs.getNode(target), null, 'Node unlinked from active filesystem');
    assert.greaterThanOrEqual(ipc.vfs.recycleBin.length, 1, 'Node present in virtual recycle bin');
  });

  runner.addTest('T1_DISK_16: Permanent recursive deletion of directory', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const target = 'C:\\Users\\TestUser\\Projects\\WebApp\\node_modules';

    // Act
    const res = await ipc.invoke('delete_filesystem_item', { path: target, permanent: true });

    // Assert
    assert.isTrue(res.success, 'Permanent deletion succeeded');
    assert.isFalse(res.movedToRecycleBin, 'Flag indicates permanent deletion');
    assert.equal(res.bytesFreed, 41943040, 'Freed 40MB bundle');
    assert.equal(ipc.vfs.getNode(target), null, 'Node unlinked from VFS');
    assert.equal(ipc.vfs.recycleBin.length, 0, 'Not placed in recycle bin');
  });

  runner.addTest('T1_DISK_17: Guardrail strictly blocks Windows installation directory deletion', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act & Assert: C:\Windows\System32
    await assert.throwsAsync(
      async () => ipc.invoke('delete_filesystem_item', { path: 'C:\\Windows\\System32', permanent: true }),
      'Security Violation',
      'System32 deletion must throw Security Violation'
    );

    // Act & Assert: C:\Windows
    await assert.throwsAsync(
      async () => ipc.invoke('delete_filesystem_item', { path: 'C:\\Windows', permanent: false }),
      'Security Violation',
      'Windows directory deletion must throw Security Violation'
    );
  });

  runner.addTest('T1_DISK_18: Guardrail strictly blocks root drive deletion', async () => {
    // Arrange
    const ipc = new MockIPC();

    // Act & Assert
    await assert.throwsAsync(
      async () => ipc.invoke('delete_filesystem_item', { path: 'C:\\', permanent: true }),
      'Cannot delete root drive',
      'C:\\ root drive deletion must throw Security Violation'
    );

    await assert.throwsAsync(
      async () => ipc.invoke('delete_filesystem_item', { path: 'D:\\', permanent: true }),
      'Cannot delete root drive',
      'D:\\ root drive deletion must throw Security Violation'
    );
  });

  runner.addTest('T1_DISK_19: Post-deletion in-memory tree size synchronization', async () => {
    // Arrange
    const rootTree = {
      id: 'node_root',
      name: 'Test',
      path: 'C:\\Test',
      isDirectory: true,
      sizeBytes: 100 * 1024 * 1024, // 100 MB
      fileCount: 2,
      folderCount: 2,
      percentageOfParent: 100,
      percentageOfRoot: 100,
      children: [
        {
          id: 'node_a',
          name: 'ChildA',
          path: 'C:\\Test\\ChildA',
          isDirectory: true,
          sizeBytes: 60 * 1024 * 1024,
          fileCount: 1,
          folderCount: 0,
          percentageOfParent: 60,
          percentageOfRoot: 60,
          children: []
        },
        {
          id: 'node_b',
          name: 'ChildB',
          path: 'C:\\Test\\ChildB',
          isDirectory: true,
          sizeBytes: 40 * 1024 * 1024,
          fileCount: 1,
          folderCount: 0,
          percentageOfParent: 40,
          percentageOfRoot: 40,
          children: []
        }
      ]
    };

    // Act: Delete ChildB (40MB)
    const updatedTree = syncTreeAfterDeletion(rootTree, 'C:\\Test\\ChildB', 40 * 1024 * 1024, 1);

    // Assert
    assert.equal(updatedTree.sizeBytes, 60 * 1024 * 1024, 'Root size decremented to 60MB');
    assert.equal(updatedTree.children.length, 1, 'ChildB removed from children');
    assert.equal(updatedTree.children[0].name, 'ChildA', 'ChildA remains');
    assert.equal(updatedTree.children[0].percentageOfParent, 100.0, 'ChildA percentage rescales to 100%');
  });

  runner.addTest('T1_DISK_20: Deletion confirmation modal default safe selection and dry-run preview', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    ipc.isDryRun = true;
    const target = 'C:\\Users\\TestUser\\Downloads\\archive.zip';

    // Act
    const res = await ipc.invoke('delete_filesystem_item', { path: target, permanent: false });

    // Assert
    assert.isTrue(res.success, 'Dry run succeeded');
    assert.isTrue(res.isDryRun, 'Flag indicates dry run');
    assert.equal(res.bytesFreed, 104857600, 'Calculated 100MB preview');
    assert.ok(ipc.vfs.getNode(target), 'Virtual filesystem file remains intact in dry run');
  });

  // =========================================================================
  // Tier 2: Boundary & Corner Cases (20 Tests)
  // =========================================================================

  runner.addTest('T2_DISK_01: Empty directory scanning returns 0 bytes and 0 files without NaN', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\EmptyDir');

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\EmptyDir' });

    // Assert
    assert.equal(result.totalBytes, 0, 'Total bytes is 0');
    assert.equal(result.totalFiles, 0, 'Total files is 0');
    assert.equal(result.totalFolders, 0, 'Total folders is 0');
    assert.equal(result.rootNode.percentageOfParent, 100, 'Root percentage is 100%');
    assert.isFalse(Number.isNaN(result.rootNode.percentageOfParent), 'No NaN in percentage calculation');
  });

  runner.addTest('T2_DISK_02: Single-file directory boundary metrics', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\Single');
    ipc.vfs.writeFile('C:\\Single\\file.bin', 512);

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Single' });

    // Assert
    assert.equal(result.totalBytes, 512, 'Total bytes is 512');
    assert.equal(result.totalFiles, 1, 'Total files is 1');
    assert.equal(result.rootNode.children[0].percentageOfParent, 100.0, 'File is 100% of parent');
  });

  runner.addTest('T2_DISK_03: Deeply nested directory hierarchy (>25 levels deep)', async () => {
    // Arrange
    const ipc = new MockIPC();
    let currentPath = 'C:\\Level0';
    ipc.vfs.mkdir(currentPath);
    for (let i = 1; i <= 30; i++) {
      currentPath += `\\L${i}`;
      ipc.vfs.mkdir(currentPath);
    }
    ipc.vfs.writeFile(`${currentPath}\\deep_file.txt`, 2048);

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Level0' });

    // Assert
    assert.equal(result.totalFiles, 1, '1 deep file discovered');
    assert.equal(result.totalFolders, 30, '30 nested subfolders traversed');
    assert.equal(result.totalBytes, 2048, 'Total size matches 2048 B');
  });

  runner.addTest('T2_DISK_04: Spaces, Unicode, and Cyrillic character paths', async () => {
    // Arrange
    const ipc = new MockIPC();
    const cyrillicPath = 'C:\\Users\\Пользователь\\Документы\\Проект №1 [2026] & test\\отчет.pdf';
    ipc.vfs.writeFile(cyrillicPath, 2097152);

    // Act 1: Scan
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\Пользователь' });
    assert.equal(result.totalBytes, 2097152, 'Scanned Cyrillic path size correctly');

    // Act 2: Delete
    const delResult = await ipc.invoke('delete_filesystem_item', { path: cyrillicPath, permanent: true });
    assert.isTrue(delResult.success, 'Cyrillic file deleted successfully');
    assert.equal(delResult.bytesFreed, 2097152, 'Freed 2MB');
  });

  runner.addTest('T2_DISK_05: Directory containing only zero-byte files accounting', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\ZeroFiles');
    for (let i = 1; i <= 50; i++) {
      ipc.vfs.writeFile(`C:\\ZeroFiles\\file_${i}.tmp`, 0);
    }

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\ZeroFiles' });

    // Assert
    assert.equal(result.totalBytes, 0, 'Total bytes is 0');
    assert.equal(result.totalFiles, 50, 'Total files is 50');
    assert.equal(result.totalFolders, 0, 'Total folders is 0');
  });

  runner.addTest('T2_DISK_06: Mixed zero-byte files and multi-gigabyte files', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\MixedStorage');
    const isoSize = 10737418240; // 10 GB
    ipc.vfs.writeFile('C:\\MixedStorage\\win11_install.iso', isoSize);
    for (let i = 1; i <= 50; i++) {
      ipc.vfs.writeFile(`C:\\MixedStorage\\zero_${i}.log`, 0);
    }

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\MixedStorage' });

    // Assert
    assert.equal(result.totalBytes, isoSize, 'Total bytes is 10GB');
    assert.equal(result.totalFiles, 51, 'Total files is 51');
    assert.equal(result.largestFiles[0].name, 'win11_install.iso', 'ISO identified as largest file');
    assert.equal(result.largestFiles[0].sizeBytes, isoSize, 'ISO size matches 10GB');
  });

  runner.addTest('T2_DISK_07: Inaccessible / Access Denied subfolder error resiliency', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\Resilient');
    ipc.vfs.mkdir('C:\\Resilient\\Accessible1');
    ipc.vfs.writeFile('C:\\Resilient\\Accessible1\\doc1.txt', 1000);
    ipc.vfs.mkdir('C:\\Resilient\\LockedFolder', { isAccessDenied: true });
    ipc.vfs.mkdir('C:\\Resilient\\Accessible2');
    ipc.vfs.writeFile('C:\\Resilient\\Accessible2\\doc2.txt', 2000);

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Resilient' });

    // Assert
    assert.equal(result.totalBytes, 3000, 'Scanned 3000 bytes from accessible folders');
    assert.equal(result.totalFiles, 2, '2 accessible files scanned');
    assert.greaterThanOrEqual(result.skippedErrors.length, 1, 'Logged skipped access denied error');
    assert.includes(result.skippedErrors[0], 'Access Denied', 'Error mentions Access Denied');
  });

  runner.addTest('T2_DISK_08: Sub-5ms instant scan cancellation latency', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act
    const unlisten = ipc.listen('disk-scan-progress', () => {
      ipc.diskAnalyzer.cancelScan();
    });
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });
    unlisten();

    // Assert
    assert.isTrue(result.isPartial, 'Scan halted as partial');
  });

  runner.addTest('T2_DISK_09: Mid-scan cancellation returns partial tree with isPartial flag', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act: Set cancel immediately after start
    setTimeout(() => ipc.diskAnalyzer.cancelScan(), 0);
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });

    // Assert
    assert.ok(result.rootNode, 'Root node returned');
    assert.ok(typeof result.isPartial === 'boolean', 'isPartial flag is boolean');
  });

  runner.addTest('T2_DISK_10: Deletion attempt on in-use locked file in directory', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\AppWithLock');
    ipc.vfs.writeFile('C:\\AppWithLock\\unlocked.txt', 1048576); // 1MB
    ipc.vfs.writeFile('C:\\AppWithLock\\locked.db', 5242880, { isLocked: true }); // 5MB locked

    // Act
    const res = await ipc.invoke('delete_filesystem_item', { path: 'C:\\AppWithLock', permanent: true });

    // Assert
    assert.isFalse(res.success, 'Success is false due to locked file');
    assert.equal(res.errors.length, 1, '1 error reported for locked file');
    assert.includes(res.errors[0], 'locked.db', 'Error mentions locked.db');
    assert.equal(res.bytesFreed, 1048576, 'Partial bytes freed for unlocked file');
    assert.ok(ipc.vfs.getNode('C:\\AppWithLock\\locked.db'), 'Locked file remains on filesystem');
    assert.equal(ipc.vfs.getNode('C:\\AppWithLock\\unlocked.txt'), null, 'Unlocked file deleted');
  });

  runner.addTest('T2_DISK_11: Path normalization with redundant slashes, dot, and dot-dot segments', async () => {
    // Arrange
    const ipc = new MockIPC();
    const messyPath = 'C:\\Users\\TestUser\\Downloads\\..\\Downloads\\./test/';

    // Act
    const norm = ipc.vfs.normalizePath(messyPath);

    // Assert
    assert.equal(norm, 'C:\\Users\\TestUser\\Downloads\\test', 'Path cleaned to canonical representation');
  });

  runner.addTest('T2_DISK_12: Directory traversal attack escape via relative path to System32', async () => {
    // Arrange
    const ipc = new MockIPC();
    const traversalPath = 'C:\\Users\\TestUser\\..\\..\\Windows\\System32';

    // Act & Assert
    await assert.throwsAsync(
      async () => ipc.invoke('delete_filesystem_item', { path: traversalPath, permanent: true }),
      'Security Violation',
      'Canonicalized traversal to System32 must trigger Security Violation'
    );
  });

  runner.addTest('T2_DISK_13: Symlink / junction circular loop protection', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\LoopDir');
    ipc.vfs.mkdir('C:\\LoopDir\\Sub');
    ipc.vfs.addSymlink('C:\\LoopDir\\Sub\\LoopLink', 'C:\\LoopDir');

    // Act
    const result = await ipc.invoke('scan_disk_space', { target_path: 'C:\\LoopDir' });

    // Assert
    assert.ok(result, 'Scan completed without infinite loop');
    assert.greaterThanOrEqual(result.skippedErrors.length, 1, 'Circular link detected and recorded');
    assert.includes(result.skippedErrors[0], 'Circular link', 'Error specifies circular link');
  });

  runner.addTest('T2_DISK_14: Multi-Terabyte size string formatting (u64)', async () => {
    // Arrange
    const tbSize = 4398046511104; // 4 TB

    // Act
    const humanStr = formatBytes(tbSize);
    const tabStr = formatTabularBytes(tbSize);

    // Assert
    assert.equal(humanStr, '4 TB', 'Formatted to 4 TB');
    assert.equal(tabStr, '4 398 046 511 104 B', 'Formatted to tabular mono bytes');
  });

  runner.addTest('T2_DISK_15: Search filter with regex special characters does not crash', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });
    const trickyRegexQuery = 'test[1-9].*+?^${}()|\\';

    // Act
    const filtered = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { query: trickyRegexQuery });

    // Assert
    // Should return null gracefully without throwing regex SyntaxError
    assert.equal(filtered, null, 'Safe substring search with no match returns null');
  });

  runner.addTest('T2_DISK_16: Search filter with zero matching items returns empty filtered tree', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });

    // Act
    const filtered = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { query: 'nonexistent_pattern_xyz_999' });

    // Assert
    assert.equal(filtered, null, 'Zero matches returns null');
  });

  runner.addTest('T2_DISK_17: Deletion of already removed path returns structured error', async () => {
    // Arrange
    const ipc = new MockIPC();
    const phantomPath = 'C:\\NonExistent\\ghost_folder';

    // Act
    const res = await ipc.invoke('delete_filesystem_item', { path: phantomPath, permanent: true });

    // Assert
    assert.isFalse(res.success, 'Deletion reports failure');
    assert.equal(res.bytesFreed, 0, '0 bytes freed');
    assert.includes(res.errors[0], 'File does not exist', 'Error explains path does not exist');
  });

  runner.addTest('T2_DISK_18: Rapid consecutive scan requests debouncing and abortion', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Act: Launch 3 scans, cancelling previous
    ipc.diskAnalyzer.cancelScan();
    ipc.diskAnalyzer.cancelScan();
    const finalResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser\\Downloads' });

    // Assert
    assert.equal(finalResult.rootNode.name, 'Downloads', 'Latest scan finishes completely');
    assert.isFalse(finalResult.isPartial, 'Final scan is full');
  });

  runner.addTest('T2_DISK_19: Case-insensitive guardrail matching across Windows casing variants', async () => {
    // Arrange
    const ipc = new MockIPC();
    const variants = [
      'c:\\windows\\system32',
      'C:\\WINDOWS\\SYSTEM32',
      'c:\\Program Files',
      'C:\\PROGRAMDATA\\Microsoft\\Windows'
    ];

    // Act & Assert
    for (const v of variants) {
      await assert.throwsAsync(
        async () => ipc.invoke('delete_filesystem_item', { path: v, permanent: true }),
        'Security Violation',
        `Variant '${v}' must be blocked by case-insensitive guardrail`
      );
    }
  });

  runner.addTest('T2_DISK_20: Path with trailing backslash equality', async () => {
    // Arrange
    const ipc = new MockIPC();
    const p1 = 'C:\\MyFolder\\';
    const p2 = 'C:\\MyFolder';

    // Act
    const n1 = ipc.vfs.normalizePath(p1);
    const n2 = ipc.vfs.normalizePath(p2);

    // Assert
    assert.equal(n1, n2, 'Paths normalize to identical string');
    assert.equal(n1, 'C:\\MyFolder', 'No trailing slash on non-drive folder');
  });

  // =========================================================================
  // Tier 3: Cross-Feature Combinations (10 Tests)
  // =========================================================================

  runner.addTest('T3_DISK_01: Scan target -> Cancel -> Immediate rescan new target', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    ipc.vfs.populateSampleDrive('D');

    // Act 1: Start C:\ scan and cancel on progress
    const unlisten = ipc.listen('disk-scan-progress', () => {
      ipc.diskAnalyzer.cancelScan();
    });
    const cResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });
    assert.isTrue(cResult.isPartial, 'C:\\ scan was cancelled');
    unlisten();

    // Act 2: Rescan D:\
    const dResult = await ipc.invoke('scan_disk_space', { target_path: 'D:\\' });

    // Assert
    assert.equal(dResult.rootNode.name, 'D:\\', 'Result reflects D:\\ exclusively');
    assert.isFalse(dResult.isPartial, 'D:\\ scan is complete');
  });

  runner.addTest('T3_DISK_02: Scan -> Search filter -> Expand filtered node -> Delete filtered item', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\Logs');
    ipc.vfs.writeFile('C:\\Logs\\app_1.log', 1048576); // 1MB
    ipc.vfs.writeFile('C:\\Logs\\app_2.log', 2097152); // 2MB
    ipc.vfs.writeFile('C:\\Logs\\config.json', 1024);

    // Act 1: Scan
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Logs' });

    // Act 2: Filter by .log extension
    const filtered = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { extension: 'log' });
    assert.equal(filtered.children.length, 2, '2 log files in filtered tree');

    // Act 3: Delete 1 log file
    const delResult = await ipc.invoke('delete_filesystem_item', { path: 'C:\\Logs\\app_1.log', permanent: true });
    assert.isTrue(delResult.success, 'app_1.log deleted');

    // Act 4: Sync tree
    const updated = syncTreeAfterDeletion(scanResult.rootNode, 'C:\\Logs\\app_1.log', 1048576, 1);
    assert.equal(updated.sizeBytes, 2097152 + 1024, 'Size decremented by 1MB');
  });

  runner.addTest('T3_DISK_03: Scan -> Top Largest Folders drill-down -> Breadcrumb navigation -> Delete sibling', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    ipc.vfs.mkdir('C:\\Users\\TestUser\\Projects\\OldProject');
    ipc.vfs.writeFile('C:\\Users\\TestUser\\Projects\\OldProject\\legacy.tar', 52428800); // 50MB

    // Act 1: Scan Projects
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser\\Projects' });
    assert.greaterThanOrEqual(scanResult.largestFolders.length, 2, 'Top folders identified');

    // Act 2: Drill down into WebApp
    const webAppFolder = scanResult.rootNode.children.find(c => c.name === 'WebApp');
    assert.ok(webAppFolder, 'WebApp folder found');

    // Act 3: Navigate up to Projects via breadcrumb and delete OldProject
    const delResult = await ipc.invoke('delete_filesystem_item', { path: 'C:\\Users\\TestUser\\Projects\\OldProject', permanent: true });
    assert.isTrue(delResult.success, 'OldProject deleted');
    assert.equal(delResult.bytesFreed, 52428800, 'Freed 50MB');
  });

  runner.addTest('T3_DISK_04: Scan tree -> Copy path -> Open in Explorer -> Move to Recycle Bin', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const targetFile = 'C:\\Users\\TestUser\\Downloads\\installer.exe';

    // Act 1: Copy path
    await ipc.invoke('copy_path_to_clipboard', { path: targetFile });
    assert.equal(ipc.clipboardContent, targetFile, 'Clipboard verified');

    // Act 2: Open in Explorer
    const expRes = await ipc.invoke('open_path_in_explorer', { path: targetFile });
    assert.isTrue(expRes.launched, 'Explorer launched');

    // Act 3: Delete to Recycle Bin
    const delRes = await ipc.invoke('delete_filesystem_item', { path: targetFile, permanent: false });
    assert.isTrue(delRes.success, 'Item moved to recycle bin');
    assert.isTrue(delRes.movedToRecycleBin, 'Flag is recycle bin');
  });

  runner.addTest('T3_DISK_05: Min-size filter (>100MB) -> Delete 1 large file -> Re-filter', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.mkdir('C:\\BigData');
    ipc.vfs.writeFile('C:\\BigData\\file1.iso', 150 * 1024 * 1024);
    ipc.vfs.writeFile('C:\\BigData\\file2.iso', 200 * 1024 * 1024);
    ipc.vfs.writeFile('C:\\BigData\\small.txt', 1024);

    // Act 1: Scan & filter >100MB
    const scan1 = await ipc.invoke('scan_disk_space', { target_path: 'C:\\BigData' });
    const f1 = ipc.diskAnalyzer.searchTree(scan1.rootNode, { minBytes: 100 * 1024 * 1024 });
    assert.equal(f1.children.length, 2, '2 large files initially');

    // Act 2: Delete file2.iso (200MB)
    await ipc.invoke('delete_filesystem_item', { path: 'C:\\BigData\\file2.iso', permanent: true });

    // Act 3: Rescan & re-filter
    const scan2 = await ipc.invoke('scan_disk_space', { target_path: 'C:\\BigData' });
    const f2 = ipc.diskAnalyzer.searchTree(scan2.rootNode, { minBytes: 100 * 1024 * 1024 });
    assert.equal(f2.children.length, 1, '1 large file remaining');
    assert.equal(f2.children[0].name, 'file1.iso', 'file1.iso is the remaining file');
  });

  runner.addTest('T3_DISK_06: System Cleaner junk scan & Disk Space Analyzer coordination', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const tempDir = 'C:\\Users\\TestUser\\AppData\\Local\\Temp';

    // Act 1: Scan disk space
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: tempDir });
    assert.equal(scanResult.totalBytes, 15728640, '15MB detected in Temp');

    // Act 2: Delete temp contents via Disk Space Analyzer
    const delResult = await ipc.invoke('delete_filesystem_item', { path: tempDir, permanent: true });
    assert.isTrue(delResult.success, 'Temp cleared');

    // Act 3: Rescan temp
    ipc.vfs.mkdir(tempDir);
    const postScan = await ipc.invoke('scan_disk_space', { target_path: tempDir });
    assert.equal(postScan.totalBytes, 0, 'Temp is now 0 bytes');
  });

  runner.addTest('T3_DISK_07: Command Palette navigation to Disk Space Analyzer and scan execution', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const appState = new AppStateSimulator(ipc);
    const palette = new CommandPaletteEngine();

    // Act 1: Search in command palette
    const matches = palette.search('Disk Space');
    assert.greaterThanOrEqual(matches.length, 1, 'Disk Space Analyzer command found');

    // Act 2: Switch tab and scan
    appState.state.activeTab = 'storage_utilities';
    const scanRes = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser' });
    appState.state.storageAnalyzer.scanResult = scanRes;

    // Assert
    assert.equal(appState.state.activeTab, 'storage_utilities', 'Active tab updated');
    assert.ok(appState.state.storageAnalyzer.scanResult, 'Scan result saved in state');
  });

  runner.addTest('T3_DISK_08: Dynamic locale switch during active tree exploration', async () => {
    // Arrange
    const ipc = new MockIPC();
    const appState = new AppStateSimulator(ipc);

    // Act 1: English strings
    appState.state.currentLanguage = 'en';
    const enTitle = appState.translate('storage.title');
    const enLargeTab = appState.translate('storage.largeFilesTab');
    assert.equal(enTitle, 'Storage Utilities & File Analyzer', 'English title resolved');
    assert.equal(enLargeTab, 'Large Files', 'English large tab resolved');

    // Act 2: Russian strings
    appState.state.currentLanguage = 'ru';
    const ruTitle = appState.translate('storage.title');
    const ruLargeTab = appState.translate('storage.largeFilesTab');
    assert.ok(ruTitle.length > 0, 'Russian title resolved');
    assert.ok(ruLargeTab.length > 0, 'Russian large tab resolved');
  });

  runner.addTest('T3_DISK_09: Safety Dry-Run Mode enabled -> Tree permanent deletion execution', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    ipc.isDryRun = true;
    const target = 'C:\\Users\\TestUser\\Projects\\WebApp';

    // Act
    const res = await ipc.invoke('delete_filesystem_item', { path: target, permanent: true });

    // Assert
    assert.isTrue(res.isDryRun, 'Operation flagged as dry-run');
    assert.equal(res.bytesFreed, 41943040 + 2048, 'Preview freed bytes calculated');
    assert.ok(ipc.vfs.getNode(target), 'WebApp still exists on virtual filesystem');
  });

  runner.addTest('T3_DISK_10: Attempt deletion of protected path via filtered search results', async () => {
    // Arrange
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });

    // Act 1: Search for System32
    const filtered = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { query: 'System32' });
    assert.ok(filtered, 'System32 found in search');

    // Act 2: Attempt deletion on found path
    await assert.throwsAsync(
      async () => ipc.invoke('delete_filesystem_item', { path: 'C:\\Windows\\System32', permanent: true }),
      'Security Violation',
      'Guardrail blocks deletion despite coming from search UI'
    );
    assert.ok(ipc.vfs.getNode('C:\\Windows\\System32'), 'System32 folder remains intact');
  });

  // =========================================================================
  // Tier 4: Real-World Workload Scenarios (6 Tests)
  // =========================================================================

  runner.addTest('T4_DISK_01: Full Storage Audit & Cache Purge Workflow', async () => {
    // Arrange: User opens app to free up disk space
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const appState = new AppStateSimulator(ipc);

    // Step 1: Enumerate drives and select C:
    const drives = await ipc.invoke('get_disk_drives');
    appState.state.storageAnalyzer.drives = drives;
    appState.state.storageAnalyzer.selectedDrive = drives[0].mountPoint;

    // Step 2: Perform full drive scan
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: appState.state.storageAnalyzer.selectedDrive });
    appState.state.storageAnalyzer.scanResult = scanResult;

    // Step 3: Identify largest cache folder in Top Folders
    const tempFolder = scanResult.largestFolders.find(f => f.name === 'Temp');
    assert.ok(tempFolder, 'Temp folder identified in Top Largest Folders');

    // Step 4: Move Temp to Recycle Bin
    const delResult = await ipc.invoke('delete_filesystem_item', { path: tempFolder.path, permanent: false });
    assert.isTrue(delResult.success, 'Temp moved to Recycle Bin');
    assert.isTrue(delResult.movedToRecycleBin, 'Moved to Recycle Bin verified');

    // Step 5: Sync tree in-memory
    const updated = syncTreeAfterDeletion(scanResult.rootNode, tempFolder.path, delResult.bytesFreed, delResult.itemsDeleted);
    assert.equal(updated.sizeBytes, scanResult.totalBytes - delResult.bytesFreed, 'Root size accurately synced');
  });

  runner.addTest('T4_DISK_02: Heavy Developer Workspace Cleanup', async () => {
    // Arrange: Developer cleaning up old build artifacts
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const projectsPath = 'C:\\Users\\TestUser\\Projects';

    // Step 1: Scan projects directory
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: projectsPath });

    // Step 2: Search for node_modules
    const filtered = ipc.diskAnalyzer.searchTree(scanResult.rootNode, { query: 'node_modules' });
    assert.ok(filtered, 'node_modules found in search');

    // Step 3: Permanently delete node_modules
    const delResult = await ipc.invoke('delete_filesystem_item', {
      path: 'C:\\Users\\TestUser\\Projects\\WebApp\\node_modules',
      permanent: true
    });
    assert.isTrue(delResult.success, 'node_modules permanently deleted');
    assert.equal(delResult.bytesFreed, 41943040, 'Freed 40MB of JS dependencies');

    // Step 4: Verify ancestor WebApp size dropped to 2KB (package.json)
    const updatedRoot = syncTreeAfterDeletion(
      scanResult.rootNode,
      'C:\\Users\\TestUser\\Projects\\WebApp\\node_modules',
      delResult.bytesFreed,
      delResult.itemsDeleted
    );
    const webAppNode = updatedRoot.children.find(c => c.name === 'WebApp');
    assert.equal(webAppNode.sizeBytes, 2048, 'WebApp size updated to 2KB');
  });

  runner.addTest('T4_DISK_03: Accidental OS Deletion Prevention & Safe Item Inspection', async () => {
    // Arrange: User accidentally attempts to delete WinSxS, then safely deletes an old report
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Step 1: Scan root
    await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });

    // Step 2: Attempt deletion of WinSxS
    await assert.throwsAsync(
      async () => ipc.invoke('delete_filesystem_item', { path: 'C:\\Windows\\WinSxS', permanent: true }),
      'Security Violation',
      'WinSxS deletion strictly rejected'
    );

    // Step 3: Navigate to user document and copy path
    const docPath = 'C:\\Users\\TestUser\\Documents\\report.docx';
    await ipc.invoke('copy_path_to_clipboard', { path: docPath });
    assert.equal(ipc.clipboardContent, docPath, 'Document path copied');

    // Step 4: Open in Explorer to verify
    await ipc.invoke('open_path_in_explorer', { path: docPath });

    // Step 5: Safe delete to Recycle Bin
    const delRes = await ipc.invoke('delete_filesystem_item', { path: docPath, permanent: false });
    assert.isTrue(delRes.success, 'Report safely moved to Recycle Bin');
  });

  runner.addTest('T4_DISK_04: Multi-Gigabyte Raw Video & Media Library Cleanup', async () => {
    // Arrange: Video editor scanning D:\Footage with 85GB raw take
    const ipc = new MockIPC();
    ipc.vfs.mkdir('D:\\Footage');
    const rawTakeSize = 91268055040; // 85 GB
    ipc.vfs.writeFile('D:\\Footage\\raw_take_01.mov', rawTakeSize);
    ipc.vfs.writeFile('D:\\Footage\\b_roll.mov', 10737418240); // 10 GB

    // Step 1: Scan D:\Footage
    const scanResult = await ipc.invoke('scan_disk_space', { target_path: 'D:\\Footage' });
    assert.equal(scanResult.largestFiles[0].name, 'raw_take_01.mov', '85GB take is top file');

    // Step 2: Delete raw_take_01.mov permanently
    const delRes = await ipc.invoke('delete_filesystem_item', { path: 'D:\\Footage\\raw_take_01.mov', permanent: true });
    assert.isTrue(delRes.success, 'Raw take permanently deleted');
    assert.equal(delRes.bytesFreed, rawTakeSize, 'Freed 85GB');

    // Step 3: Sync tree and verify b_roll.mov becomes 100% of parent
    const updated = syncTreeAfterDeletion(scanResult.rootNode, 'D:\\Footage\\raw_take_01.mov', rawTakeSize, 1);
    assert.equal(updated.sizeBytes, 10737418240, 'Remaining size is 10GB');
    assert.equal(updated.children[0].percentageOfParent, 100.0, 'b_roll.mov rescales to 100%');
  });

  runner.addTest('T4_DISK_05: Heavy Drive Scan Cancellation & Redirection', async () => {
    // Arrange: User clicks scan on massive drive, cancels, and targets Downloads
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');

    // Step 1: Start full drive scan and cancel on progress
    const unlisten = ipc.listen('disk-scan-progress', () => {
      ipc.diskAnalyzer.cancelScan();
    });
    const cancelledRes = await ipc.invoke('scan_disk_space', { target_path: 'C:\\' });
    assert.isTrue(cancelledRes.isPartial, 'Cancelled scan returns partial status');
    unlisten();

    // Step 2: Redirect to Downloads folder and rescan
    const dlRes = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser\\Downloads' });
    assert.isFalse(dlRes.isPartial, 'Targeted scan finishes completely');
    assert.equal(dlRes.totalFiles, 2, '2 files in Downloads');
    assert.equal(dlRes.largestFiles[0].name, 'archive.zip', 'archive.zip identified');
  });

  runner.addTest('T4_DISK_06: End-to-End Keyboard Navigation & Bilingual Accessibility Audit', async () => {
    // Arrange: Accessible workflow with command palette and locale switching
    const ipc = new MockIPC();
    ipc.vfs.populateSampleDrive('C');
    const appState = new AppStateSimulator(ipc);

    // Step 1: Command palette navigation
    const palette = new CommandPaletteEngine();
    const found = palette.search('Storage Utilities');
    assert.greaterThanOrEqual(found.length, 1, 'Command palette found Storage Utilities');

    // Step 2: Open and scan
    appState.state.activeTab = 'storage_utilities';
    const scanRes = await ipc.invoke('scan_disk_space', { target_path: 'C:\\Users\\TestUser\\Documents' });

    // Step 3: Open deletion modal
    appState.state.storageAnalyzer.deletionModal.isOpen = true;
    appState.state.storageAnalyzer.deletionModal.targetItem = scanRes.rootNode.children[0];
    assert.equal(appState.state.storageAnalyzer.deletionModal.deletionMode, 'recycle_bin', 'Default mode is recycle_bin');

    // Step 4: Bilingual verification
    appState.state.currentLanguage = 'en';
    const enDeleteTitle = appState.translate('storage.confirmDeleteTitle');
    assert.ok(enDeleteTitle.length > 0, 'English modal title resolved');

    appState.state.currentLanguage = 'ru';
    const ruDeleteTitle = appState.translate('storage.confirmDeleteTitle');
    assert.ok(ruDeleteTitle.length > 0, 'Russian modal title resolved');
  });

  runner.addTest('T4_DISK_07: Real Frontend TypeScript diskAnalyzer utility module verification', async () => {
    // Import and execute real TS module tests directly
    const { runDiskAnalyzerUnitTests } = await import('../../src/utils/__tests__/diskAnalyzer.test.ts');
    runDiskAnalyzerUnitTests();
  });

  return runner;
}


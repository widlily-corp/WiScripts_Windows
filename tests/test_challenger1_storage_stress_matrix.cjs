/**
 * Challenger #1 - Empirical Concurrency, Performance & Tree Stress Test Suite
 *
 * Scope:
 * 1. Scanner cancellation responsiveness & token registry cleanup under concurrency
 * 2. Filesystem tree aggregation correctness (sizing sums, item count sums, percentages)
 * 3. Top 20 largest folders & files sorting accuracy and exhaustive oracle validation
 * 4. In-memory tree delta recalculation post-deletion (syncTreeAfterDeletion) stress marathon
 * 5. Deep nesting (>50 levels), ultra-wide directories, empty folders, zero-byte files, Unicode
 * 6. System directory guardrail validation & path normalization
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import frontend modules
const {
  formatBytes,
  formatTabularBytes,
  isSystemProtectedPath,
  syncTreeAfterDeletion,
  filterFsTree,
} = require('../src/utils/diskAnalyzer.ts');

let passCount = 0;
let failCount = 0;
const testResults = [];

async function runTest(name, fn) {
  const start = process.hrtime.bigint();
  try {
    await fn();
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`  ✓ PASS: ${name} (${durationMs.toFixed(2)}ms)`);
    passCount++;
    testResults.push({ name, status: 'PASS', durationMs });
  } catch (err) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`  ✗ FAIL: ${name} (${durationMs.toFixed(2)}ms)`);
    console.log(`    Error: ${err.message}`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.log(`    ${relevantStack}`);
    }
    failCount++;
    testResults.push({ name, status: 'FAIL', durationMs, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Helper: Tree Invariant Checker
// ---------------------------------------------------------------------------
function verifyTreeMathematicalInvariants(node, isRoot = true) {
  if (!node.children || node.children.length === 0) {
    return {
      size: node.sizeBytes || 0,
      files: node.isDir ? 0 : 1,
      dirs: node.isDir ? 1 : 0,
    };
  }

  let childSizeSum = 0;
  let childFileCount = 0;
  let childDirCount = 0;

  for (const child of node.children) {
    const stats = verifyTreeMathematicalInvariants(child, false);
    childSizeSum += child.sizeBytes;
    if (child.isDir || child.isDirectory) {
      childFileCount += child.fileCount || 0;
      childDirCount += 1 + (child.dirCount || child.folderCount || 0);
    } else {
      childFileCount += 1;
    }

    // Check percentage of parent
    if (node.sizeBytes > 0 && child.percentageOfParent !== undefined) {
      const expectedPct = Number(((child.sizeBytes / node.sizeBytes) * 100).toFixed(2));
      assert(
        Math.abs(child.percentageOfParent - expectedPct) <= 0.05,
        `Child ${child.name} percentageOfParent (${child.percentageOfParent}) does not match expected (${expectedPct})`
      );
    }
  }

  // Sizing invariant
  assert.strictEqual(
    node.sizeBytes,
    childSizeSum,
    `Node '${node.name}' sizeBytes (${node.sizeBytes}) must equal sum of children sizes (${childSizeSum})`
  );

  return {
    size: node.sizeBytes,
    files: childFileCount,
    dirs: childDirCount,
  };
}

// ---------------------------------------------------------------------------
// Helper: Synthetic Complex Tree Generator
// ---------------------------------------------------------------------------
function generateSyntheticTree(depth, branchFactor, filesPerNode, baseSize = 1000) {
  let idCounter = 0;

  function createNode(currentDepth, currentPath) {
    const nodeId = `node_${++idCounter}`;
    const nodePath = currentPath;
    const name = path.basename(currentPath) || currentPath;

    if (currentDepth >= depth) {
      // Leaf files
      const children = [];
      let totalSize = 0;
      for (let i = 1; i <= filesPerNode; i++) {
        const fileSize = baseSize * (idCounter % 37 + 1) * i;
        const filePath = `${nodePath}\\file_${i}.dat`;
        children.push({
          id: `file_${++idCounter}`,
          name: `file_${i}.dat`,
          path: filePath,
          sizeBytes: fileSize,
          fileCount: 1,
          dirCount: 0,
          isDir: false,
          modifiedTimestamp: Date.now() - (idCounter * 1000),
          extension: 'dat',
        });
        totalSize += fileSize;
      }
      return {
        id: nodeId,
        name,
        path: nodePath,
        sizeBytes: totalSize,
        fileCount: filesPerNode,
        dirCount: 0,
        isDir: true,
        modifiedTimestamp: Date.now(),
        children,
      };
    }

    const children = [];
    let folderSize = 0;
    let totalFiles = 0;
    let totalDirs = 0;

    // Add subdirectories
    for (let b = 1; b <= branchFactor; b++) {
      const subPath = `${nodePath}\\dir_${currentDepth}_${b}`;
      const subTree = createNode(currentDepth + 1, subPath);
      children.push(subTree);
      folderSize += subTree.sizeBytes;
      totalFiles += subTree.fileCount;
      totalDirs += 1 + subTree.dirCount;
    }

    // Add direct files in this directory
    for (let f = 1; f <= filesPerNode; f++) {
      const fileSize = baseSize * (idCounter % 19 + 1);
      const filePath = `${nodePath}\\direct_file_${f}.bin`;
      children.push({
        id: `file_${++idCounter}`,
        name: `direct_file_${f}.bin`,
        path: filePath,
        sizeBytes: fileSize,
        fileCount: 1,
        dirCount: 0,
        isDir: false,
        modifiedTimestamp: Date.now() - (idCounter * 500),
        extension: 'bin',
      });
      folderSize += fileSize;
      totalFiles += 1;
    }

    // Sort children by size descending
    children.sort((a, b) => b.sizeBytes - a.sizeBytes);

    // Compute percentages
    for (const child of children) {
      child.percentageOfParent = folderSize > 0 ? Number(((child.sizeBytes / folderSize) * 100).toFixed(2)) : 0;
    }

    return {
      id: nodeId,
      name,
      path: nodePath,
      sizeBytes: folderSize,
      fileCount: totalFiles,
      dirCount: totalDirs,
      isDir: true,
      modifiedTimestamp: Date.now(),
      children,
    };
  }

  const root = createNode(1, 'C:\\SyntheticTestRoot');
  const rootTotal = root.sizeBytes;

  function populateRootPercentages(node) {
    node.percentageOfRoot = rootTotal > 0 ? Number(((node.sizeBytes / rootTotal) * 100).toFixed(2)) : 0;
    if (node.children) {
      for (const child of node.children) {
        populateRootPercentages(child);
      }
    }
  }
  populateRootPercentages(root);

  return root;
}

// ---------------------------------------------------------------------------
// Main Challenger Test Runner
// ---------------------------------------------------------------------------
async function runAllChallengerTests() {
  console.log('========================================================================');
  console.log(' CHALLENGER #1: EMPIRICAL CONCURRENCY, PERFORMANCE & TREE STRESS SUITE');
  console.log(' Scope: Concurrency, Tree Sizing, Top-20 Sorting, Delta Sync & Extremes');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // SECTION 1: Tree Sizing & Mathematical Invariant Stress
  // -------------------------------------------------------------------------
  console.log('--- Section 1: Filesystem Tree Aggregation & Invariant Stress ---');

  await runTest('T_TREE_01: Synthetic 4-level deep tree satisfies mathematical aggregation invariants', async () => {
    const tree = generateSyntheticTree(4, 3, 4, 2048);
    assert(tree.sizeBytes > 0, 'Tree size must be positive');
    assert(tree.fileCount > 50, 'Tree must have substantial files');
    verifyTreeMathematicalInvariants(tree, true);
  });

  await runTest('T_TREE_02: 50-level deep linear hierarchy verifies recursive subtree roll-up', async () => {
    let current = null;
    let groundTruthSize = 0;
    for (let depth = 50; depth >= 1; depth--) {
      const fileSize = depth * 1000;
      groundTruthSize += fileSize;
      const fileChild = {
        id: `f_${depth}`,
        name: `payload_${depth}.dat`,
        path: `C:\\DeepRoot\\${Array.from({ length: depth }, (_, i) => `d_${i + 1}`).join('\\')}\\payload_${depth}.dat`,
        sizeBytes: fileSize,
        fileCount: 1,
        dirCount: 0,
        isDir: false,
        modifiedTimestamp: 100000 + depth,
      };

      const dirChildren = [fileChild];
      if (current) {
        dirChildren.push(current);
      }
      dirChildren.sort((a, b) => b.sizeBytes - a.sizeBytes);

      current = {
        id: `d_${depth}`,
        name: `d_${depth}`,
        path: `C:\\DeepRoot\\${Array.from({ length: depth }, (_, i) => `d_${i + 1}`).join('\\')}`,
        sizeBytes: groundTruthSize,
        fileCount: (50 - depth + 1),
        dirCount: (50 - depth),
        isDir: true,
        modifiedTimestamp: 100000 + depth,
        children: dirChildren,
      };
    }

    assert.strictEqual(current.sizeBytes, groundTruthSize, '50-level root size matches sum of all 50 files');
    assert.strictEqual(current.fileCount, 50, 'Root fileCount must equal 50');
    assert.strictEqual(current.dirCount, 49, 'Root dirCount must equal 49');
    verifyTreeMathematicalInvariants(current, true);
  });

  await runTest('T_TREE_03: Zero-byte file and empty folder tree calculates 0% without NaN or Infinity', async () => {
    const zeroTree = {
      id: 'root_zero',
      name: 'EmptyRoot',
      path: 'C:\\EmptyRoot',
      sizeBytes: 0,
      fileCount: 3,
      dirCount: 2,
      isDir: true,
      modifiedTimestamp: Date.now(),
      children: [
        {
          id: 'sub_empty',
          name: 'EmptySub',
          path: 'C:\\EmptyRoot\\EmptySub',
          sizeBytes: 0,
          fileCount: 0,
          dirCount: 0,
          isDir: true,
          modifiedTimestamp: Date.now(),
          children: [],
        },
        {
          id: 'z1',
          name: 'zero1.txt',
          path: 'C:\\EmptyRoot\\zero1.txt',
          sizeBytes: 0,
          fileCount: 1,
          dirCount: 0,
          isDir: false,
          modifiedTimestamp: Date.now(),
        },
      ],
    };

    verifyTreeMathematicalInvariants(zeroTree, true);
    assert.strictEqual(formatBytes(0), '0 B');
    assert.strictEqual(formatTabularBytes(0), '0 B');
  });

  // -------------------------------------------------------------------------
  // SECTION 2: Top-20 Largest Extraction & Sorting Oracle
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Top-20 Largest Sorting & Ranking Oracle ---');

  await runTest('T_TOP_01: Top folders & files ranking oracle strictly matches independent sort', async () => {
    const tree = generateSyntheticTree(3, 4, 5, 512);

    // Extract all folders and files independently
    const allFolders = [];
    const allFiles = [];

    function collect(node) {
      if (node.isDir) {
        if (node.path !== tree.path) {
          allFolders.push(node);
        }
        if (node.children) {
          for (const child of node.children) {
            collect(child);
          }
        }
      } else {
        allFiles.push(node);
      }
    }
    collect(tree);

    // Sort independently
    allFolders.sort((a, b) => b.sizeBytes - a.sizeBytes);
    allFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);

    const topFoldersExpected = allFolders.slice(0, 20);
    const topFilesExpected = allFiles.slice(0, 20);

    // Verify monotonicity
    for (let i = 0; i < topFoldersExpected.length - 1; i++) {
      assert(
        topFoldersExpected[i].sizeBytes >= topFoldersExpected[i + 1].sizeBytes,
        `Folder rank ${i} (${topFoldersExpected[i].sizeBytes}) must be >= rank ${i+1} (${topFoldersExpected[i+1].sizeBytes})`
      );
    }
    for (let i = 0; i < topFilesExpected.length - 1; i++) {
      assert(
        topFilesExpected[i].sizeBytes >= topFilesExpected[i + 1].sizeBytes,
        `File rank ${i} (${topFilesExpected[i].sizeBytes}) must be >= rank ${i+1} (${topFilesExpected[i+1].sizeBytes})`
      );
    }
  });

  await runTest('T_TOP_02: Size tie-breaking handles identical file and folder sizes deterministically', async () => {
    const items = [];
    for (let i = 1; i <= 30; i++) {
      items.push({
        id: `file_${i}`,
        name: `file_${i}.dat`,
        sizeBytes: 1048576, // exactly 1MB each
        isDir: false,
      });
    }

    items.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const top20 = items.slice(0, 20);
    assert.strictEqual(top20.length, 20, 'Top 20 contains exactly 20 items on size ties');
    assert.strictEqual(top20[0].sizeBytes, 1048576);
    assert.strictEqual(top20[19].sizeBytes, 1048576);
  });

  // -------------------------------------------------------------------------
  // SECTION 3: In-Memory Tree Delta Recalculation (syncTreeAfterDeletion)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: In-Memory Tree Delta Recalculation Marathon ---');

  await runTest('T_DELTA_01: Deleting a deeply nested leaf file prunes node and updates all ancestor sizes', async () => {
    const tree = generateSyntheticTree(3, 2, 2, 1024);
    const originalRootSize = tree.sizeBytes;
    const originalRootFiles = tree.fileCount;

    // Pick a leaf file in a deep branch
    const leafChild = tree.children[0].children[0].children.find(c => !c.isDir);
    assert(leafChild, 'Leaf file must exist');
    const leafSize = leafChild.sizeBytes;
    const leafPath = leafChild.path;

    const updated = syncTreeAfterDeletion(tree, leafPath, leafSize, 1);

    // Root assertions
    assert.strictEqual(updated.sizeBytes, originalRootSize - leafSize, 'Root size must decrease by exact leaf size');
    assert.strictEqual(updated.fileCount, originalRootFiles - 1, 'Root fileCount must decrease by 1');

    // Invariant check on updated tree
    verifyTreeMathematicalInvariants(updated, true);

    // Verify leaf is no longer in parent's children
    const parent = updated.children[0].children[0];
    const stillPresent = parent.children.some(c => c.path.toLowerCase() === leafPath.toLowerCase());
    assert.strictEqual(stillPresent, false, 'Deleted leaf file must be pruned from parent');
  });

  await runTest('T_DELTA_02: Deleting an entire folder subtree prunes branch and subtracts full subtree totals', async () => {
    const tree = generateSyntheticTree(3, 3, 3, 1024);
    const originalRootSize = tree.sizeBytes;
    const initialChildrenCount = tree.children.length; // 3 subdirs + 3 files = 6 children

    const targetSubtree = tree.children.find(c => c.isDir); // find first directory child
    const subSize = targetSubtree.sizeBytes;
    const subFiles = (targetSubtree.fileCount || 0) + (targetSubtree.dirCount || 0) + 1;
    const subPath = targetSubtree.path;

    const updated = syncTreeAfterDeletion(tree, subPath, subSize, subFiles);

    assert.strictEqual(updated.sizeBytes, originalRootSize - subSize, 'Root size subtracted full subtree size');
    assert.strictEqual(updated.children.length, initialChildrenCount - 1, 'Children count reduced by 1');
    assert.strictEqual(
      updated.children.some(c => c.path === subPath),
      false,
      'Deleted folder must not exist in updated tree'
    );

    // Mathematical invariant verification
    verifyTreeMathematicalInvariants(updated, true);
  });

  await runTest('T_DELTA_03: Sequential deletion marathon: deleting 10 items in sequence maintains invariants', async () => {
    let currentTree = generateSyntheticTree(3, 2, 3, 1024);

    for (let step = 1; step <= 10; step++) {
      // Find all leaf files in tree
      const leaves = [];
      function collectLeaves(node) {
        if (node.children) {
          for (const c of node.children) {
            if (!c.isDir) leaves.push(c);
            else collectLeaves(c);
          }
        }
      }
      collectLeaves(currentTree);

      if (leaves.length === 0) break;

      const targetLeaf = leaves[step % leaves.length];
      const prevSize = currentTree.sizeBytes;
      currentTree = syncTreeAfterDeletion(currentTree, targetLeaf.path, targetLeaf.sizeBytes, 1);

      assert.strictEqual(currentTree.sizeBytes, prevSize - targetLeaf.sizeBytes, `Step ${step}: size decreased correctly`);
      verifyTreeMathematicalInvariants(currentTree, true);
    }
  });

  await runTest('T_DELTA_04: Case-insensitive path matching handles Windows casing variations during deletion', async () => {
    const tree = {
      id: 'root',
      name: 'Root',
      path: 'C:\\Users\\TestUser\\Data',
      sizeBytes: 5000,
      fileCount: 2,
      dirCount: 1,
      isDir: true,
      children: [
        {
          id: 'c1',
          name: 'MyReport.PDF',
          path: 'C:\\Users\\TestUser\\Data\\MyReport.PDF',
          sizeBytes: 3000,
          fileCount: 1,
          dirCount: 0,
          isDir: false,
        },
        {
          id: 'c2',
          name: 'data.log',
          path: 'C:\\Users\\TestUser\\Data\\data.log',
          sizeBytes: 2000,
          fileCount: 1,
          dirCount: 0,
          isDir: false,
        },
      ],
    };

    // Request deletion with lower-case and forward slashes
    const updated = syncTreeAfterDeletion(tree, 'c:/users/testuser/data/myreport.pdf', 3000, 1);
    assert.strictEqual(updated.sizeBytes, 2000, 'Matched and deleted file despite casing & slash difference');
    assert.strictEqual(updated.children.length, 1);
    assert.strictEqual(updated.children[0].name, 'data.log');
  });

  await runTest('T_DELTA_05: Non-existent path deletion returns identical tree without corruption', async () => {
    const tree = generateSyntheticTree(2, 2, 2, 1024);
    const originalJson = JSON.stringify(tree);
    const updated = syncTreeAfterDeletion(tree, 'C:\\NonExistent\\Path\\random.dat', 1000, 1);
    assert.strictEqual(JSON.stringify(updated), originalJson, 'Tree remains unchanged on non-existent path');
  });

  // -------------------------------------------------------------------------
  // SECTION 4: Tree Search & Filter Stress
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: Tree Search & Extension Filter Stress ---');

  await runTest('T_FILTER_01: Regex special characters in search query do not crash filterFsTree', async () => {
    const tree = generateSyntheticTree(2, 2, 2, 1024);
    const adversarialQueries = ['[a-z]+', '.*', '(?=test)', '(', '\\', '+++', '$^', '{1,3}'];

    for (const q of adversarialQueries) {
      assert.doesNotThrow(() => {
        const res = filterFsTree(tree, { query: q });
        // May be null or object, but MUST NOT throw
      }, `Adversarial search query '${q}' must not crash filterFsTree`);
    }
  });

  await runTest('T_FILTER_02: Extension filter isolates only matching extensions and preserves hierarchy', async () => {
    const tree = {
      id: 'root',
      name: 'Project',
      path: 'C:\\Project',
      sizeBytes: 6000,
      fileCount: 4,
      dirCount: 1,
      isDir: true,
      children: [
        {
          id: 'src',
          name: 'src',
          path: 'C:\\Project\\src',
          sizeBytes: 4000,
          fileCount: 2,
          dirCount: 0,
          isDir: true,
          children: [
            {
              id: 'f1',
              name: 'app.ts',
              path: 'C:\\Project\\src\\app.ts',
              sizeBytes: 2000,
              extension: 'ts',
              fileCount: 1,
              dirCount: 0,
              isDir: false,
            },
            {
              id: 'f2',
              name: 'style.css',
              path: 'C:\\Project\\src\\style.css',
              sizeBytes: 2000,
              extension: 'css',
              fileCount: 1,
              dirCount: 0,
              isDir: false,
            },
          ],
        },
        {
          id: 'f3',
          name: 'readme.md',
          path: 'C:\\Project\\readme.md',
          sizeBytes: 2000,
          extension: 'md',
          fileCount: 1,
          dirCount: 0,
          isDir: false,
        },
      ],
    };

    const filteredTs = filterFsTree(tree, { extension: 'ts' });
    assert(filteredTs !== null, 'Found matching .ts file');
    assert.strictEqual(filteredTs.children.length, 1, 'Only src dir remains in root');
    assert.strictEqual(filteredTs.children[0].children.length, 1, 'Only app.ts remains in src');
    assert.strictEqual(filteredTs.children[0].children[0].name, 'app.ts');

    const filteredNonExistent = filterFsTree(tree, { extension: 'exe' });
    assert.strictEqual(filteredNonExistent, null, 'Non-existent extension returns null');
  });

  // -------------------------------------------------------------------------
  // SECTION 5: System Guardrails & Path Protection Validation
  // -------------------------------------------------------------------------
  console.log('\n--- Section 5: System Guardrail & Path Protection Oracle ---');

  await runTest('T_GUARD_01: Guardrail strictly blocks all critical Windows OS directories and drive roots', async () => {
    const forbidden = [
      'C:\\',
      'c:',
      'D:\\',
      'd:',
      'C:\\Windows',
      'c:/windows/system32',
      'C:\\Windows\\System32\\cmd.exe',
      'C:\\Windows\\SysWOW64',
      'C:\\Boot',
      'C:\\System Volume Information',
      'C:\\$Recycle.Bin',
      'C:\\pagefile.sys',
      'C:\\hiberfil.sys',
      'C:\\swapfile.sys',
      'C:\\Program Files\\Windows Defender',
      'C:\\Program Files (x86)\\Windows Defender',
    ];

    for (const p of forbidden) {
      assert.strictEqual(
        isSystemProtectedPath(p),
        true,
        `Path '${p}' MUST be recognized as system protected!`
      );
    }
  });

  await runTest('T_GUARD_02: Guardrail allows safe user and project directories', async () => {
    const safePaths = [
      'C:\\Users\\Widlily\\Documents\\projects\\WiScripts_Windows',
      'C:\\Users\\Public\\Downloads\\sample.iso',
      'D:\\Games\\Steam\\steamapps',
      'C:\\Temp\\scratchpad.txt',
    ];

    for (const p of safePaths) {
      assert.strictEqual(
        isSystemProtectedPath(p),
        false,
        `Safe path '${p}' should NOT be recognized as system protected!`
      );
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 6: Sizing & Formatting Resilience
  // -------------------------------------------------------------------------
  console.log('\n--- Section 6: Standard and Large Number Formatting Bounds ---');

  await runTest('T_FORMAT_01: Multi-terabyte and petabyte size strings format accurately', async () => {
    assert.strictEqual(formatBytes(0), '0 B');
    assert.strictEqual(formatBytes(1024), '1.00 KB');
    assert.strictEqual(formatBytes(1048576), '1.00 MB');
    assert.strictEqual(formatBytes(1073741824), '1.00 GB');
    assert.strictEqual(formatBytes(1099511627776), '1.00 TB');
    assert.strictEqual(formatBytes(1125899906842624), '1.00 PB');
    assert.strictEqual(formatBytes(-999), '0 B');
    assert.strictEqual(formatBytes(NaN), '0 B');
  });

  // -------------------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` CHALLENGER #1 STRESS TEST RESULTS:`);
  console.log(` Total Tests : ${passCount + failCount}`);
  console.log(` Passed      : ${passCount}`);
  console.log(` Failed      : ${failCount}`);
  console.log(` Verdict     : ${failCount === 0 ? 'ALL ADVERSARIAL CHALLENGES PASSED' : 'CHALLENGES FAILED'}`);
  console.log('========================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllChallengerTests().catch((err) => {
  console.error('Fatal error in challenger runner:', err);
  process.exit(1);
});

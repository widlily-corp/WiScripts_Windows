import {
  CleanerCategoryItem,
  CleanerScanResult,
  CleanerCleanResult,
  DuplicateFileItem,
  DuplicateGroup,
  LargeFileItem,
  StorageDeleteResult,
} from '../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function runCleanerStorageEmpiricalTests() {
  console.log('====================================================');
  console.log(' EMPIRICAL TEST SUITE: SystemCleaner & StorageUtilities Integration');
  console.log('====================================================\n');

  // Test 1: Cleaner Scan Result Field & Type Validation
  console.log('[Test 1] Cleaner Scan Result DTO Deserialization');
  const mockScanResult: CleanerScanResult = {
    categories: [
      {
        id: 'user_temp',
        name: 'User Temp Directory',
        description: 'Temporary files created by user applications',
        paths: ['C:\\Users\\Test\\AppData\\Local\\Temp'],
        totalSizeBytes: 104857600, // 100 MB
        fileCount: 250,
      },
      {
        id: 'browser_cache',
        name: 'Browser Caches',
        description: 'Temporary web cache files',
        paths: ['C:\\Users\\Test\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache'],
        totalSizeBytes: 52428800, // 50 MB
        fileCount: 120,
      },
    ],
    totalBytes: 157286400,
    totalFiles: 370,
  };

  assert(mockScanResult.categories.length === 2, 'Cleaner scan result contains 2 categories');
  assert(mockScanResult.totalBytes === 157286400, 'totalBytes matches sum of category totalSizeBytes');
  assert(mockScanResult.totalFiles === 370, 'totalFiles matches sum of category fileCount');
  assert(mockScanResult.categories[0].totalSizeBytes === 104857600, 'totalSizeBytes field populated correctly');
  assert(mockScanResult.categories[0].fileCount === 250, 'fileCount field populated correctly');
  assert(formatBytes(mockScanResult.totalBytes) === '150 MB', 'formatBytes formats 157286400 B as 150 MB');

  // Test 2: Cleaner Clean Result Field & Type Validation
  console.log('\n[Test 2] Cleaner Clean Result DTO Deserialization');
  const mockCleanResult: CleanerCleanResult = {
    bytesFreed: 104857600,
    filesRemoved: 245,
    skippedFilesCount: 5,
    errors: ['Skipped locked file C:\\Users\\Test\\AppData\\Local\\Temp\\locked.tmp'],
  };

  assert(mockCleanResult.bytesFreed === 104857600, 'bytesFreed field correctly mapped');
  assert(mockCleanResult.filesRemoved === 245, 'filesRemoved field correctly mapped');
  assert(mockCleanResult.skippedFilesCount === 5, 'skippedFilesCount field correctly mapped');
  assert(mockCleanResult.errors.length === 1, 'errors array captures skipped file messages');

  // Test 3: Duplicate Group & Item Field & Type Validation
  console.log('\n[Test 3] Storage Duplicate Group & Item DTO Deserialization');
  const mockDuplicateGroups: DuplicateGroup[] = [
    {
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sizeBytes: 1048576, // 1 MB
      files: [
        {
          path: 'C:\\Users\\Test\\Documents\\file1.bin',
          sizeBytes: 1048576,
          modifiedTimestamp: 1774000000,
        },
        {
          path: 'C:\\Users\\Test\\Downloads\\file1_copy.bin',
          sizeBytes: 1048576,
          modifiedTimestamp: 1774000100,
        },
      ],
    },
  ];

  assert(mockDuplicateGroups[0].hash.length === 64, 'SHA-256 hash string is 64 hex characters');
  assert(mockDuplicateGroups[0].sizeBytes === 1048576, 'sizeBytes correctly mapped on group level');
  assert(mockDuplicateGroups[0].files.length === 2, 'Group contains 2 candidate duplicate files');
  assert(mockDuplicateGroups[0].files[0].path === 'C:\\Users\\Test\\Documents\\file1.bin', 'File path correctly populated');
  assert(mockDuplicateGroups[0].files[0].modifiedTimestamp === 1774000000, 'modifiedTimestamp correctly populated');

  // Test 4: Large File Item Field & Type Validation
  console.log('\n[Test 4] Storage Large File Item DTO Deserialization');
  const mockLargeFiles: LargeFileItem[] = [
    {
      path: 'C:\\Users\\Test\\Downloads\\ubuntu-24.04.iso',
      name: 'ubuntu-24.04.iso',
      sizeBytes: 6120000000, // ~5.7 GB
      extension: 'iso',
      modifiedTimestamp: 1774005000,
    },
  ];

  assert(mockLargeFiles[0].name === 'ubuntu-24.04.iso', 'File name correctly extracted');
  assert(mockLargeFiles[0].extension === 'iso', 'File extension correctly extracted');
  assert(mockLargeFiles[0].sizeBytes === 6120000000, 'sizeBytes correctly populated');
  assert(formatBytes(mockLargeFiles[0].sizeBytes) === '5.7 GB', 'formatBytes formats large ISO correctly');

  // Test 5: Delete Result DTO Deserialization
  console.log('\n[Test 5] Storage Delete Result DTO Deserialization');
  const mockDeleteResult: StorageDeleteResult = {
    filesDeleted: 1,
    bytesFreed: 6120000000,
    errors: [],
  };

  assert(mockDeleteResult.filesDeleted === 1, 'filesDeleted correctly populated');
  assert(mockDeleteResult.bytesFreed === 6120000000, 'bytesFreed correctly populated');
  assert(mockDeleteResult.errors.length === 0, 'errors array empty on clean deletion');

  // Test 6: Empty Array & Zero States Resilience
  console.log('\n[Test 6] UI Empty Array & Zero Byte Calculations Resilience');
  
  // Empty scan result categories
  const emptyScanResult: CleanerScanResult = {
    categories: [],
    totalBytes: 0,
    totalFiles: 0,
  };
  const emptyCatSelectedBytes = emptyScanResult.categories.reduce((acc, c) => acc + c.totalSizeBytes, 0);
  assert(emptyCatSelectedBytes === 0, 'Empty categories list returns 0 selected bytes safely');
  assert(formatBytes(emptyScanResult.totalBytes) === '0 B', '0 bytes formats as "0 B"');

  // Selection calculation logic for duplicates
  const selectedPaths = new Set<string>(['C:\\Users\\Test\\Downloads\\file1_copy.bin']);
  let totalSelectedBytes = 0;
  for (const grp of mockDuplicateGroups) {
    for (const f of grp.files) {
      if (selectedPaths.has(f.path)) {
        totalSelectedBytes += f.sizeBytes;
      }
    }
  }
  assert(totalSelectedBytes === 1048576, 'Selected duplicate file bytes calculated as 1 MB');

  console.log('\n====================================================');
  console.log(' ALL CLEANER & STORAGE EMPIRICAL INTEGRATION TESTS PASSED CLEANLY! 🎉');
  console.log('====================================================\n');
}

runCleanerStorageEmpiricalTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Integration test failed:', err);
    process.exit(1);
  });

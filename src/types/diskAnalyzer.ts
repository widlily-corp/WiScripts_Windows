export type ViewMode = 'tree' | 'ranked_folders' | 'ranked_files';

export interface DiskDriveInfo {
  mountPoint: string;
  name: string;
  fileSystem: string;
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usagePercentage: number;
  isRemovable: boolean;
  isReadOnly: boolean;
  isSystemDrive: boolean;
  id?: string;
  freeBytes?: number;
}

export interface FsTreeNode {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  fileCount: number;
  dirCount: number;
  isDir: boolean;
  isDirectory?: boolean;
  folderCount?: number;
  modifiedTimestamp: number;
  extension?: string;
  children?: FsTreeNode[];
  percentageOfParent?: number;
  percentageOfRoot?: number;
  isSystemProtected?: boolean;
}

export interface RankedFsItem {
  rank: number;
  name: string;
  path: string;
  sizeBytes: number;
  totalBytes?: number;
  isDir: boolean;
  isDirectory?: boolean;
  extension?: string | null;
  modifiedTimestamp: number;
  itemCount: number;
  fileCount?: number;
  percentageOfTotal: number;
  isSystemProtected?: boolean;
}

export interface DiskScanProgressPayload {
  scanId: string;
  currentPath: string;
  filesScanned: number;
  directoriesScanned: number;
  totalBytesScanned: number;
  bytesProcessed?: number;
  elapsedMs: number;
  itemsPerSecond?: number;
}

export interface DiskScanResult {
  scanId: string;
  rootPath: string;
  totalBytes: number;
  totalFiles: number;
  totalDirs: number;
  totalFolders?: number;
  scanDurationMs: number;
  tree: FsTreeNode;
  rootNode?: FsTreeNode;
  topFolders: RankedFsItem[];
  largestFolders?: RankedFsItem[];
  topFiles: RankedFsItem[];
  largestFiles?: RankedFsItem[];
  isCancelled: boolean;
  isPartial?: boolean;
}

export interface DeletionItemReport {
  path: string;
  success: boolean;
  bytesFreed: number;
  error?: string | null;
}

export interface DeletionResult {
  itemsDeleted: number;
  bytesFreed: number;
  errors: string[];
  itemReports: DeletionItemReport[];
  permanent: boolean;
  success?: boolean;
  isDryRun?: boolean;
  movedToRecycleBin?: boolean;
}

export interface PathProtectionStatus {
  path: string;
  isProtected: boolean;
  reason?: string | null;
  protectionLevel: string;
}

export interface DiskDeleteOptions {
  paths: string[];
  permanent: boolean;
  dryRun?: boolean;
}

export interface DiskAnalyzerFilterOptions {
  query?: string;
  minBytes?: number;
  extension?: string;
}

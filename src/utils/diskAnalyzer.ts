import type { FsTreeNode, DiskAnalyzerFilterOptions } from '../types/diskAnalyzer.ts';

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes <= 0 || isNaN(bytes) || !isFinite(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i <= 0) return `${Math.round(bytes)} B`;
  if (i >= sizes.length) i = sizes.length - 1;

  let val = bytes / Math.pow(k, i);
  let formatted = val >= 100 ? val.toFixed(1) : val.toFixed(decimals);

  // If rounding causes value to reach or exceed 1024 (e.g. 1023.996 GB rounded to 1 decimal is 1024.0 GB),
  // rollover to the next binary unit (e.g. 1.00 TB)
  if (parseFloat(formatted) >= 1024 && i < sizes.length - 1) {
    i += 1;
    val = bytes / Math.pow(k, i);
    formatted = val >= 100 ? val.toFixed(1) : val.toFixed(decimals);
  }

  return `${formatted} ${sizes[i]}`;
}

export function formatTabularBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes) || !isFinite(bytes)) return '0 B';
  return `${Math.round(bytes).toLocaleString('en-US')} B`;
}

export function isSystemProtectedPath(path: string): boolean {
  if (!path) return false;
  const normalized = path.replace(/\//g, '\\').trim().toLowerCase();

  const driveRootMatch = /^[a-z]:\\?$/.test(normalized);
  if (driveRootMatch) return true;

  const protectedPrefixes = [
    ':\\windows',
    ':\\boot',
    ':\\system volume information',
    ':\\$recycle.bin',
    ':\\recovery',
    ':\\program files\\windows defender',
    ':\\program files (x86)\\windows defender',
    ':\\programdata\\microsoft\\windows defender',
  ];

  for (const prefix of protectedPrefixes) {
    if (normalized.length >= 3 && normalized.slice(1).startsWith(prefix)) {
      return true;
    }
  }

  const systemFiles = [
    'pagefile.sys',
    'hiberfil.sys',
    'swapfile.sys',
    'bootmgr',
    'bootstat.dat',
  ];

  const fileName = normalized.split('\\').pop() || '';
  return systemFiles.includes(fileName);
}

export function syncTreeAfterDeletion(
  rootNode: FsTreeNode,
  deletedPath: string,
  _bytesFreed: number,
  _itemsDeleted: number = 1
): FsTreeNode {
  if (!rootNode || !deletedPath) return rootNode;
  const targetNorm = deletedPath.replace(/\//g, '\\').toLowerCase();
  const rootNorm = rootNode.path.replace(/\//g, '\\').toLowerCase();

  if (rootNorm === targetNorm) {
    return {
      ...rootNode,
      sizeBytes: 0,
      fileCount: 0,
      dirCount: 0,
      children: [],
      percentageOfParent: 0,
      percentageOfRoot: 0,
    };
  }

  const updateSubtree = (node: FsTreeNode): { node: FsTreeNode | null; freed: number; items: number } => {
    const nodeNorm = node.path.replace(/\//g, '\\').toLowerCase();
    if (nodeNorm === targetNorm) {
      const count = (node.isDir || node.isDirectory)
        ? ((node.fileCount || 0) + (node.dirCount || node.folderCount || 0) + 1)
        : 1;
      return { node: null, freed: node.sizeBytes, items: count };
    }

    if (!node.children || node.children.length === 0) {
      return { node, freed: 0, items: 0 };
    }

    let modified = false;
    let totalFreedInSubtree = 0;
    let totalItemsInSubtree = 0;
    const newChildren: FsTreeNode[] = [];

    for (const child of node.children) {
      const childNorm = child.path.replace(/\//g, '\\').toLowerCase();
      if (childNorm === targetNorm) {
        modified = true;
        const count = (child.isDir || child.isDirectory)
          ? ((child.fileCount || 0) + (child.dirCount || child.folderCount || 0) + 1)
          : 1;
        totalFreedInSubtree += child.sizeBytes;
        totalItemsInSubtree += count;
        // Omit deleted child from newChildren
      } else {
        const childRes = updateSubtree(child);
        if (childRes.freed > 0 || childRes.node === null || childRes.node !== child) {
          modified = true;
          totalFreedInSubtree += childRes.freed;
          totalItemsInSubtree += childRes.items;
          if (childRes.node !== null) {
            newChildren.push(childRes.node);
          }
        } else {
          newChildren.push(child);
        }
      }
    }

    if (modified) {
      const newSizeBytes = Math.max(0, node.sizeBytes - totalFreedInSubtree);
      const newFileCount = Math.max(0, (node.fileCount || 0) - totalItemsInSubtree);

      const updatedChildren = newChildren.map((ch) => ({
        ...ch,
        percentageOfParent:
          newSizeBytes > 0 ? Number(((ch.sizeBytes / newSizeBytes) * 100).toFixed(2)) : 0,
      }));

      return {
        node: {
          ...node,
          sizeBytes: newSizeBytes,
          fileCount: newFileCount,
          children: updatedChildren,
        },
        freed: totalFreedInSubtree,
        items: totalItemsInSubtree,
      };
    }

    return { node, freed: 0, items: 0 };
  };

  const result = updateSubtree(rootNode);
  const updatedRoot = result.node || {
    ...rootNode,
    sizeBytes: 0,
    fileCount: 0,
    dirCount: 0,
    children: [],
  };

  const rootTotal = updatedRoot.sizeBytes;
  const recomputeRootPercentage = (node: FsTreeNode): FsTreeNode => {
    const pctOfRoot = rootTotal > 0 ? Number(((node.sizeBytes / rootTotal) * 100).toFixed(2)) : 0;
    const nextChildren = node.children ? node.children.map(recomputeRootPercentage) : undefined;
    return {
      ...node,
      percentageOfRoot: pctOfRoot,
      children: nextChildren,
    };
  };

  return recomputeRootPercentage(updatedRoot);
}

export function filterFsTree(
  rootNode: FsTreeNode,
  options: DiskAnalyzerFilterOptions
): FsTreeNode | null {
  const { query, minBytes = 0, extension } = options;
  const qLower = query ? query.trim().toLowerCase() : '';
  const extFilter = extension ? extension.trim().toLowerCase().replace(/^\./, '') : '';

  const filterNode = (node: FsTreeNode): FsTreeNode | null => {
    const isDirectory = node.isDir || node.isDirectory || (node.children && node.children.length > 0);

    if (!isDirectory) {
      if (minBytes > 0 && node.sizeBytes < minBytes) return null;
      if (extFilter) {
        const fileExt = (node.extension || node.name.split('.').pop() || '').toLowerCase();
        if (fileExt !== extFilter) return null;
      }
      if (qLower && !node.name.toLowerCase().includes(qLower) && !node.path.toLowerCase().includes(qLower)) {
        return null;
      }
      return { ...node };
    }

    const matchingChildren: FsTreeNode[] = [];
    if (node.children) {
      for (const child of node.children) {
        const res = filterNode(child);
        if (res) matchingChildren.push(res);
      }
    }

    const folderMatchesQuery = !qLower || node.name.toLowerCase().includes(qLower) || node.path.toLowerCase().includes(qLower);

    if (matchingChildren.length > 0) {
      return {
        ...node,
        children: matchingChildren,
      };
    }

    if (folderMatchesQuery && !extFilter && minBytes === 0) {
      return {
        ...node,
        children: matchingChildren,
      };
    }

    return null;
  };

  return filterNode(rootNode);
}
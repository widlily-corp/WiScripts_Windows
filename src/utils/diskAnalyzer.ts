import type { FsTreeNode, DiskAnalyzerFilterOptions } from '../types/diskAnalyzer.ts';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i <= 0) return `${bytes} B`;
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 ? val.toFixed(1) : val.toFixed(2)} ${sizes[i]}`;
}

export function formatTabularBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0 || isNaN(bytes)) return '0 B';
  return `${bytes.toLocaleString('en-US')} B`;
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
  bytesFreed: number,
  itemsDeleted: number = 1
): FsTreeNode {
  if (!rootNode || !deletedPath) return rootNode;
  const targetNorm = deletedPath.replace(/\//g, '\\').toLowerCase();

  const clonedRoot: FsTreeNode = JSON.parse(JSON.stringify(rootNode));

  const updateSubtree = (node: FsTreeNode): { freed: number; items: number } | null => {
    const nodeNorm = node.path.replace(/\//g, '\\').toLowerCase();
    if (nodeNorm === targetNorm) {
      return { freed: node.sizeBytes, items: node.fileCount || 1 };
    }

    if (node.children && node.children.length > 0) {
      const newChildren: FsTreeNode[] = [];
      let freedInChild = 0;
      let itemsInChild = 0;

      for (const child of node.children) {
        const childNorm = child.path.replace(/\//g, '\\').toLowerCase();
        if (childNorm === targetNorm) {
          freedInChild += child.sizeBytes;
          const count = (child.isDir || child.isDirectory)
            ? ((child.fileCount || 0) + (child.dirCount || child.folderCount || 0) + 1)
            : 1;
          itemsInChild += count;
        } else {
          const subResult = updateSubtree(child);
          if (subResult && subResult.freed > 0) {
            freedInChild += subResult.freed;
            itemsInChild += subResult.items;
          }
          newChildren.push(child);
        }
      }

      if (freedInChild > 0 || itemsInChild > 0) {
        node.sizeBytes = Math.max(0, node.sizeBytes - freedInChild);
        node.fileCount = Math.max(0, (node.fileCount || 0) - itemsInChild);
        node.children = newChildren;

        for (const child of node.children) {
          child.percentageOfParent =
            node.sizeBytes > 0
              ? Number(((child.sizeBytes / node.sizeBytes) * 100).toFixed(2))
              : 0;
        }
        return { freed: freedInChild, items: itemsInChild };
      }
    }
    return null;
  };

  updateSubtree(clonedRoot);

  const total = clonedRoot.sizeBytes;
  const recomputeRootPercentage = (node: FsTreeNode) => {
    node.percentageOfRoot = total > 0 ? Number(((node.sizeBytes / total) * 100).toFixed(2)) : 0;
    if (node.children) {
      for (const child of node.children) {
        recomputeRootPercentage(child);
      }
    }
  };
  recomputeRootPercentage(clonedRoot);

  return clonedRoot;
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
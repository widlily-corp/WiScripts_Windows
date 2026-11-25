import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { LargeFileItem } from '../../types';
import { formatBytes } from '../../utils';
import { PaginationBar, usePagination } from '../common/VirtualList';
import { formatStorageDate } from './DuplicateFilesTab';

interface LargeFilesTabProps {
  largeFiles: LargeFileItem[] | null;
  selectedPaths: Set<string>;
  isScanning: boolean;
  onScanLargeFiles: () => void;
  onTogglePathSelect: (path: string) => void;
}

export function LargeFilesTab({
  largeFiles,
  selectedPaths,
  isScanning,
  onScanLargeFiles,
  onTogglePathSelect,
}: LargeFilesTabProps) {
  const { t } = useTranslation();
  const pagination = usePagination(largeFiles ?? [], 25);

  if (!largeFiles) {
    return (
      <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-3">
        <HardDrive className="h-10 w-10 text-text-muted mx-auto opacity-50" />
        <div className="text-sm font-medium text-text-primary">{t('storageUtilities.largeFileFinder')}</div>
        <p className="text-xs text-text-muted max-w-md mx-auto">
          {t('storageUtilities.scanLargeDescription')}
        </p>
        <button
          type="button"
          onClick={onScanLargeFiles}
          disabled={isScanning}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{t('storageUtilities.startLargeFilesScan')}</span>
        </button>
      </div>
    );
  }

  if (largeFiles.length === 0) {
    return (
      <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-2">
        <HardDrive className="h-8 w-8 text-text-muted mx-auto opacity-50" />
        <div className="text-sm font-medium text-text-primary">{t('storageUtilities.noLargeFiles')}</div>
        <p className="text-xs text-text-muted">{t('storageUtilities.noSpaceConsuming')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[6px] border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-subtle border-b border-border-subtle text-text-muted font-medium uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3 w-10">{t('storageUtilities.selectColumn')}</th>
              <th className="p-3">{t('storageUtilities.fileNameAndDetails')}</th>
              <th className="p-3">{t('storageUtilities.extension')}</th>
              <th className="p-3 font-mono text-right">{t('storageUtilities.size')}</th>
              <th className="p-3 text-right">{t('storageUtilities.lastModified')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/50">
            {pagination.pageItems.map((file, idx) => {
              const isSelected = selectedPaths.has(file.path);
              return (
                <tr
                  key={file.path + idx}
                  className={`transition-colors ${isSelected ? 'bg-brand/5' : 'hover:bg-surface-hover'}`}
                >
                  <td className="p-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={file.name}
                      onClick={() => onTogglePathSelect(file.path)}
                      className="text-brand p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-brand/40"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4 text-text-muted" />
                      )}
                    </button>
                  </td>
                  <td className="p-3 max-w-md">
                    <button
                      type="button"
                      onClick={() => onTogglePathSelect(file.path)}
                      className="text-left w-full"
                    >
                      <div className="font-medium text-text-primary truncate">{file.name}</div>
                      <div className="text-[11px] font-mono text-text-muted truncate" title={file.path}>
                        {file.path}
                      </div>
                    </button>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-[4px] bg-surface-subtle border border-border text-[10px] font-mono uppercase text-text-secondary">
                      .{file.extension || 'file'}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums font-semibold text-brand">
                    {formatBytes(file.sizeBytes)}
                  </td>
                  <td className="p-3 text-right text-text-muted font-mono tabular-nums text-[11px]">
                    {formatStorageDate(file.modifiedTimestamp, t)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationBar
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        onPageChange={pagination.setPage}
      />
    </div>
  );
}

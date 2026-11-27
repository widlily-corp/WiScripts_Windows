import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import {
  Copy,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  File,
  CheckSquare,
  Square,
} from 'lucide-react';
import { DuplicateGroup } from '../../types';
import { formatBytes } from '../../utils';
import { PaginationBar, usePagination } from '../common/VirtualList';

export function formatStorageDate(tsSec: number, t: TFunction): string {
  if (!tsSec) return t('storageUtilities.unknown');
  const date = new Date(tsSec * 1000);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface DuplicateFilesTabProps {
  duplicateGroups: DuplicateGroup[] | null;
  expandedGroups: Set<string>;
  selectedPaths: Set<string>;
  selectedBytes: number;
  isScanning: boolean;
  onScanDuplicates: () => void;
  onToggleGroupExpand: (hash: string) => void;
  onTogglePathSelect: (path: string) => void;
  onSelectDuplicatesExceptFirst: (group: DuplicateGroup) => void;
}

export function DuplicateFilesTab({
  duplicateGroups,
  expandedGroups,
  selectedPaths,
  selectedBytes,
  isScanning,
  onScanDuplicates,
  onToggleGroupExpand,
  onTogglePathSelect,
  onSelectDuplicatesExceptFirst,
}: DuplicateFilesTabProps) {
  const { t } = useTranslation();
  const pagination = usePagination(duplicateGroups ?? [], 20);

  if (!duplicateGroups) {
    return (
      <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-3">
        <Copy className="h-10 w-10 text-text-muted mx-auto opacity-50" />
        <div className="text-sm font-medium text-text-primary">{t('storageUtilities.duplicateFileScanner')}</div>
        <p className="text-xs text-text-muted max-w-md mx-auto">
          {t('storageUtilities.scanDescription')}
        </p>
        <button
          type="button"
          onClick={onScanDuplicates}
          disabled={isScanning}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{t('storageUtilities.startDuplicateScan')}</span>
        </button>
      </div>
    );
  }

  if (duplicateGroups.length === 0) {
    return (
      <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-12 text-center space-y-2">
        <Copy className="h-8 w-8 text-text-muted mx-auto opacity-50" />
        <div className="text-sm font-medium text-text-primary">{t('storageUtilities.noDuplicateFiles')}</div>
        <p className="text-xs text-text-muted">{t('storageUtilities.allScannedFilesUnique')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{t('storageUtilities.foundDuplicateGroups', { count: duplicateGroups.length })}</span>
        {selectedPaths.size > 0 && (
          <span className="font-mono tabular-nums text-brand">
            {t('storageUtilities.selectedFiles', {
              count: selectedPaths.size,
              size: formatBytes(selectedBytes),
            })}
          </span>
        )}
      </div>

      {pagination.pagedItems.map((group, gIdx) => {
        const isExpanded = expandedGroups.has(group.hash);
        const potentialSavings = group.sizeBytes * (group.files.length - 1);

        return (
          <div key={group.hash + gIdx} className="rounded-[6px] border border-border bg-surface overflow-hidden">
            <div className="p-3.5 bg-surface-subtle flex items-center justify-between gap-3 border-b border-border-subtle">
              <button
                type="button"
                onClick={() => onToggleGroupExpand(group.hash)}
                aria-expanded={isExpanded}
                className="flex items-center gap-2.5 min-w-0 text-left flex-1 focus:outline-none focus:ring-2 focus:ring-brand/40 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
                )}
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {t('storageUtilities.hash', { hash: group.hash.substring(0, 16) })}
                  </span>
                  <span className="px-2 py-0.5 rounded-[4px] bg-brand/10 text-brand text-[10px] font-mono">
                    {t('storageUtilities.duplicatesCount', { count: group.files.length })}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-xs font-mono tabular-nums font-semibold text-text-primary">
                    {formatBytes(group.sizeBytes)} {t('storageUtilities.each')}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-status-success">
                    {t('storageUtilities.save', { size: formatBytes(potentialSavings) })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectDuplicatesExceptFirst(group)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-[4px] border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                >
                  {t('storageUtilities.selectDuplicates')}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="divide-y divide-border-subtle/40 bg-surface">
                {group.files.map((file, fIdx) => {
                  const isSelected = selectedPaths.has(file.path);
                  return (
                    <button
                      key={file.path + fIdx}
                      type="button"
                      onClick={() => onTogglePathSelect(file.path)}
                      aria-pressed={isSelected}
                      className={`w-full text-left p-3 flex items-center justify-between gap-3 transition-colors text-xs ${
                        isSelected ? 'bg-brand/5' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-brand shrink-0">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4 text-text-muted" />
                          )}
                        </div>
                        <File className="h-4 w-4 text-text-muted shrink-0" />
                        <div className="min-w-0">
                          <div className="font-mono text-text-primary truncate" title={file.path}>
                            {file.path}
                          </div>
                          <div className="text-[10px] text-text-muted">
                            {t('storageUtilities.modified', { date: formatStorageDate(file.modifiedTimestamp, t) })}
                            {fIdx === 0 && (
                              <span className="ml-2 text-status-info font-medium">
                                {t('storageUtilities.originalCandidate')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums text-text-secondary shrink-0">
                        {formatBytes(file.sizeBytes)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <PaginationBar
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        pageSize={pagination.pageSize}
        onPageChange={pagination.setPage}
      />
    </div>
  );
}

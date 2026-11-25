import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  containerHeight?: number;
  overscan?: number;
  className?: string;
  getKey?: (item: T, index: number) => React.Key;
  renderRow: (item: T, index: number) => React.ReactNode;
}

/**
 * Lightweight fixed-height virtualized list renderer that keeps DOM size O(visible).
 */
export function VirtualList<T>({
  items,
  rowHeight,
  containerHeight = 420,
  overscan = 6,
  className = '',
  getKey,
  renderRow,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * rowHeight;
  const visibleCount = Math.ceil(containerHeight / rowHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ maxHeight: containerHeight }}
      className={`overflow-y-auto relative ${className}`}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${startIndex * rowHeight}px)` }}>
          {visibleItems.map((item, offset) => {
            const index = startIndex + offset;
            const key = getKey ? getKey(item, index) : index;
            return (
              <div key={key} style={{ height: rowHeight }}>
                {renderRow(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function usePagination<T>(items: T[], pageSize = 50) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    totalPages,
    pageSize,
    totalItems: items.length,
    pagedItems,
    setPage,
  };
}

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showingLabel?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  showingLabel,
}) => {
  if (totalItems <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface-subtle text-xs text-text-secondary">
      <span className="font-mono tabular-nums text-[11px]">
        {showingLabel ?? `${start}–${end} / ${totalItems}`}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          className="inline-flex items-center justify-center rounded-[4px] border border-border bg-surface px-2 py-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 font-mono tabular-nums text-[11px] text-text-primary">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="inline-flex items-center justify-center rounded-[4px] border border-border bg-surface px-2 py-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

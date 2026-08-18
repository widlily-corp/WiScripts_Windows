import React from 'react';

/**
 * ViewSkeleton - Refined Minimal loading placeholder for lazy-loaded views.
 * Adheres to Titan Core aesthetic standards: semantic tokens, 1px borders,
 * subtle pulsing animations with prefers-reduced-motion safety, and zero layout shift.
 */
export function ViewSkeleton() {
  return (
    <div
      className="p-6 space-y-6 max-w-7xl mx-auto animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading view content"
    >
      <span className="sr-only">Loading view content...</span>

      {/* Header & Stats Banner Placeholder */}
      <div className="rounded-[6px] border border-border bg-surface-subtle p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-5 rounded bg-surface-active" />
            <div className="h-5 w-44 rounded bg-surface-active" />
          </div>
          <div className="h-3 w-64 rounded bg-surface-active/60" />
        </div>

        {/* Header Action / Stat Badges Placeholder */}
        <div className="flex items-center gap-3">
          <div className="rounded-[6px] border border-border bg-surface px-4 py-2 flex flex-col items-center gap-1 min-w-[72px]">
            <div className="h-2.5 w-10 rounded bg-surface-active/50" />
            <div className="h-4 w-8 rounded bg-surface-active" />
          </div>
          <div className="rounded-[6px] border border-border bg-surface px-4 py-2 flex flex-col items-center gap-1 min-w-[72px]">
            <div className="h-2.5 w-10 rounded bg-surface-active/50" />
            <div className="h-4 w-8 rounded bg-surface-active" />
          </div>
          <div className="h-8 w-28 rounded-[6px] bg-surface-active border border-border" />
        </div>
      </div>

      {/* Action / Filter Bar Placeholder */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="h-8 w-20 rounded-[6px] bg-surface-subtle border border-border" />
          <div className="h-8 w-24 rounded-[6px] bg-surface-subtle border border-border" />
          <div className="h-8 w-20 rounded-[6px] bg-surface-subtle border border-border" />
        </div>
        <div className="h-8 w-full sm:w-64 rounded-[6px] bg-surface-subtle border border-border" />
      </div>

      {/* Main Content Grid / Card Placeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            className="rounded-[6px] border border-border bg-surface-subtle p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-surface-active" />
                <div className="h-4 w-28 rounded bg-surface-active" />
              </div>
              <div className="h-4 w-12 rounded bg-surface-active/70" />
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="h-3 w-full rounded bg-surface-active/50" />
              <div className="h-3 w-4/5 rounded bg-surface-active/40" />
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-border/50">
              <div className="h-3 w-16 rounded bg-surface-active/50" />
              <div className="h-5 w-9 rounded-full bg-surface-active" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

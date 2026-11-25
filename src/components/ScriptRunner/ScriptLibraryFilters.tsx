import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ShieldAlert, Code2 } from 'lucide-react';
import type { ScriptCategory, ScriptRiskLevel } from '../../types';

interface CategoryItem {
  id: ScriptCategory;
  label: string;
  icon: React.ReactNode;
}

interface ScriptLibraryFiltersProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  selectedRisk: ScriptRiskLevel | 'all';
  onRiskChange: (risk: ScriptRiskLevel | 'all') => void;
  selectedCategory: ScriptCategory;
  onCategoryChange: (cat: ScriptCategory) => void;
  categories: CategoryItem[];
  libraryError: string | null;
  onRetry: () => void;
  isLoadingLibrary: boolean;
  hasManifest: boolean;
  filteredCount: number;
}

export function ScriptLibraryFilters({
  searchQuery,
  onSearchChange,
  selectedRisk,
  onRiskChange,
  selectedCategory,
  onCategoryChange,
  categories,
  libraryError,
  onRetry,
  isLoadingLibrary,
  hasManifest,
  filteredCount,
}: ScriptLibraryFiltersProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col gap-4 bg-surface border border-border rounded-[6px] p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-secondary/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t(
                'script_runner.search_placeholder',
                'Search scripts by name, tags, description...'
              )}
              aria-label={t(
                'script_runner.search_placeholder',
                'Search scripts by name, tags, description...'
              )}
              className="w-full bg-surface-subtle border border-border rounded-[6px] pl-9 pr-8 py-2 text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t('common.clear', 'Clear')}
                className="absolute right-2.5 top-2.5 text-text-secondary hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-text-secondary font-medium">
              {t('script_runner.risk_filter_label', 'Risk:')}
            </span>
            <div className="inline-flex p-0.5 rounded-[6px] bg-surface-subtle border border-border">
              {(['all', 'safe', 'elevated'] as const).map((risk) => (
                <button
                  key={risk}
                  type="button"
                  onClick={() => onRiskChange(risk)}
                  className={`px-2.5 py-1 rounded-[4px] text-[11px] font-medium capitalize transition-colors ${
                    selectedRisk === risk
                      ? 'bg-brand text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {risk === 'all'
                    ? t('script_runner.risk_all', 'All')
                    : risk === 'safe'
                    ? t('script_runner.risk_safe', 'Safe')
                    : t('script_runner.risk_elevated', 'Elevated')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium border transition-colors shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-brand text-white border-brand shadow-xs'
                  : 'bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-text-primary border-border'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {libraryError && (
        <div className="p-4 rounded-[6px] border border-status-danger/40 bg-status-dangerSubtle text-status-danger flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{libraryError}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1 bg-surface hover:bg-surface-hover text-text-primary border border-border text-xs rounded-[4px] font-medium shrink-0"
          >
            {t('common.retry', 'Retry')}
          </button>
        </div>
      )}

      {isLoadingLibrary && !hasManifest && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="border border-border rounded-[6px] bg-surface p-4 space-y-3 animate-pulse"
            >
              <div className="h-4 bg-surface-subtle rounded w-3/4" />
              <div className="h-3 bg-surface-subtle rounded w-full" />
              <div className="h-3 bg-surface-subtle rounded w-5/6" />
              <div className="flex gap-2 pt-2">
                <div className="h-6 bg-surface-subtle rounded w-16" />
                <div className="h-6 bg-surface-subtle rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoadingLibrary && filteredCount === 0 && (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-[6px] bg-surface text-center space-y-3">
          <Code2 className="h-8 w-8 text-text-secondary/40" />
          <p className="text-sm font-semibold text-text-primary">
            {t('script_runner.no_scripts_found', 'No scripts found matching the active filter criteria.')}
          </p>
          <p className="text-xs text-text-secondary max-w-sm">
            {t('script_runner.clear_filters_hint', 'Try clearing your search query or selecting another category above.')}
          </p>
          {(searchQuery || selectedCategory !== 'all' || selectedRisk !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onCategoryChange('all');
                onRiskChange('all');
              }}
              className="px-3 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border"
            >
              {t('script_runner.clear_filters', 'Clear Filters')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

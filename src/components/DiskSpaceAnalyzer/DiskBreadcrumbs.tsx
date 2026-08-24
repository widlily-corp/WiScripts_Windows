import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ArrowUp, Copy, Check, HardDrive } from 'lucide-react';

interface DiskBreadcrumbsProps {
  currentPath: string;
  baseRootPath: string;
  onNavigate: (path: string) => void;
  onNavigateUp: () => void;
  onCopyPath: (path: string) => void;
}

export const DiskBreadcrumbs: React.FC<DiskBreadcrumbsProps> = ({
  currentPath,
  baseRootPath,
  onNavigate,
  onNavigateUp,
  onCopyPath,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopyPath(currentPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isAtBaseRoot = !currentPath ||
    currentPath.replace(/[\\\/]+$/g, '').toLowerCase() === baseRootPath.replace(/[\\\/]+$/g, '').toLowerCase();

  // Split path into segments
  const segments: { label: string; path: string }[] = [];
  const normalized = currentPath.replace(/\//g, '\\');
  const parts = normalized.split('\\').filter(Boolean);

  let accumulated = '';
  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      accumulated = parts[0].includes(':') ? parts[0] + '\\' : parts[0];
      segments.push({ label: parts[0], path: accumulated });
    } else {
      accumulated = accumulated.endsWith('\\') ? accumulated + parts[i] : accumulated + '\\' + parts[i];
      segments.push({ label: parts[i], path: accumulated });
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-surface-subtle border border-border rounded-[6px]">
      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
        {/* Up One Level Button */}
        <button
          onClick={onNavigateUp}
          disabled={isAtBaseRoot}
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex-shrink-0"
          title={t('diskAnalyzer.upOneLevel', 'Up One Level')}
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>

        <span className="text-border-subtle">|</span>

        {/* Root Icon */}
        <button
          onClick={() => onNavigate(baseRootPath)}
          className="px-1.5 py-0.5 rounded text-xs font-mono text-text-muted hover:text-text hover:bg-surface-hover flex items-center gap-1 flex-shrink-0 transition-colors"
          title="Jump to root"
        >
          <HardDrive className="w-3.5 h-3.5 text-brand" />
          <span>{t('diskAnalyzer.breadcrumbsRoot', 'Root')}</span>
        </button>

        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={seg.path}>
              <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              <button
                onClick={() => onNavigate(seg.path)}
                className={'px-1.5 py-0.5 rounded text-xs font-mono truncate transition-colors flex-shrink-0 ' +
                  (isLast
                    ? 'font-bold text-brand bg-brand/10'
                    : 'text-text-muted hover:text-text hover:bg-surface-hover')}
                title={seg.path}
              >
                {seg.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Copy Path Quick Button */}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors flex-shrink-0"
        title={t('diskAnalyzer.copyPath', 'Copy Path')}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-status-success" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
};

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface AdminElevationBannerProps {
  featureName?: string;
}

export function AdminElevationBanner({ featureName }: AdminElevationBannerProps) {
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const setDryRunMode = useAppStore((s) => s.setDryRunMode);

  if (isElevated) {
    return null;
  }

  return (
    <div className="rounded-[6px] border border-status-warning/40 bg-status-warningSubtle p-4 text-xs space-y-2 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-status-warning font-semibold text-xs">
          <ShieldAlert className="h-4 w-4 shrink-0 text-status-warning" />
          <span>Administrator Elevation Required</span>
        </div>
        {!dryRunMode && (
          <button
            onClick={() => setDryRunMode(true)}
            className="px-2.5 py-1 rounded bg-status-warning/20 hover:bg-status-warning/30 text-status-warning font-mono text-[11px] border border-status-warning/40 transition-colors"
          >
            Enable Dry-Run Mode
          </button>
        )}
      </div>
      <p className="text-text-secondary leading-relaxed">
        WiScripts is running as a <strong>Standard User</strong>. {featureName ? featureName : 'This system operation'} requires elevated Administrator privileges for live execution. Live actions are disabled while non-elevated. Toggle <strong>Safety Dry-Run</strong> to simulate commands safely.
      </p>
    </div>
  );
}

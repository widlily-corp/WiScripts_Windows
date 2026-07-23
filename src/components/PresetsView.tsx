import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OptimizationProfile } from '../types';
import {
  Sparkles,
  Gamepad2,
  ShieldCheck,
  Briefcase,
  Play,
  Loader2,
  CheckCircle2,
  ListChecks,
  Zap,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Gamepad2: Gamepad2,
  ShieldCheck: ShieldCheck,
  Briefcase: Briefcase,
};

export function PresetsView() {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const profiles = useAppStore((s) => s.optimizationProfiles);
  const isLoadingProfiles = useAppStore((s) => s.isLoadingProfiles);

  const fetchOptimizationProfiles = useAppStore((s) => s.fetchOptimizationProfiles);
  const applyOptimizationProfile = useAppStore((s) => s.applyOptimizationProfile);

  useEffect(() => {
    if (profiles.length === 0 && !isLoadingProfiles) {
      fetchOptimizationProfiles();
    }
  }, [profiles.length, isLoadingProfiles, fetchOptimizationProfiles]);

  const handleApplyProfile = async (profileId: string) => {
    if (isExecuting) return;
    setActiveProfileId(profileId);
    try {
      await applyOptimizationProfile(profileId);
    } finally {
      setActiveProfileId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">Curated Optimization Presets</h2>
          </div>
          <p className="text-xs text-text-secondary">
            Apply 1-click tailored optimization profiles to configure services, telemetry, bloatware, and Explorer UI.
          </p>
        </div>

        {dryRunMode && (
          <span className="text-xs bg-status-successSubtle text-status-success px-3 py-1 rounded-[6px] border border-status-success/30 font-mono flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Safety Dry-Run Mode Active
          </span>
        )}
      </div>

      {isLoadingProfiles ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-text-muted text-xs">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <span>Loading curated optimization profiles...</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="py-16 text-center text-xs text-text-muted italic border border-dashed border-border-subtle rounded-[6px]">
          No profiles loaded. Click refresh to query profiles from Rust engine.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {profiles.map((profile) => {
            const IconComponent = ICON_MAP[profile.iconName] || Sparkles;
            const isRunning = activeProfileId === profile.id;

            return (
              <div
                key={profile.id}
                className="rounded-[6px] border border-border bg-surface p-5 flex flex-col justify-between space-y-5 hover:border-border-focus/50 transition-colors"
              >
                <div className="space-y-3">
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-[6px] bg-brand-subtle text-brand flex items-center justify-center border border-brand/20">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-mono uppercase bg-surface-subtle border border-border-subtle text-text-muted px-2 py-0.5 rounded">
                      {profile.ruleIds.length} Rules Included
                    </span>
                  </div>

                  {/* Profile Title & Description */}
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-text-primary">{profile.name}</h3>
                    <p className="text-xs text-text-secondary leading-relaxed">{profile.description}</p>
                  </div>

                  {/* Included Rule Badges */}
                  <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1">
                      <ListChecks className="h-3 w-3" /> Target Rules:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {profile.ruleIds.map((ruleId) => (
                        <span
                          key={ruleId}
                          className="text-[10px] font-mono bg-surface-subtle border border-border-subtle/80 text-text-secondary px-2 py-0.5 rounded"
                        >
                          {ruleId}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Apply Button */}
                <button
                  onClick={() => handleApplyProfile(profile.id)}
                  disabled={isExecuting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 transition-opacity shadow-sm"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Applying Profile...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      <span>Apply {profile.name}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

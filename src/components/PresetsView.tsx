import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { OptimizationProfile } from '../types';
import { invoke } from '@tauri-apps/api/core';
import {
  Sparkles,
  Gamepad2,
  ShieldCheck,
  Briefcase,
  Play,
  Loader2,
  ListChecks,
  Zap,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  X,
  History,
  Check,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Gamepad2: Gamepad2,
  ShieldCheck: ShieldCheck,
  Briefcase: Briefcase,
};

export interface WiScriptsProfile {
  $schema?: string;
  schemaVersion: string;
  format: 'wiscripts-configuration-profile';
  metadata: {
    id: string;
    name: string;
    description: string;
    author: string;
    created?: string;
    appVersion: string;
    osVersion?: string;
  };
  targetOs?: {
    minBuild?: string;
    supportedEditions?: string[];
  };
  optimizations: {
    enabledRuleIds: string[];
  };
  proFlowRules?: Array<{
    processName: string;
    targetPriority: string;
    coreAffinityMask?: string;
  }>;
  governorRules?: Array<{
    processName: string;
    targetPriority: string;
    coreAffinityMask?: string;
  }>;
  autoruns?: Array<{
    id: string;
    enabled: boolean;
  }>;
  integrity?: string;
}

export interface ProfileImportValidation {
  isValid: boolean;
  profile: WiScriptsProfile | null;
  validRuleIds: string[];
  unknownRuleIds: string[];
  errors: string[];
  warnings: string[];
}

export async function computeProfileSha256(data: unknown): Promise<string> {
  const copy = JSON.parse(JSON.stringify(data));
  delete copy.integrity;
  const jsonStr = typeof copy === 'string' ? copy : JSON.stringify(copy);
  const encoder = new TextEncoder();
  const buffer = encoder.encode(jsonStr);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function validateProfileData(
  parsed: unknown,
  knownRuleIds: Set<string>,
  hostBuild = 26100
): ProfileImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed || typeof parsed !== 'object') {
    return {
      isValid: false,
      profile: null,
      validRuleIds: [],
      unknownRuleIds: [],
      errors: ['Profile root must be a valid JSON object'],
      warnings: [],
    };
  }

  const profile = parsed as Partial<WiScriptsProfile>;

  if (profile.format !== 'wiscripts-configuration-profile') {
    errors.push("Invalid format header: expected 'wiscripts-configuration-profile'");
  }

  if (!profile.schemaVersion || !/^\d+\.\d+\.\d+$/.test(profile.schemaVersion)) {
    errors.push('Invalid or missing schemaVersion (expected semver, e.g. 1.0.0)');
  }

  if (!profile.metadata || !profile.metadata.id || !profile.metadata.name) {
    errors.push('Profile metadata missing required id or name');
  }

  if (!profile.optimizations || !Array.isArray(profile.optimizations.enabledRuleIds)) {
    errors.push('Profile missing optimizations.enabledRuleIds array');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      profile: null,
      validRuleIds: [],
      unknownRuleIds: [],
      errors,
      warnings,
    };
  }

  const validRuleIds: string[] = [];
  const unknownRuleIds: string[] = [];

  for (const id of profile.optimizations!.enabledRuleIds) {
    if (knownRuleIds.has(id)) {
      validRuleIds.push(id);
    } else {
      unknownRuleIds.push(id);
    }
  }

  if (unknownRuleIds.length > 0) {
    warnings.push(
      `Profile contains ${unknownRuleIds.length} unknown or obsolete tweak IDs that will be skipped: ${unknownRuleIds.join(', ')}`
    );
  }

  if (profile.targetOs?.minBuild) {
    const minBuildNum = parseInt(profile.targetOs.minBuild, 10);
    if (!isNaN(minBuildNum) && hostBuild < minBuildNum) {
      warnings.push(
        `Profile requires Windows Build ${minBuildNum}+ (Host is Build ${hostBuild}). Some 24H2-specific tweaks may not take effect.`
      );
    }
  }

  return {
    isValid: true,
    profile: profile as WiScriptsProfile,
    validRuleIds,
    unknownRuleIds,
    errors,
    warnings,
  };
}

export function PresetsView() {
  const { t } = useTranslation();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [importValidation, setImportValidation] = useState<ProfileImportValidation | null>(null);
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const profiles = useAppStore((s) => s.optimizationProfiles);
  const isLoadingProfiles = useAppStore((s) => s.isLoadingProfiles);
  const optimizations = useAppStore((s) => s.optimizations);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const appVersion = useAppStore((s) => s.appVersion);
  const addToast = useAppStore((s) => s.addToast);
  const addLog = useAppStore((s) => s.addLog);

  const fetchOptimizationProfiles = useAppStore((s) => s.fetchOptimizationProfiles);
  const applyOptimizationProfile = useAppStore((s) => s.applyOptimizationProfile);

  useEffect(() => {
    if (profiles.length === 0 && !isLoadingProfiles) {
      fetchOptimizationProfiles();
    }
  }, [profiles.length, isLoadingProfiles, fetchOptimizationProfiles]);

  const knownRuleIds = React.useMemo(() => {
    return new Set(optimizations.map((o) => o.id));
  }, [optimizations]);

  const hostBuildNum = React.useMemo(() => {
    if (systemInfo?.osBuild) {
      const match = /^(\d+)/.exec(systemInfo.osBuild);
      if (match) return parseInt(match[1], 10);
    }
    return 26100;
  }, [systemInfo]);

  const isButtonDisabled = isExecuting || (!isElevated && !dryRunMode);

  const handleApplyProfile = async (profileId: string) => {
    if (isButtonDisabled) return;
    setActiveProfileId(profileId);
    try {
      await applyOptimizationProfile(profileId);
    } finally {
      setActiveProfileId(null);
    }
  };

  // Export current configuration to .wiscripts JSON profile
  const handleExportProfile = async () => {
    try {
      const selectedRuleIds = optimizations.filter((o) => o.isSelected).map((o) => o.id);

      const profilePayload: WiScriptsProfile = {
        $schema: 'https://wiscripts.app/schemas/profile-v1.json',
        schemaVersion: '1.0.0',
        format: 'wiscripts-configuration-profile',
        metadata: {
          id: `wiscripts-profile-${Date.now()}`,
          name: 'My Custom Windows Profile',
          description: 'Exported WiScripts configuration profile for tweaks and debloat preferences.',
          author: 'WiScripts User',
          created: new Date().toISOString(),
          appVersion: appVersion || '1.0.0',
          osVersion: `${systemInfo?.osName || 'Windows 11'} (${systemInfo?.osBuild || '26100'})`,
        },
        targetOs: {
          minBuild: '22621',
          supportedEditions: ['Pro', 'Enterprise', 'Home', 'Workstation'],
        },
        optimizations: {
          enabledRuleIds: selectedRuleIds,
        },
        proFlowRules: [],
        governorRules: [],
        autoruns: [],
      };

      const checksum = await computeProfileSha256(profilePayload);
      profilePayload.integrity = checksum;

      const jsonBlob = new Blob([JSON.stringify(profilePayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(jsonBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `custom_profile_${new Date().toISOString().slice(0, 10)}.wiscripts`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addToast({
        type: 'success',
        title: 'Profile Exported',
        message: `Exported .wiscripts profile with ${selectedRuleIds.length} active tweaks (SHA-256: ${checksum.slice(0, 8)}...).`,
      });
      addLog({
        level: 'info',
        message: `Profile export generated successfully (Rules: ${selectedRuleIds.length}, SHA-256: ${checksum})`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: String(err),
      });
    }
  };

  // Import profile file trigger
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateProfileData(parsed, knownRuleIds, hostBuildNum);

      if (validation.isValid && validation.profile?.integrity) {
        const computedChecksum = await computeProfileSha256(validation.profile);
        if (computedChecksum !== validation.profile.integrity) {
          validation.warnings.push(
            'Cryptographic checksum warning: Profile content was modified since checksum generation.'
          );
        }
      }

      setImportValidation(validation);
      if (!validation.isValid) {
        addToast({
          type: 'error',
          title: 'Invalid Profile Format',
          message: validation.errors.join('; '),
        });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'File Read Error',
        message: `Failed to parse profile JSON: ${String(err)}`,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleApplyImportedProfile = async () => {
    if (!importValidation || !importValidation.profile) return;
    setIsApplyingImport(true);

    try {
      const { validRuleIds } = importValidation;

      // 1. Create Pre-flight safety snapshot
      if (!dryRunMode) {
        addLog({
          level: 'info',
          message: `Pre-flight safety snapshot: Capturing StateEngine baseline before profile import '${importValidation.profile.metadata.name}'`,
        });

        try {
          await invoke('create_preflight_snapshot', {
            description: `Pre-flight snapshot for profile: ${importValidation.profile.metadata.name}`,
            rule_ids: validRuleIds,
          });
        } catch (snapErr) {
          addLog({
            level: 'warn',
            message: `Snapshot warning: ${String(snapErr)}`,
          });
        }
      }

      // 2. Select matching rules in app store
      const currentOptimizations = useAppStore.getState().optimizations;
      currentOptimizations.forEach((item) => {
        const shouldBeSelected = validRuleIds.includes(item.id);
        if (item.isSelected !== shouldBeSelected) {
          useAppStore.getState().toggleOptimizationSelected(item.id);
        }
      });

      // 3. Apply optimizations batch
      await invoke('execute_optimizations', {
        selectedKeys: validRuleIds,
        dryRun: dryRunMode,
      });

      addToast({
        type: 'success',
        title: 'Profile Applied',
        message: `Successfully applied profile "${importValidation.profile.metadata.name}" (${validRuleIds.length} rules enabled).`,
      });

      addLog({
        level: 'info',
        message: `Profile '${importValidation.profile.metadata.name}' applied (${validRuleIds.length} rules, dryRun: ${dryRunMode})`,
      });

      setImportValidation(null);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Application Error',
        message: String(err),
      });
    } finally {
      setIsApplyingImport(false);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)] select-none">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".wiscripts,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-4 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">{t('presetsView.curatedTitle')}</h2>
          </div>
          <p className="text-xs text-text-secondary">
            {t('presetsView.curatedDesc')}
          </p>
        </div>

        {/* Toolbar & Profile Sync Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors shadow-sm"
          >
            <Upload className="h-3.5 w-3.5 text-brand" />
            <span>Import Profile (.wiscripts)</span>
          </button>

          <button
            onClick={handleExportProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5 text-brand" />
            <span>Export Profile</span>
          </button>

          {dryRunMode && (
            <span className="text-xs bg-status-successSubtle text-status-success px-3 py-1.5 rounded-[6px] border border-status-success/30 font-mono flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> {t('presetsView.dryRunActive')}
            </span>
          )}
        </div>
      </div>

      {/* Admin Elevation Warning Banner */}
      <AdminElevationBanner featureName={t('presetsView.adminBannerFeature')} />

      {/* Curated Profiles Grid */}
      {isLoadingProfiles ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-text-muted text-xs">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <span>{t('presetsView.loading')}</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="py-16 text-center text-xs text-text-muted italic border border-dashed border-border-subtle rounded-[6px]">
          {t('presetsView.noProfiles')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {profiles.map((profile) => {
            const IconComponent = ICON_MAP[profile.iconName] || Sparkles;
            const isRunning = activeProfileId === profile.id;

            return (
              <div
                key={profile.id}
                className="rounded-[6px] border border-border bg-surface p-5 flex flex-col justify-between space-y-5 hover:border-border-focus/50 transition-colors shadow-sm"
              >
                <div className="space-y-3">
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-[6px] bg-brand-subtle text-brand flex items-center justify-center border border-brand/20">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-mono uppercase bg-surface-subtle border border-border-subtle text-text-muted px-2 py-0.5 rounded">
                      {t('presetsView.rulesIncluded', { count: profile.ruleIds.length })}
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
                      <ListChecks className="h-3 w-3" /> {t('presetsView.targetRules')}
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
                  disabled={isButtonDisabled}
                  title={!isElevated && !dryRunMode ? t('presetsView.adminRequired') : ''}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('presetsView.applyingProfile')}</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      <span>{t('presetsView.applyProfileName', { name: profile.name })}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Imported Profile Review & Validation Modal */}
      {importValidation && importValidation.profile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-[8px] border border-border bg-surface p-6 shadow-2xl space-y-4 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-brand" />
                <h3 className="text-base font-semibold text-text-primary">
                  Review Imported .wiscripts Profile
                </h3>
              </div>
              <button
                onClick={() => setImportValidation(null)}
                className="p-1 rounded text-text-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Profile Metadata */}
            <div className="rounded-[6px] border border-border-subtle bg-surface-subtle p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Profile Name:</span>
                <span className="font-semibold text-text-primary">
                  {importValidation.profile.metadata.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Author / Origin:</span>
                <span className="text-text-secondary">
                  {importValidation.profile.metadata.author}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Schema Version:</span>
                <span className="font-mono text-text-secondary">
                  {importValidation.profile.schemaVersion}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted font-medium">Valid Tweak Rules:</span>
                <span className="font-bold text-brand">
                  {importValidation.validRuleIds.length} tweaks
                </span>
              </div>
            </div>

            {/* Warnings / Unknown Rules */}
            {importValidation.warnings.length > 0 && (
              <div className="space-y-1.5 rounded-[6px] border border-status-warning/40 bg-status-warningSubtle p-3 text-xs text-status-warning">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Profile Compatibility Warnings</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-text-secondary">
                  {importValidation.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Safety Guarantee Info */}
            <div className="flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface-subtle p-2.5 text-xs text-text-secondary">
              <History className="h-4 w-4 text-brand shrink-0" />
              <span>
                Pre-Flight Safety Snapshot will be created automatically before applying this profile.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <button
                onClick={() => setImportValidation(null)}
                className="px-4 py-2 rounded-[6px] border border-border text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyImportedProfile}
                disabled={isApplyingImport || isButtonDisabled}
                className="flex items-center gap-2 px-4 py-2 rounded-[6px] bg-brand text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-40 shadow-sm"
              >
                {isApplyingImport ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Applying Profile...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Apply Imported Profile</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

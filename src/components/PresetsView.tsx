import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { invoke } from '@tauri-apps/api/core';
import { ExecutionSummary } from '../types';
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
} from 'lucide-react';
import {
  WiScriptsProfile,
  ProfileImportValidation,
  computeProfileSha256,
  validateProfileData,
} from './Presets/profileUtils';
import { ProfileImportModal } from './Presets/ProfileImportModal';

export type { WiScriptsProfile, ProfileImportValidation };
export { computeProfileSha256, validateProfileData };

const ICON_MAP: Record<string, React.ElementType> = {
  Gamepad2: Gamepad2,
  ShieldCheck: ShieldCheck,
  Briefcase: Briefcase,
};

export function PresetsView() {
  const { t } = useTranslation();
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [importValidation, setImportValidation] = useState<ProfileImportValidation | null>(null);
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dryRunMode = useAppStore((s) => s.dryRunMode);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const isExecuting = useAppStore((s) => s.isExecuting);
  const setIsExecuting = useAppStore((s) => s.setIsExecuting);
  const openSafetyModal = useAppStore((s) => s.openSafetyModal);
  const profiles = useAppStore((s) => s.optimizationProfiles);
  const isLoadingProfiles = useAppStore((s) => s.isLoadingProfiles);
  const optimizations = useAppStore((s) => s.optimizations);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const appVersion = useAppStore((s) => s.appVersion);
  const addToast = useAppStore((s) => s.addToast);
  const addLog = useAppStore((s) => s.addLog);

  const fetchOptimizationProfiles = useAppStore((s) => s.fetchOptimizationProfiles);
  const applyOptimizationProfile = useAppStore((s) => s.applyOptimizationProfile);
  const fetchOptimizationsStatus = useAppStore((s) => s.fetchOptimizationsStatus);

  useEffect(() => {
    if (profiles.length === 0 && !isLoadingProfiles) {
      fetchOptimizationProfiles();
    }
  }, [profiles.length, isLoadingProfiles, fetchOptimizationProfiles]);

  const knownRuleIds = useMemo(() => {
    return new Set(optimizations.map((o) => o.id));
  }, [optimizations]);

  const hostBuildNum = useMemo(() => {
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
    } catch (err) {
      addToast({
        type: 'error',
        title: t('presetsView.applyErrorTitle', 'Profile Application Failed'),
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setActiveProfileId(null);
    }
  };

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
          osVersion: `${systemInfo?.osName || 'Windows 11'} (${systemInfo?.osBuild || ''})`,
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
        title: t('presetsView.exportSuccessTitle', 'Profile Exported'),
        message: t('presetsView.exportSuccessMsg', {
          count: selectedRuleIds.length,
          hash: checksum.slice(0, 8),
          defaultValue: `Exported .wiscripts profile with ${selectedRuleIds.length} active tweaks (SHA-256: ${checksum.slice(0, 8)}...).`,
        }),
      });
      addLog({
        level: 'info',
        message: `Profile export generated successfully (Rules: ${selectedRuleIds.length}, SHA-256: ${checksum})`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: t('presetsView.exportErrorTitle', 'Export Failed'),
        message: String(err),
      });
    }
  };

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
            t('presetsView.checksumWarning', 'Cryptographic checksum warning: Profile content was modified since checksum generation.')
          );
        }
      }

      setImportValidation(validation);
      if (!validation.isValid) {
        addToast({
          type: 'error',
          title: t('presetsView.invalidProfileTitle', 'Invalid Profile Format'),
          message: validation.errors.join('; '),
        });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: t('presetsView.fileReadErrorTitle', 'File Read Error'),
        message: `Failed to parse profile JSON: ${String(err)}`,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleApplyImportedProfile = () => {
    if (isButtonDisabled || !importValidation || !importValidation.profile) return;
    const { profile, validRuleIds } = importValidation;
    if (validRuleIds.length === 0) return;

    const validRuleIdSet = new Set(validRuleIds);
    const matchingRules = optimizations.filter((o) => validRuleIdSet.has(o.id));
    const highestRisk = matchingRules.some((r) => r.riskLevel === 'critical')
      ? 'critical'
      : matchingRules.some((r) => r.riskLevel === 'high')
      ? 'high'
      : matchingRules.some((r) => r.riskLevel === 'medium')
      ? 'medium'
      : 'low';

    setImportValidation(null);

    openSafetyModal({
      title: t('presetsView.safetyModalImportTitle', {
        name: profile.metadata.name,
        defaultValue: `Apply Imported Profile: ${profile.metadata.name}`,
      }),
      description: t('presetsView.safetyModalImportDesc', {
        count: validRuleIds.length,
        defaultValue: `Apply ${validRuleIds.length} optimization rules from "${profile.metadata.name}".`,
      }),
      riskLevel: highestRisk,
      commandsToRun: matchingRules.length > 0 ? matchingRules.map((r) => r.powershellCommand) : validRuleIds,
      onConfirmAction: async () => {
        const currentDryRun = useAppStore.getState().dryRunMode;
        setIsExecuting(true);
        setIsApplyingImport(true);
        try {
          const currentOptimizations = useAppStore.getState().optimizations;
          const updatedOptimizations = currentOptimizations.map((item) => ({
            ...item,
            isSelected: validRuleIdSet.has(item.id),
          }));
          useAppStore.getState().setOptimizations(updatedOptimizations);

          const summary = await invoke<ExecutionSummary>('execute_optimizations', {
            selectedKeys: validRuleIds,
            dryRun: currentDryRun,
          });

          await fetchOptimizationsStatus();

          if (summary && !summary.success) {
            const failed = summary.executedActions?.find((a) => a.output.exitCode !== 0);
            const errMsg = failed?.output.stderr?.trim() || failed?.output.stdout?.trim() || 'Execution failed';
            addToast({
              type: 'error',
              title: t('presetsView.applyErrorTitle', 'Profile Application Failed'),
              message: errMsg,
            });
          } else {
            addToast({
              type: 'success',
              title: t('presetsView.importAppliedTitle', 'Profile Applied'),
              message: t('presetsView.importAppliedMsg', {
                name: profile.metadata.name,
                count: validRuleIds.length,
                defaultValue: `Successfully applied profile "${profile.metadata.name}" (${validRuleIds.length} rules enabled).`,
              }),
            });
          }

          addLog({
            level: summary && !summary.success ? 'error' : 'info',
            message: `Profile '${profile.metadata.name}' applied (${validRuleIds.length} rules, dryRun: ${currentDryRun})`,
          });
        } catch (err) {
          addToast({
            type: 'error',
            title: t('presetsView.applyErrorTitle', 'Profile Application Failed'),
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setIsApplyingImport(false);
          setIsExecuting(false);
        }
      },
    });
  };

  return (
    <div className="p-6 space-y-6 select-none">
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
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExecuting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 transition-colors shadow-sm"
          >
            <Upload className="h-3.5 w-3.5 text-brand" />
            <span>{t('presetsView.importProfileBtn', 'Import Profile (.wiscripts)')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-border bg-surface-subtle text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5 text-brand" />
            <span>{t('presetsView.exportProfileBtn', 'Export Profile')}</span>
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
                  type="button"
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
      <ProfileImportModal
        validation={importValidation}
        isApplying={isApplyingImport}
        isButtonDisabled={isButtonDisabled}
        onClose={() => setImportValidation(null)}
        onApply={handleApplyImportedProfile}
      />
    </div>
  );
}

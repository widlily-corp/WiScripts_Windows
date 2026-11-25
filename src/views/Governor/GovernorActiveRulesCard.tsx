import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Trash2, Volume2 } from 'lucide-react';
import { ResourceGovernorRule } from '../../types/governor';
import { PRIORITIES } from './governorUtils';

interface GovernorActiveRulesCardProps {
  activeRules: ResourceGovernorRule[];
  onDeleteRule: (processName: string) => void;
}

export function GovernorActiveRulesCard({ activeRules, onDeleteRule }: GovernorActiveRulesCardProps) {
  const { t } = useTranslation();

  if (activeRules.length === 0) return null;

  return (
    <div className="rounded-[6px] bg-surface border border-border p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-text-primary">
        <ShieldCheck className="h-4 w-4 text-brand" />
        {t('governor.active_rules_title', 'Configured Governor Rules')} ({activeRules.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted font-mono uppercase tracking-wider">
              <th className="py-2 px-3">{t('governor.process_name', 'Process Name')}</th>
              <th className="py-2 px-3">{t('governor.target_priority', 'Target Priority')}</th>
              <th className="py-2 px-3">{t('governor.affinity_mask', 'Core Mask')}</th>
              <th className="py-2 px-3">{t('governor.audio_endpoint', 'Audio Route')}</th>
              <th className="py-2 px-3">{t('governor.auto_trim_threshold', 'Auto Trim RAM')}</th>
              <th className="py-2 px-3 text-right">{t('common.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {activeRules.map((rule) => {
              const prio = PRIORITIES.find((p) => p.id === rule.targetPriority);
              return (
                <tr key={rule.processName} className="hover:bg-surface-hover/50">
                  <td className="py-2.5 px-3 font-mono text-text-primary font-medium">
                    {rule.processName}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${prio?.color || ''}`}>
                      {prio ? t(prio.labelKey, prio.defaultLabel) : rule.targetPriority}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-text-secondary">
                    {rule.coreAffinityMask}
                  </td>
                  <td className="py-2.5 px-3 text-text-muted">
                    {rule.audioEndpointId ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Volume2 className="h-3 w-3" />
                        {t('governor.endpointRouted', 'Endpoint Routed')}
                      </span>
                    ) : (
                      t('governor.defaultRoute', 'Default')
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-text-muted">
                    {rule.autoTrimMemoryMbThreshold
                      ? `> ${rule.autoTrimMemoryMbThreshold} MB`
                      : t('governor.disabled', 'Disabled')}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteRule(rule.processName)}
                      className="p-1.5 text-text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                      title={t('common.delete', 'Delete Rule')}
                      aria-label={t('common.delete', 'Delete Rule')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

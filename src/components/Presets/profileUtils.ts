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

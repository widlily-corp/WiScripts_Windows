export type ScriptRiskLevel = 'safe' | 'elevated' | 'critical';

export type ScriptCategory =
  | 'all'
  | 'maintenance'
  | 'network'
  | 'security'
  | 'performance'
  | 'diagnostics';

export interface ScriptParameter {
  name: string;
  type: string;
  default?: unknown;
  description: string;
}

export interface ScriptManifestEntry {
  id: string;
  name: string;
  category: string;
  path: string;
  description: string;
  riskLevel: ScriptRiskLevel;
  requiresAdmin: boolean;
  author: string;
  version: string;
  tags: string[];
  sha256: string;
  parameters?: ScriptParameter[];
}

export interface ScriptsLibraryManifest {
  schemaVersion: string;
  version: string;
  lastUpdated: string;
  repositoryUrl: string;
  rawBaseUrl: string;
  scripts: ScriptManifestEntry[];
}

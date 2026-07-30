export interface AutorunEntry {
  id: string;
  location: string;
  name: string;
  imagePath: string;
  publisher: string;
  signatureStatus: 'Valid' | 'Unsigned' | 'InvalidCertificate' | 'Unknown';
  enabled: boolean;
  riskScore: number;
}

export interface QuarantineResult {
  entryId: string;
  quarantinedPath: string;
  backupRegistryKey: string;
  success: boolean;
  error?: string | null;
}

export type AutorunCategoryFilter =
  | 'all'
  | 'high_risk'
  | 'registry'
  | 'tasks'
  | 'services';

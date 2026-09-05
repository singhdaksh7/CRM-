export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PortalConnectionSummary {
  id: string;
  provider: string;
  status: string;
  connectionMode: string;
  displayName: string | null;
  /** Never the credential itself - only whether one is on file, so dry-run output can never leak a secret. */
  hasCredentialReference: boolean;
}

export interface PreflightResult {
  passed: boolean;
  checks: CheckResult[];
  resolvedHost: string;
  organizationExists: boolean;
  handoverAdminId: string | null;
  expectedMigrationCount: number;
  appliedMigrationCount: number | null;
  portalConnections: PortalConnectionSummary[];
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

export interface DryRunReport {
  preflight: PreflightResult;
  organizationId: string;
  totalUserCount: number;
  usersToDelete: UserSummary[];
  usersToPreserve: UserSummary[];
  /** Per-model row counts that `--execute` would delete, in deletion order. */
  deletionCounts: Record<string, number>;
  deletionOrder: string[];
  preservedTables: string[];
  objectKeysDiscovered: string[];
  warnings: string[];
}

export interface ExecuteResult {
  deletionCounts: Record<string, number>;
  deletedUserCount: number;
  preservedAdminId: string;
  durationMs: number;
}

import { prisma } from "./prisma";
import { getOrganizationId } from "./organization";
import { cached, invalidateCache } from "./cache";

const SYSTEM_CONFIG_CACHE_TTL_SECONDS = 60;

/**
 * Previously-hardcoded business rules (Phase 3, Module 7). Every field here
 * has a safe built-in default matching the value that used to be a literal
 * constant elsewhere in the codebase - moving a rule under admin control is
 * an additive change to `DEFAULT_SYSTEM_CONFIG`, never a breaking one.
 */
export interface SystemConfigValues {
  /** Lead score at/above which a lead is treated as HOT (src/lib/scoring.ts historically hardcoded this). */
  hotLeadThreshold: number;
  /** Lead scoring factor weights, must roughly sum to 100. */
  healthScoreWeights: {
    location: number;
    budget: number;
    bhk: number;
    furnishing: number;
    availability: number;
    type: number;
  };
  /** Matching radius in kilometers used by nearby-properties/lead matching. */
  matchingRadiusKm: number;
  /** How far above a lead's stated max budget a property may be and still match. */
  matchingBudgetTolerancePct: number;
  /** Hours allowed before a follow-up is considered overdue. */
  followUpSlaHours: number;
  /** Minutes before a scheduled visit that a reminder notification should fire. */
  visitReminderMinutesBefore: number;
  /** Minimum minutes between repeat notifications of the same type to the same user. */
  notificationThrottleMinutes: number;
  /** Days after creation that a catalogue share auto-expires if no expiresAt was set explicitly. */
  catalogueExpiryDays: number;
  /** Business hours, 24h local time. */
  businessHours: {
    startHour: number;
    endHour: number;
  };
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfigValues = {
  hotLeadThreshold: 70,
  healthScoreWeights: {
    location: 25,
    budget: 30,
    bhk: 20,
    furnishing: 10,
    availability: 8,
    type: 7,
  },
  matchingRadiusKm: 5,
  matchingBudgetTolerancePct: 20,
  followUpSlaHours: 24,
  visitReminderMinutesBefore: 60,
  notificationThrottleMinutes: 60,
  catalogueExpiryDays: 14,
  businessHours: {
    startHour: 9,
    endHour: 20,
  },
};

/** Deep-merges a partial config blob (as stored in SystemConfig.values) over the defaults - never trusts the stored blob to have every key. */
export function mergeSystemConfig(overrides: Partial<SystemConfigValues> | null | undefined): SystemConfigValues {
  if (!overrides) return DEFAULT_SYSTEM_CONFIG;
  return {
    ...DEFAULT_SYSTEM_CONFIG,
    ...overrides,
    healthScoreWeights: { ...DEFAULT_SYSTEM_CONFIG.healthScoreWeights, ...overrides.healthScoreWeights },
    businessHours: { ...DEFAULT_SYSTEM_CONFIG.businessHours, ...overrides.businessHours },
  };
}

export async function getSystemConfig(organizationId?: string): Promise<SystemConfigValues> {
  const orgId = organizationId ?? getOrganizationId();
  return cached(`system-config:${orgId}`, SYSTEM_CONFIG_CACHE_TTL_SECONDS, async () => {
    const row = await prisma.systemConfig.findUnique({ where: { organizationId: orgId } });
    if (!row) return DEFAULT_SYSTEM_CONFIG;
    try {
      return mergeSystemConfig(JSON.parse(row.values) as Partial<SystemConfigValues>);
    } catch {
      return DEFAULT_SYSTEM_CONFIG;
    }
  });
}

export async function updateSystemConfig(params: {
  organizationId?: string;
  updatedById: string;
  patch: Partial<SystemConfigValues>;
}): Promise<SystemConfigValues> {
  const orgId = params.organizationId ?? getOrganizationId();
  const existing = await prisma.systemConfig.findUnique({ where: { organizationId: orgId } });
  const currentOverrides = existing ? (JSON.parse(existing.values) as Partial<SystemConfigValues>) : {};
  const nextOverrides: Partial<SystemConfigValues> = {
    ...currentOverrides,
    ...params.patch,
    healthScoreWeights: params.patch.healthScoreWeights
      ? { ...currentOverrides.healthScoreWeights, ...params.patch.healthScoreWeights }
      : currentOverrides.healthScoreWeights,
    businessHours: params.patch.businessHours
      ? { ...currentOverrides.businessHours, ...params.patch.businessHours }
      : currentOverrides.businessHours,
  };

  await prisma.systemConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, values: JSON.stringify(nextOverrides), updatedById: params.updatedById },
    update: { values: JSON.stringify(nextOverrides), updatedById: params.updatedById },
  });

  await invalidateCache(`system-config:${orgId}`);
  return mergeSystemConfig(nextOverrides);
}

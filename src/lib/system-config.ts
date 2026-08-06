import { prisma } from "./prisma";
import { getOrganizationId } from "./organization";
import { cached, invalidateCache } from "./cache";
import { logger } from "./logger";

const SYSTEM_CONFIG_CACHE_TTL_SECONDS = 60;

/**
 * Previously-hardcoded business rules (Phase 3, Module 7). Every field here
 * has a safe built-in default matching the value that used to be a literal
 * constant elsewhere in the codebase - moving a rule under admin control is
 * an additive change to `DEFAULT_SYSTEM_CONFIG`, never a breaking one.
 *
 * -------------------------------------------------------------------------
 * Config integration matrix (staging review, 2026-08-06)
 * -------------------------------------------------------------------------
 * ACTIVE  - read by real business logic today, changing it changes behavior:
 *   hotLeadThreshold            -> scoring.ts computeLeadScore (HOT cutoff)
 *   matchingBudgetTolerancePct  -> scoring.ts + lead-matching.ts (property-match tolerance)
 *   followUpSlaHours            -> notifications.ts notifyHotLeadsNoFollowUp cutoff
 *   staleLeadDays               -> rules/lead-health.ts "Stale lead"/"Going quiet" thresholds
 *   stalePropertyDays           -> rules/property-health.ts "Stale availability" threshold
 *   catalogueFollowUpDelayHours -> notifications.ts notifyCatalogueNoResponse cutoff
 *
 * FUTURE  - stored and displayed, but not read by any code path yet
 *   (INACTIVE_CONFIG_KEYS below - UI must disable editing and label
 *   "Not active yet", never present these as if they take effect):
 *   healthScoreWeights          -> matching.ts's WEIGHTS constant matches this shape
 *                                  exactly, but is not threaded through (12 call
 *                                  sites across matching/scoring/lead-matching);
 *                                  wiring it is a follow-up, not done in this pass
 *                                  to avoid destabilizing the matching algorithm
 *                                  under time pressure.
 *   matchingRadiusKm            -> nearby-properties.ts uses a fixed, user-selected
 *                                  enum of allowed radii (1/3/5/10km) per API call,
 *                                  not a single configurable default - doesn't map
 *                                  onto this field without a UX change.
 *   visitReminderMinutesBefore  -> no "visit reminder" notification exists in the
 *                                  NotificationType enum or notification sweep at
 *                                  all yet - genuinely unimplemented, not just unwired.
 *   notificationThrottleMinutes -> the notification sweep already has several
 *                                  distinct per-rule dedup windows (24h/48h/72h/7d)
 *                                  hardcoded per notifyXxx function; a single global
 *                                  override would change several of them
 *                                  simultaneously and inconsistently, so it is left
 *                                  unwired rather than risk a silent behavior change.
 *   catalogueExpiryDays         -> catalogues.ts createCatalogue() has no auto-expiry
 *                                  fallback at all today (expiresAt stays null/never-
 *                                  expires unless the caller sets it explicitly);
 *                                  wiring this would be a real behavior change
 *                                  (catalogues that never expired would start
 *                                  expiring), not just "wiring an existing value",
 *                                  so it is left unwired.
 *   businessHours                -> reserved for a future "don't send WhatsApp/
 *                                  notify outside business hours" feature; no such
 *                                  gate exists in the codebase yet.
 * -------------------------------------------------------------------------
 */
export interface SystemConfigValues {
  /** ACTIVE - Lead score at/above which a lead is treated as HOT (src/lib/scoring.ts). */
  hotLeadThreshold: number;
  /** FUTURE - matching.ts's WEIGHTS constant matches this shape but is not wired to it yet. */
  healthScoreWeights: {
    location: number;
    budget: number;
    bhk: number;
    furnishing: number;
    availability: number;
    type: number;
  };
  /** FUTURE - nearby-properties.ts uses a fixed per-request radius enum, not this field. */
  matchingRadiusKm: number;
  /** ACTIVE - src/lib/scoring.ts + src/lib/lead-matching.ts property-match budget tolerance. */
  matchingBudgetTolerancePct: number;
  /** ACTIVE - src/lib/notifications.ts notifyHotLeadsNoFollowUp cutoff. */
  followUpSlaHours: number;
  /** FUTURE - no visit-reminder notification exists in this codebase yet. */
  visitReminderMinutesBefore: number;
  /** FUTURE - each notification sweep rule has its own distinct hardcoded dedup window; not safely collapsible into one global knob without changing several of them. */
  notificationThrottleMinutes: number;
  /** FUTURE - catalogues never auto-expire today; wiring this would be a real behavior change, not just "wiring an existing value". */
  catalogueExpiryDays: number;
  /** FUTURE - reserved for a not-yet-built "quiet hours" notification gate. */
  businessHours: {
    startHour: number;
    endHour: number;
  };
  /** ACTIVE - rules/lead-health.ts "Stale lead" threshold (days since last contact); "Going quiet" fires at half this value. */
  staleLeadDays: number;
  /** ACTIVE - rules/property-health.ts "Stale availability" threshold (days since last update). */
  stalePropertyDays: number;
  /** ACTIVE - notifications.ts notifyCatalogueNoResponse cutoff (hours since last view with no client response). */
  catalogueFollowUpDelayHours: number;
}

/** Keys the Settings UI must render read-only with a "Not active yet" badge - see the FUTURE section of the matrix above. Exported so the UI and this module can never drift apart on which fields are real. */
export const INACTIVE_CONFIG_KEYS: readonly (keyof SystemConfigValues)[] = [
  "healthScoreWeights",
  "matchingRadiusKm",
  "visitReminderMinutesBefore",
  "notificationThrottleMinutes",
  "catalogueExpiryDays",
  "businessHours",
];

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
  staleLeadDays: 14,
  stalePropertyDays: 30,
  catalogueFollowUpDelayHours: 24,
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

/**
 * Falls back to DEFAULT_SYSTEM_CONFIG - never throws - even if the
 * `system_configs` table itself doesn't exist yet (the Phase 3 migration
 * hasn't been applied to this database). This function is now called from
 * core write paths (lead creation, visit completion, lead scoring, the
 * notification sweep) via scoring.ts/lead-matching.ts/notifications.ts/
 * rules/lead-health.ts/rules/property-health.ts - a missing table here must
 * degrade to "use the old hardcoded defaults", never break lead creation.
 */
export async function getSystemConfig(organizationId?: string): Promise<SystemConfigValues> {
  const orgId = organizationId ?? getOrganizationId();
  return cached(`system-config:${orgId}`, SYSTEM_CONFIG_CACHE_TTL_SECONDS, async () => {
    let row;
    try {
      row = await prisma.systemConfig.findUnique({ where: { organizationId: orgId } });
    } catch (err) {
      logger.warn("system_config_lookup_failed", { organizationId: orgId, message: err instanceof Error ? err.message : String(err) });
      return DEFAULT_SYSTEM_CONFIG;
    }
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

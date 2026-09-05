/**
 * Ordered, dependency-safe deletion plan for the handover reset.
 *
 * Derived directly from prisma/schema.prisma as it exists at this commit
 * (see the task's schema-inspection step) - children before parents,
 * following each model's actual foreign keys rather than a remembered/
 * assumed table list. Reuses the same leaf-to-root structure already
 * proven correct for this exact schema in src/lib/demo-data/teardown.ts
 * (including its documented P2003 regression fix), widened from
 * "kp-demo-" id-prefixed rows to every row belonging to org_default - this
 * tool resets the WHOLE tenant's operational data, not just the demo
 * subset.
 *
 * Ordering notes (Prisma's referential-action defaults: SetNull for
 * optional FKs without an explicit onDelete, Restrict for required FKs
 * without one):
 *  - Required, non-cascade FKs are the only HARD ordering constraints.
 *    Every one found in this schema points at Property, Lead,
 *    InventoryPartner, PropertyImage, or User - so as long as (a) every
 *    table below is deleted before the Property/Lead/InventoryPartner/
 *    PropertyImage rows it required-references, and (b) every User except
 *    the preserved admin is deleted dead last, no FK violation is possible.
 *  - PropertyPortalConnection is deliberately ABSENT from this plan - see
 *    the task's PropertyPortalConnection policy. It is never deleted here.
 *  - `_prisma_migrations`, Organization, and SystemConfig are likewise
 *    absent - never touched by this tool.
 */

export type ResetModelKey =
  | "leadAssignmentHistory"
  | "catalogueVersionEvent"
  | "cataloguePropertyPreference"
  | "catalogueShareProperty"
  | "catalogueInteraction"
  | "requirementBroadcastRecipient"
  | "requirementBroadcast"
  | "dealOffer"
  | "matchRecommendation"
  | "propertyRecommendation"
  | "whatsAppMessage"
  | "whatsAppConversation"
  | "catalogueShare"
  | "portalOperation"
  | "externalLeadEvent"
  | "portalListing"
  | "sharedPropertyLog"
  | "payment"
  | "brokerageCalculation"
  | "document"
  | "deal"
  | "visitFeedback"
  | "visitProperty"
  | "propertyAvailabilityReport"
  | "propertyReport"
  | "visit"
  | "followUp"
  | "leadScoreHistory"
  | "leadTransfer"
  | "activity"
  | "notification"
  | "savedView"
  | "propertyFavorite"
  | "propertyViewLog"
  | "propertyImage"
  | "storageUploadSession"
  | "propertyTimelineEvent"
  | "leadPhone"
  | "customerRequirement"
  | "lead"
  | "customerContact"
  | "property"
  | "propertyLocality"
  | "owner"
  | "inventoryPartner"
  | "importRecord"
  | "importJob"
  | "importMappingPreset"
  | "auditLog"
  | "restoreValidation"
  | "backupRecord"
  | "automationRule"
  | "employeeServiceArea"
  | "leadAssignmentRule"
  | "accountSetupToken"
  | "passwordResetToken"
  | "integrationWebhookEvent";

/** Minimal structural type - deliberately loose `where`, same reasoning as teardown.ts's CountableClient. */
type DeleteManyModel = { deleteMany(args: { where: unknown }): Promise<{ count: number }> };
/** `user` is deleted separately (last, preserved-admin-excluded) by executeReset() itself - not part of DELETION_PLAN - but still needs a slot on the transactional client type. */
export type ResetTransactionClient = Record<ResetModelKey | "user", DeleteManyModel>;

export interface DeletionStep {
  model: ResetModelKey;
  /** Builds this step's `where` filter, always organizationId-scoped (belt-and-suspenders like teardown.ts, even where a relation filter alone would suffice). */
  where(organizationId: string): unknown;
}

const orgScoped = (organizationId: string) => ({ organizationId });

export const DELETION_PLAN: DeletionStep[] = [
  // --- Phase 5+6 / matching workflow children ---
  { model: "leadAssignmentHistory", where: orgScoped },
  { model: "catalogueVersionEvent", where: orgScoped },
  { model: "cataloguePropertyPreference", where: orgScoped },
  { model: "catalogueShareProperty", where: (organizationId) => ({ catalogueShare: { organizationId } }) },
  { model: "catalogueInteraction", where: orgScoped },
  { model: "requirementBroadcastRecipient", where: (organizationId) => ({ requirementBroadcast: { organizationId } }) },
  { model: "requirementBroadcast", where: orgScoped },
  { model: "dealOffer", where: orgScoped },
  { model: "matchRecommendation", where: orgScoped },
  { model: "propertyRecommendation", where: orgScoped },

  // --- WhatsApp + Catalogue tree ---
  { model: "whatsAppMessage", where: orgScoped },
  { model: "whatsAppConversation", where: orgScoped },
  { model: "catalogueShare", where: orgScoped },

  // --- Property-portal operational data (PropertyPortalConnection itself is
  // NEVER included here - see module doc comment and the R2/portal policy). ---
  { model: "portalOperation", where: orgScoped },
  { model: "externalLeadEvent", where: orgScoped },
  { model: "portalListing", where: orgScoped },

  // --- Shared logs / Deal tree ---
  { model: "sharedPropertyLog", where: orgScoped },
  { model: "payment", where: orgScoped },
  { model: "brokerageCalculation", where: orgScoped },
  { model: "document", where: orgScoped },
  { model: "deal", where: orgScoped },

  // --- Visits (and everything with a required FK into Visit/Property) ---
  { model: "visitFeedback", where: orgScoped },
  { model: "visitProperty", where: orgScoped },
  { model: "propertyAvailabilityReport", where: orgScoped },
  { model: "propertyReport", where: orgScoped },
  { model: "visit", where: orgScoped },

  // --- Follow-ups, activity/notification timeline ---
  { model: "followUp", where: orgScoped },
  { model: "leadScoreHistory", where: orgScoped },
  { model: "leadTransfer", where: orgScoped },
  { model: "activity", where: orgScoped },
  { model: "notification", where: orgScoped },
  { model: "savedView", where: orgScoped },

  // --- Property engagement / media ---
  { model: "propertyFavorite", where: (organizationId) => ({ property: { organizationId } }) },
  { model: "propertyViewLog", where: (organizationId) => ({ property: { organizationId } }) },
  { model: "propertyImage", where: orgScoped },
  { model: "storageUploadSession", where: orgScoped },
  { model: "propertyTimelineEvent", where: orgScoped },

  // --- Core entities (dependency chain: CustomerRequirement -> Lead -> CustomerContact -> Property) ---
  { model: "leadPhone", where: orgScoped },
  { model: "customerRequirement", where: orgScoped },
  { model: "lead", where: orgScoped },
  { model: "customerContact", where: orgScoped },
  { model: "property", where: orgScoped },
  { model: "propertyLocality", where: orgScoped },
  { model: "owner", where: orgScoped },
  { model: "inventoryPartner", where: orgScoped },

  // --- Imports (includes Housing.com HOUSING_LEADS import jobs/records - see
  // migration 20260905020000_housing_leads_import_entity_type; ImportEntityType
  // is not itself scoped by, and this deletion is not conditioned on, entityType -
  // every ImportJob/ImportRecord row for org_default is in scope, HOUSING_LEADS included) ---
  { model: "importRecord", where: (organizationId) => ({ importJob: { organizationId } }) },
  { model: "importJob", where: orgScoped },
  { model: "importMappingPreset", where: orgScoped },

  // --- Audit / backup metadata ---
  { model: "auditLog", where: orgScoped },
  { model: "restoreValidation", where: orgScoped },
  { model: "backupRecord", where: orgScoped },

  // --- Automation / assignment configuration ---
  { model: "automationRule", where: orgScoped },
  { model: "employeeServiceArea", where: orgScoped },
  { model: "leadAssignmentRule", where: orgScoped },

  // --- Auth-adjacent tokens (must precede User deletion - Cascade FK, but
  // deleted explicitly here for accurate per-model counts, same reasoning
  // as teardown.ts's own explicit-before-cascade deletes) ---
  { model: "accountSetupToken", where: orgScoped },
  { model: "passwordResetToken", where: orgScoped },

  // --- Standalone webhook idempotency ledger ---
  { model: "integrationWebhookEvent", where: orgScoped },
];

/** Every model this tool is capable of touching, for tests that assert nothing outside this list is ever written to. */
export const DELETION_MODEL_KEYS: ResetModelKey[] = DELETION_PLAN.map((s) => s.model);

/**
 * Guards against production schema drift: prisma/schema.prisma (and
 * prisma/migrations/) can describe columns that were never actually applied
 * to the production database, because a migration was merged but
 * `prisma migrate deploy` was never run against it. tsc/prisma validate
 * can't catch this - they only check the schema file and the generated
 * client against each other, not the live database. Checked here via a
 * read-only information_schema query so a gap like this produces a clear
 * pre-write FAIL instead of a runtime P2022 mid-seed (see
 * prisma/manual-migrations/2026-08-06-catalogue-share-properties-drift-fix.sql
 * for the concrete drift this caught: catalogue_share_properties was
 * missing internalNote/isTopPick/addedManually/addedByUserId in production).
 */
export interface RequiredColumn {
  table: string;
  column: string;
}

/** Every catalogue_share_properties column that createDemoCatalogues() (src/lib/demo-data/catalogues.ts) and the real catalogue-sharing code path write to, beyond the columns present since the original init migration. */
export const REQUIRED_CATALOGUE_COLUMNS: readonly RequiredColumn[] = [
  { table: "catalogue_share_properties", column: "internalNote" },
  { table: "catalogue_share_properties", column: "isTopPick" },
  { table: "catalogue_share_properties", column: "addedManually" },
  { table: "catalogue_share_properties", column: "addedByUserId" },
];

export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface CatalogueSchemaCheckResult {
  ok: boolean;
  missing: RequiredColumn[];
}

export async function checkCatalogueSchemaCompatibility(
  client: RawQueryClient,
  required: readonly RequiredColumn[] = REQUIRED_CATALOGUE_COLUMNS
): Promise<CatalogueSchemaCheckResult> {
  const tables = [...new Set(required.map((r) => r.table))];
  const rows = await client.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    tables
  );
  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = required.filter((r) => !present.has(`${r.table}.${r.column}`));
  return { ok: missing.length === 0, missing };
}

/**
 * Phase 4 - every table AND every column the demo seeder writes to (or, for
 * the handful marked below, that Phase 4 added but the demo seeder itself
 * doesn't touch - listed anyway so this check is exhaustive against
 * schema.prisma, not just "whatever the seeder happens to need today").
 * Higher drift risk than a single-column gap (the catalogue_share_properties
 * incident above) since 9 whole tables plus columns on 5 existing tables
 * land in one migration - checked the same way, reusing
 * checkCatalogueSchemaCompatibility's underlying logic (it's generic
 * despite the name; only the constant differs). Cross-checked field-for-field
 * against prisma/manual-migrations/2026-08-07-phase4-field-operations.sql.
 */
export const REQUIRED_PHASE4_TABLES: readonly RequiredColumn[] = [
  // 9 new tables (every column)
  { table: "inventory_partners", column: "partnerCode" },
  { table: "inventory_partners", column: "name" },
  { table: "inventory_partners", column: "phone" },
  { table: "inventory_partners", column: "commissionSplitPct" },
  { table: "inventory_partners", column: "isActive" },
  { table: "property_timeline_events", column: "eventType" },
  { table: "property_timeline_events", column: "fromValue" },
  { table: "property_timeline_events", column: "toValue" },
  { table: "property_availability_reports", column: "photoId" },
  { table: "property_availability_reports", column: "reason" },
  { table: "property_availability_reports", column: "status" },
  { table: "property_reports", column: "type" },
  { table: "property_reports", column: "status" },
  { table: "visit_feedback", column: "willVisitAgain" },
  { table: "visit_feedback", column: "budgetIssue" },
  { table: "visit_feedback", column: "areaIssue" },
  { table: "visit_feedback", column: "parkingIssue" },
  { table: "visit_feedback", column: "familyRejected" },
  { table: "visit_feedback", column: "ownerRejected" },
  { table: "visit_feedback", column: "negotiationRequired" },
  { table: "lead_assignment_history", column: "method" },
  { table: "lead_assignment_history", column: "toUserId" },
  { table: "catalogue_version_events", column: "changeType" },
  { table: "catalogue_version_events", column: "version" },
  { table: "property_favorites", column: "propertyId" },
  { table: "property_favorites", column: "userId" },
  { table: "property_view_logs", column: "propertyId" },
  { table: "property_view_logs", column: "userId" },
  // properties - all 15 new columns
  { table: "properties", column: "inventorySource" },
  { table: "properties", column: "partnerId" },
  { table: "properties", column: "buildingName" },
  { table: "properties", column: "flatNumber" },
  { table: "properties", column: "gateNumber" },
  { table: "properties", column: "propertySource" },
  { table: "properties", column: "keyAvailability" },
  { table: "properties", column: "entryInstructions" },
  { table: "properties", column: "internalNotes" },
  { table: "properties", column: "negotiationNotes" },
  { table: "properties", column: "hiddenRemarks" },
  { table: "properties", column: "imagesUpdatedAt" },
  { table: "properties", column: "pendingVerification" },
  { table: "properties", column: "lastVerifiedAt" },
  { table: "properties", column: "lastVerifiedById" },
  // catalogue_share_properties - all 6 new columns
  { table: "catalogue_share_properties", column: "executiveStatus" },
  { table: "catalogue_share_properties", column: "executiveStatusUpdatedAt" },
  { table: "catalogue_share_properties", column: "executiveStatusUpdatedById" },
  { table: "catalogue_share_properties", column: "executiveStatusNote" },
  { table: "catalogue_share_properties", column: "removedAt" },
  { table: "catalogue_share_properties", column: "removedReason" },
  // one column each on notifications/activities/catalogue_shares
  { table: "notifications", column: "inventoryPartnerId" },
  { table: "activities", column: "inventoryPartnerId" },
  { table: "catalogue_shares", column: "version" },
];

export async function checkPhase4SchemaCompatibility(client: RawQueryClient): Promise<CatalogueSchemaCheckResult> {
  return checkCatalogueSchemaCompatibility(client, REQUIRED_PHASE4_TABLES);
}

/** The 6 brand-new Phase 4 enum types (not extensions of a pre-existing enum - those are checked via checkNotificationTypeEnumInProduction in enum-compat.ts instead, since only an *extended* enum can have a stale value set). A column-existence check alone can't distinguish "column exists but references an incomplete enum type" from "column exists and the type is fully populated" - checked explicitly here via pg_type so a partially-applied migration (unlikely, but the whole point of this file is not assuming "unlikely" away) still fails loudly. */
export const REQUIRED_PHASE4_ENUM_TYPES: readonly string[] = [
  "InventorySource",
  "CatalogueExecutiveStatus",
  "AvailabilityReportStatus",
  "AvailabilityReportReason",
  "PropertyReportType",
  "PropertyReportStatus",
];

export interface EnumTypeCheckResult {
  ok: boolean;
  missing: string[];
}

export async function checkPhase4EnumTypesExist(
  client: RawQueryClient,
  required: readonly string[] = REQUIRED_PHASE4_ENUM_TYPES
): Promise<EnumTypeCheckResult> {
  const rows = await client.$queryRawUnsafe<{ typname: string }[]>(
    `SELECT typname FROM pg_type WHERE typname = ANY($1::text[])`,
    required
  );
  const present = new Set(rows.map((r) => r.typname));
  const missing = required.filter((t) => !present.has(t));
  return { ok: missing.length === 0, missing };
}

export const REQUIRED_PHASE5_TABLES: readonly RequiredColumn[] = [
  { table: "deals", column: "expectedBrokerageAmount" }, { table: "deals", column: "kpSharePct" }, { table: "deals", column: "partnerSharePct" }, { table: "deals", column: "closingNotes" },
  { table: "deal_offers", column: "organizationId" }, { table: "deal_offers", column: "dealId" }, { table: "deal_offers", column: "side" }, { table: "deal_offers", column: "createdById" },
  { table: "requirement_broadcasts", column: "organizationId" }, { table: "requirement_broadcasts", column: "leadId" }, { table: "requirement_broadcasts", column: "requirementSnapshot" }, { table: "requirement_broadcasts", column: "messageSnapshot" }, { table: "requirement_broadcasts", column: "status" },
  { table: "requirement_broadcast_recipients", column: "requirementBroadcastId" }, { table: "requirement_broadcast_recipients", column: "inventoryPartnerId" }, { table: "requirement_broadcast_recipients", column: "linkedPropertyId" },
  { table: "match_recommendations", column: "organizationId" }, { table: "match_recommendations", column: "leadId" }, { table: "match_recommendations", column: "propertyId" }, { table: "match_recommendations", column: "lifecycleKey" }, { table: "match_recommendations", column: "status" },
];
export const REQUIRED_PHASE5_ENUM_TYPES = ["DealOfferSide", "RequirementBroadcastStatus", "MatchRecommendationStatus"] as const;
export async function checkPhase5SchemaCompatibility(client: RawQueryClient) { return checkCatalogueSchemaCompatibility(client, REQUIRED_PHASE5_TABLES); }
export async function checkPhase5EnumTypesExist(client: RawQueryClient) { return checkPhase4EnumTypesExist(client, REQUIRED_PHASE5_ENUM_TYPES); }

export const REQUIRED_ACCOUNT_SETUP_COLUMNS: readonly RequiredColumn[] = [
  { table: "account_setup_tokens", column: "id" },
  { table: "account_setup_tokens", column: "organizationId" },
  { table: "account_setup_tokens", column: "userId" },
  { table: "account_setup_tokens", column: "tokenHash" },
  { table: "account_setup_tokens", column: "expiresAt" },
  { table: "account_setup_tokens", column: "usedAt" },
  { table: "account_setup_tokens", column: "createdAt" },
];

export async function checkAccountSetupSchemaCompatibility(client: RawQueryClient) {
  return checkCatalogueSchemaCompatibility(client, REQUIRED_ACCOUNT_SETUP_COLUMNS);
}

export async function checkPendingSetupEnumCompatibility(client: RawQueryClient): Promise<EnumTypeCheckResult> {
  const rows = await client.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='EmployeeStatus'`
  );
  const present = new Set(rows.map((row) => row.enumlabel));
  return { ok: present.has("PENDING_SETUP"), missing: present.has("PENDING_SETUP") ? [] : ["PENDING_SETUP"] };
}

export const REQUIRED_PHASE8_COLUMNS: readonly RequiredColumn[] = [
  { table: "whatsapp_conversations", column: "assignedToId" }, { table: "whatsapp_conversations", column: "displayName" },
  { table: "whatsapp_conversations", column: "contactState" }, { table: "whatsapp_conversations", column: "providerPhoneNumberId" },
  { table: "whatsapp_conversations", column: "providerMetadata" }, { table: "whatsapp_conversations", column: "unreadCount" },
  { table: "whatsapp_conversations", column: "crmReadAt" }, { table: "whatsapp_messages", column: "idempotencyKey" },
  { table: "whatsapp_messages", column: "mediaObjectKey" }, { table: "whatsapp_messages", column: "mediaMimeType" },
  { table: "whatsapp_messages", column: "mediaFilename" }, { table: "whatsapp_messages", column: "mediaSizeBytes" },
  { table: "whatsapp_messages", column: "caption" }, { table: "whatsapp_messages", column: "providerErrorCode" },
  { table: "whatsapp_messages", column: "providerTimestamp" },
];
export async function checkPhase8SchemaCompatibility(client: RawQueryClient) { return checkCatalogueSchemaCompatibility(client, REQUIRED_PHASE8_COLUMNS); }
export async function checkPhase8EnumCompatibility(client: RawQueryClient): Promise<EnumTypeCheckResult> {
  const required = ["WhatsAppContactState.LINKED", "WhatsAppContactState.UNKNOWN", "WhatsAppContactState.AMBIGUOUS", "WhatsAppMessageType.INTERACTIVE", "ActivityType.WHATSAPP_INBOUND", "ActivityType.WHATSAPP_OUTBOUND", "ActivityType.WHATSAPP_CATALOGUE_SENT", "ActivityType.WHATSAPP_PROPERTY_SENT", "ActivityType.WHATSAPP_CONVERSATION_LINKED"];
  const rows = await client.$queryRawUnsafe<{ typname: string; enumlabel: string }[]>(`SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname IN ('WhatsAppContactState','WhatsAppMessageType','ActivityType')`);
  const present = new Set(rows.map((row) => `${row.typname}.${row.enumlabel}`)); const missing = required.filter((value) => !present.has(value));
  return { ok: missing.length === 0, missing };
}

export const REQUIRED_PHASE7_COLUMNS: readonly RequiredColumn[] = [
  { table: "properties", column: "dimension" }, { table: "properties", column: "possessionNotes" }, { table: "properties", column: "liftAvailable" },
  { table: "import_jobs", column: "sheetName" }, { table: "import_jobs", column: "importMode" }, { table: "import_jobs", column: "partialPolicy" },
  { table: "import_jobs", column: "allowBlankClear" }, { table: "import_jobs", column: "warningRows" }, { table: "import_jobs", column: "errorRows" },
  { table: "import_jobs", column: "fileHash" }, { table: "import_jobs", column: "createdRows" }, { table: "import_jobs", column: "updatedRows" }, { table: "import_jobs", column: "skippedRows" }, { table: "import_jobs", column: "failedRows" }, { table: "import_jobs", column: "rolledBackAt" },
  { table: "import_records", column: "action" }, { table: "import_records", column: "duplicateClass" }, { table: "import_records", column: "validationErrors" },
  { table: "import_records", column: "warnings" }, { table: "import_records", column: "beforeSummary" }, { table: "import_records", column: "afterSummary" },
  { table: "import_mapping_presets", column: "id" }, { table: "import_mapping_presets", column: "organizationId" }, { table: "import_mapping_presets", column: "name" }, { table: "import_mapping_presets", column: "entityType" }, { table: "import_mapping_presets", column: "headerSignature" }, { table: "import_mapping_presets", column: "columnMapping" }, { table: "import_mapping_presets", column: "createdById" }, { table: "import_mapping_presets", column: "createdAt" }, { table: "import_mapping_presets", column: "updatedAt" },
];
export const REQUIRED_PHASE7_ENUM_TYPES = ["InventoryImportMode", "ImportPartialPolicy", "PropertyDuplicateClass", "PropertyImportAction"] as const;
export const REQUIRED_PHASE7_ENUM_VALUES = [
  "InventoryImportMode.CREATE_ONLY", "InventoryImportMode.UPSERT_SAFE", "InventoryImportMode.UPDATE_EXISTING_ONLY",
  "ImportPartialPolicy.REQUIRE_ALL_ROWS_VALID", "ImportPartialPolicy.IMPORT_VALID_ROWS",
  "PropertyDuplicateClass.EXACT_DUPLICATE", "PropertyDuplicateClass.PROBABLE_DUPLICATE", "PropertyDuplicateClass.POSSIBLE_DUPLICATE", "PropertyDuplicateClass.NEW",
  "PropertyImportAction.CREATE", "PropertyImportAction.UPDATE_EXISTING", "PropertyImportAction.SKIP",
  "ImportStatus.DRAFT", "ImportStatus.RUNNING", "ImportStatus.COMPLETED_WITH_ERRORS", "ImportRecordStatus.WARNING", "ImportRecordStatus.FAILED",
] as const;
export async function checkPhase7SchemaCompatibility(client: RawQueryClient) { return checkCatalogueSchemaCompatibility(client, REQUIRED_PHASE7_COLUMNS); }
export async function checkPhase7EnumCompatibility(client: RawQueryClient): Promise<EnumTypeCheckResult> {
  const rows = await client.$queryRawUnsafe<{ typname: string; enumlabel: string }[]>(`SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname IN ('InventoryImportMode','ImportPartialPolicy','PropertyDuplicateClass','PropertyImportAction','ImportStatus','ImportRecordStatus')`);
  const present = new Set(rows.map((row) => `${row.typname}.${row.enumlabel}`)); const missing = REQUIRED_PHASE7_ENUM_VALUES.filter((value) => !present.has(value));
  return { ok: missing.length === 0, missing: [...missing] };
}

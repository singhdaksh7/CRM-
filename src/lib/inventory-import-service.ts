import "server-only";
import { Prisma, type ImportPartialPolicy, type InventoryImportMode, type PropertyImportAction } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";
import { recordAudit } from "./audit";
import { normalize as normalizeLocalityText, resolveOrCreatePropertyLocality } from "./property-locality";
import {
  applyImportFallbackDefaults, applySheetDefaults, classifyDuplicate, defaultImportAction, deriveSheetContext, fieldDiff, normalizeHeader, normalizeMappedRow, validateImportedProperty, validateImportedPropertyUpdate,
  type DuplicateClassValue, type ExistingPropertyCandidate, type ImportActionValue, type ImportFieldIssue,
} from "./inventory-import-core";

const BATCH_SIZE = 100;
const PROPERTY_FIELDS = new Set([
  "title", "listingType", "propertyType", "inventorySource", "area", "address", "buildingName", "landmark", "pincode",
  "monthlyRent", "salePrice", "floorNumber", "totalFloors", "builtUpAreaSqft", "carpetAreaSqft", "dimension", "possessionNotes",
  "availableFrom", "bhk", "bathrooms", "furnishing", "parkingAvailable", "liftAvailable", "status", "ownerName", "ownerPhone",
  "ownerAlternatePhone", "internalNotes", "description", "partnerId", "ownerId",
  "assetClass", "superAreaSqft", "frontageFeet", "workstations", "cabins", "commercialFitOut", "goodsLiftAvailable", "leaseTermMonths", "lockInPeriodMonths", "camCharge", "expectedPrice",
  // Property Inventory V2 - additive import provenance/parsing fields (see
  // prisma/schema.prisma Property model and inventory-import-core.ts).
  "areaUnit", "areaRaw", "floorRaw", "priceRaw", "lastPrice", "parkFacing", "sourceRaw", "possessionStatus", "localityId",
]);

export interface PreviewRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  data: Record<string, unknown>;
  issues: ImportFieldIssue[];
  duplicateClass: DuplicateClassValue;
  matchedProperty: ExistingPropertyCandidate | null;
  duplicateReasons: string[];
  action: ImportActionValue;
  diff: Array<{ field: string; before: unknown; after: unknown }>;
  ownerResolution: "REUSE" | "CREATE" | "NONE" | "AMBIGUOUS";
  ownerId: string | null;
  partnerResolution: "MATCHED" | "NOT_FOUND" | "NOT_REQUIRED";
  sourceResolution: "CONFIRMED" | "AUTO_MAPPED_BROKER" | "REQUIRED";
  partnerId: string | null;
  localityResolution: "MATCHED" | "ALIAS_MATCHED" | "NOT_FOUND" | "NOT_REQUIRED";
  localityId: string | null;
  state: "READY" | "WARNING" | "ERROR" | "DUPLICATE" | "SKIPPED";
}

export interface PreviewInventoryParams {
  organizationId: string;
  rows: Record<string, unknown>[];
  mapping: Record<string, string>;
  mode: InventoryImportMode;
  allowBlankClear?: boolean;
  resolutions?: Record<string, { action?: ImportActionValue; partnerId?: string; existingPropertyId?: string; inventorySource?: "DIRECT" | "INDIRECT" }>;
  // Property Inventory V2 - sheet-derived defaults (see deriveSheetContext)
  // and pre-resolved locality aliases (see PropertyLocalityAlias). Both
  // optional so existing callers/tests that don't know about a sheet name or
  // haven't resolved any aliases yet keep working unchanged.
  sheetName?: string;
  sheetTitle?: string;
  localityAliasResolutions?: { alias: string; localityId: string }[];
}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function cleanPropertyData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([field]) => PROPERTY_FIELDS.has(field)));
}


function rowState(row: Pick<PreviewRow, "issues" | "duplicateClass" | "action">): PreviewRow["state"] {
  if (row.action === "SKIP") return "SKIPPED";
  if (row.issues.some((issue) => issue.severity === "ERROR")) return "ERROR";
  if (row.duplicateClass !== "NEW") return "DUPLICATE";
  if (row.issues.length) return "WARNING";
  return "READY";
}

export async function previewInventoryImport(params: PreviewInventoryParams): Promise<PreviewRow[]> {
  if (params.rows.length > 5000) throw new Error("Import row limit exceeded");
  const sheetContext = params.sheetName ? deriveSheetContext(params.sheetName, params.sheetTitle) : undefined;
  const normalized = params.rows.map((raw) => {
    const { data, issues, sourceResolutionRequired } = normalizeMappedRow(raw, params.mapping, sheetContext);
    return { raw, data: sheetContext ? applySheetDefaults(data, sheetContext) : data, issues, sourceResolutionRequired };
  });
  const codes = unique(normalized.map((row) => String(row.data.propertyCode ?? "").trim()).filter(Boolean));
  const phones = unique(normalized.map((row) => String(row.data.ownerPhone ?? "").trim()).filter(Boolean));
  const areas = unique(normalized.map((row) => String(row.data.area ?? "").trim()).filter(Boolean));
  const explicitPartnerIds = unique(Object.values(params.resolutions ?? {}).map((resolution) => resolution.partnerId).filter((id): id is string => !!id));
  const needsPartners = normalized.some((row) => row.data.inventorySource === "INDIRECT" || row.sourceResolutionRequired) || explicitPartnerIds.length > 0;
  const phoneVariants = unique(phones.flatMap((phone) => [phone, phone.slice(-10), `+${phone}`, `0${phone.slice(-10)}`]));
  const normalizedAreaTokens = unique(areas.map(normalizeLocalityText).filter(Boolean));
  const [properties, owners, partners, localityAliases, localities] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId: params.organizationId, OR: [{ propertyCode: { in: codes } }, { ownerPhone: { in: phoneVariants } }, { area: { in: areas } }] },
      take: 5000,
    }),
    phones.length ? prisma.owner.findMany({ where: { organizationId: params.organizationId }, select: { id: true, phone: true }, take: 10000 }) : [],
    needsPartners ? prisma.inventoryPartner.findMany({ where: { organizationId: params.organizationId, isActive: true }, select: { id: true, name: true, company: true }, take: 10000 }) : [],
    // Property Inventory V2 - locality alias resolution is always org-scoped
    // from params.organizationId (never row/file data) so an alias created
    // for one organization can never resolve for another.
    normalizedAreaTokens.length ? prisma.propertyLocalityAlias.findMany({ where: { organizationId: params.organizationId, normalizedAlias: { in: normalizedAreaTokens } }, select: { normalizedAlias: true, localityId: true } }) : [],
    normalizedAreaTokens.length ? prisma.propertyLocality.findMany({ where: { organizationId: params.organizationId, normalizedName: { in: normalizedAreaTokens } }, select: { normalizedName: true, id: true } }) : [],
  ]);
  const partnerByName = new Map<string, string[]>();
  for (const partner of partners) for (const name of [partner.name, partner.company].filter(Boolean)) {
    const key = normalizeHeader(String(name)); partnerByName.set(key, [...(partnerByName.get(key) ?? []), partner.id]);
  }
  const localityAliasMap = new Map<string, string>(localityAliases.map((row) => [row.normalizedAlias, row.localityId]));
  for (const resolution of params.localityAliasResolutions ?? []) {
    const key = normalizeLocalityText(resolution.alias);
    if (key) localityAliasMap.set(key, resolution.localityId);
  }
  const localityByName = new Map<string, string>(localities.map((row) => [row.normalizedName, row.id]));
  return normalized.map((row, index): PreviewRow => {
    const rowNumber = Number(row.raw.__spreadsheetRowNumber) || index + 2;
    const issues = [...row.issues];
    if (/^sample\b/i.test(String(row.data.propertyCode ?? ""))) issues.push({ field: "propertyCode", originalValue: String(row.data.propertyCode), message: "Delete the clearly marked SAMPLE template row before importing", severity: "ERROR" });
    const resolution = params.resolutions?.[String(rowNumber)] ?? {};
    let partnerId: string | null = resolution.partnerId ?? null;
    let partnerResolution: PreviewRow["partnerResolution"] = "NOT_REQUIRED";
    let sourceResolution: PreviewRow["sourceResolution"] = "CONFIRMED";
    if (row.sourceResolutionRequired) {
      const sourceMatches = row.data.sourceRaw ? partnerByName.get(normalizeHeader(String(row.data.sourceRaw))) ?? [] : [];
      if (sourceMatches.length === 1) {
        row.data.inventorySource = "INDIRECT";
        partnerId = partnerId ?? sourceMatches[0];
        sourceResolution = "AUTO_MAPPED_BROKER";
      } else if (resolution.inventorySource) {
        row.data.inventorySource = resolution.inventorySource;
      } else {
        sourceResolution = "REQUIRED";
        issues.push({ field: "inventorySource", originalValue: row.data.sourceRaw ? String(row.data.sourceRaw) : undefined, message: "Source classification is required: choose Direct Owner or Through Broker before creating this property", severity: "ERROR" });
      }
    }
    if (row.data.inventorySource === "DIRECT") { row.data.partnerId = null; delete row.data.partnerName; }
    if (row.data.inventorySource === "INDIRECT") {
      const matches = partnerByName.get(normalizeHeader(String(row.data.partnerName ?? ""))) ?? [];
      partnerId = partnerId ?? (matches.length === 1 ? matches[0] : null);
      if (partnerId && partners.some((partner) => partner.id === partnerId)) { row.data.partnerId = partnerId; partnerResolution = "MATCHED"; }
      else { partnerResolution = "NOT_FOUND"; issues.push({ field: "partnerName", originalValue: String(row.data.partnerName ?? ""), message: "Inventory Partner not found; choose an existing partner or skip this row", severity: "ERROR" }); }
      delete row.data.partnerName;
    }
    let ownerResolution: PreviewRow["ownerResolution"] = "NONE"; let ownerId: string | null = null;
    if (row.data.ownerPhone) {
      const matches = owners.filter((owner) => normalizeIndianPhone(owner.phone) === row.data.ownerPhone);
      if (matches.length === 1) { ownerResolution = "REUSE"; ownerId = matches[0].id; row.data.ownerId = ownerId; }
      else if (matches.length === 0) ownerResolution = "CREATE";
      else { ownerResolution = "AMBIGUOUS"; issues.push({ field: "ownerPhone", message: "Multiple owners use this normalized phone; resolve manually", severity: "ERROR" }); }
    }
    // Property Inventory V2 - locality alias resolution. An alias match is
    // tried first and, when found, skips the plain PropertyLocality
    // exact-match path entirely for this row. Neither matching is treated as
    // an error: unlike Inventory Partners, PropertyLocality rows are
    // designed to auto-accumulate from whatever staff type (see
    // property-locality.ts) - NOT_FOUND here just means "this will become a
    // new locality on save", surfaced so a later wizard phase can offer an
    // explicit alias mapping instead when appropriate.
    let localityResolution: PreviewRow["localityResolution"] = "NOT_REQUIRED";
    let localityId: string | null = null;
    const normalizedArea = normalizeLocalityText(String(row.data.area ?? ""));
    if (normalizedArea) {
      const aliasHit = localityAliasMap.get(normalizedArea);
      if (aliasHit) { localityId = aliasHit; localityResolution = "ALIAS_MATCHED"; row.data.localityId = localityId; }
      else {
        const localityHit = localityByName.get(normalizedArea);
        if (localityHit) { localityId = localityHit; localityResolution = "MATCHED"; row.data.localityId = localityId; }
        else localityResolution = "NOT_FOUND";
      }
    }
    const duplicate = classifyDuplicate(row.data, properties as ExistingPropertyCandidate[]);
    const forcedProperty = resolution.existingPropertyId ? properties.find((property) => property.id === resolution.existingPropertyId) as ExistingPropertyCandidate | undefined : undefined;
    const matchedProperty = forcedProperty ?? duplicate.match;
    const duplicateClass = forcedProperty ? "EXACT_DUPLICATE" : duplicate.duplicateClass;
    const action = resolution.action ?? defaultImportAction(params.mode, duplicateClass);
    if (action === "UPDATE_EXISTING") validateImportedPropertyUpdate(cleanPropertyData(row.data), issues);
    else if (action === "CREATE") {
      // Only CREATE rows get fallback title/propertyType - an UPDATE_EXISTING
      // row must never overwrite a real property's title/type with a
      // generated placeholder just because this particular re-import didn't
      // map those columns.
      row.data = applyImportFallbackDefaults(row.data, issues);
      validateImportedProperty(cleanPropertyData(row.data), issues);
    }
    if (action === "UPDATE_EXISTING" && !matchedProperty) issues.push({ field: "action", message: "Update requires an exact existing property match", severity: "ERROR" });
    if (action === "CREATE" && params.mode === "UPDATE_EXISTING_ONLY") issues.push({ field: "action", message: "Update-only mode cannot create properties", severity: "ERROR" });
    if (action === "UPDATE_EXISTING" && params.mode === "CREATE_ONLY") issues.push({ field: "action", message: "Create-only mode cannot update properties", severity: "ERROR" });
    const preview: PreviewRow = { rowNumber, raw: row.raw, data: cleanPropertyData(row.data), issues, duplicateClass, matchedProperty: matchedProperty ?? null, duplicateReasons: duplicate.reasons, action, diff: fieldDiff(matchedProperty ?? null, cleanPropertyData(row.data), params.allowBlankClear), ownerResolution, ownerId, partnerResolution, partnerId, sourceResolution, localityResolution, localityId, state: "READY" };
    preview.state = rowState(preview);
    return preview;
  });
}

function maskedSnapshot(data: Record<string, unknown>) {
  const mask = (value: unknown) => { const digits = String(value ?? "").replace(/\D/g, ""); return digits ? `******${digits.slice(-4)}` : null; };
  return { propertyCode: data.propertyCode ?? null, title: data.title ?? null, area: data.area ?? null, address: data.address ?? null, inventorySource: data.inventorySource ?? null, ownerPhone: mask(data.ownerPhone), price: data.monthlyRent ?? data.salePrice ?? null };
}

function updateData(row: PreviewRow, allowBlankClear: boolean): Prisma.PropertyUncheckedUpdateInput {
  const entries = Object.entries(row.data).filter(([field, value]) => PROPERTY_FIELDS.has(field) && field !== "ownerId" && (allowBlankClear || (value !== "" && value != null)));
  const data = Object.fromEntries(entries) as Prisma.PropertyUncheckedUpdateInput;
  if (typeof data.availableFrom === "string") data.availableFrom = new Date(data.availableFrom);
  return data;
}

export async function executeInventoryImport(params: PreviewInventoryParams & {
  actorId: string; fileName: string; sheetName?: string; partialPolicy: ImportPartialPolicy; fileHash?: string;
}) {
  if (params.fileHash) {
    const prior = await prisma.importJob.findFirst({ where: { organizationId: params.organizationId, entityType: "PROPERTIES", fileHash: params.fileHash, status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS", "RUNNING"] } }, select: { id: true, status: true } });
    if (prior) throw new Error(`This exact file already has import job ${prior.id} (${prior.status}); review its history instead of importing it twice`);
  }
  // Property Inventory V2 - persist any chosen locality alias resolutions
  // BEFORE previewing/processing rows, upserting so a re-run of the same
  // execution never errors on the (organizationId, normalizedAlias) unique
  // constraint. previewInventoryImport (called next) re-queries
  // PropertyLocalityAlias fresh, so these are immediately used to resolve
  // localityId for every affected row in this same execution.
  //
  // localityId is fully client-supplied (organizationId is not - it always
  // comes from the authenticated session, never the request body), so it
  // MUST be checked against a PropertyLocality this org actually owns
  // before being written - otherwise a caller could alias one of their own
  // locality names to another organization's locality id, leaking a
  // cross-tenant reference into every future import that resolves it.
  if (params.localityAliasResolutions?.length) {
    const candidateLocalityIds = unique(params.localityAliasResolutions.map((r) => r.localityId));
    const ownedLocalities = await prisma.propertyLocality.findMany({ where: { organizationId: params.organizationId, id: { in: candidateLocalityIds } }, select: { id: true } });
    const ownedLocalityIds = new Set(ownedLocalities.map((l) => l.id));
    await Promise.all(params.localityAliasResolutions.map((resolution) => {
      const normalizedAlias = normalizeLocalityText(resolution.alias);
      if (!normalizedAlias || !ownedLocalityIds.has(resolution.localityId)) return null;
      return prisma.propertyLocalityAlias.upsert({
        where: { organizationId_normalizedAlias: { organizationId: params.organizationId, normalizedAlias } },
        update: { localityId: resolution.localityId },
        create: { organizationId: params.organizationId, alias: resolution.alias.trim(), normalizedAlias, localityId: resolution.localityId, createdById: params.actorId },
      });
    }));
  }
  const preview = await previewInventoryImport(params);
  const errorRows = preview.filter((row) => row.state === "ERROR");
  if (params.partialPolicy === "REQUIRE_ALL_ROWS_VALID" && errorRows.length) throw new Error(`${errorRows.length} row(s) contain errors; correct them or explicitly choose Import Valid Rows`);
  const actionable = preview.filter((row) => row.action !== "SKIP" && row.state !== "ERROR");
  const job = await prisma.importJob.create({ data: {
    organizationId: params.organizationId, entityType: "PROPERTIES", fileName: params.fileName, sheetName: params.sheetName,
    status: "RUNNING", importMode: params.mode, partialPolicy: params.partialPolicy, allowBlankClear: params.allowBlankClear ?? false,
    fileHash: params.fileHash, totalRows: preview.length, validRows: actionable.length, warningRows: preview.filter((row) => row.state === "WARNING").length,
    errorRows: errorRows.length, invalidRows: errorRows.length, duplicateRows: preview.filter((row) => row.duplicateClass !== "NEW").length,
    columnMapping: JSON.stringify(params.mapping), createdById: params.actorId, startedAt: new Date(),
  } });
  let created = 0; let updated = 0; let failed = 0;
  for (let start = 0; start < actionable.length; start += BATCH_SIZE) {
    const batch = actionable.slice(start, start + BATCH_SIZE);
    await prisma.$transaction(async (tx) => {
      const timeline: Prisma.PropertyTimelineEventCreateManyInput[] = [];
      for (const row of batch) {
        try {
          let propertyId: string; let before: Record<string, unknown> | null = null; let after: Record<string, unknown>;
          if (row.action === "UPDATE_EXISTING" && row.matchedProperty) {
            before = Object.fromEntries(row.diff.map((diff) => [diff.field, diff.before]));
            const property = await tx.property.update({ where: { id: row.matchedProperty.id }, data: updateData(row, params.allowBlankClear ?? false) });
            propertyId = property.id; after = Object.fromEntries(row.diff.map((diff) => [diff.field, diff.after])); updated++;
            timeline.push({ organizationId: params.organizationId, propertyId, eventType: "UPDATED_FROM_IMPORT", note: `${params.fileName} row ${row.rowNumber}`, actorId: params.actorId });
          } else {
            let ownerId = row.ownerId;
            if (!ownerId && row.ownerResolution === "CREATE" && row.data.ownerPhone) {
              const owner = await tx.owner.create({ data: { organizationId: params.organizationId, ownerCode: `OWN-IMP-${job.id.slice(-6)}-${row.rowNumber}`, name: String(row.data.ownerName), phone: String(row.data.ownerPhone), alternatePhone: row.data.ownerAlternatePhone ? String(row.data.ownerAlternatePhone) : null, createdById: params.actorId } });
              ownerId = owner.id;
            }
            const createData = updateData(row, false) as Prisma.PropertyUncheckedCreateInput;
            delete (createData as Record<string, unknown>).ownerId;
            // A NOT_FOUND locality resolution (no matching PropertyLocality
            // or alias) must still join the reusable/aliasable locality
            // list on create, exactly like the manual property API does via
            // resolveOrCreatePropertyLocality - otherwise imported
            // properties with a genuinely new area text would silently
            // never become part of the org's reusable locality set.
            if (!createData.localityId && typeof createData.area === "string" && createData.area.trim()) {
              createData.localityId = await resolveOrCreatePropertyLocality(params.organizationId, createData.area, params.actorId, tx);
            }
            const suppliedCode = row.duplicateClass === "EXACT_DUPLICATE" ? null : row.data.propertyCode;
            const property = await tx.property.create({ data: { ...createData, organizationId: params.organizationId, propertyCode: String(suppliedCode || `PROP-IMP-${job.id.slice(-6)}-${row.rowNumber}`), description: String(row.data.description ?? "Imported from inventory spreadsheet"), amenities: "[]", images: "[]", ownerId, createdById: params.actorId } });
            propertyId = property.id; after = maskedSnapshot(row.data); created++;
            timeline.push({ organizationId: params.organizationId, propertyId, eventType: "IMPORTED", note: `${params.fileName} row ${row.rowNumber}`, actorId: params.actorId });
          }
          await tx.importRecord.create({ data: { importJobId: job.id, rowNumber: row.rowNumber, status: "IMPORTED", action: row.action as PropertyImportAction, duplicateClass: row.duplicateClass, rawData: JSON.stringify(maskedSnapshot(row.data)), warnings: row.issues.length ? JSON.stringify(row.issues) : null, beforeSummary: before ? JSON.stringify(before) : null, afterSummary: JSON.stringify(after), entityId: propertyId } });
        } catch (error) {
          failed++;
          await tx.importRecord.create({ data: { importJobId: job.id, rowNumber: row.rowNumber, status: "FAILED", action: row.action as PropertyImportAction, duplicateClass: row.duplicateClass, rawData: JSON.stringify(maskedSnapshot(row.data)), errorMessage: error instanceof Error ? error.message : "Import failed", validationErrors: JSON.stringify(row.issues) } });
        }
      }
      if (timeline.length) await tx.propertyTimelineEvent.createMany({ data: timeline });
    });
  }
  const nonActionRecords = preview.filter((row) => row.action === "SKIP" || row.state === "ERROR").map((row) => ({ importJobId: job.id, rowNumber: row.rowNumber, status: row.state === "ERROR" ? "INVALID" as const : "SKIPPED" as const, action: "SKIP" as const, duplicateClass: row.duplicateClass, rawData: JSON.stringify(maskedSnapshot(row.data)), errorMessage: row.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ") || null, validationErrors: row.issues.length ? JSON.stringify(row.issues) : null }));
  for (let start = 0; start < nonActionRecords.length; start += BATCH_SIZE) await prisma.importRecord.createMany({ data: nonActionRecords.slice(start, start + BATCH_SIZE) });
  const skipped = preview.length - created - updated - failed;
  const completed = await prisma.importJob.update({ where: { id: job.id }, data: { status: failed || errorRows.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED", importedRows: created + updated, createdRows: created, updatedRows: updated, skippedRows: skipped, failedRows: failed, completedAt: new Date() } });
  await recordAudit({ userId: params.actorId, action: "IMPORT", entityType: "ImportJob", entityId: job.id, newValues: { event: "IMPORT_EXECUTED", created, updated, skipped, failed, total: preview.length } });
  return { job: completed, counts: { created, updated, skipped, failed }, rows: preview };
}

export async function rollbackCreatedImportProperties(importJobId: string, organizationId: string, actorId: string) {
  const job = await prisma.importJob.findFirst({ where: { id: importJobId, organizationId, entityType: "PROPERTIES" } });
  if (!job) throw new Error("Import job not found");
  if (job.status === "ROLLED_BACK") throw new Error("Import was already rolled back");
  const records = await prisma.importRecord.findMany({ where: { importJobId, action: "CREATE", status: "IMPORTED", entityId: { not: null } }, select: { entityId: true } });
  const ids = records.map((record) => record.entityId!).filter(Boolean);
  const dependent = ids.length ? await prisma.property.findMany({ where: { organizationId, id: { in: ids }, OR: [
    { sharedIn: { some: {} } }, { visits: { some: {} } }, { catalogueShareProperties: { some: {} } }, { deals: { some: {} } },
    { documents: { some: {} } }, { propertyImages: { some: {} } }, { matchRecommendations: { some: {} } }, { favoritedBy: { some: {} } }, { viewLogs: { some: {} } },
  ] }, select: { id: true, propertyCode: true } }) : [];
  if (dependent.length) throw new Error(`Rollback blocked: ${dependent.map((property) => property.propertyCode).join(", ")} acquired dependent business data`);
  await prisma.$transaction(async (tx) => {
    await tx.property.deleteMany({ where: { organizationId, id: { in: ids } } });
    await tx.importJob.update({ where: { id: importJobId }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
  });
  await recordAudit({ userId: actorId, action: "DELETE", entityType: "ImportJob", entityId: importJobId, newValues: { event: "IMPORT_ROLLBACK", removedCreatedProperties: ids.length } });
  return { rolledBack: ids.length };
}

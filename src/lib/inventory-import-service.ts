import "server-only";
import { Prisma, type ImportPartialPolicy, type InventoryImportMode, type PropertyImportAction } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";
import { recordAudit } from "./audit";
import {
  classifyDuplicate, defaultImportAction, fieldDiff, normalizeHeader, normalizeMappedRow, validateImportedProperty, validateImportedPropertyUpdate,
  type DuplicateClassValue, type ExistingPropertyCandidate, type ImportActionValue, type ImportFieldIssue,
} from "./inventory-import-core";

const BATCH_SIZE = 100;
const PROPERTY_FIELDS = new Set([
  "title", "listingType", "propertyType", "inventorySource", "area", "address", "buildingName", "landmark", "pincode",
  "monthlyRent", "salePrice", "floorNumber", "totalFloors", "builtUpAreaSqft", "carpetAreaSqft", "dimension", "possessionNotes",
  "availableFrom", "bhk", "bathrooms", "furnishing", "parkingAvailable", "liftAvailable", "status", "ownerName", "ownerPhone",
  "ownerAlternatePhone", "internalNotes", "description", "partnerId", "ownerId",
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
  partnerId: string | null;
  state: "READY" | "WARNING" | "ERROR" | "DUPLICATE" | "SKIPPED";
}

export interface PreviewInventoryParams {
  organizationId: string;
  rows: Record<string, unknown>[];
  mapping: Record<string, string>;
  mode: InventoryImportMode;
  allowBlankClear?: boolean;
  resolutions?: Record<string, { action?: ImportActionValue; partnerId?: string; existingPropertyId?: string }>;
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
  const normalized = params.rows.map((raw) => ({ raw, ...normalizeMappedRow(raw, params.mapping) }));
  const codes = unique(normalized.map((row) => String(row.data.propertyCode ?? "").trim()).filter(Boolean));
  const phones = unique(normalized.map((row) => String(row.data.ownerPhone ?? "").trim()).filter(Boolean));
  const areas = unique(normalized.map((row) => String(row.data.area ?? "").trim()).filter(Boolean));
  const explicitPartnerIds = unique(Object.values(params.resolutions ?? {}).map((resolution) => resolution.partnerId).filter((id): id is string => !!id));
  const needsPartners = normalized.some((row) => row.data.inventorySource === "INDIRECT") || explicitPartnerIds.length > 0;
  const phoneVariants = unique(phones.flatMap((phone) => [phone, phone.slice(-10), `+${phone}`, `0${phone.slice(-10)}`]));
  const [properties, owners, partners] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId: params.organizationId, OR: [{ propertyCode: { in: codes } }, { ownerPhone: { in: phoneVariants } }, { area: { in: areas } }] },
      take: 5000,
    }),
    phones.length ? prisma.owner.findMany({ where: { organizationId: params.organizationId }, select: { id: true, phone: true }, take: 10000 }) : [],
    needsPartners ? prisma.inventoryPartner.findMany({ where: { organizationId: params.organizationId, isActive: true }, select: { id: true, name: true, company: true }, take: 10000 }) : [],
  ]);
  const partnerByName = new Map<string, string[]>();
  for (const partner of partners) for (const name of [partner.name, partner.company].filter(Boolean)) {
    const key = normalizeHeader(String(name)); partnerByName.set(key, [...(partnerByName.get(key) ?? []), partner.id]);
  }
  return normalized.map((row, index): PreviewRow => {
    const rowNumber = Number(row.raw.__spreadsheetRowNumber) || index + 2;
    const issues = [...row.issues];
    if (/^sample\b/i.test(String(row.data.propertyCode ?? ""))) issues.push({ field: "propertyCode", originalValue: String(row.data.propertyCode), message: "Delete the clearly marked SAMPLE template row before importing", severity: "ERROR" });
    const resolution = params.resolutions?.[String(rowNumber)] ?? {};
    let partnerId: string | null = resolution.partnerId ?? null;
    let partnerResolution: PreviewRow["partnerResolution"] = "NOT_REQUIRED";
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
    const duplicate = classifyDuplicate(row.data, properties as ExistingPropertyCandidate[]);
    const forcedProperty = resolution.existingPropertyId ? properties.find((property) => property.id === resolution.existingPropertyId) as ExistingPropertyCandidate | undefined : undefined;
    const matchedProperty = forcedProperty ?? duplicate.match;
    const duplicateClass = forcedProperty ? "EXACT_DUPLICATE" : duplicate.duplicateClass;
    const action = resolution.action ?? defaultImportAction(params.mode, duplicateClass);
    if (action === "UPDATE_EXISTING") validateImportedPropertyUpdate(cleanPropertyData(row.data), issues);
    else if (action === "CREATE") validateImportedProperty(cleanPropertyData(row.data), issues);
    if (action === "UPDATE_EXISTING" && !matchedProperty) issues.push({ field: "action", message: "Update requires an exact existing property match", severity: "ERROR" });
    if (action === "CREATE" && params.mode === "UPDATE_EXISTING_ONLY") issues.push({ field: "action", message: "Update-only mode cannot create properties", severity: "ERROR" });
    if (action === "UPDATE_EXISTING" && params.mode === "CREATE_ONLY") issues.push({ field: "action", message: "Create-only mode cannot update properties", severity: "ERROR" });
    const preview: PreviewRow = { rowNumber, raw: row.raw, data: cleanPropertyData(row.data), issues, duplicateClass, matchedProperty: matchedProperty ?? null, duplicateReasons: duplicate.reasons, action, diff: fieldDiff(matchedProperty ?? null, cleanPropertyData(row.data), params.allowBlankClear), ownerResolution, ownerId, partnerResolution, partnerId, state: "READY" };
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

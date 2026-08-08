import { prisma } from "./prisma";
import { getOrganizationId } from "./organization";
import { generateCode } from "./utils";
import { recordAudit } from "./audit";
import { logger } from "./logger";
import { propertySchema, leadSchema, ownerSchema, employeeSchema } from "./validators";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { ImportEntityType } from "@prisma/client";

const NUMERIC_FIELDS: Record<ImportEntityType, string[]> = {
  PROPERTIES: [
    "monthlyRent", "securityDeposit", "maintenanceCharge", "rentBrokerage", "salePrice", "pricePerSqft",
    "saleBrokeragePct", "saleBrokerageAmount", "bhk", "bathrooms", "balconies", "floorNumber", "totalFloors",
    "propertyAgeYears", "builtUpAreaSqft", "carpetAreaSqft", "latitude", "longitude",
  ],
  LEADS: ["minBudget", "maxBudget", "preferredBhk"],
  OWNERS: [],
  EMPLOYEES: ["maxActiveLeads"],
};

const BOOLEAN_FIELDS: Record<ImportEntityType, string[]> = {
  PROPERTIES: ["negotiable", "parkingAvailable"],
  LEADS: [],
  OWNERS: [],
  EMPLOYEES: ["isAvailable", "autoAssignEnabled"],
};

/**
 * Neutralizes CSV/spreadsheet formula injection (=, +, -, @, tab, CR at the
 * start of a cell) by prefixing with a single quote, the standard mitigation
 * - any of these values re-opened in Excel/Sheets later (e.g. a future
 * export feature) would otherwise execute as a formula.
 */
export function sanitizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Maps a raw CSV row (source column -> value) onto target field names using the job's column mapping. */
export function mapRow(row: Record<string, string>, columnMapping: Record<string, string>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [targetField, sourceColumn] of Object.entries(columnMapping)) {
    const raw = row[sourceColumn];
    if (raw !== undefined && raw !== "") mapped[targetField] = raw;
  }
  return mapped;
}

/** Coerces numeric/boolean fields, then sanitizes every remaining string field against formula injection. */
export function coerceTypes(mapped: Record<string, unknown>, entityType: ImportEntityType): Record<string, unknown> {
  const out = { ...mapped };
  for (const field of NUMERIC_FIELDS[entityType]) {
    if (out[field] !== undefined) {
      const n = Number(out[field]);
      out[field] = Number.isNaN(n) ? out[field] : n;
    }
  }
  for (const field of BOOLEAN_FIELDS[entityType]) {
    if (out[field] !== undefined) out[field] = String(out[field]).toLowerCase() === "true";
  }
  for (const field of Object.keys(out)) {
    if (typeof out[field] === "string") out[field] = sanitizeCell(out[field] as string);
  }
  return out;
}

function validateRow(entityType: ImportEntityType, mapped: Record<string, unknown>): { valid: true; data: Record<string, unknown> } | { valid: false; error: string } {
  const schema = { PROPERTIES: propertySchema, LEADS: leadSchema, OWNERS: ownerSchema, EMPLOYEES: employeeSchema }[entityType];
  const result = schema.safeParse(mapped);
  if (!result.success) return { valid: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { valid: true, data: result.data as Record<string, unknown> };
}

async function findExistingDuplicate(entityType: ImportEntityType, data: Record<string, unknown>, organizationId: string): Promise<boolean> {
  switch (entityType) {
    case "LEADS":
      return !!(await prisma.lead.findFirst({ where: { organizationId, phone: data.phone as string } }));
    case "OWNERS":
      return !!(await prisma.owner.findFirst({ where: { organizationId, phone: data.phone as string } }));
    case "EMPLOYEES":
      return !!(await prisma.user.findUnique({ where: { email: (data.email as string).toLowerCase() } }));
    case "PROPERTIES":
      return !!(await prisma.property.findFirst({ where: { organizationId, ownerPhone: data.ownerPhone as string, title: data.title as string } }));
  }
}

export interface ImportRowOutcome {
  rowNumber: number;
  status: "VALID" | "INVALID" | "DUPLICATE" | "IMPORTED" | "SKIPPED";
  error?: string;
  entityId?: string;
}

/**
 * Validates + imports every row of a job in one pass (small in-house CSV
 * imports, not a streaming pipeline). If entity creation fails partway
 * through, every entity already created in this job is deleted and the job
 * is marked ROLLED_BACK - rows that were merely INVALID/DUPLICATE (and thus
 * never created) do not trigger a rollback.
 */
export async function runImport(params: {
  entityType: ImportEntityType;
  fileName: string;
  rows: Record<string, string>[];
  columnMapping: Record<string, string>;
  actorId: string;
}) {
  const organizationId = getOrganizationId(params.actorId);

  const job = await prisma.importJob.create({
    data: {
      organizationId,
      entityType: params.entityType,
      fileName: params.fileName,
      status: "VALIDATING",
      totalRows: params.rows.length,
      columnMapping: JSON.stringify(params.columnMapping),
      createdById: params.actorId,
      startedAt: new Date(),
    },
  });
  logger.info("import_job_started", { importJobId: job.id, entityType: params.entityType, totalRows: params.rows.length, actorId: params.actorId });

  const outcomes: ImportRowOutcome[] = [];
  const validatedRows: { rowNumber: number; data: Record<string, unknown> }[] = [];

  for (let i = 0; i < params.rows.length; i++) {
    const rowNumber = i + 1;
    const mapped = coerceTypes(mapRow(params.rows[i], params.columnMapping), params.entityType);
    const validation = validateRow(params.entityType, mapped);
    if (!validation.valid) {
      outcomes.push({ rowNumber, status: "INVALID", error: validation.error });
      continue;
    }
    if (await findExistingDuplicate(params.entityType, validation.data, organizationId)) {
      outcomes.push({ rowNumber, status: "DUPLICATE" });
      continue;
    }
    validatedRows.push({ rowNumber, data: validation.data });
    outcomes.push({ rowNumber, status: "VALID" });
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: "IMPORTING",
      validRows: validatedRows.length,
      invalidRows: outcomes.filter((o) => o.status === "INVALID").length,
      duplicateRows: outcomes.filter((o) => o.status === "DUPLICATE").length,
    },
  });

  const createdEntityIds: string[] = [];
  try {
    for (const row of validatedRows) {
      const entityId = await createEntity(params.entityType, row.data, organizationId, params.actorId);
      createdEntityIds.push(entityId);
      const outcome = outcomes.find((o) => o.rowNumber === row.rowNumber)!;
      outcome.status = "IMPORTED";
      outcome.entityId = entityId;
    }
  } catch (err) {
    // Best-effort rollback: remove everything this job created.
    await rollbackCreatedEntities(params.entityType, createdEntityIds);
    await prisma.importRecord.createMany({
      data: outcomes.map((o) => ({
        importJobId: job.id,
        rowNumber: o.rowNumber,
        status: o.status === "IMPORTED" ? "SKIPPED" : o.status,
        rawData: JSON.stringify(params.rows[o.rowNumber - 1]),
        errorMessage: o.error ?? null,
        entityId: null,
      })),
    });
    const failed = await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "ROLLED_BACK", errorLog: JSON.stringify([{ error: err instanceof Error ? err.message : "Unknown import error" }]), completedAt: new Date() },
    });
    await recordAudit({ userId: params.actorId, action: "IMPORT", entityType: "ImportJob", entityId: job.id, result: "FAILURE", errorMessage: err instanceof Error ? err.message : "Import failed" });
    logger.error("import_job_rolled_back", { importJobId: job.id, entityType: params.entityType, createdThenRemoved: createdEntityIds.length, error: err instanceof Error ? err.message : "Unknown import error" });
    return { job: failed, outcomes };
  }

  await prisma.importRecord.createMany({
    data: outcomes.map((o) => ({
      importJobId: job.id,
      rowNumber: o.rowNumber,
      status: o.status,
      rawData: JSON.stringify(params.rows[o.rowNumber - 1]),
      errorMessage: o.error ?? null,
      entityId: o.entityId ?? null,
    })),
  });

  const completed = await prisma.importJob.update({
    where: { id: job.id },
    data: { status: "COMPLETED", importedRows: createdEntityIds.length, completedAt: new Date() },
  });

  await recordAudit({ userId: params.actorId, action: "IMPORT", entityType: "ImportJob", entityId: job.id, newValues: { imported: createdEntityIds.length, total: params.rows.length } });
  logger.info("import_job_completed", { importJobId: job.id, entityType: params.entityType, imported: createdEntityIds.length, total: params.rows.length });

  return { job: completed, outcomes };
}

async function createEntity(entityType: ImportEntityType, data: Record<string, unknown>, organizationId: string, actorId: string): Promise<string> {
  switch (entityType) {
    case "OWNERS": {
      const ownerCode = generateCode("OWN", (await prisma.owner.count()) + 1);
      const owner = await prisma.owner.create({
        data: {
          organizationId,
          ownerCode,
          name: data.name as string,
          phone: data.phone as string,
          alternatePhone: (data.alternatePhone as string) ?? null,
          email: (data.email as string) || null,
          address: (data.address as string) ?? null,
          city: (data.city as string) ?? "Delhi",
          notes: (data.notes as string) ?? null,
          createdById: actorId,
        },
      });
      return owner.id;
    }
    case "LEADS": {
      const leadCode = generateCode("LEAD", (await prisma.lead.count()) + 1);
      const lead = await prisma.lead.create({
        data: {
          organizationId,
          leadCode,
          clientName: data.clientName as string,
          phone: data.phone as string,
          email: (data.email as string) || null,
          source: (data.source as never) ?? "MANUAL",
          requirementType: data.requirementType as never,
          preferredLocation: data.preferredLocation as string,
          minBudget: data.minBudget as number,
          maxBudget: data.maxBudget as number,
          preferredBhk: (data.preferredBhk as number) ?? null,
          notes: (data.notes as string) ?? null,
        },
      });
      return lead.id;
    }
    case "EMPLOYEES": {
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      const user = await prisma.user.create({
        data: {
          organizationId,
          name: data.name as string,
          email: (data.email as string).toLowerCase(),
          phone: (data.phone as string) ?? null,
          role: data.role as never,
          passwordHash,
          status: "PENDING_SETUP",
        },
      });
      return user.id;
    }
    case "PROPERTIES": {
      const propertyCode = generateCode("PROP", (await prisma.property.count()) + 1);
      const property = await prisma.property.create({
        data: {
          organizationId,
          propertyCode,
          title: data.title as string,
          propertyType: data.propertyType as never,
          listingType: data.listingType as never,
          description: data.description as string,
          area: data.area as string,
          address: data.address as string,
          bhk: data.bhk as number,
          bathrooms: data.bathrooms as number,
          furnishing: data.furnishing as never,
          builtUpAreaSqft: data.builtUpAreaSqft as number,
          ownerName: data.ownerName as string,
          ownerPhone: data.ownerPhone as string,
          createdById: actorId,
        },
      });
      return property.id;
    }
  }
}

async function rollbackCreatedEntities(entityType: ImportEntityType, ids: string[]) {
  if (ids.length === 0) return;
  switch (entityType) {
    case "OWNERS":
      await prisma.owner.deleteMany({ where: { id: { in: ids } } });
      break;
    case "LEADS":
      await prisma.lead.deleteMany({ where: { id: { in: ids } } });
      break;
    case "EMPLOYEES":
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      break;
    case "PROPERTIES":
      await prisma.property.deleteMany({ where: { id: { in: ids } } });
      break;
  }
}

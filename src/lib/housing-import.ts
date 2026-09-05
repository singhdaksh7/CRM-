import "server-only";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { logActivity } from "./activity";
import { recordAudit } from "./audit";
import { sanitizeCell } from "./imports";
import { ingestPortalLead } from "@/integrations/property-portals/ingestion";
import { extractHousingRow, missingRequiredColumns, type HousingFileImportColumn } from "@/integrations/housing/file-import-schema";
import { normalizeHousingFileRow, type HousingFileMappingResult } from "@/integrations/housing/file-import-adapter";

/**
 * Housing lead EXPORT FILE import orchestration - the staff-upload
 * counterpart to the live Housing webhook
 * (src/app/api/integrations/housing/leads/route.ts). Both channels are
 * kept architecturally compatible on purpose: every row that validates goes
 * through the SAME canonical `ingestPortalLead()` service the webhook uses
 * (dedup by ExternalLeadEvent's unique organizationId+provider+externalEventId,
 * phone-based candidate matching, and the existing auto-assignment
 * pipeline), so an imported Housing lead is indistinguishable from a
 * webhook-received one anywhere else in the CRM (leads workspace,
 * assignment, Today/My Work, follow-ups, matching, catalogues, visits,
 * Needs Attention). This file only ever ADDS the file-upload entry point
 * and its ImportJob/ImportRecord bookkeeping - it never re-implements
 * ingestion, dedup, or assignment.
 *
 * Deliberately NOT built on top of `runImport()`/`createEntity()` in
 * ./imports.ts: that pipeline creates a Lead directly via a flat schema and
 * rolls back the WHOLE job on any row's exception. Housing rows instead
 * need per-row canonical mapping + dedup + assignment (ingestPortalLead) and
 * per-row failure isolation (one bad row must not undo an otherwise-good
 * import), matching how the live webhook already treats each delivery as
 * independent. ImportJob/ImportRecord are still reused for history (see
 * entityType "HOUSING_LEADS").
 */

export interface HousingImportPreviewRow {
  rowNumber: number;
  display: {
    leadName: string;
    phone: string;
    leadDate: string;
    locality: string;
    propertyType: string;
    configuration: string;
    price: string;
    project: string;
    housingPropertyId: string;
    housingStatus: string;
  };
  state: "VALID" | "NEEDS_REVIEW" | "INVALID" | "DUPLICATE";
  issues: string[];
}

export interface HousingImportPreviewSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  needsReview: number;
}

function displayFromRow(rowNumber: number, mapped: Partial<Record<HousingFileImportColumn, string>>): HousingImportPreviewRow["display"] {
  return {
    leadName: mapped["Lead Name"] ?? "",
    phone: mapped["Lead Phone Number"] ?? "",
    leadDate: mapped["Lead Date"] ?? "",
    locality: mapped["Locality"] ?? "",
    propertyType: mapped["Property Type"] ?? "",
    configuration: mapped["Configuration"] ?? "",
    price: mapped["Price"] ?? "",
    project: mapped["Building/Project Name"] ?? "",
    housingPropertyId: mapped["Property/Project ID"] ?? "",
    housingStatus: [mapped["primary_lead_status"], mapped["secondary_lead_status"]].filter(Boolean).join(" / "),
  };
}

/**
 * Read-only preview: maps + validates every row exactly like the real
 * import would, and flags rows that are a duplicate either of (a) another
 * row earlier in the SAME file, or (b) an already-imported Housing event
 * from a previous upload - but never writes anything. Mirrors the CONTACTS
 * import preview pattern in ./imports.ts (previewContactImport).
 */
export async function previewHousingImport(params: {
  rows: Record<string, string>[];
  columnMapping: Partial<Record<HousingFileImportColumn, string>>;
  organizationId: string;
}): Promise<{ rows: HousingImportPreviewRow[]; summary: HousingImportPreviewSummary }> {
  const missing = missingRequiredColumns(params.columnMapping);
  if (missing.length > 0) throw new Error(`Missing required column mapping: ${missing.join(", ")}`);

  const out: HousingImportPreviewRow[] = [];
  const seenInFile = new Set<string>();

  for (let i = 0; i < params.rows.length; i++) {
    const rowNumber = i + 1;
    const mapped = extractHousingRow(params.rows[i], params.columnMapping);
    const result = normalizeHousingFileRow(mapped);
    const display = displayFromRow(rowNumber, mapped);

    if (result.errors.length > 0) {
      out.push({ rowNumber, display, state: "INVALID", issues: result.errors });
      continue;
    }

    if (seenInFile.has(result.dedupeEventId)) {
      out.push({ rowNumber, display, state: "DUPLICATE", issues: ["Same phone + Housing property + lead date as an earlier row in this file"] });
      continue;
    }
    seenInFile.add(result.dedupeEventId);

    const existingEvent = await prisma.externalLeadEvent.findUnique({
      where: { organizationId_provider_externalEventId: { organizationId: params.organizationId, provider: "HOUSING", externalEventId: result.dedupeEventId } },
      select: { id: true },
    });
    if (existingEvent) {
      out.push({ rowNumber, display, state: "DUPLICATE", issues: ["Already imported in a previous Housing upload"] });
      continue;
    }

    out.push({ rowNumber, display, state: result.needsReview ? "NEEDS_REVIEW" : "VALID", issues: result.reviewReasons });
  }

  return {
    rows: out,
    summary: {
      total: out.length,
      valid: out.filter((r) => r.state === "VALID").length,
      invalid: out.filter((r) => r.state === "INVALID").length,
      duplicate: out.filter((r) => r.state === "DUPLICATE").length,
      needsReview: out.filter((r) => r.state === "NEEDS_REVIEW").length,
    },
  };
}

export interface HousingImportRowOutcome {
  rowNumber: number;
  outcome: "IMPORTED" | "MATCHED_EXISTING" | "DUPLICATE" | "NEEDS_REVIEW" | "INVALID" | "FAILED";
  leadId?: string;
  eventId?: string;
  issues: string[];
}

export interface HousingImportResultSummary {
  total: number;
  imported: number;
  duplicatesSkippedOrMatched: number;
  needsReview: number;
  invalid: number;
  failed: number;
}

/**
 * Executes the import: requires an explicit prior confirmation from the
 * caller (the API route only reaches this after the client's confirm step -
 * see POST /api/imports/housing). Every row that passes validation is
 * routed through `ingestPortalLead()`, so dedup/matching/assignment are
 * identical to the live webhook. NEVER triggers WhatsApp/SMS/email -
 * ingestPortalLead's only side effects are DB writes, an internal
 * assignment-notification (existing, non-customer-facing), and here, an
 * internal Activity note - no customer-facing send path is called anywhere
 * in this module.
 */
export async function runHousingImport(params: {
  rows: Record<string, string>[];
  columnMapping: Partial<Record<HousingFileImportColumn, string>>;
  fileName: string;
  actorId: string;
  organizationId: string;
}): Promise<{ jobId: string; summary: HousingImportResultSummary; rows: HousingImportRowOutcome[] }> {
  const missing = missingRequiredColumns(params.columnMapping);
  if (missing.length > 0) throw new Error(`Missing required column mapping: ${missing.join(", ")}`);

  const job = await prisma.importJob.create({
    data: {
      organizationId: params.organizationId,
      entityType: "HOUSING_LEADS",
      fileName: params.fileName,
      status: "IMPORTING",
      totalRows: params.rows.length,
      columnMapping: JSON.stringify(params.columnMapping),
      createdById: params.actorId,
      startedAt: new Date(),
    },
  });
  logger.info("housing_file_import_started", { importJobId: job.id, totalRows: params.rows.length, actorId: params.actorId });

  const outcomes: HousingImportRowOutcome[] = [];
  let imported = 0;
  let duplicatesSkippedOrMatched = 0;
  let needsReview = 0;
  let invalid = 0;
  let failed = 0;

  for (let i = 0; i < params.rows.length; i++) {
    const rowNumber = i + 1;
    const mapped = extractHousingRow(params.rows[i], params.columnMapping);
    let result: HousingFileMappingResult;
    try {
      result = normalizeHousingFileRow(mapped);
    } catch (err) {
      failed++;
      outcomes.push({ rowNumber, outcome: "FAILED", issues: ["Row could not be processed"] });
      logger.error("housing_file_import_row_normalize_failed", { importJobId: job.id, rowNumber, message: err instanceof Error ? err.message : String(err) });
      continue;
    }

    if (result.errors.length > 0 || !result.canonical) {
      invalid++;
      outcomes.push({ rowNumber, outcome: "INVALID", issues: result.errors });
      continue;
    }

    try {
      const snapshot = { ...result.snapshot, importJobId: job.id, importFileName: sanitizeCell(params.fileName) };
      const ingestResult = await ingestPortalLead(params.organizationId, "HOUSING", result.canonical, mapped, { snapshot });

      if (ingestResult.status === "NEW") {
        if (result.notes) {
          try {
            await logActivity({
              leadId: ingestResult.lead.id,
              organizationId: params.organizationId,
              type: "NOTE_ADDED",
              description: `[Housing Import] ${sanitizeCell(result.notes).slice(0, 2000)}`,
              actorId: params.actorId,
              metadata: { provenance: "HOUSING_IMPORT", importJobId: job.id },
            });
          } catch (noteErr) {
            logger.error("housing_file_import_note_failed", { importJobId: job.id, leadId: ingestResult.lead.id, message: noteErr instanceof Error ? noteErr.message : String(noteErr) });
          }
        }
        imported++;
        if (result.needsReview) needsReview++;
        outcomes.push({ rowNumber, outcome: result.needsReview ? "NEEDS_REVIEW" : "IMPORTED", leadId: ingestResult.lead.id, eventId: ingestResult.event.id, issues: result.reviewReasons });
      } else if (ingestResult.status === "MATCHED_EXISTING") {
        duplicatesSkippedOrMatched++;
        outcomes.push({ rowNumber, outcome: "MATCHED_EXISTING", eventId: ingestResult.event.id, issues: [`Matched an existing lead by phone/email - no new lead created`, ...result.reviewReasons] });
      } else if (ingestResult.status === "AMBIGUOUS") {
        needsReview++;
        outcomes.push({ rowNumber, outcome: "NEEDS_REVIEW", eventId: ingestResult.event.id, issues: ["Multiple existing leads matched this phone/email - left for manual review, nothing auto-merged", ...result.reviewReasons] });
      } else {
        duplicatesSkippedOrMatched++;
        outcomes.push({ rowNumber, outcome: "DUPLICATE", eventId: ingestResult.event.id, issues: ["Identical row already imported"] });
      }
    } catch (err) {
      failed++;
      outcomes.push({ rowNumber, outcome: "FAILED", issues: ["Row could not be imported due to an internal error"] });
      logger.error("housing_file_import_row_failed", { importJobId: job.id, rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  await prisma.importRecord.createMany({
    data: outcomes.map((o) => ({
      importJobId: job.id,
      rowNumber: o.rowNumber,
      status: o.outcome === "IMPORTED" ? "IMPORTED" : o.outcome === "INVALID" ? "INVALID" : o.outcome === "FAILED" ? "SKIPPED" : o.outcome === "NEEDS_REVIEW" ? "WARNING" : "DUPLICATE",
      rawData: JSON.stringify(sanitizeRowForHistory(params.rows[o.rowNumber - 1], params.columnMapping)),
      errorMessage: o.issues.length ? o.issues.join("; ").slice(0, 1000) : null,
      entityId: o.leadId ?? o.eventId ?? null,
    })),
  });

  const completed = await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      validRows: params.rows.length - invalid,
      invalidRows: invalid,
      duplicateRows: duplicatesSkippedOrMatched,
      warningRows: needsReview,
      importedRows: imported,
      failedRows: failed,
      completedAt: new Date(),
    },
  });

  await recordAudit({
    userId: params.actorId,
    action: "IMPORT",
    entityType: "ImportJob",
    entityId: job.id,
    newValues: { source: "HOUSING", fileName: params.fileName, total: params.rows.length, imported, duplicatesSkippedOrMatched, needsReview, invalid, failed },
  });
  logger.info("housing_file_import_completed", { importJobId: job.id, total: params.rows.length, imported, duplicatesSkippedOrMatched, needsReview, invalid, failed });

  return {
    jobId: completed.id,
    summary: { total: params.rows.length, imported, duplicatesSkippedOrMatched, needsReview, invalid, failed },
    rows: outcomes,
  };
}

/** Never persist Address (whatever the source file's own header for it is called), and cap every remaining cell's length before it lands in ImportRecord.rawData - internal-only (ADMIN/DATA_MANAGER), but still no reason to keep more than needed. */
function sanitizeRowForHistory(row: Record<string, string>, columnMapping: Partial<Record<HousingFileImportColumn, string>>): Record<string, string> {
  const addressHeader = columnMapping["Address"];
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (addressHeader && key === addressHeader) continue;
    out[key] = sanitizeCell(String(value ?? "").slice(0, 500));
  }
  return out;
}

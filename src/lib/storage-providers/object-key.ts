import { randomUUID } from "crypto";
import type { DocumentEntityType } from "@prisma/client";
import { StorageValidationError } from "./types";

/**
 * Object keys never contain the original file name, owner/client names,
 * phone numbers, Aadhaar/PAN, emails, or any other identifying text - only
 * organization/entity IDs (already-opaque CUIDs) and a generated UUID. The
 * original file name is preserved only in Document.originalFilename in
 * Postgres, never in the storage path itself.
 */

const ENTITY_SEGMENT: Record<DocumentEntityType, string> = {
  PROPERTY: "properties",
  LEAD: "leads",
  OWNER: "owners",
  DEAL: "deals",
  PAYMENT: "payments",
};

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/;

/** Rejects path traversal, null bytes, and separators before an ID or file name ever reaches a storage path. */
function assertSafeSegment(value: string, label: string): string {
  if (!SAFE_ID.test(value)) {
    throw new StorageValidationError(`Invalid ${label} - must be a plain alphanumeric identifier`);
  }
  return value;
}

/** Extracts and validates a file extension - never trusts the rest of the file name. */
export function sanitizeExtension(fileName: string): string {
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new StorageValidationError("File name is required");
  }
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0")) {
    throw new StorageValidationError("File name contains invalid characters");
  }
  const parts = fileName.split(".");
  if (parts.length < 2 || parts[parts.length - 1].length === 0) {
    throw new StorageValidationError("File name must include an extension");
  }
  const ext = parts[parts.length - 1].toLowerCase();
  if (!SAFE_EXTENSION.test(ext)) {
    throw new StorageValidationError(`Unsafe or unrecognized file extension ".${ext}"`);
  }
  return ext;
}

export interface BuildDocumentObjectKeyParams {
  organizationId: string;
  entityType: DocumentEntityType;
  entityId: string;
  fileName: string;
}

/** organizations/{orgId}/{entityType-segment}/{entityId}/{documents|receipts}/{uuid}.{ext} */
export function buildDocumentObjectKey(params: BuildDocumentObjectKeyParams): string {
  const organizationId = assertSafeSegment(params.organizationId, "organization id");
  const entityId = assertSafeSegment(params.entityId, "entity id");
  const ext = sanitizeExtension(params.fileName);
  const segment = ENTITY_SEGMENT[params.entityType];
  const sub = params.entityType === "PAYMENT" ? "receipts" : "documents";
  return `organizations/${organizationId}/${segment}/${entityId}/${sub}/${randomUUID()}.${ext}`;
}

export interface BuildPropertyImageObjectKeyParams {
  organizationId: string;
  propertyId: string;
  fileName: string;
  purpose: "IMAGE" | "FLOOR_PLAN" | "AVAILABILITY_REPORT";
}

/** organizations/{orgId}/properties/{propertyId}/{images|floor-plans|availability-reports}/{uuid}.{ext} */
export function buildPropertyImageObjectKey(params: BuildPropertyImageObjectKeyParams): string {
  const organizationId = assertSafeSegment(params.organizationId, "organization id");
  const propertyId = assertSafeSegment(params.propertyId, "property id");
  const ext = sanitizeExtension(params.fileName);
  const sub = params.purpose === "FLOOR_PLAN" ? "floor-plans" : params.purpose === "AVAILABILITY_REPORT" ? "availability-reports" : "images";
  return `organizations/${organizationId}/properties/${propertyId}/${sub}/${randomUUID()}.${ext}`;
}

/** Legacy signature kept for existing call sites (upload-url route, documents.ts) - same safe key shape as buildDocumentObjectKey. */
export function buildObjectKey(params: { organizationId: string; entityType: string; entityId: string; fileName: string }): string {
  return buildDocumentObjectKey({
    organizationId: params.organizationId,
    entityType: params.entityType as DocumentEntityType,
    entityId: params.entityId,
    fileName: params.fileName,
  });
}

import { prisma } from "./prisma";
import type { Document, DocumentCategory, Role } from "@prisma/client";

/**
 * Category-based access policy for the Document Vault (Phase 1 Firebase
 * Storage). Enforced server-side in every download/replace/delete route -
 * hiding a UI button is never sufficient authorization on its own.
 */

/** Aadhaar, PAN, registry, ownership proof, owner identity, and sensitive payment receipts - Admin only, per spec. */
const ADMIN_ONLY_CATEGORIES = new Set<DocumentCategory>([
  "AADHAAR",
  "PAN",
  "REGISTRY",
  "OWNERSHIP_PROOF",
  "OWNER_IDENTITY",
  "PAYMENT_RECEIPT",
]);

/** Role-only check, no entity relationship yet - use canAccessDocument for the full check including Field Executive's assigned-visit/lead scoping. */
export function canAccessDocumentCategory(role: Role, category: DocumentCategory): boolean {
  if (role === "ADMIN") return true;
  if (role === "DATA_MANAGER") return !ADMIN_ONLY_CATEGORIES.has(category);
  if (role === "FIELD_EXECUTIVE") return category === "GENERAL";
  return false;
}

/**
 * Full access check for a specific document: category gate first (cheap,
 * no I/O), then - for Field Executives only - confirms the document is
 * actually linked to a lead assigned to them or a property they have an
 * assigned visit for. Admin/Data Manager only need the category gate once
 * organization scoping (already enforced by the caller's `where`) holds.
 */
export async function canAccessDocument(role: Role, userId: string, document: Pick<Document, "category" | "leadId" | "propertyId">): Promise<boolean> {
  if (!canAccessDocumentCategory(role, document.category)) return false;
  if (role !== "FIELD_EXECUTIVE") return true;

  if (document.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: document.leadId, assignedToId: userId }, select: { id: true } });
    if (lead) return true;
  }
  if (document.propertyId) {
    const visit = await prisma.visit.findFirst({ where: { propertyId: document.propertyId, assignedToId: userId }, select: { id: true } });
    if (visit) return true;
  }
  return false;
}

/** Which categories a role may set when uploading - mirrors the download-side policy so a user can never upload a category they wouldn't be allowed to see. */
export function canUploadDocumentCategory(role: Role, category: DocumentCategory): boolean {
  return canAccessDocumentCategory(role, category);
}

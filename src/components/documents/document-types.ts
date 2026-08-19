import type { BadgeTone } from "@/components/ui/badge";

export type DocumentEntityType = "PROPERTY" | "LEAD" | "OWNER" | "DEAL" | "PAYMENT";
export type DocumentCategory =
  | "GENERAL"
  | "AADHAAR"
  | "PAN"
  | "REGISTRY"
  | "OWNERSHIP_PROOF"
  | "RENT_AGREEMENT"
  | "SALE_AGREEMENT"
  | "BROKERAGE_AGREEMENT"
  | "DEAL_DOCUMENT"
  | "PAYMENT_RECEIPT"
  | "OWNER_IDENTITY"
  | "PROPERTY_BROCHURE";
export type DocumentStatus = "ACTIVE" | "EXPIRED" | "DELETED";
export type Role = "ADMIN" | "DATA_MANAGER" | "FIELD_EXECUTIVE";

export interface DocumentRecord {
  id: string;
  entityType: DocumentEntityType;
  propertyId: string | null;
  leadId: string | null;
  ownerId: string | null;
  dealId: string | null;
  paymentId: string | null;
  fileName: string;
  fileUrl: string;
  storageKey: string | null;
  originalFilename: string | null;
  category: DocumentCategory;
  fileType: string;
  fileSizeBytes: number | null;
  status: DocumentStatus;
  expiresAt: string | null;
  version: number;
  previousDocumentId: string | null;
  uploadedById: string | null;
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const ENTITY_TYPES: DocumentEntityType[] = ["PROPERTY", "LEAD", "OWNER", "DEAL", "PAYMENT"];

export const ENTITY_LABELS: Record<DocumentEntityType, string> = {
  PROPERTY: "Property",
  LEAD: "Lead",
  OWNER: "Owner",
  DEAL: "Deal",
  PAYMENT: "Payment",
};

/** Every entity type with an existing detail-page route the UI can deep-link to; Owner/Deal/Payment don't have one yet. */
export const ENTITY_DETAIL_ROUTE: Partial<Record<DocumentEntityType, (id: string) => string>> = {
  PROPERTY: (id) => `/properties/${id}`,
  LEAD: (id) => `/leads/${id}`,
};

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  GENERAL: "General",
  AADHAAR: "Aadhaar",
  PAN: "PAN",
  REGISTRY: "Registry",
  OWNERSHIP_PROOF: "Ownership Proof",
  RENT_AGREEMENT: "Rent Agreement",
  SALE_AGREEMENT: "Sale Agreement",
  BROKERAGE_AGREEMENT: "Brokerage Agreement",
  DEAL_DOCUMENT: "Deal Document",
  PAYMENT_RECEIPT: "Payment Receipt",
  OWNER_IDENTITY: "Owner Identity",
  PROPERTY_BROCHURE: "Property Brochure",
};

/** Mirrors src/lib/document-access.ts ADMIN_ONLY_CATEGORIES - UI-only labeling/warnings, never the source of truth (the backend re-checks every request). */
export const SENSITIVE_CATEGORIES = new Set<DocumentCategory>(["AADHAAR", "PAN", "REGISTRY", "OWNERSHIP_PROOF", "OWNER_IDENTITY", "PAYMENT_RECEIPT"]);

export function categoriesForRole(role: Role): DocumentCategory[] {
  const all = Object.keys(CATEGORY_LABELS) as DocumentCategory[];
  if (role === "ADMIN") return all;
  if (role === "DATA_MANAGER") return all.filter((c) => !SENSITIVE_CATEGORIES.has(c));
  return ["GENERAL"];
}

export const STATUS_TONE: Record<DocumentStatus, BadgeTone> = {
  ACTIVE: "green",
  EXPIRED: "amber",
  DELETED: "slate",
};

export function formatBytes(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

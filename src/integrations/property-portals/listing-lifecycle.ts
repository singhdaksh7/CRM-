import "server-only";
import type { Property } from "@prisma/client";
import type { CapabilityStatus } from "./registry";

export type ListingAction = "PUBLISH" | "UPDATE" | "DEACTIVATE";
export function listingActionState(action: ListingAction, capability: CapabilityStatus, connected: boolean, status: string) {
  if (!connected) return { allowed: false, reason: "NOT_CONFIGURED" } as const;
  if (capability !== "AVAILABLE") return { allowed: false, reason: capability } as const;
  if (action === "PUBLISH" && status !== "DRAFT" && status !== "FAILED") return { allowed: false, reason: "ALREADY_PUBLISHED" } as const;
  if (action !== "PUBLISH" && status !== "PUBLISHED" && status !== "SYNC_CONFLICT") return { allowed: false, reason: "NOT_PUBLISHED" } as const;
  return { allowed: true } as const;
}
export function portalPayloadPreview(property: Property) {
  const price = property.listingType === "RENT" ? property.monthlyRent : property.salePrice;
  const errors = [!property.title && "title", !property.area && "locality", !price && "price", !property.builtUpAreaSqft && "builtUpAreaSqft"].filter(Boolean) as string[];
  return { valid: errors.length === 0, errors, payload: { title: property.title, assetClass: property.assetClass, transactionType: property.listingType, propertyType: property.propertyType, locality: property.area, builtUpAreaSqft: property.builtUpAreaSqft, price, availableFrom: property.availableFrom?.toISOString() ?? null } };
}

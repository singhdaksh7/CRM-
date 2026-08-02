import type { DocumentEntityType } from "@prisma/client";

/** Pure lookup - no I/O - so it (and documents.test.ts) never pull in next-auth. */
const ENTITY_FIELD: Record<DocumentEntityType, "propertyId" | "leadId" | "ownerId" | "dealId" | "paymentId"> = {
  PROPERTY: "propertyId",
  LEAD: "leadId",
  OWNER: "ownerId",
  DEAL: "dealId",
  PAYMENT: "paymentId",
};

export function documentEntityField(entityType: DocumentEntityType) {
  return ENTITY_FIELD[entityType];
}

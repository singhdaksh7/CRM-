import type { Deal, Document, Owner, Property } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, DEMO_ORGANIZATION_ID } from "./constants";
import { ensureDemoDocumentAssets } from "./assets";

export const DOCUMENT_COUNT = 10;

/**
 * The task's 5 requested document types, mapped onto the real
 * DocumentCategory enum: "Owner KYC" -> OWNER_IDENTITY (a dedicated value
 * exists, unlike the Aadhaar/PAN-only mapping this framework used in an
 * earlier pass), "Property papers" -> REGISTRY, "Lease agreements" ->
 * RENT_AGREEMENT.
 */
type DocPlan = { category: Document["category"]; entityType: Document["entityType"]; label: string };
const PLAN: DocPlan[] = [
  { category: "RENT_AGREEMENT", entityType: "DEAL", label: "Lease_Agreement" },
  { category: "AADHAAR", entityType: "OWNER", label: "Aadhaar" },
  { category: "PAN", entityType: "OWNER", label: "PAN" },
  { category: "REGISTRY", entityType: "PROPERTY", label: "Property_Papers" },
  { category: "OWNER_IDENTITY", entityType: "OWNER", label: "Owner_KYC" },
];

export interface DemoDocumentSet {
  all: Document[];
  expiringScenarioId: string;
}

export async function createDemoDocuments(
  rng: Rng,
  owners: Owner[],
  properties: Property[],
  deals: Deal[],
  uploadedById: string,
  count: number = DOCUMENT_COUNT
): Promise<DemoDocumentSet> {
  const assets = ensureDemoDocumentAssets(["RENT_AGREEMENT", "AADHAAR", "PAN", "REGISTRY", "OWNER_IDENTITY"]);
  const all: Document[] = [];
  let expiringScenarioId = "";
  const rentDeals = deals.filter((d) => d.dealType === "RENTAL");

  for (let i = 0; i < count; i++) {
    const plan = PLAN[i % PLAN.length];
    const isExpiringScenario = i === 0 && plan.entityType === "PROPERTY";
    const owner = owners[i % owners.length];
    const property = properties[i % properties.length];
    const deal = rentDeals.length > 0 ? rentDeals[i % rentDeals.length] : null;

    const base = {
      id: demoId("doc", i + 1),
      organizationId: DEMO_ORGANIZATION_ID,
      entityType: plan.entityType,
      fileType: "image/svg+xml",
      category: plan.category,
      status: "ACTIVE" as const,
      uploadedById,
      expiresAt: isExpiringScenario ? rng.daysFromNow(10) : null,
    };

    let doc: Document;
    if (plan.entityType === "OWNER") {
      doc = await prisma.document.create({
        data: { ...base, ownerId: owner.id, fileName: `${owner.name.replace(/\s+/g, "_")}_${plan.label}.pdf`, fileUrl: assets[plan.category] },
      });
    } else if (plan.entityType === "PROPERTY") {
      doc = await prisma.document.create({
        data: { ...base, propertyId: property.id, fileName: `${property.propertyCode}_${plan.label}.pdf`, fileUrl: assets[plan.category] },
      });
    } else {
      // DEAL - falls back to a PROPERTY-linked doc when there's no rent deal to attach to yet (small demo counts).
      if (deal) {
        doc = await prisma.document.create({
          data: { ...base, dealId: deal.id, fileName: `${deal.dealCode}_${plan.label}.pdf`, fileUrl: assets[plan.category] },
        });
      } else {
        doc = await prisma.document.create({
          data: { ...base, entityType: "PROPERTY", propertyId: property.id, fileName: `${property.propertyCode}_${plan.label}.pdf`, fileUrl: assets[plan.category] },
        });
      }
    }

    all.push(doc);
    if (isExpiringScenario) expiringScenarioId = doc.id;
  }

  return { all, expiringScenarioId };
}

import type { Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { DEMO_ORGANIZATION_ID, demoId } from "./constants";

/**
 * Deterministic mock PropertyImage + brochure metadata only.
 * Never uploads binary bytes or contacts a real storage provider.
 */
export async function createDemoPropertyMedia(properties: Property[], uploadedBy: User): Promise<{ images: number; brochures: number }> {
  if (properties.length === 0) return { images: 0, brochures: 0 };

  const propA = properties[0];
  const propC = properties[2] ?? properties[properties.length - 1];

  // Property A: cover + 4 gallery images
  const imageRows = [];
  for (let i = 0; i < 5; i++) {
    imageRows.push(
      prisma.propertyImage.create({
        data: {
          id: demoId("prop-img", i + 1),
          organizationId: DEMO_ORGANIZATION_ID,
          propertyId: propA.id,
          purpose: "IMAGE",
          visibility: "PUBLIC",
          status: "ACTIVE",
          storageProvider: "MOCK",
          storageKey: `organizations/${DEMO_ORGANIZATION_ID}/properties/${propA.id}/images/demo-${i + 1}.webp`,
          originalFilename: `demo-photo-${i + 1}.webp`,
          mimeType: "image/webp",
          sizeBytes: 120_000 + i * 1000,
          width: 1600,
          height: 1200,
          sortOrder: i,
          isCover: i === 0,
          caption: i === 0 ? "Cover" : `Gallery ${i}`,
          uploadedById: uploadedBy.id,
        },
      })
    );
  }

  // Property B intentionally has no PropertyImage rows (legacy coverImage only).

  // Property C: brochure metadata (public-safe) + one floor plan metadata
  const brochure = prisma.document.create({
    data: {
      id: demoId("brochure", 1),
      organizationId: DEMO_ORGANIZATION_ID,
      entityType: "PROPERTY",
      propertyId: propC.id,
      fileName: `${propC.propertyCode}_Brochure.pdf`,
      fileUrl: "",
      storageKey: `organizations/${DEMO_ORGANIZATION_ID}/properties/${propC.id}/documents/demo-brochure.pdf`,
      storageProvider: "MOCK",
      originalFilename: "brochure.pdf",
      category: "PROPERTY_BROCHURE",
      isPublic: true,
      fileType: "application/pdf",
      fileSizeBytes: 250_000,
      uploadedById: uploadedBy.id,
    },
  });

  const floorPlan = prisma.propertyImage.create({
    data: {
      id: demoId("prop-img", 100),
      organizationId: DEMO_ORGANIZATION_ID,
      propertyId: propC.id,
      purpose: "FLOOR_PLAN",
      visibility: "PUBLIC",
      status: "ACTIVE",
      storageProvider: "MOCK",
      storageKey: `organizations/${DEMO_ORGANIZATION_ID}/properties/${propC.id}/floor-plans/demo-plan.webp`,
      originalFilename: "floor-plan.webp",
      mimeType: "image/webp",
      sizeBytes: 90_000,
      sortOrder: 0,
      isCover: false,
      uploadedById: uploadedBy.id,
    },
  });

  await Promise.all([...imageRows, brochure, floorPlan]);
  return { images: 6, brochures: 1 };
}

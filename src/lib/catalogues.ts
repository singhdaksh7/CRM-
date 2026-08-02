import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import { logActivity } from "./activity";
import { sendOutboundMessage } from "./whatsapp-messages";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { getPublicCatalogueUrl, buildCatalogueMessageText, toPublicCatalogueDTO } from "./catalogue-dto";

// Re-exported so existing call sites (API routes, components) can keep
// importing everything catalogue-related from "@/lib/catalogues" - the
// pure DTO/rendering logic lives in catalogue-dto.ts purely so it can be
// unit-tested without pulling in next-auth via ApiError below (see that
// file's top comment).
export { getPublicCatalogueUrl, buildCatalogueMessageText, toPublicCatalogueDTO };
export type { PublicCatalogueDTO, PublicCatalogueProperty } from "./catalogue-dto";

export interface CataloguePropertyInput {
  propertyId: string;
  sortOrder: number;
  customNote?: string | null;
  priceVisible: boolean;
  addressVisible: boolean;
  brokerageVisible: boolean;
}

export interface CreateCatalogueParams {
  leadId: string;
  createdByUserId: string;
  title: string;
  introMessage?: string | null;
  includePrice: boolean;
  includeAddress: boolean;
  includeBrokerage: boolean;
  expiresAt?: Date | null;
  properties: CataloguePropertyInput[];
}

/** Cryptographically random, unguessable, and never derived from any database ID. */
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createCatalogue(params: CreateCatalogueParams) {
  if (params.properties.length === 0) throw new ApiError(400, "Select at least one property for the catalogue");

  const organizationId = getOrganizationId();
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) throw new ApiError(404, "Lead not found");

  const propertyIds = params.properties.map((p) => p.propertyId);
  const foundProperties = await prisma.property.findMany({ where: { id: { in: propertyIds }, organizationId } });
  if (foundProperties.length !== propertyIds.length) {
    throw new ApiError(400, "One or more selected properties were not found in this organization's inventory");
  }

  let token = generateToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const collision = await prisma.catalogueShare.findUnique({ where: { token } });
    if (!collision) break;
    token = generateToken();
  }

  const catalogue = await prisma.catalogueShare.create({
    data: {
      organizationId,
      token,
      leadId: params.leadId,
      createdByUserId: params.createdByUserId,
      title: params.title,
      introMessage: params.introMessage,
      includePrice: params.includePrice,
      includeAddress: params.includeAddress,
      includeBrokerage: params.includeBrokerage,
      expiresAt: params.expiresAt,
      properties: {
        create: params.properties.map((p) => ({
          propertyId: p.propertyId,
          sortOrder: p.sortOrder,
          customNote: p.customNote,
          priceVisible: p.priceVisible,
          addressVisible: p.addressVisible,
          brokerageVisible: p.brokerageVisible,
        })),
      },
    },
    include: { properties: { include: { property: true }, orderBy: { sortOrder: "asc" } } },
  });

  await logActivity({
    leadId: params.leadId,
    type: "CATALOGUE_CREATED",
    description: `Catalogue "${params.title}" created with ${params.properties.length} propert${params.properties.length > 1 ? "ies" : "y"}`,
    actorId: params.createdByUserId,
  });

  return catalogue;
}

export async function getCatalogueById(catalogueId: string) {
  const catalogue = await prisma.catalogueShare.findUnique({
    where: { id: catalogueId },
    include: { properties: { include: { property: true }, orderBy: { sortOrder: "asc" } }, lead: true },
  });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");
  return catalogue;
}

export async function listCataloguesForLead(leadId: string) {
  return prisma.catalogueShare.findMany({
    where: { leadId },
    include: { properties: { include: { property: true } } },
    orderBy: { createdAt: "desc" },
  });
}

interface UpdateCatalogueParams {
  title?: string;
  introMessage?: string | null;
  includePrice?: boolean;
  includeAddress?: boolean;
  includeBrokerage?: boolean;
  expiresAt?: Date | null;
  properties?: CataloguePropertyInput[];
}

export async function updateCatalogue(catalogueId: string, patch: UpdateCatalogueParams) {
  const existing = await getCatalogueById(catalogueId);
  if (existing.status !== "ACTIVE") throw new ApiError(400, `Cannot edit a ${existing.status.toLowerCase()} catalogue`);

  if (patch.properties) {
    const organizationId = getOrganizationId();
    const propertyIds = patch.properties.map((p) => p.propertyId);
    const found = await prisma.property.findMany({ where: { id: { in: propertyIds }, organizationId } });
    if (found.length !== propertyIds.length) throw new ApiError(400, "One or more selected properties were not found in this organization's inventory");

    await prisma.catalogueShareProperty.deleteMany({ where: { catalogueShareId: catalogueId } });
    await prisma.catalogueShareProperty.createMany({
      data: patch.properties.map((p) => ({
        catalogueShareId: catalogueId,
        propertyId: p.propertyId,
        sortOrder: p.sortOrder,
        customNote: p.customNote,
        priceVisible: p.priceVisible,
        addressVisible: p.addressVisible,
        brokerageVisible: p.brokerageVisible,
      })),
    });
  }

  return prisma.catalogueShare.update({
    where: { id: catalogueId },
    data: {
      title: patch.title,
      introMessage: patch.introMessage,
      includePrice: patch.includePrice,
      includeAddress: patch.includeAddress,
      includeBrokerage: patch.includeBrokerage,
      expiresAt: patch.expiresAt,
    },
    include: { properties: { include: { property: true }, orderBy: { sortOrder: "asc" } } },
  });
}

export async function revokeCatalogue(catalogueId: string, actorId: string) {
  const catalogue = await getCatalogueById(catalogueId);
  const updated = await prisma.catalogueShare.update({ where: { id: catalogueId }, data: { status: "REVOKED" } });
  await logActivity({ leadId: catalogue.leadId, type: "CATALOGUE_REVOKED", description: `Catalogue "${catalogue.title}" revoked`, actorId });
  return updated;
}

/** Sends the catalogue via the configured provider, and records the same event in the legacy SharedPropertyLog for the lead's existing "Shared" tab. */
export async function sendCatalogue(catalogueId: string, sentByUserId: string) {
  const catalogue = await getCatalogueById(catalogueId);
  if (catalogue.status !== "ACTIVE") throw new ApiError(400, `Cannot send a ${catalogue.status.toLowerCase()} catalogue`);

  const message = buildCatalogueMessageText(catalogue);
  const catalogueUrl = getPublicCatalogueUrl(catalogue.token);

  const { message: sentMessage, clickToChatUrl } = await sendOutboundMessage({
    leadId: catalogue.leadId,
    sentByUserId,
    content: message,
    messageType: "CATALOGUE",
    catalogueUrl,
    metadata: { catalogueShareId: catalogue.id },
  });

  // Bridge to the Phase 1 SharedPropertyLog so the lead's existing "Shared"
  // tab keeps showing every share, old and new, in one place.
  const phoneForLink = normalizeIndianPhone(catalogue.lead.phone);
  await prisma.sharedPropertyLog.create({
    data: {
      organizationId: catalogue.organizationId,
      leadId: catalogue.leadId,
      propertyIds: JSON.stringify(catalogue.properties.map((p) => p.propertyId)),
      message,
      sharedById: sentByUserId,
      whatsappLink: clickToChatUrl ?? (phoneForLink ? `https://wa.me/${phoneForLink}` : catalogueUrl),
      propertyId: catalogue.properties[0]?.propertyId,
    },
  });

  await logActivity({
    leadId: catalogue.leadId,
    type: "CATALOGUE_SENT",
    description: `Catalogue "${catalogue.title}" sent containing ${catalogue.properties.length} propert${catalogue.properties.length > 1 ? "ies" : "y"}`,
    actorId: sentByUserId,
  });

  if (["NEW", "CONTACTED", "QUALIFIED"].includes(catalogue.lead.status)) {
    await prisma.lead.update({ where: { id: catalogue.leadId }, data: { status: "PROPERTIES_SHARED", lastContactedAt: new Date() } });
  }

  return { message: sentMessage, clickToChatUrl, catalogueUrl };
}

export async function getCatalogueByToken(token: string) {
  const catalogue = await prisma.catalogueShare.findUnique({
    where: { token },
    include: { properties: { include: { property: true }, orderBy: { sortOrder: "asc" } }, lead: true },
  });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");

  if (catalogue.status === "ACTIVE" && catalogue.expiresAt && catalogue.expiresAt < new Date()) {
    await prisma.catalogueShare.update({ where: { id: catalogue.id }, data: { status: "EXPIRED" } });
    catalogue.status = "EXPIRED";
  }

  return catalogue;
}

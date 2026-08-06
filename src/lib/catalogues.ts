import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import { logActivity } from "./activity";
import { notifyRoles, createNotification } from "./notifications";
import { sendOutboundMessage } from "./whatsapp-messages";
import { getConversationForLead } from "./whatsapp-conversations";
import { normalizeIndianPhone, getWhatsAppProvider, buildRequirementSummary } from "@/integrations/whatsapp";
import { isWithinCustomerCareWindow } from "@/integrations/whatsapp/whatsapp-window";
import { getWhatsAppTemplate, renderTemplateBody } from "@/integrations/whatsapp/whatsapp-templates";
import { getPublicCatalogueUrl, buildCatalogueMessageText, toPublicCatalogueDTO } from "./catalogue-dto";
import { getCoverImageUrls } from "./property-images";
import type { PublicCatalogueDTO } from "./catalogue-dto";
import type { Role } from "@prisma/client";

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
  /** Broker-only note, never surfaced in the public DTO or the client-facing message - `customNote` remains the client-facing one. */
  internalNote?: string | null;
  priceVisible: boolean;
  addressVisible: boolean;
  brokerageVisible: boolean;
  isTopPick?: boolean;
  addedManually?: boolean;
  addedByUserId?: string | null;
}

export interface CreateCatalogueParams {
  leadId: string;
  createdByUserId: string;
  /** Role of the creating user - when FIELD_EXECUTIVE, Admin/Data Manager are notified the catalogue needs review before sending. Optional so existing internal callers (tests, scripts) keep working without it. */
  createdByRole?: Role;
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
          internalNote: p.internalNote,
          priceVisible: p.priceVisible,
          addressVisible: p.addressVisible,
          brokerageVisible: p.brokerageVisible,
          isTopPick: p.isTopPick ?? false,
          addedManually: p.addedManually ?? false,
          addedByUserId: p.addedByUserId ?? null,
        })),
      },
    },
    include: { properties: { include: { property: true, addedByUser: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" } } },
  });

  await logActivity({
    leadId: params.leadId,
    type: "CATALOGUE_CREATED",
    description: `Catalogue "${params.title}" created with ${params.properties.length} propert${params.properties.length > 1 ? "ies" : "y"}`,
    actorId: params.createdByUserId,
  });

  if (params.createdByRole === "FIELD_EXECUTIVE") {
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "CATALOGUE_READY_FOR_REVIEW",
      title: "Catalogue ready for review",
      message: `${lead.clientName} - catalogue "${params.title}" was created by a field executive and is ready for review.`,
      leadId: params.leadId,
    });
  }

  // Phase 4, Objective 9 - the assigned executive automatically receives the
  // same catalogue (no second share/token record - they open the internal
  // version of this one). Skipped when the executive is the one who just
  // created it themselves - no need to notify someone of their own action.
  if (lead.assignedToId && lead.assignedToId !== params.createdByUserId) {
    await logActivity({
      leadId: params.leadId,
      type: "CATALOGUE_INTERNAL_SHARED",
      description: `Catalogue "${params.title}" automatically shared with the assigned field executive`,
      actorId: params.createdByUserId,
    });
    await createNotification({
      organizationId,
      userId: lead.assignedToId,
      type: "INTERNAL_CATALOGUE_SHARED",
      title: "New catalogue for your lead",
      message: `${lead.clientName} - catalogue "${params.title}" is ready. Open it for owner/partner details, navigation, and internal notes.`,
      leadId: params.leadId,
    });
  }

  return catalogue;
}

// Minimal, name-only selection for the message-rendering fields
// (employeeName/brokerageName) - deliberately never `true` (which would
// pull the full User row, including passwordHash, into memory) even though
// neither of these objects is ever serialized as-is (only toPublicCatalogueDTO
// / buildCatalogueMessageText read specific fields off them).
const CATALOGUE_SENDER_INCLUDE = {
  // Phase 4: property now also loads owner/partner so toExecutiveCatalogueDTO
  // can resolve Direct-vs-Indirect contact details without a second query -
  // toPublicCatalogueDTO stays a strict whitelist and never reads these.
  properties: { include: { property: { include: { owner: true, partner: true } }, addedByUser: { select: { id: true, name: true } }, executiveStatusUpdatedBy: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" as const } },
  lead: { include: { assignedTo: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
};

export async function getCatalogueById(catalogueId: string) {
  const catalogue = await prisma.catalogueShare.findUnique({
    where: { id: catalogueId },
    include: CATALOGUE_SENDER_INCLUDE,
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
        internalNote: p.internalNote,
        priceVisible: p.priceVisible,
        addressVisible: p.addressVisible,
        brokerageVisible: p.brokerageVisible,
        isTopPick: p.isTopPick ?? false,
        addedManually: p.addedManually ?? false,
        addedByUserId: p.addedByUserId ?? null,
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
    include: { properties: { include: { property: true, addedByUser: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" } } },
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

  // Meta only allows free-form/"CATALOGUE" session messages within the 24h
  // customer-care window (see sendOutboundMessage). Outside it - and only
  // for the real Meta Cloud provider, which is the only one this window
  // rule applies to - fall back to the approved PROPERTY_OPTIONS_SHARED
  // template instead of the freeform message, exactly like any other
  // outside-window template send. assertTemplateApproved (invoked inside
  // sendOutboundMessage) still gates this on WHATSAPP_APPROVED_TEMPLATE_NAMES,
  // so an unapproved template fails loudly rather than silently degrading.
  const provider = getWhatsAppProvider();
  let outboundParams: Parameters<typeof sendOutboundMessage>[0] = {
    leadId: catalogue.leadId,
    sentByUserId,
    content: message,
    messageType: "CATALOGUE",
    catalogueUrl,
    metadata: { catalogueShareId: catalogue.id },
  };

  if (provider.name === "META_CLOUD") {
    const conversation = await getConversationForLead(catalogue.leadId);
    if (!isWithinCustomerCareWindow(conversation?.lastInboundAt ?? null)) {
      const template = getWhatsAppTemplate("PROPERTY_OPTIONS_SHARED");
      const requirementSummary = buildRequirementSummary(
        catalogue.lead,
        catalogue.properties.map((cp) => ({
          property: cp.property,
          priceVisible: cp.priceVisible,
          addressVisible: cp.addressVisible,
          brokerageVisible: cp.brokerageVisible,
        }))
      );
      const templateBody = renderTemplateBody("PROPERTY_OPTIONS_SHARED", [
        catalogue.lead.clientName.split(" ")[0],
        String(catalogue.properties.length),
        requirementSummary,
        catalogue.lead.preferredLocation,
        catalogueUrl,
      ]);
      outboundParams = { ...outboundParams, messageType: "TEMPLATE", templateName: template.name, content: templateBody };
    }
  }

  const { message: sentMessage, clickToChatUrl } = await sendOutboundMessage(outboundParams);

  // Bridge to the Phase 1 SharedPropertyLog so the lead's existing "Shared"
  // tab keeps showing every share, old and new, in one place.
  const phoneForLink = normalizeIndianPhone(catalogue.lead.phone);
  await prisma.sharedPropertyLog.create({
    data: {
      organizationId: catalogue.organizationId,
      leadId: catalogue.leadId,
      propertyIds: JSON.stringify(catalogue.properties.map((p) => p.propertyId)),
      message: outboundParams.content,
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

  await notifyRoles(["ADMIN"], {
    organizationId: catalogue.organizationId,
    type: "CATALOGUE_SENT",
    title: "Catalogue sent",
    message: `Catalogue "${catalogue.title}" was sent to ${catalogue.lead.clientName}.`,
    leadId: catalogue.leadId,
  });

  if (["NEW", "CONTACTED", "QUALIFIED"].includes(catalogue.lead.status)) {
    await prisma.lead.update({ where: { id: catalogue.leadId }, data: { status: "PROPERTIES_SHARED", lastContactedAt: new Date() } });
  }

  return { message: sentMessage, clickToChatUrl, catalogueUrl };
}

/**
 * Overlays uploaded PropertyImage cover URLs onto the pure DTO (which only
 * knows about the legacy Property.coverImage scalar) - kept out of
 * toPublicCatalogueDTO itself so that function stays I/O-free and
 * unit-testable per the comment at the top of catalogue-dto.ts. Removed or
 * never-uploaded images fall back to whatever coverImage the DTO already has.
 */
export async function withResolvedCoverImages(dto: PublicCatalogueDTO): Promise<PublicCatalogueDTO> {
  if (dto.properties.length === 0) return dto;
  const urls = await getCoverImageUrls(dto.properties.map((p) => p.id), getOrganizationId());
  if (Object.keys(urls).length === 0) return dto;
  return { ...dto, properties: dto.properties.map((p) => ({ ...p, coverImage: urls[p.id] ?? p.coverImage })) };
}

export async function getCatalogueByToken(token: string) {
  const catalogue = await prisma.catalogueShare.findUnique({
    where: { token },
    include: CATALOGUE_SENDER_INCLUDE,
  });
  if (!catalogue) throw new ApiError(404, "Catalogue not found");

  if (catalogue.status === "ACTIVE" && catalogue.expiresAt && catalogue.expiresAt < new Date()) {
    await prisma.catalogueShare.update({ where: { id: catalogue.id }, data: { status: "EXPIRED" } });
    catalogue.status = "EXPIRED";
  }

  return catalogue;
}

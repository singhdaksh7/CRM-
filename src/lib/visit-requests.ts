/**
 * Client visit REQUESTS from a shared catalogue, as the Admin sees them.
 *
 * Product decision (explicit): a client tapping "Request Visit" on the public
 * catalogue page books NOTHING. It records a `VISIT_REQUESTED`
 * CatalogueInteraction plus a `VISIT_CONFIRMATION` FollowUp (see
 * src/lib/catalogue-interactions.ts) and stops there. A real `Visit` +
 * `VisitProperty` rows only ever come into existence when an Admin reviews
 * the request and presses [Confirm Visit].
 *
 * There is deliberately NO separate request model. The CatalogueInteraction
 * row already carries everything a request needs - which catalogue, which
 * property, who asked, when, their preferred date/window, their message - so
 * this module is a read model over those rows plus the three resolution
 * columns added for this workflow (`scheduledVisitId`, `scheduledAt`,
 * `scheduledById`).
 *
 * Grouping: the public page's bulk "Request Visits" button fires one
 * interaction per selected property, so N rows are really ONE request. Rows
 * are grouped by (catalogueShareId, scheduledVisitId) - every still-pending
 * row for a catalogue forms one pending request, and rows already consumed by
 * a confirmed visit group under that visit. That means a client who requests
 * again after a visit was confirmed produces a NEW pending request rather
 * than silently merging into the finished one.
 */

import { prisma } from "./prisma";

export interface VisitRequestProperty {
  propertyId: string;
  title: string;
  propertyCode: string;
  area: string;
  /** False when the property has since been sold/rented or pulled from the catalogue. */
  isSelectable: boolean;
}

export interface VisitRequest {
  /** Stable key for the grouped request: catalogue id + resolution state. */
  id: string;
  status: "PENDING" | "SCHEDULED";
  organizationId: string;
  catalogueShareId: string;
  catalogueTitle: string;
  leadId: string;
  leadCode: string;
  clientName: string;
  /**
   * Client contact. Only ever populated for callers the page has already
   * gated to ADMIN/DATA_MANAGER - a Field Executive never renders this list.
   */
  clientPhone: string | null;
  requestedProperties: VisitRequestProperty[];
  propertyCount: number;
  /** Earliest request row in the group - "when did the client ask". */
  requestedAt: Date;
  preferredDate: string | null;
  preferredWindow: string | null;
  message: string | null;
  /** The CatalogueInteraction ids this request is made of. */
  interactionIds: string[];
  /** Set once confirmed. Drives the "Visit Scheduled - View Visit" state. */
  scheduledVisitId: string | null;
  scheduledAt: Date | null;
}

/** Every active (non-removed) property of the catalogue, for the picker. */
export interface VisitRequestCatalogueOption extends VisitRequestProperty {
  /** True when this property is one the client explicitly asked to see. */
  requested: boolean;
}

function parsePreferences(metadata: string | null): { preferredDate: string | null; preferredWindow: string | null } {
  if (!metadata) return { preferredDate: null, preferredWindow: null };
  try {
    const parsed = JSON.parse(metadata) as { preferredDate?: unknown; preferredWindow?: unknown };
    return {
      preferredDate: typeof parsed.preferredDate === "string" && parsed.preferredDate ? parsed.preferredDate : null,
      preferredWindow: typeof parsed.preferredWindow === "string" && parsed.preferredWindow ? parsed.preferredWindow : null,
    };
  } catch {
    // Metadata is a free-form JSON blob written by several code paths; a
    // malformed one must degrade to "no stated preference", never throw and
    // hide the whole request from the Admin queue.
    return { preferredDate: null, preferredWindow: null };
  }
}

const SELECTABLE_PROPERTY_STATUSES = new Set(["AVAILABLE", "RESERVED"]);

/**
 * All catalogue visit requests for an organization, newest first, pending
 * ones before already-scheduled ones.
 *
 * `includeScheduled` keeps recently-confirmed requests visible so the Admin
 * gets the "Visit Scheduled - View Visit" confirmation state instead of the
 * request simply vanishing (which reads as "did my click work?").
 */
export async function listCatalogueVisitRequests(
  organizationId: string,
  options: { includeScheduled?: boolean; limit?: number } = {}
): Promise<VisitRequest[]> {
  const { includeScheduled = true, limit = 50 } = options;

  const interactions = await prisma.catalogueInteraction.findMany({
    where: {
      organizationId,
      type: "VISIT_REQUESTED",
      ...(includeScheduled ? {} : { scheduledVisitId: null }),
    },
    include: {
      property: { select: { id: true, title: true, propertyCode: true, area: true, status: true } },
      catalogueShare: { select: { id: true, title: true, leadId: true, lead: { select: { id: true, leadCode: true, clientName: true, phone: true } } } },
    },
    orderBy: { createdAt: "desc" },
    // Bounded read: the queue is an actionable worklist, not an archive.
    take: 500,
  });

  const groups = new Map<string, VisitRequest>();

  for (const row of interactions) {
    const catalogue = row.catalogueShare;
    if (!catalogue?.lead) continue;

    const key = `${row.catalogueShareId}:${row.scheduledVisitId ?? "pending"}`;
    const prefs = parsePreferences(row.metadata);

    let group = groups.get(key);
    if (!group) {
      group = {
        id: key,
        status: row.scheduledVisitId ? "SCHEDULED" : "PENDING",
        organizationId,
        catalogueShareId: row.catalogueShareId,
        catalogueTitle: catalogue.title,
        leadId: catalogue.lead.id,
        leadCode: catalogue.lead.leadCode,
        clientName: row.clientName ?? catalogue.lead.clientName,
        clientPhone: row.clientPhone ?? catalogue.lead.phone ?? null,
        requestedProperties: [],
        propertyCount: 0,
        requestedAt: row.createdAt,
        preferredDate: prefs.preferredDate,
        preferredWindow: prefs.preferredWindow,
        message: row.message ?? null,
        interactionIds: [],
        scheduledVisitId: row.scheduledVisitId,
        scheduledAt: row.scheduledAt,
      };
      groups.set(key, group);
    }

    group.interactionIds.push(row.id);
    // Earliest row in the group is when the client actually asked.
    if (row.createdAt < group.requestedAt) group.requestedAt = row.createdAt;
    group.preferredDate ??= prefs.preferredDate;
    group.preferredWindow ??= prefs.preferredWindow;
    group.message ??= row.message ?? null;

    if (row.property && !group.requestedProperties.some((p) => p.propertyId === row.property!.id)) {
      group.requestedProperties.push({
        propertyId: row.property.id,
        title: row.property.title,
        propertyCode: row.property.propertyCode,
        area: row.property.area,
        isSelectable: SELECTABLE_PROPERTY_STATUSES.has(row.property.status),
      });
    }
  }

  const result = [...groups.values()];
  for (const group of result) group.propertyCount = group.requestedProperties.length;

  result.sort((a, b) => {
    if (a.status !== b.status) return a.status === "PENDING" ? -1 : 1;
    return b.requestedAt.getTime() - a.requestedAt.getTime();
  });

  return result.slice(0, limit);
}

/**
 * The properties an Admin may pick from when scheduling a request: every
 * active property of the catalogue, flagged with whether the client asked for
 * it. The scheduling UI pre-selects exactly the requested ones - the Admin can
 * remove any of them, and can only add from this list, so the selection is
 * never silently widened beyond the catalogue.
 */
export async function getVisitRequestCatalogueOptions(
  requests: Pick<VisitRequest, "catalogueShareId" | "requestedProperties">[],
  organizationId: string
): Promise<Record<string, VisitRequestCatalogueOption[]>> {
  const catalogueIds = [...new Set(requests.map((r) => r.catalogueShareId))];
  if (catalogueIds.length === 0) return {};

  // One query for every catalogue in the queue rather than one per request.
  const rows = await prisma.catalogueShareProperty.findMany({
    where: { catalogueShareId: { in: catalogueIds }, removedAt: null, catalogueShare: { organizationId } },
    orderBy: { sortOrder: "asc" },
    include: { property: { select: { id: true, title: true, propertyCode: true, area: true, status: true } } },
  });

  const requestedByCatalogue = new Map<string, Set<string>>();
  for (const request of requests) {
    const set = requestedByCatalogue.get(request.catalogueShareId) ?? new Set<string>();
    for (const p of request.requestedProperties) set.add(p.propertyId);
    requestedByCatalogue.set(request.catalogueShareId, set);
  }

  const byCatalogue: Record<string, VisitRequestCatalogueOption[]> = {};
  for (const row of rows) {
    const requested = requestedByCatalogue.get(row.catalogueShareId) ?? new Set<string>();
    (byCatalogue[row.catalogueShareId] ??= []).push({
      propertyId: row.property.id,
      title: row.property.title,
      propertyCode: row.property.propertyCode,
      area: row.property.area,
      isSelectable: SELECTABLE_PROPERTY_STATUSES.has(row.property.status),
      requested: requested.has(row.property.id),
    });
  }
  return byCatalogue;
}

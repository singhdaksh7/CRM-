import { prisma } from "../prisma";
import { DEMO_ID_PREFIX, DEMO_ORGANIZATION_ID } from "./constants";

/**
 * A minimal structural type for "something with .count() on these models" -
 * deliberately NOT `Pick<typeof prisma, ...>`: Prisma Client Extensions
 * (read-only-guard.ts) return a type-level-incompatible-but-runtime-identical
 * shape (extension generics don't structurally match the base
 * PrismaClient's), so pinning to the exact base type would make it
 * impossible to pass a guarded/extended client in here without an `as`
 * cast at every call site. `count(args: any)` is intentionally loose here
 * (this is an internal cross-cutting utility type, not a public API) -
 * every actual call site below passes a concrete, fully-typed `where`.
 */
type CountableClient = Record<ModelDelegateKeys, { count(args: unknown): Promise<number> }>;
type ModelDelegateKeys =
  | "dealOffer"
  | "requirementBroadcastRecipient"
  | "requirementBroadcast"
  | "matchRecommendation"
  | "catalogueInteraction"
  | "catalogueShareProperty"
  | "catalogueVersionEvent"
  | "catalogueShare"
  | "whatsAppMessage"
  | "whatsAppConversation"
  | "portalOperation"
  | "externalLeadEvent"
  | "portalListing"
  | "propertyPortalConnection"
  | "sharedPropertyLog"
  | "payment"
  | "brokerageCalculation"
  | "deal"
  | "document"
  | "visitFeedback"
  | "visit"
  | "followUp"
  | "leadScoreHistory"
  | "activity"
  | "notification"
  | "savedView"
  | "propertyAvailabilityReport"
  | "propertyReport"
  | "propertyFavorite"
  | "propertyViewLog"
  | "propertyImage"
  | "lead"
  | "property"
  | "owner"
  | "inventoryPartner"
  | "employeeServiceArea"
  | "leadAssignmentRule"
  | "user";

/**
 * Deletes every row this framework could have created, in FK-safe
 * (children-before-parents) order - Option A from the task spec ("delete
 * previous DEMO organization data and recreate"). Safe to call on a DB that
 * also has prisma/seed.ts's data: that script's rows use Prisma's default
 * cuid() ids, never the "kp-demo-..." prefix this framework uses
 * everywhere, so the `startsWith` filters below never match them.
 *
 * Every filter below is double-scoped: by the "kp-demo-" id/relation prefix
 * AND by organizationId - belt-and-suspenders. In this single-tenant app
 * every row lives under DEMO_ORGANIZATION_ID ("org_default") anyway, so the
 * org filter is currently redundant with the prefix filter, but it's cheap
 * insurance against a future multi-tenant change silently widening what
 * `startsWith("kp-demo-")` could match, and it's what a safety audit should
 * see: nothing here can delete another organization's data even in
 * principle, not just "in practice today".
 *
 * Some rows are created by reused business-logic services (recalculateLeadScore,
 * generateSmartNotifications, runMatchingForLead) that assign their own
 * cuid() ids, not deterministic kp-demo- ids - those are deleted via
 * relation filters back to a kp-demo- prefixed, org-scoped parent instead
 * of by id.
 */
/**
 * The portal tables are the newest additions to this schema, so a database
 * that has not yet had the property-business/portal migration applied simply
 * does not have them. Counting/deleting from a table that does not exist
 * throws Prisma's P2021, which previously took down the whole teardown
 * preview (and with it `seed:demo:verify`, which is documented as safe to
 * run anywhere, anytime). "Table absent" and "table present but empty" mean
 * exactly the same thing for teardown - there is nothing to remove - so
 * P2021 degrades to 0 here. Nothing is hidden by this: the dedicated
 * `checkPortalSchemaCompatibility` dry-run check still FAILs loudly when the
 * migration has not been applied. Only P2021 is tolerated; any other error
 * still propagates.
 */
function isMissingTableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2021";
}

async function tolerateMissingTable<T extends { count: number }>(fn: () => Promise<T>): Promise<{ count: number }> {
  try {
    return await fn();
  } catch (error) {
    if (isMissingTableError(error)) return { count: 0 };
    throw error;
  }
}

export async function teardownDemoData(): Promise<{ deletedCounts: Record<string, number> }> {
  const p = DEMO_ID_PREFIX;
  const orgId = DEMO_ORGANIZATION_ID;
  // A relation filter scoped by both the demo id prefix and organizationId.
  const startsWith = (prefix: string) => ({ organizationId: orgId, id: { startsWith: `${p}${prefix}-` } });
  const deletedCounts: Record<string, number> = {};

  async function del(label: string, fn: () => Promise<{ count: number }>) {
    const { count } = await fn();
    deletedCounts[label] = count;
  }

  // --- Phase 5+6 workflow children ---
  await del("matchRecommendation", () => prisma.matchRecommendation.deleteMany({
    where: { organizationId: orgId, OR: [{ lead: startsWith("lead") }, { property: startsWith("prop") }] },
  }));
  await del("requirementBroadcastRecipient", () => prisma.requirementBroadcastRecipient.deleteMany({
    where: { requirementBroadcast: startsWith("broadcast") },
  }));
  await del("requirementBroadcast", () => prisma.requirementBroadcast.deleteMany({
    where: { organizationId: orgId, OR: [{ id: { startsWith: `${p}broadcast-` } }, { lead: startsWith("lead") }] },
  }));
  await del("dealOffer", () => prisma.dealOffer.deleteMany({
    where: { organizationId: orgId, deal: startsWith("deal") },
  }));

  // --- Catalogue tree (leaf -> root) ---
  // catalogueInteraction/catalogueShareProperty each have TWO independent
  // routes to a demo Property: through a demo-prefixed CatalogueShare
  // (the normal case, e.g. every catalogue createDemoCatalogues() makes),
  // OR directly through their own optional/required propertyId FK when a
  // REAL (non-demo-prefixed) catalogue was built against a demo property via
  // the live catalogue-builder UI - e.g. an admin QA-testing catalogue
  // creation against demo inventory. Filtering only by catalogueShare (the
  // original code) misses that second route entirely: the row survives,
  // and property.deleteMany() then fails with a P2003 FK violation on
  // catalogue_share_properties_propertyId_fkey - the exact incident this
  // fix addresses. Deleting these rows is safe even when the parent
  // CatalogueShare/Lead is real: they are link/log rows, not top-level
  // business records - removing one only clears a stale reference to a
  // property that's about to stop existing, and never deletes the real
  // CatalogueShare/Lead itself.
  await del("catalogueInteraction", () =>
    prisma.catalogueInteraction.deleteMany({
      where: { organizationId: orgId, OR: [{ catalogueShare: startsWith("cat") }, { property: startsWith("prop") }] },
    })
  );
  await del("catalogueShareProperty", () =>
    prisma.catalogueShareProperty.deleteMany({
      where: { OR: [{ catalogueShare: startsWith("cat") }, { property: startsWith("prop") }] },
    })
  );
  // Phase 4 - catalogue versioning log; cascades on catalogueShare too, deleted explicitly here (before catalogueShare) for an accurate per-model count.
  // Its own propertyId field (present on some rows) is a plain string, not a foreign key (see schema.prisma) - no additional scoping needed here.
  await del("catalogueVersionEvent", () =>
    prisma.catalogueVersionEvent.deleteMany({ where: { organizationId: orgId, catalogueShare: startsWith("cat") } })
  );
  await del("catalogueShare", () => prisma.catalogueShare.deleteMany({ where: startsWith("cat") }));

  // --- Property-portal tree (leaf -> root). Deleted before lead/property
  // below: PortalListing.propertyId is a required FK (cascade), and
  // ExternalLeadEvent.leadId/portalListingId are SetNull - deleting these
  // explicitly (rather than relying on cascade) keeps the per-model counts
  // accurate and keeps teardown correct if those cascade rules ever change.
  // Every filter is prefix- AND org-scoped exactly like the trees above, so
  // a real (non-demo) portal connection or listing can never be removed. ---
  await del("portalOperation", () => tolerateMissingTable(() => prisma.portalOperation.deleteMany({ where: startsWith("portal-op") })));
  await del("externalLeadEvent", () => tolerateMissingTable(() => prisma.externalLeadEvent.deleteMany({ where: startsWith("portal-evt") })));
  await del("portalListing", () => tolerateMissingTable(() => prisma.portalListing.deleteMany({ where: startsWith("portal-listing") })));
  await del("propertyPortalConnection", () => tolerateMissingTable(() => prisma.propertyPortalConnection.deleteMany({ where: startsWith("portal-conn") })));

  // --- WhatsApp tree ---
  await del("whatsAppMessage", () =>
    prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgId, conversation: startsWith("wa") } })
  );
  await del("whatsAppConversation", () => prisma.whatsAppConversation.deleteMany({ where: startsWith("wa") }));

  // --- Shared property logs (relation-only, no deterministic id). Same
  // two-route reasoning as the catalogue tree above: a real Lead's shared-
  // property log can carry an optional propertyId pointing at a demo
  // property (shared from the live UI), independent of whether the Lead
  // itself is demo-prefixed. The Prisma relation field here is named
  // `Property` (capitalized, an inconsistency already present in
  // schema.prisma), not `property` like every other model. ---
  await del("sharedPropertyLog", () =>
    prisma.sharedPropertyLog.deleteMany({
      where: { organizationId: orgId, OR: [{ lead: startsWith("lead") }, { Property: startsWith("prop") }] },
    })
  );

  // --- Deal tree ---
  // Deliberately NOT widened to an OR-by-property filter like the catalogue/
  // shared-log tables above: unlike a CatalogueShareProperty or
  // SharedPropertyLog row, a Deal is itself a top-level real business record
  // (with real payments/brokerage attached) - deleting a REAL deal just
  // because its optional propertyId happens to point at a demo property
  // would violate "incapable of deleting real records". Known limitation:
  // if a real deal is ever linked to a demo property (only possible via
  // manual live-UI usage, never via the demo seed itself - createDemoDeals()
  // only ever links demo-prefixed deals to demo-prefixed properties),
  // property.deleteMany() below would still fail with a P2003 on that one
  // property; resolving that is a data-hygiene question for whoever created
  // that link, not something teardown should silently paper over.
  await del("payment", () => prisma.payment.deleteMany({ where: { organizationId: orgId, deal: startsWith("deal") } }));
  await del("brokerageCalculation", () =>
    prisma.brokerageCalculation.deleteMany({ where: { organizationId: orgId, deal: startsWith("deal") } })
  );
  await del("deal", () => prisma.deal.deleteMany({ where: startsWith("deal") }));

  // --- Documents (references property/lead/owner/deal). The `deal` clause
  // is defensive - Document.deal has onDelete: Cascade, so deal-linked demo
  // documents are usually already gone by the time this runs (the deal
  // tree above is deleted first) - but filtering on it explicitly here
  // means this deleteMany is correct on its own, not dependent on that
  // ordering/cascade staying true forever. ---
  await del("document", () =>
    prisma.document.deleteMany({
      where: {
        organizationId: orgId,
        OR: [{ property: startsWith("prop") }, { lead: startsWith("lead") }, { owner: startsWith("owner") }, { deal: startsWith("deal") }],
      },
    })
  );

  // --- Visits, follow-ups, lead score history, activities, notifications (relation-scoped) ---
  // Phase 4 - one-to-one with Visit (cascades too, deleted explicitly here first for an accurate per-model count).
  await del("visitFeedback", () => prisma.visitFeedback.deleteMany({ where: { organizationId: orgId, visit: startsWith("visit") } }));
  // VisitProperty cascades on visit delete, but is removed explicitly first so
  // the per-model teardown count is accurate rather than silently zero.
  await del("visitProperty", () => prisma.visitProperty.deleteMany({ where: { organizationId: orgId, visit: startsWith("visit") } }));
  // Visit.propertyId is required (NOT NULL, no cascade) - same "real top-level
  // record" reasoning as Deal above applies even more strongly here: a real
  // Visit can't be partially unlinked (there's no nullable propertyId to
  // clear), so widening this filter would mean either deleting a real visit
  // outright or leaving a dangling reference - both worse than the current,
  // narrow demo-id-scoped delete. createDemoVisits() only ever links
  // demo-prefixed visits to demo-prefixed properties, so this is already
  // complete for anything the seed itself creates.
  await del("visit", () => prisma.visit.deleteMany({ where: startsWith("visit") }));
  await del("followUp", () => prisma.followUp.deleteMany({ where: startsWith("fu") }));
  await del("leadScoreHistory", () =>
    prisma.leadScoreHistory.deleteMany({ where: { organizationId: orgId, lead: startsWith("lead") } })
  );
  await del("activity", () =>
    prisma.activity.deleteMany({
      where: {
        organizationId: orgId,
        OR: [{ lead: startsWith("lead") }, { crmOwner: startsWith("owner") }, { deal: startsWith("deal") }],
      },
    })
  );
  // Notification has no relation fields to Lead/Property/Visit/FollowUp (only
  // scalar leadId/propertyId/visitId/followUpId columns), unlike the other
  // models above - filter directly on those id columns instead.
  await del("notification", () =>
    prisma.notification.deleteMany({
      where: {
        organizationId: orgId,
        OR: [
          { leadId: { startsWith: `${p}lead-` } },
          { propertyId: { startsWith: `${p}prop-` } },
          { visitId: { startsWith: `${p}visit-` } },
          { followUpId: { startsWith: `${p}fu-` } },
          { user: startsWith("emp") },
        ],
      },
    })
  );

  // --- Saved views (owned by demo employees) ---
  await del("savedView", () => prisma.savedView.deleteMany({ where: { organizationId: orgId, user: startsWith("emp") } }));

  // --- Property Issues Queue + engagement (Phase 4) - all property-relation-scoped, deleted before
  // `property` below. PropertyAvailabilityReport must come before propertyImage: its photoId FK to
  // PropertyImage has no onDelete: Cascade (the whole point is a real required evidence photo), so a
  // dangling report would block deleting the photo it points to. PropertyFavorite/PropertyViewLog have
  // no organizationId column of their own (always scoped through userId/propertyId) - the nested
  // `property: startsWith("prop")` relation filter is what keeps this org+prefix-scoped. ---
  await del("propertyAvailabilityReport", () =>
    prisma.propertyAvailabilityReport.deleteMany({ where: { organizationId: orgId, property: startsWith("prop") } })
  );
  await del("propertyReport", () => prisma.propertyReport.deleteMany({ where: { organizationId: orgId, property: startsWith("prop") } }));
  await del("propertyFavorite", () => prisma.propertyFavorite.deleteMany({ where: { property: startsWith("prop") } }));
  await del("propertyViewLog", () => prisma.propertyViewLog.deleteMany({ where: { property: startsWith("prop") } }));
  await del("propertyImage", () => prisma.propertyImage.deleteMany({ where: { organizationId: orgId, property: startsWith("prop") } }));

  // --- Core entities ---
  await del("lead", () => prisma.lead.deleteMany({ where: startsWith("lead") }));
  await del("property", () => prisma.property.deleteMany({ where: startsWith("prop") }));
  await del("owner", () => prisma.owner.deleteMany({ where: startsWith("owner") }));
  // Phase 4 - must come after property (Property.partnerId references this table, no cascade set).
  await del("inventoryPartner", () => prisma.inventoryPartner.deleteMany({ where: startsWith("partner") }));

  // --- Employee-scoped config, then employees themselves ---
  await del("employeeServiceArea", () =>
    prisma.employeeServiceArea.deleteMany({ where: { organizationId: orgId, employee: startsWith("emp") } })
  );
  await del("leadAssignmentRule", () => prisma.leadAssignmentRule.deleteMany({ where: startsWith("rule") }));
  await del("user", () => prisma.user.deleteMany({ where: startsWith("emp") }));

  return { deletedCounts };
}

/**
 * Read-only counterpart to teardownDemoData() - same filters, `.count()`
 * instead of `.deleteMany()`, zero writes. Used by scripts/seed-demo-dry-run.ts
 * and scripts/seed-demo-verify.ts to report "what currently exists / what
 * would be removed" without touching anything. Accepts an optional client
 * so callers that must guarantee zero writes at runtime (not just by
 * convention) can pass the read-only-guarded client from
 * read-only-guard.ts instead of the shared singleton.
 */
/** Count counterpart to tolerateMissingTable() above - same P2021-only degradation, same reasoning. */
async function countTolerantOfMissingTable(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (error) {
    if (isMissingTableError(error)) return 0;
    throw error;
  }
}

export async function previewTeardownCounts(client: CountableClient = prisma): Promise<Record<string, number>> {
  const p = DEMO_ID_PREFIX;
  const orgId = DEMO_ORGANIZATION_ID;
  const startsWith = (prefix: string) => ({ organizationId: orgId, id: { startsWith: `${p}${prefix}-` } });

  const [
    dealOffer, requirementBroadcastRecipient, requirementBroadcast, matchRecommendation,
    catalogueInteraction, catalogueShareProperty, catalogueVersionEvent, catalogueShare,
    whatsAppMessage, whatsAppConversation, sharedPropertyLog,
    portalOperation, externalLeadEvent, portalListing, propertyPortalConnection,
    payment, brokerageCalculation, deal, document,
    visitFeedback, visit, followUp, leadScoreHistory, activity, notification, savedView,
    propertyAvailabilityReport, propertyReport, propertyFavorite, propertyViewLog, propertyImage,
    lead, property, owner, inventoryPartner, employeeServiceArea, leadAssignmentRule, user,
  ] = await Promise.all([
    client.dealOffer.count({ where: { organizationId: orgId, deal: startsWith("deal") } }),
    client.requirementBroadcastRecipient.count({ where: { requirementBroadcast: startsWith("broadcast") } }),
    client.requirementBroadcast.count({ where: { organizationId: orgId, OR: [{ id: { startsWith: `${p}broadcast-` } }, { lead: startsWith("lead") }] } }),
    client.matchRecommendation.count({ where: { organizationId: orgId, OR: [{ lead: startsWith("lead") }, { property: startsWith("prop") }] } }),
    client.catalogueInteraction.count({
      where: { organizationId: orgId, OR: [{ catalogueShare: startsWith("cat") }, { property: startsWith("prop") }] },
    }),
    client.catalogueShareProperty.count({
      where: { OR: [{ catalogueShare: startsWith("cat") }, { property: startsWith("prop") }] },
    }),
    client.catalogueVersionEvent.count({ where: { organizationId: orgId, catalogueShare: startsWith("cat") } }),
    client.catalogueShare.count({ where: startsWith("cat") }),
    client.whatsAppMessage.count({ where: { organizationId: orgId, conversation: startsWith("wa") } }),
    client.whatsAppConversation.count({ where: startsWith("wa") }),
    client.sharedPropertyLog.count({
      where: { organizationId: orgId, OR: [{ lead: startsWith("lead") }, { Property: startsWith("prop") }] },
    }),
    countTolerantOfMissingTable(() => client.portalOperation.count({ where: startsWith("portal-op") })),
    countTolerantOfMissingTable(() => client.externalLeadEvent.count({ where: startsWith("portal-evt") })),
    countTolerantOfMissingTable(() => client.portalListing.count({ where: startsWith("portal-listing") })),
    countTolerantOfMissingTable(() => client.propertyPortalConnection.count({ where: startsWith("portal-conn") })),
    client.payment.count({ where: { organizationId: orgId, deal: startsWith("deal") } }),
    client.brokerageCalculation.count({ where: { organizationId: orgId, deal: startsWith("deal") } }),
    client.deal.count({ where: startsWith("deal") }),
    client.document.count({
      where: {
        organizationId: orgId,
        OR: [{ property: startsWith("prop") }, { lead: startsWith("lead") }, { owner: startsWith("owner") }, { deal: startsWith("deal") }],
      },
    }),
    client.visitFeedback.count({ where: { organizationId: orgId, visit: startsWith("visit") } }),
    client.visit.count({ where: startsWith("visit") }),
    client.followUp.count({ where: startsWith("fu") }),
    client.leadScoreHistory.count({ where: { organizationId: orgId, lead: startsWith("lead") } }),
    client.activity.count({
      where: { organizationId: orgId, OR: [{ lead: startsWith("lead") }, { crmOwner: startsWith("owner") }, { deal: startsWith("deal") }] },
    }),
    client.notification.count({
      where: {
        organizationId: orgId,
        OR: [
          { leadId: { startsWith: `${p}lead-` } },
          { propertyId: { startsWith: `${p}prop-` } },
          { visitId: { startsWith: `${p}visit-` } },
          { followUpId: { startsWith: `${p}fu-` } },
          { user: startsWith("emp") },
        ],
      },
    }),
    client.savedView.count({ where: { organizationId: orgId, user: startsWith("emp") } }),
    client.propertyAvailabilityReport.count({ where: { organizationId: orgId, property: startsWith("prop") } }),
    client.propertyReport.count({ where: { organizationId: orgId, property: startsWith("prop") } }),
    client.propertyFavorite.count({ where: { property: startsWith("prop") } }),
    client.propertyViewLog.count({ where: { property: startsWith("prop") } }),
    client.propertyImage.count({ where: { organizationId: orgId, property: startsWith("prop") } }),
    client.lead.count({ where: startsWith("lead") }),
    client.property.count({ where: startsWith("prop") }),
    client.owner.count({ where: startsWith("owner") }),
    client.inventoryPartner.count({ where: startsWith("partner") }),
    client.employeeServiceArea.count({ where: { organizationId: orgId, employee: startsWith("emp") } }),
    client.leadAssignmentRule.count({ where: startsWith("rule") }),
    client.user.count({ where: startsWith("emp") }),
  ]);

  return {
    dealOffer, requirementBroadcastRecipient, requirementBroadcast, matchRecommendation,
    catalogueInteraction, catalogueShareProperty, catalogueVersionEvent, catalogueShare,
    whatsAppMessage, whatsAppConversation, sharedPropertyLog,
    portalOperation, externalLeadEvent, portalListing, propertyPortalConnection,
    payment, brokerageCalculation, deal, document,
    visitFeedback, visit, followUp, leadScoreHistory, activity, notification, savedView,
    propertyAvailabilityReport, propertyReport, propertyFavorite, propertyViewLog, propertyImage,
    lead, property, owner, inventoryPartner, employeeServiceArea, leadAssignmentRule, user,
  };
}

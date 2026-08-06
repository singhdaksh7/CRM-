import { prisma } from "../prisma";
import { DEMO_ID_PREFIX, DEMO_ORGANIZATION_ID } from "./constants";

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

  // --- Catalogue tree (leaf -> root) ---
  await del("catalogueInteraction", () =>
    prisma.catalogueInteraction.deleteMany({ where: { organizationId: orgId, catalogueShare: startsWith("cat") } })
  );
  await del("catalogueShareProperty", () =>
    prisma.catalogueShareProperty.deleteMany({ where: { catalogueShare: startsWith("cat") } })
  );
  await del("catalogueShare", () => prisma.catalogueShare.deleteMany({ where: startsWith("cat") }));

  // --- WhatsApp tree ---
  await del("whatsAppMessage", () =>
    prisma.whatsAppMessage.deleteMany({ where: { organizationId: orgId, conversation: startsWith("wa") } })
  );
  await del("whatsAppConversation", () => prisma.whatsAppConversation.deleteMany({ where: startsWith("wa") }));

  // --- Shared property logs (relation-only, no deterministic id) ---
  await del("sharedPropertyLog", () =>
    prisma.sharedPropertyLog.deleteMany({ where: { organizationId: orgId, lead: startsWith("lead") } })
  );

  // --- Deal tree ---
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

  // --- Core entities ---
  await del("lead", () => prisma.lead.deleteMany({ where: startsWith("lead") }));
  await del("property", () => prisma.property.deleteMany({ where: startsWith("prop") }));
  await del("owner", () => prisma.owner.deleteMany({ where: startsWith("owner") }));

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
 * would be removed" without touching anything.
 */
export async function previewTeardownCounts(): Promise<Record<string, number>> {
  const p = DEMO_ID_PREFIX;
  const orgId = DEMO_ORGANIZATION_ID;
  const startsWith = (prefix: string) => ({ organizationId: orgId, id: { startsWith: `${p}${prefix}-` } });

  const [
    catalogueInteraction, catalogueShareProperty, catalogueShare,
    whatsAppMessage, whatsAppConversation, sharedPropertyLog,
    payment, brokerageCalculation, deal, document,
    visit, followUp, leadScoreHistory, activity, notification, savedView,
    lead, property, owner, employeeServiceArea, leadAssignmentRule, user,
  ] = await Promise.all([
    prisma.catalogueInteraction.count({ where: { organizationId: orgId, catalogueShare: startsWith("cat") } }),
    prisma.catalogueShareProperty.count({ where: { catalogueShare: startsWith("cat") } }),
    prisma.catalogueShare.count({ where: startsWith("cat") }),
    prisma.whatsAppMessage.count({ where: { organizationId: orgId, conversation: startsWith("wa") } }),
    prisma.whatsAppConversation.count({ where: startsWith("wa") }),
    prisma.sharedPropertyLog.count({ where: { organizationId: orgId, lead: startsWith("lead") } }),
    prisma.payment.count({ where: { organizationId: orgId, deal: startsWith("deal") } }),
    prisma.brokerageCalculation.count({ where: { organizationId: orgId, deal: startsWith("deal") } }),
    prisma.deal.count({ where: startsWith("deal") }),
    prisma.document.count({
      where: {
        organizationId: orgId,
        OR: [{ property: startsWith("prop") }, { lead: startsWith("lead") }, { owner: startsWith("owner") }, { deal: startsWith("deal") }],
      },
    }),
    prisma.visit.count({ where: startsWith("visit") }),
    prisma.followUp.count({ where: startsWith("fu") }),
    prisma.leadScoreHistory.count({ where: { organizationId: orgId, lead: startsWith("lead") } }),
    prisma.activity.count({
      where: { organizationId: orgId, OR: [{ lead: startsWith("lead") }, { crmOwner: startsWith("owner") }, { deal: startsWith("deal") }] },
    }),
    prisma.notification.count({
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
    prisma.savedView.count({ where: { organizationId: orgId, user: startsWith("emp") } }),
    prisma.lead.count({ where: startsWith("lead") }),
    prisma.property.count({ where: startsWith("prop") }),
    prisma.owner.count({ where: startsWith("owner") }),
    prisma.employeeServiceArea.count({ where: { organizationId: orgId, employee: startsWith("emp") } }),
    prisma.leadAssignmentRule.count({ where: startsWith("rule") }),
    prisma.user.count({ where: startsWith("emp") }),
  ]);

  return {
    catalogueInteraction, catalogueShareProperty, catalogueShare,
    whatsAppMessage, whatsAppConversation, sharedPropertyLog,
    payment, brokerageCalculation, deal, document,
    visit, followUp, leadScoreHistory, activity, notification, savedView,
    lead, property, owner, employeeServiceArea, leadAssignmentRule, user,
  };
}

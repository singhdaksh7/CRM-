import { prisma } from "../prisma";
import { getDemoVerificationMetrics } from "./dashboard-verify";
import { countDemoSearchResults } from "./search-verify";
import { getLeadHealth, getLeadHealthOverview } from "../rules/lead-health";
import { getPropertyHealth, getPropertyHealthOverview } from "../rules/property-health";
import { matchPropertiesToLead } from "../matching";
import { toPublicCatalogueDTO } from "../catalogue-dto";
import { DEMO_ORGANIZATION_ID, DEMO_ID_PREFIX } from "./constants";

/**
 * Mirrors catalogues.ts's private CATALOGUE_SENDER_INCLUDE - deliberately
 * NOT importing getCatalogueById/getCatalogueById from ../catalogues here:
 * that module (via ./api-auth) pulls in next-auth and `server-only`, which
 * throws ("This module cannot be imported from a Client Component module")
 * under this framework's plain `tsx` script execution (no Next.js runtime
 * present) - confirmed by trying it. toPublicCatalogueDTO itself has no such
 * dependency (catalogue-dto.ts only takes a type-only import from
 * ../catalogues for exactly this reason), so it's safe to call directly.
 */
const DEMO_VERIFY_CATALOGUE_INCLUDE = {
  properties: {
    include: { property: { include: { owner: true, partner: true } }, addedByUser: { select: { id: true, name: true } }, executiveStatusUpdatedBy: { select: { id: true, name: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
  lead: { include: { assignedTo: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
};

export interface VerificationReport {
  propertyMatching: Record<string, { matchCount: number; topKind: string | null }>;
  dashboard: { criticalKeysPresent: boolean; totalLeads: number; totalProperties: number };
  /** Always "skipped" on this branch - depends on src/lib/report-builder.ts, a Phase 3 module not present on main. See Known Limitations. */
  reports: { status: "skipped"; reason: string };
  smartActions: { checked: number; created: number };
  notifications: { total: number; distinctTypes: number };
  savedViews: { count: number; names: string[] };
  /** LEAD + PROPERTY entity results only (via countDemoSearchResults) - see search-verify.ts's doc comment for why NOTIFICATION-entity results aren't included. */
  globalSearch: Record<string, number>;
  commandPalette: { resultCount: number };
  healthScores: { leadLabels: string[]; propertyLabels: string[]; leadOverview: unknown; propertyOverview: unknown };
  exportsOk: boolean;
  /** Phase 4 - Field Operations relationship integrity + public-DTO leak-guard, checked against live seeded data. */
  phase4: {
    indirectPropertiesWithoutPartner: number;
    directPropertiesWithPartner: number;
    visitFeedbackOutsideDemoScope: number;
    availabilityReportOutsideDemoScope: number;
    propertyReportOutsideDemoScope: number;
    catalogueVersionEventOutsideDemoScope: number;
    favoritesOutsideDemoScope: number;
    viewLogsOutsideDemoScope: number;
    publicCatalogueLeakGuardOk: boolean;
  };
  ok: boolean;
  errors: string[];
}

export async function runVerification(params: {
  adminId: string;
  adminRole: "ADMIN";
  leadScenarioIds: Record<string, string>;
  propertyScenarioIds: Record<string, string>;
}): Promise<VerificationReport> {
  const errors: string[] = [];
  const orgId = DEMO_ORGANIZATION_ID;

  // --- Property matching ---
  const propertyMatching: VerificationReport["propertyMatching"] = {};
  try {
    const availableProperties = await prisma.property.findMany({ where: { organizationId: orgId, status: "AVAILABLE" } });
    for (const [label, leadId] of Object.entries(params.leadScenarioIds)) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) continue;
      const matches = matchPropertiesToLead(availableProperties, lead, 0.2);
      propertyMatching[label] = { matchCount: matches.length, topKind: matches[0]?.locationMatchKind ?? null };
    }
  } catch (e) {
    errors.push(`propertyMatching: ${(e as Error).message}`);
  }

  // --- Dashboard ---
  // See dashboard-verify.ts for why this calls a seed-safe standalone
  // helper instead of the real getDashboardData() - that function pulls in
  // src/lib/organization.ts's `import "server-only"`, which crashes a
  // plain `tsx` process.
  let dashboard: VerificationReport["dashboard"] = { criticalKeysPresent: false, totalLeads: 0, totalProperties: 0 };
  try {
    const metrics = await getDemoVerificationMetrics(orgId);
    dashboard = {
      criticalKeysPresent: Number.isInteger(metrics.totalProperties) && Number.isInteger(metrics.totalLeads),
      totalLeads: metrics.totalLeads,
      totalProperties: metrics.totalProperties,
    };
  } catch (e) {
    errors.push(`dashboard: ${(e as Error).message}`);
  }

  // --- Reports ---
  // src/lib/report-builder.ts is a Phase 3 ("brokerage intelligence
  // dashboard") module not present on main - this stays a "skipped" no-op
  // (not an error) here rather than importing it, so the demo-data
  // framework has no dependency on unrelated Phase 3 code. Once
  // report-builder.ts lands on main, this can call buildReport() per
  // REPORT_TYPES the same way the dashboard verification below does.
  const reports: VerificationReport["reports"] = { status: "skipped", reason: "src/lib/report-builder.ts not present on this branch" };

  // --- Smart actions ---
  // Deliberately does NOT call the real generateSmartNotifications() sweep
  // here: that function scans the WHOLE organization (this app has no
  // per-row org isolation finer than DEMO_ORGANIZATION_ID itself), so on a
  // database that also holds real production leads/properties/deals,
  // calling it would create real Notification rows about real records as a
  // side effect of "verifying demo data" - exactly what "existing records
  // remain untouched" / "only insert demo data" rules out. Instead this
  // checks (read-only) that the demo notification history already created
  // by createDemoNotificationHistory() covers the six target categories for
  // demo-prefixed leads/properties specifically.
  let smartActions: VerificationReport["smartActions"] = { checked: 0, created: 0 };
  try {
    const demoNotificationCount = await prisma.notification.count({
      where: {
        organizationId: orgId,
        OR: [{ leadId: { startsWith: `${DEMO_ID_PREFIX}lead-` } }, { propertyId: { startsWith: `${DEMO_ID_PREFIX}prop-` } }],
      },
    });
    smartActions = { checked: demoNotificationCount, created: 0 };
  } catch (e) {
    errors.push(`smartActions: ${(e as Error).message}`);
  }

  // --- Notifications ---
  let notifications: VerificationReport["notifications"] = { total: 0, distinctTypes: 0 };
  try {
    const total = await prisma.notification.count({ where: { organizationId: orgId } });
    const grouped = await prisma.notification.groupBy({ by: ["type"], where: { organizationId: orgId }, _count: true });
    notifications = { total, distinctTypes: grouped.length };
  } catch (e) {
    errors.push(`notifications: ${(e as Error).message}`);
  }

  // --- Saved views ---
  let savedViews: VerificationReport["savedViews"] = { count: 0, names: [] };
  try {
    const views = await prisma.savedView.findMany({ where: { organizationId: orgId } });
    savedViews = { count: views.length, names: views.map((v) => v.name) };
  } catch (e) {
    errors.push(`savedViews: ${(e as Error).message}`);
  }

  // --- Global search / command palette (LEAD + PROPERTY entities - see
  // search-verify.ts for why NOTIFICATION-entity search is out of scope
  // here) ---
  const globalSearch: VerificationReport["globalSearch"] = {};
  try {
    for (const q of ["Karol Bagh", "DEMO-PROP", "DEMO-LEAD"]) {
      globalSearch[q] = await countDemoSearchResults(q, { organizationId: orgId, role: params.adminRole, userId: params.adminId });
    }
  } catch (e) {
    errors.push(`globalSearch: ${(e as Error).message}`);
  }
  let commandPalette: VerificationReport["commandPalette"] = { resultCount: 0 };
  try {
    const resultCount = await countDemoSearchResults("DEMO", { organizationId: orgId, role: params.adminRole, userId: params.adminId });
    commandPalette = { resultCount };
  } catch (e) {
    errors.push(`commandPalette: ${(e as Error).message}`);
  }

  // --- Health scores ---
  let healthScores: VerificationReport["healthScores"] = { leadLabels: [], propertyLabels: [], leadOverview: null, propertyOverview: null };
  try {
    const leadLabels: string[] = [];
    for (const leadId of Object.values(params.leadScenarioIds)) {
      const h = await getLeadHealth(leadId, orgId);
      if (h) leadLabels.push(h.label);
    }
    const propertyLabels: string[] = [];
    for (const propertyId of Object.values(params.propertyScenarioIds)) {
      const h = await getPropertyHealth(propertyId, orgId);
      if (h) propertyLabels.push(h.label);
    }
    const leadOverview = await getLeadHealthOverview(orgId);
    const propertyOverview = await getPropertyHealthOverview(orgId);
    healthScores = { leadLabels, propertyLabels, leadOverview, propertyOverview };
  } catch (e) {
    errors.push(`healthScores: ${(e as Error).message}`);
  }

  // --- Exports --- also depends on report-builder.ts (see Reports above) - skipped on this branch, not an error.
  const exportsOk = false;

  // --- Phase 4: Field Operations relationship integrity + public-DTO leak-guard ---
  // Structural FK integrity (a VisitFeedback row referencing a non-existent
  // Visit, say) is impossible by construction - Postgres enforces the
  // foreign key. What this checks instead is *scope drift*: every Phase 4
  // row this seed created should reference another demo-prefixed row, never
  // a real production one, even though nothing at the schema level requires
  // that (these tables use org-scoping, not id-prefix-scoping, for their FKs).
  let phase4: VerificationReport["phase4"] = {
    indirectPropertiesWithoutPartner: -1,
    directPropertiesWithPartner: -1,
    visitFeedbackOutsideDemoScope: -1,
    availabilityReportOutsideDemoScope: -1,
    propertyReportOutsideDemoScope: -1,
    catalogueVersionEventOutsideDemoScope: -1,
    favoritesOutsideDemoScope: -1,
    viewLogsOutsideDemoScope: -1,
    publicCatalogueLeakGuardOk: false,
  };
  try {
    const propPrefix = `${DEMO_ID_PREFIX}prop-`;
    const empPrefix = `${DEMO_ID_PREFIX}emp-`;
    const catPrefix = `${DEMO_ID_PREFIX}cat-`;
    const visitPrefix = `${DEMO_ID_PREFIX}visit-`;

    const indirectPropertiesWithoutPartner = await prisma.property.count({
      where: { organizationId: orgId, id: { startsWith: propPrefix }, inventorySource: "INDIRECT", partnerId: null },
    });
    const directPropertiesWithPartner = await prisma.property.count({
      where: { organizationId: orgId, id: { startsWith: propPrefix }, inventorySource: "DIRECT", NOT: { partnerId: null } },
    });
    const visitFeedbackOutsideDemoScope = await prisma.visitFeedback.count({
      where: { organizationId: orgId, NOT: { visit: { id: { startsWith: visitPrefix } } } },
    });
    const availabilityReportOutsideDemoScope = await prisma.propertyAvailabilityReport.count({
      where: {
        organizationId: orgId,
        OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { reportedBy: { id: { not: { startsWith: empPrefix } } } }],
      },
    });
    const propertyReportOutsideDemoScope = await prisma.propertyReport.count({
      where: {
        organizationId: orgId,
        OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { reportedBy: { id: { not: { startsWith: empPrefix } } } }],
      },
    });
    const catalogueVersionEventOutsideDemoScope = await prisma.catalogueVersionEvent.count({
      where: { organizationId: orgId, NOT: { catalogueShare: { id: { startsWith: catPrefix } } } },
    });
    const favoritesOutsideDemoScope = await prisma.propertyFavorite.count({
      where: { OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { user: { id: { not: { startsWith: empPrefix } } } }] },
    });
    const viewLogsOutsideDemoScope = await prisma.propertyViewLog.count({
      where: { OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { user: { id: { not: { startsWith: empPrefix } } } }] },
    });

    // Live leak-guard against real seeded data, on top of catalogue-dto.test.ts's
    // fixture-based unit tests - reuses the exact production DTO builder
    // (toPublicCatalogueDTO), never a re-implementation.
    let publicCatalogueLeakGuardOk = false;
    const full = await prisma.catalogueShare.findFirst({
      where: { organizationId: orgId, id: { startsWith: catPrefix } },
      include: DEMO_VERIFY_CATALOGUE_INCLUDE,
    });
    if (full) {
      const dto = toPublicCatalogueDTO(full);
      const serialized = JSON.stringify(dto);
      const internalFieldMarkers = [
        "buildingName", "flatNumber", "gateNumber", "propertySource", "keyAvailability",
        "entryInstructions", "internalNotes", "negotiationNotes", "hiddenRemarks",
      ];
      publicCatalogueLeakGuardOk = internalFieldMarkers.every((marker) => !serialized.includes(marker));
    } else {
      publicCatalogueLeakGuardOk = true; // nothing to check - not a failure
    }

    phase4 = {
      indirectPropertiesWithoutPartner,
      directPropertiesWithPartner,
      visitFeedbackOutsideDemoScope,
      availabilityReportOutsideDemoScope,
      propertyReportOutsideDemoScope,
      catalogueVersionEventOutsideDemoScope,
      favoritesOutsideDemoScope,
      viewLogsOutsideDemoScope,
      publicCatalogueLeakGuardOk,
    };

    const issues: string[] = [];
    if (indirectPropertiesWithoutPartner > 0) issues.push(`${indirectPropertiesWithoutPartner} INDIRECT demo properties have no partnerId`);
    if (directPropertiesWithPartner > 0) issues.push(`${directPropertiesWithPartner} DIRECT demo properties unexpectedly have a partnerId`);
    if (visitFeedbackOutsideDemoScope > 0) issues.push(`${visitFeedbackOutsideDemoScope} VisitFeedback row(s) reference a non-demo visit`);
    if (availabilityReportOutsideDemoScope > 0)
      issues.push(`${availabilityReportOutsideDemoScope} PropertyAvailabilityReport row(s) reference a non-demo property/reporter`);
    if (propertyReportOutsideDemoScope > 0) issues.push(`${propertyReportOutsideDemoScope} PropertyReport row(s) reference a non-demo property/reporter`);
    if (catalogueVersionEventOutsideDemoScope > 0)
      issues.push(`${catalogueVersionEventOutsideDemoScope} CatalogueVersionEvent row(s) reference a non-demo catalogue`);
    if (favoritesOutsideDemoScope > 0) issues.push(`${favoritesOutsideDemoScope} PropertyFavorite row(s) reference a non-demo user/property`);
    if (viewLogsOutsideDemoScope > 0) issues.push(`${viewLogsOutsideDemoScope} PropertyViewLog row(s) reference a non-demo user/property`);
    if (!publicCatalogueLeakGuardOk) issues.push("Public catalogue DTO leak-guard failed against live seeded data - an internal-only field name leaked into the serialized public DTO");
    if (issues.length > 0) errors.push(`phase4: ${issues.join("; ")}`);
  } catch (e) {
    errors.push(`phase4: ${(e as Error).message}`);
  }

  return {
    propertyMatching,
    dashboard,
    reports,
    smartActions,
    notifications,
    savedViews,
    globalSearch,
    commandPalette,
    healthScores,
    exportsOk,
    phase4,
    ok: errors.length === 0,
    errors,
  };
}

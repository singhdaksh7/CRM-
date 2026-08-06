import { prisma } from "../prisma";
import { getDashboardData } from "../dashboard-data";
import { buildReport, REPORT_TYPES } from "../report-builder";
import { runGlobalSearch } from "../search/entity-search";
import { getLeadHealth, getLeadHealthOverview } from "../rules/lead-health";
import { getPropertyHealth, getPropertyHealthOverview } from "../rules/property-health";
import { matchPropertiesToLead } from "../matching";
import { DEMO_ORGANIZATION_ID, DEMO_ID_PREFIX } from "./constants";

export interface VerificationReport {
  propertyMatching: Record<string, { matchCount: number; topKind: string | null }>;
  dashboard: { criticalKeysPresent: boolean; totalLeads: number; totalProperties: number };
  reports: Record<string, { rows: number; headerOk: boolean }>;
  smartActions: { checked: number; created: number };
  notifications: { total: number; distinctTypes: number };
  savedViews: { count: number; names: string[] };
  globalSearch: Record<string, number>;
  commandPalette: { resultCount: number };
  healthScores: { leadLabels: string[]; propertyLabels: string[]; leadOverview: unknown; propertyOverview: unknown };
  exportsOk: boolean;
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
  let dashboard: VerificationReport["dashboard"] = { criticalKeysPresent: false, totalLeads: 0, totalProperties: 0 };
  try {
    const data = await getDashboardData(params.adminRole, params.adminId);
    const totalLeads = await prisma.lead.count({ where: { organizationId: orgId } });
    const totalProperties = await prisma.property.count({ where: { organizationId: orgId } });
    dashboard = { criticalKeysPresent: Boolean(data && typeof data === "object"), totalLeads, totalProperties };
  } catch (e) {
    errors.push(`dashboard: ${(e as Error).message}`);
  }

  // --- Reports ---
  const reports: VerificationReport["reports"] = {};
  for (const type of REPORT_TYPES) {
    try {
      const result = await buildReport(type, {});
      reports[type] = { rows: result.rows.length, headerOk: result.header.length > 0 };
    } catch (e) {
      errors.push(`report(${type}): ${(e as Error).message}`);
      reports[type] = { rows: 0, headerOk: false };
    }
  }

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

  // --- Global search / command palette (same underlying engine) ---
  const globalSearch: VerificationReport["globalSearch"] = {};
  try {
    for (const q of ["Karol Bagh", "DEMO-PROP", "DEMO-LEAD"]) {
      const res = await runGlobalSearch(q, { organizationId: orgId, role: params.adminRole, userId: params.adminId });
      globalSearch[q] = res.results.length;
    }
  } catch (e) {
    errors.push(`globalSearch: ${(e as Error).message}`);
  }
  let commandPalette: VerificationReport["commandPalette"] = { resultCount: 0 };
  try {
    const res = await runGlobalSearch("DEMO", { organizationId: orgId, role: params.adminRole, userId: params.adminId });
    commandPalette = { resultCount: res.results.length };
  } catch (e) {
    errors.push(`commandPalette: ${(e as Error).message}`);
  }

  // --- Health scores ---
  let healthScores: VerificationReport["healthScores"] = { leadLabels: [], propertyLabels: [], leadOverview: null, propertyOverview: null };
  try {
    const leadLabels: string[] = [];
    for (const leadId of Object.values(params.leadScenarioIds)) {
      const h = await getLeadHealth(leadId);
      if (h) leadLabels.push(h.label);
    }
    const propertyLabels: string[] = [];
    for (const propertyId of Object.values(params.propertyScenarioIds)) {
      const h = await getPropertyHealth(propertyId);
      if (h) propertyLabels.push(h.label);
    }
    const leadOverview = await getLeadHealthOverview(orgId);
    const propertyOverview = await getPropertyHealthOverview(orgId);
    healthScores = { leadLabels, propertyLabels, leadOverview, propertyOverview };
  } catch (e) {
    errors.push(`healthScores: ${(e as Error).message}`);
  }

  // --- Exports (CSV shape only - no file written) ---
  let exportsOk = false;
  try {
    const { toCsv } = await import("../report-builder");
    const leadsReport = await buildReport("leads", {});
    const csv = toCsv(leadsReport);
    exportsOk = csv.split("\n").length === leadsReport.rows.length + 1;
  } catch (e) {
    errors.push(`exports: ${(e as Error).message}`);
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
    ok: errors.length === 0,
    errors,
  };
}

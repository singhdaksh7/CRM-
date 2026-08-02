import { prisma } from "./prisma";
import { logActivity } from "./activity";
import { createNotification, notifyRoles } from "./notifications";
import { DEFAULT_ORGANIZATION_ID } from "./organization";
import type { AssignmentStrategy, Lead, LeadAssignmentRule } from "@prisma/client";

export interface EmployeeCandidate {
  id: string;
  name: string;
  activeLeadCount: number;
  maxActiveLeads: number;
  todaysAssignedCount: number;
  speciality: "RENT" | "SALE" | "COMMERCIAL" | "RESIDENTIAL" | "ALL";
  serviceAreas: string[];
}

export interface AssignmentSelection {
  employeeId: string | null;
  reason: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function specialityMatches(speciality: EmployeeCandidate["speciality"], lead: Pick<Lead, "requirementType">): boolean {
  if (speciality === "ALL") return true;
  if (speciality === "RENT") return lead.requirementType === "RENT";
  if (speciality === "SALE") return lead.requirementType === "BUY";
  // COMMERCIAL/RESIDENTIAL speciality can't be inferred from requirementType
  // alone yet (property type isn't part of a lead) - treat as a soft match
  // so these employees remain eligible rather than being excluded outright.
  return true;
}

/**
 * Pure selection logic - given an already-filtered pool of candidates and a
 * strategy, picks one and explains why. No I/O here so it's unit-testable
 * without a database.
 */
export function selectEmployeeForLead(
  candidates: EmployeeCandidate[],
  strategy: AssignmentStrategy,
  lead: Pick<Lead, "preferredLocation" | "requirementType">
): AssignmentSelection {
  const withCapacity = candidates.filter((c) => c.activeLeadCount < c.maxActiveLeads);
  if (withCapacity.length === 0) {
    return {
      employeeId: null,
      reason: candidates.length === 0
        ? "No available, auto-assignable field executive matched this lead."
        : "All matching field executives are at their maximum active-lead capacity.",
    };
  }

  if (strategy === "LOCATION_BASED") {
    const loc = normalize(lead.preferredLocation);
    const inArea = withCapacity.filter((c) => c.serviceAreas.some((a) => normalize(a) === loc));
    const pool = inArea.length > 0 ? inArea : withCapacity;
    const picked = lowestWorkload(pool);
    return {
      employeeId: picked.id,
      reason: inArea.length > 0
        ? `Assigned to ${picked.name} because ${lead.preferredLocation} is one of their service areas and they currently have the lowest active workload.`
        : `Assigned to ${picked.name} on lowest workload - no field executive lists ${lead.preferredLocation} as a service area.`,
    };
  }

  if (strategy === "SPECIALITY") {
    const specialised = withCapacity.filter((c) => specialityMatches(c.speciality, lead));
    const pool = specialised.length > 0 ? specialised : withCapacity;
    const picked = lowestWorkload(pool);
    return {
      employeeId: picked.id,
      reason: specialised.length > 0
        ? `Assigned to ${picked.name} because their speciality (${picked.speciality}) matches this ${lead.requirementType === "RENT" ? "rental" : "sale"} requirement and they have the lowest active workload among specialists.`
        : `Assigned to ${picked.name} on lowest workload - no specialist match found for this requirement.`,
    };
  }

  if (strategy === "ROUND_ROBIN") {
    const picked = [...withCapacity].sort((a, b) => a.todaysAssignedCount - b.todaysAssignedCount || a.id.localeCompare(b.id))[0];
    return {
      employeeId: picked.id,
      reason: `Assigned to ${picked.name} by round robin - they have received the fewest new leads today among eligible field executives.`,
    };
  }

  // LOWEST_WORKLOAD (also the default fallback strategy)
  const picked = lowestWorkload(withCapacity);
  return {
    employeeId: picked.id,
    reason: `Assigned to ${picked.name} because they currently have the lowest active workload (${picked.activeLeadCount} active lead${picked.activeLeadCount === 1 ? "" : "s"}).`,
  };
}

function lowestWorkload(pool: EmployeeCandidate[]): EmployeeCandidate {
  return [...pool].sort((a, b) => a.activeLeadCount - b.activeLeadCount || a.id.localeCompare(b.id))[0];
}

const OPEN_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION"] as const;

async function loadEligibleCandidates(organizationId: string): Promise<EmployeeCandidate[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const employees = await prisma.user.findMany({
    where: { organizationId, role: "FIELD_EXECUTIVE", status: "ACTIVE", isAvailable: true, autoAssignEnabled: true },
    include: {
      serviceAreas: true,
      _count: { select: { assignedLeads: { where: { status: { in: [...OPEN_LEAD_STATUSES] } } } } },
    },
  });

  const todaysCounts = await prisma.lead.groupBy({
    by: ["assignedToId"],
    where: { organizationId, autoAssignedAt: { gte: startOfToday }, assignedToId: { not: null } },
    _count: { _all: true },
  });
  const todaysCountMap = new Map(todaysCounts.map((c) => [c.assignedToId as string, c._count._all]));

  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    activeLeadCount: e._count.assignedLeads,
    maxActiveLeads: e.maxActiveLeads,
    todaysAssignedCount: todaysCountMap.get(e.id) ?? 0,
    speciality: e.speciality,
    serviceAreas: e.serviceAreas.map((a) => a.locality),
  }));
}

async function findMatchingRule(organizationId: string, lead: Lead): Promise<LeadAssignmentRule | null> {
  const rules = await prisma.leadAssignmentRule.findMany({
    where: { organizationId, isActive: true },
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    if (rule.source && rule.source !== lead.source) continue;
    if (rule.requirementType && rule.requirementType !== lead.requirementType) continue;
    if (rule.locality && normalize(rule.locality) !== normalize(lead.preferredLocation)) continue;
    return rule;
  }
  return null;
}

export interface AutoAssignOutcome {
  assigned: boolean;
  employeeId: string | null;
  strategy: AssignmentStrategy | null;
  reason: string;
}

/** Runs the full auto-assignment pipeline for one lead: rule match -> eligible pool -> strategy -> assign. */
export async function autoAssignLead(leadId: string, organizationId = DEFAULT_ORGANIZATION_ID): Promise<AutoAssignOutcome> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

  const rule = await findMatchingRule(organizationId, lead);
  if (rule?.strategy === "MANUAL_ONLY") {
    return { assigned: false, employeeId: null, strategy: "MANUAL_ONLY", reason: `Matches manual-only assignment rule "${rule.name}" - left for manual assignment.` };
  }
  if (rule?.employeeId) {
    // Rule pins a specific employee (e.g. a named locality specialist) rather than running a strategy.
    const employee = await prisma.user.findUnique({ where: { id: rule.employeeId } });
    if (employee && employee.status === "ACTIVE" && employee.isAvailable) {
      const reason = `Assigned to ${employee.name} per assignment rule "${rule.name}".`;
      await applyAssignment(lead, employee.id, rule.strategy, reason, organizationId);
      return { assigned: true, employeeId: employee.id, strategy: rule.strategy, reason };
    }
  }

  const strategy: AssignmentStrategy = rule?.strategy ?? "LOWEST_WORKLOAD";
  const candidates = await loadEligibleCandidates(organizationId);
  const selection = selectEmployeeForLead(candidates, strategy, lead);

  if (!selection.employeeId) {
    if (candidates.length > 0) {
      await notifyRoles(["ADMIN"], {
        organizationId,
        type: "EMPLOYEE_CAPACITY_REACHED",
        title: "All field executives at capacity",
        message: `Lead ${lead.leadCode} (${lead.clientName}) could not be auto-assigned - every eligible field executive is at their maximum active-lead capacity.`,
        leadId: lead.id,
      });
    }
    return { assigned: false, employeeId: null, strategy, reason: selection.reason };
  }

  await applyAssignment(lead, selection.employeeId, strategy, selection.reason, organizationId);
  return { assigned: true, employeeId: selection.employeeId, strategy, reason: selection.reason };
}

async function applyAssignment(lead: Lead, employeeId: string, strategy: AssignmentStrategy, reason: string, organizationId: string) {
  await prisma.lead.update({
    where: { id: lead.id },
    data: { assignedToId: employeeId, assignmentStrategy: strategy, assignmentReason: reason, autoAssignedAt: new Date() },
  });
  await logActivity({ leadId: lead.id, type: "LEAD_ASSIGNED", description: reason });
  await createNotification({
    organizationId,
    userId: employeeId,
    type: "LEAD_ASSIGNED",
    title: "New lead assigned to you",
    message: `${lead.clientName} (${lead.leadCode}) - ${lead.preferredLocation}, ${lead.requirementType === "RENT" ? "rent" : "buy"} ${lead.preferredBhk ? lead.preferredBhk + " BHK" : ""}`.trim(),
    leadId: lead.id,
  });
}

/** Bulk variant used by the leads page "Run Auto Assignment" action and by webhook ingestion cleanup. */
export async function bulkAutoAssign(leadIds: string[], organizationId = DEFAULT_ORGANIZATION_ID): Promise<AutoAssignOutcome[]> {
  const outcomes: AutoAssignOutcome[] = [];
  for (const id of leadIds) {
    outcomes.push(await autoAssignLead(id, organizationId));
  }
  return outcomes;
}

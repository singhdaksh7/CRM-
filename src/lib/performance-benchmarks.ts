import "server-only";

import { prisma } from "./prisma";
import { getDashboardCriticalData, getDashboardSecondaryData } from "./dashboard-data";
import { getActionCenterItems, getLeadHealthOverview, getPropertyHealthOverview } from "./rules";
import { getFieldOpsSummary } from "./field-ops-summary-data";
import { getManagerVisitBoard } from "./visit-analytics-data";
import { getLeadsAwaitingShortlist } from "./dashboard-data";
import { listAvailablePropertiesPage, PROPERTY_LIST_INITIAL_TAKE } from "./property-list-query";
import { measurePerformanceMetric } from "./performance-diagnostic-context";
import type { Role } from "@prisma/client";

/**
 * These benchmarks call the same read functions used by their corresponding
 * pages. Results are intentionally discarded; only aggregate durations and
 * call counts leave the server.
 */
export async function benchmarkDashboard(input: { role: Role; userId: string; organizationId: string }) {
  const { role, userId, organizationId } = input;
  if (role === "DATA_MANAGER") {
    // Its specialised dashboard has a distinct loader and is not the ADMIN
    // dashboard waterfall this diagnostic page targets.
    await measurePerformanceMetric("dashboardDataManager", () => import("./dm-dashboard-data").then(({ getDataManagerDashboardData }) => getDataManagerDashboardData(organizationId, { id: userId, role })));
    return;
  }

  // These are siblings in the actual RSC tree (critical data blocks before
  // streamed panels), so record them as parallel branches rather than invent
  // a sequential relationship the page does not have.
  await Promise.all([
    measurePerformanceMetric("dashboardPrimary", () => getDashboardCriticalData(role, userId), true),
    measurePerformanceMetric("actionCenter", () => getActionCenterItems(role, userId), true),
    measurePerformanceMetric("healthOverview", () => Promise.all([
      getLeadHealthOverview(organizationId, role === "FIELD_EXECUTIVE" ? userId : undefined),
      getPropertyHealthOverview(organizationId),
    ]), true),
    measurePerformanceMetric("shortlist", () => getLeadsAwaitingShortlist(organizationId), true),
    measurePerformanceMetric("dashboardSecondary", () => getDashboardSecondaryData(role, userId), true),
    ...(role === "ADMIN" ? [
      measurePerformanceMetric("visitBoard", () => getManagerVisitBoard(organizationId), true),
      measurePerformanceMetric("fieldOperations", () => getFieldOpsSummary(organizationId), true),
    ] : []),
  ]);
}

export async function benchmarkLeads(organizationId: string) {
  // Same default /leads page query group (unfiltered, first page).
  await Promise.all([
    measurePerformanceMetric("leadsRows", () => prisma.lead.findMany({ where: { organizationId }, take: 25, orderBy: { createdAt: "desc" }, select: { id: true } }), true),
    measurePerformanceMetric("leadsCount", () => prisma.lead.count({ where: { organizationId } }), true),
    measurePerformanceMetric("leadsEmployees", () => prisma.user.findMany({ where: { organizationId, role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] }, status: "ACTIVE" }, select: { id: true } }), true),
    measurePerformanceMetric("leadsUnassigned", () => prisma.lead.count({ where: { organizationId, assignedToId: null, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } } }), true),
  ]);
}

export async function benchmarkProperties(organizationId: string) {
  await Promise.all([
    measurePerformanceMetric("propertiesList", () => listAvailablePropertiesPage({ organizationId, take: PROPERTY_LIST_INITIAL_TAKE }), true),
    measurePerformanceMetric("propertiesCount", () => prisma.property.count({ where: { organizationId, status: "AVAILABLE" } }), true),
  ]);
}

export async function benchmarkVisits(organizationId: string) {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  await Promise.all([
    measurePerformanceMetric("visitsRows", () => prisma.visit.findMany({ where: { organizationId, visitDate: { gte: start, lte: end } }, take: 300, select: { id: true } }), true),
    measurePerformanceMetric("visitsLeads", () => prisma.lead.findMany({ where: { organizationId }, take: 100, select: { id: true } }), true),
    measurePerformanceMetric("visitsProperties", () => prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" }, take: 200, select: { id: true } }), true),
    measurePerformanceMetric("visitsEmployees", () => prisma.user.findMany({ where: { organizationId, role: "FIELD_EXECUTIVE", status: "ACTIVE" }, select: { id: true } }), true),
  ]);
}

export async function benchmarkFollowUps(organizationId: string) {
  const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0); const end = new Date(now); end.setHours(23, 59, 59, 999);
  const scoped = { organizationId, leadId: { not: null } };
  await Promise.all([
    measurePerformanceMetric("followUpsOverdue", () => prisma.followUp.count({ where: { ...scoped, status: { not: "COMPLETED" }, dueDate: { lt: start } } }), true),
    measurePerformanceMetric("followUpsToday", () => prisma.followUp.count({ where: { ...scoped, dueDate: { gte: start, lte: end } } }), true),
    measurePerformanceMetric("followUpsUpcoming", () => prisma.followUp.count({ where: { ...scoped, dueDate: { gt: end } } }), true),
    measurePerformanceMetric("followUpsLeads", () => prisma.lead.findMany({ where: { organizationId }, take: 100, select: { id: true } }), true),
    measurePerformanceMetric("followUpsEmployees", () => prisma.user.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true } }), true),
    measurePerformanceMetric("followUpsRows", () => prisma.followUp.findMany({ where: { ...scoped, dueDate: { gte: start, lte: end } }, take: 25, select: { id: true } }), true),
  ]);
}

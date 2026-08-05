import { prisma } from "./prisma";
import { getOrganizationId } from "./organization";

export const REPORT_TYPES = ["leads", "visits", "employees", "brokerage", "properties"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const MAX_REPORT_ROWS = 2000;

export interface ReportFilters {
  from?: Date;
  to?: Date;
}

export interface ReportResult {
  header: string[];
  rows: (string | number)[][];
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Renders a report result to CSV text (Excel-compatible). Pure function, easy to unit test independent of Prisma. */
export function toCsv(result: ReportResult): string {
  return [result.header, ...result.rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

export async function buildReport(type: ReportType, filters: ReportFilters): Promise<ReportResult> {
  const organizationId = getOrganizationId();
  const createdAtRange = filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined;

  switch (type) {
    case "leads": {
      const leads = await prisma.lead.findMany({
        where: { organizationId, ...(createdAtRange ? { createdAt: createdAtRange } : {}) },
        include: { assignedTo: { select: { name: true } } },
        take: MAX_REPORT_ROWS,
        orderBy: { createdAt: "desc" },
      });
      return {
        header: ["Lead Code", "Client Name", "Phone", "Status", "Priority", "Source", "Requirement", "Locality", "Min Budget", "Max Budget", "Assigned To", "Created At"],
        rows: leads.map((l) => [l.leadCode, l.clientName, l.phone, l.status, l.priority, l.source, l.requirementType, l.preferredLocation, l.minBudget, l.maxBudget, l.assignedTo?.name ?? "Unassigned", l.createdAt.toISOString()]),
      };
    }
    case "visits": {
      const visits = await prisma.visit.findMany({
        where: { organizationId, ...(createdAtRange ? { createdAt: createdAtRange } : {}) },
        include: { lead: { select: { clientName: true } }, property: { select: { propertyCode: true, area: true } }, assignedTo: { select: { name: true } } },
        take: MAX_REPORT_ROWS,
        orderBy: { visitDate: "desc" },
      });
      return {
        header: ["Client", "Property", "Area", "Visit Date", "Status", "Outcome", "Assigned To", "Created At"],
        rows: visits.map((v) => [v.lead.clientName, v.property.propertyCode, v.property.area, v.visitDate.toISOString(), v.status, v.outcome ?? "", v.assignedTo?.name ?? "Unassigned", v.createdAt.toISOString()]),
      };
    }
    case "employees": {
      const employees = await prisma.user.findMany({
        where: { organizationId, role: "FIELD_EXECUTIVE" },
        select: {
          name: true,
          email: true,
          _count: { select: { assignedLeads: true, assignedVisits: true } },
          assignedLeads: { select: { status: true }, ...(createdAtRange ? { where: { createdAt: createdAtRange } } : {}) },
        },
      });
      return {
        header: ["Name", "Email", "Total Leads", "Deals Closed", "Total Visits"],
        rows: employees.map((e) => [e.name, e.email, e._count.assignedLeads, e.assignedLeads.filter((l) => l.status === "CLOSED_WON").length, e._count.assignedVisits]),
      };
    }
    case "brokerage": {
      const payments = await prisma.payment.findMany({
        where: { organizationId, ...(createdAtRange ? { createdAt: createdAtRange } : {}) },
        include: { deal: { select: { dealCode: true } } },
        take: MAX_REPORT_ROWS,
        orderBy: { createdAt: "desc" },
      });
      return {
        header: ["Deal Code", "Direction", "Amount", "Method", "Status", "Due Date", "Paid At", "Receipt Number"],
        rows: payments.map((p) => [p.deal.dealCode, p.direction, p.amount, p.method, p.status, p.dueDate?.toISOString() ?? "", p.paidAt?.toISOString() ?? "", p.receiptNumber ?? ""]),
      };
    }
    case "properties": {
      const properties = await prisma.property.findMany({
        where: { organizationId, ...(createdAtRange ? { createdAt: createdAtRange } : {}) },
        take: MAX_REPORT_ROWS,
        orderBy: { createdAt: "desc" },
      });
      return {
        header: ["Property Code", "Title", "Type", "Listing Type", "Status", "Area", "BHK", "Monthly Rent", "Sale Price", "Created At"],
        rows: properties.map((p) => [p.propertyCode, p.title, p.propertyType, p.listingType, p.status, p.area, p.bhk, p.monthlyRent ?? "", p.salePrice ?? "", p.createdAt.toISOString()]),
      };
    }
  }
}

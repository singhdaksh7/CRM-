import { prisma } from "./prisma";
import { startOfIstDay, endOfIstDay, startOfIstMonth, endOfIstMonth } from "./ist-date";

export type TeamReportPeriod = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "prevMonth" | "custom";

export interface TeamReportDateRange {
  from: Date;
  to: Date;
  period: TeamReportPeriod;
}

export function resolveTeamReportDateRange(params: {
  period?: string;
  from?: string;
  to?: string;
  now?: Date;
}): TeamReportDateRange {
  const now = params.now ?? new Date();
  const period = (params.period as TeamReportPeriod) ?? "today";

  if (period === "yesterday") {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      from: startOfIstDay(yesterday),
      to: endOfIstDay(yesterday),
      period: "yesterday",
    };
  }

  if (period === "last7") {
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      from: startOfIstDay(sevenDaysAgo),
      to: endOfIstDay(now),
      period: "last7",
    };
  }

  if (period === "last30") {
    const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      from: startOfIstDay(thirtyDaysAgo),
      to: endOfIstDay(now),
      period: "last30",
    };
  }

  if (period === "thisMonth") {
    return {
      from: startOfIstMonth(now),
      to: endOfIstMonth(now),
      period: "thisMonth",
    };
  }

  if (period === "prevMonth") {
    // 1st of current IST month minus 1ms is in prev month
    const startOfCurrentMonth = startOfIstMonth(now);
    const prevMonthInstant = new Date(startOfCurrentMonth.getTime() - 1);
    return {
      from: startOfIstMonth(prevMonthInstant),
      to: endOfIstMonth(prevMonthInstant),
      period: "prevMonth",
    };
  }

  if (period === "custom" && params.from && params.to) {
    const fromDate = new Date(`${params.from}T00:00:00+05:30`);
    const toDate = new Date(`${params.to}T23:59:59.999+05:30`);
    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && fromDate <= toDate) {
      return {
        from: fromDate,
        to: toDate,
        period: "custom",
      };
    }
  }

  // Default to today
  return {
    from: startOfIstDay(now),
    to: endOfIstDay(now),
    period: "today",
  };
}

export interface TeamReportData {
  member: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  metrics: {
    propertiesAdded: number;
    visitsCount: number;
    followUpsCompleted: number;
    activitiesLogged: number;
    leadsWorked: number;
    dealsClosedCount: number;
  };
  details: {
    dealsClosed: Array<{
      id: string;
      dealCode: string;
      status: string;
      stage: string;
      closedAt: Date | null;
      lead: { id: string; clientName: string; leadCode: string; assignedTo: { id: string; name: string } | null } | null;
      property: { id: string; propertyCode: string; title: string; area: string } | null;
      assignedTo: { id: string; name: string } | null; // Deal Closed By
      createdBy: { id: string; name: string } | null;  // Marked Closed By
    }>;
    properties: Array<{
      id: string;
      propertyCode: string;
      title: string;
      area: string;
      listingType: string;
      price: number | null;
      createdAt: Date;
    }>;
    visits: Array<{
      id: string;
      visitDate: Date;
      visitTime: string;
      status: string;
      lead: { id: string; clientName: string; phone: string };
      property: { id: string; propertyCode: string; title: string; area: string };
    }>;
    followUps: Array<{
      id: string;
      type: string;
      dueDate: Date;
      completedAt: Date | null;
      notes: string | null;
      lead: { id: string; clientName: string } | null;
    }>;
    activities: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date;
      lead: { id: string; clientName: string } | null;
      crmOwner: { id: string; name: string } | null;
      deal: { id: string; dealCode: string } | null;
    }>;
  };
}

export async function getTeamReportData(params: {
  organizationId: string;
  userId: string;
  range: TeamReportDateRange;
}): Promise<TeamReportData | null> {
  const { organizationId, userId, range } = params;

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, status: "ACTIVE" },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) return null;

  const [
    propertiesAddedCount,
    visitsCount,
    followUpsCompletedCount,
    activitiesCount,
    distinctLeadsWorked,
    dealsClosedCount,
    dealsClosed,
    properties,
    visits,
    followUps,
    activities,
  ] = await Promise.all([
    // Metric 1: Properties added count
    prisma.property.count({
      where: {
        organizationId,
        createdById: userId,
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
    // Metric 2: Visits count (assigned executive, scheduled visit date within range)
    prisma.visit.count({
      where: {
        organizationId,
        assignedToId: userId,
        visitDate: { gte: range.from, lte: range.to },
      },
    }),
    // Metric 3: Follow-ups completed count (strictly completed within range)
    prisma.followUp.count({
      where: {
        organizationId,
        ownerId: userId,
        status: "COMPLETED",
        completedAt: { gte: range.from, lte: range.to },
      },
    }),
    // Metric 4: Activities logged count
    prisma.activity.count({
      where: {
        organizationId,
        actorId: userId,
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
    // Metric 5: Leads worked (distinct leads where selected user performed activity within range)
    prisma.activity.findMany({
      where: {
        organizationId,
        actorId: userId,
        leadId: { not: null },
        createdAt: { gte: range.from, lte: range.to },
      },
      distinct: ["leadId"],
      select: { leadId: true },
    }),
    // Metric 6: Deals Closed count (Deal Closed By selected user, status WON, closedAt within range)
    prisma.deal.count({
      where: {
        organizationId,
        assignedToId: userId,
        status: "WON",
        closedAt: { gte: range.from, lte: range.to },
      },
    }),
    // Drill-down 0: Deals Closed
    prisma.deal.findMany({
      where: {
        organizationId,
        assignedToId: userId,
        status: "WON",
        closedAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        dealCode: true,
        status: true,
        stage: true,
        closedAt: true,
        lead: {
          select: {
            id: true,
            clientName: true,
            leadCode: true,
            assignedTo: { select: { id: true, name: true } },
          },
        },
        property: {
          select: {
            id: true,
            propertyCode: true,
            title: true,
            area: true,
          },
        },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { closedAt: "desc" },
      take: 100,
    }),
    // Drill-down 1: Properties
    prisma.property.findMany({
      where: {
        organizationId,
        createdById: userId,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        propertyCode: true,
        title: true,
        area: true,
        listingType: true,
        monthlyRent: true,
        salePrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    // Drill-down 2: Visits
    prisma.visit.findMany({
      where: {
        organizationId,
        assignedToId: userId,
        visitDate: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        visitDate: true,
        visitTime: true,
        status: true,
        lead: { select: { id: true, clientName: true, phone: true } },
        property: { select: { id: true, propertyCode: true, title: true, area: true } },
      },
      orderBy: { visitDate: "desc" },
      take: 100,
    }),
    // Drill-down 3: Follow-ups completed
    prisma.followUp.findMany({
      where: {
        organizationId,
        ownerId: userId,
        status: "COMPLETED",
        completedAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        type: true,
        dueDate: true,
        completedAt: true,
        notes: true,
        lead: { select: { id: true, clientName: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 100,
    }),
    // Drill-down 4: Activities
    prisma.activity.findMany({
      where: {
        organizationId,
        actorId: userId,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        lead: { select: { id: true, clientName: true } },
        crmOwner: { select: { id: true, name: true } },
        deal: { select: { id: true, dealCode: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return {
    member: user,
    metrics: {
      propertiesAdded: propertiesAddedCount,
      visitsCount,
      followUpsCompleted: followUpsCompletedCount,
      activitiesLogged: activitiesCount,
      leadsWorked: distinctLeadsWorked.length,
      dealsClosedCount,
    },
    details: {
      dealsClosed,
      properties: properties.map((p) => ({
        id: p.id,
        propertyCode: p.propertyCode,
        title: p.title,
        area: p.area,
        listingType: p.listingType,
        price: p.listingType === "RENT" ? p.monthlyRent : p.salePrice,
        createdAt: p.createdAt,
      })),
      visits,
      followUps,
      activities,
    },
  };
}

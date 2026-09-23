import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge, LEAD_STATUS_TONE, LEAD_PRIORITY_TONE } from "@/components/ui/badge";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { LeadWorkspace } from "@/components/leads/lead-workspace";
import { LeadPhonesPanel } from "@/components/leads/lead-phones-panel";
import { isLeadAccessibleToUser } from "@/lib/lead-access";
import { getLeadHealth, getLeadSuggestions, computeVisitSuggestions } from "@/lib/rules";
import { Mail, MapPin, Wallet } from "lucide-react";
import { getWhatsAppConfigStatus } from "@/integrations/whatsapp/whatsapp-config";
import { assignedToSelect } from "@/lib/user-select";
import { getOrganizationId } from "@/lib/organization";
import { getLeadPropertyPreferences, getCataloguePreferenceSummary } from "@/lib/catalogue-property-preferences";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preselectedPropertyId?: string; outcomeOverrideVisitId?: string }>;
}) {
  const { id } = await params;
  const { preselectedPropertyId, outcomeOverrideVisitId } = await searchParams;
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId },
    include: {
      assignedTo: { select: assignedToSelect },
      activities: { orderBy: { createdAt: "desc" }, include: { actor: { select: assignedToSelect } } },
      followUps: { orderBy: { dueDate: "asc" }, include: { owner: { select: assignedToSelect } } },
      visits: { orderBy: { visitDate: "desc" }, include: { property: true, assignedTo: { select: assignedToSelect }, properties: { include: { property: true } } } },
      sharedProperties: { orderBy: { createdAt: "desc" } },
      matchRecommendations: { where: { status: "PENDING" }, orderBy: { score: "desc" }, include: { property: { select: { id: true, propertyCode: true, title: true, area: true, bhk: true, monthlyRent: true, salePrice: true, listingType: true, inventorySource: true, status: true, coverImage: true, lastVerifiedAt: true, pendingVerification: true } } } },
      catalogueShares: { where: { status: "ACTIVE" }, select: { id: true, title: true, version: true }, orderBy: { updatedAt: "desc" } },
      phones: { orderBy: [{ type: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!lead) notFound();
  if (!isLeadAccessibleToUser(lead, session!.user)) notFound();

  const employees = await prisma.user.findMany({
    where: { organizationId, role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] }, status: "ACTIVE" },
    select: assignedToSelect,
  });
  const visitAssignees = await prisma.user.findMany({
    where: { organizationId, role: { in: ["FIELD_EXECUTIVE", "ADMIN"] }, status: "ACTIVE" },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const canManage = session!.user.role === "ADMIN" || session!.user.role === "DATA_MANAGER";
  const [health, suggestions] = await Promise.all([getLeadHealth(lead.id, organizationId), getLeadSuggestions(lead.id, canManage)]);

  const upcomingVisit = lead.visits
    .filter((v) => !["COMPLETED", "CANCELLED"].includes(v.status) && v.visitDate.getTime() >= new Date().setHours(0, 0, 0, 0))
    .sort((a, b) => a.visitDate.getTime() - b.visitDate.getTime())[0] ?? null;
  const hasPendingFollowUp = lead.followUps.some((f) => f.status === "PENDING");
  const visitSuggestions = Object.fromEntries(
    lead.visits.map((v) => [
      v.id,
      computeVisitSuggestions({
        visitId: v.id,
        leadId: lead.id,
        status: v.status,
        outcome: v.outcome,
        visitDate: v.visitDate,
        leadStatus: lead.status,
        hasPendingFollowUpForLead: hasPendingFollowUp,
      }),
    ])
  );

  const [clientPreferences, catalogueSummaries] = await Promise.all([
    getLeadPropertyPreferences(lead.id, organizationId).catch(() => ({ liked: [], notInterested: [], likedCount: 0, notInterestedCount: 0, leadId: lead.id })),
    Promise.all(
      lead.catalogueShares.map((c) =>
        getCataloguePreferenceSummary(c.id, organizationId).catch(() => null)
      )
    ).then((rows) => rows.filter((r): r is NonNullable<typeof r> => r !== null)),
  ]);

  return (
    <div className="space-y-4">
      {/* Lead Header Card */}
      <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-mono text-xs text-[#71717A]">{lead.leadCode}</span>
              <Badge tone={LEAD_STATUS_TONE[lead.status]}>{enumToLabel(lead.status)}</Badge>
              <Badge tone={LEAD_PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
            </div>
            <h1 className="text-xl font-bold text-[#09090B]">{lead.clientName}</h1>
            <LeadPhonesPanel leadId={lead.id} primaryPhone={lead.phone} phones={lead.phones} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#52525B]">
              {lead.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-[#71717A]" /> {lead.email}</span>}
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#71717A]" /> {lead.preferredLocation}</span>
              <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5 text-[#71717A]" /> {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}</span>
            </div>
          </div>
          <div className="text-right text-xs text-[#71717A] space-y-0.5">
            <p className="font-medium text-[#09090B]">{lead.requirementType === "RENT" ? "Looking to Rent" : "Looking to Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any BHK"}</p>
            <p>Created {formatDate(lead.createdAt)} &middot; Source {enumToLabel(lead.source)}</p>
            <p>Assigned to <span className="font-semibold text-[#09090B]">{lead.assignedTo?.name ?? "Unassigned"}</span></p>
            {lead.nextFollowUpAt && <p className="text-[#09090B] font-medium">Next follow-up: {formatDate(lead.nextFollowUpAt)}</p>}
            {upcomingVisit && <p className="text-[#16A34A] font-medium">Upcoming visit: {formatDate(upcomingVisit.visitDate)} at {upcomingVisit.visitTime}</p>}
          </div>
        </div>
        {lead.additionalRequirements && <p className="mt-3 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] p-3 text-xs text-[#52525B]">{lead.additionalRequirements}</p>}
      </div>

      <LeadWorkspace
        lead={lead}
        employees={employees}
        visitAssignees={visitAssignees}
        role={session!.user.role}
        health={health}
        suggestions={suggestions}
        visitSuggestions={visitSuggestions}
        providerSendConfigured={getWhatsAppConfigStatus().metaReady}
        clientPreferences={{ liked: clientPreferences.liked, notInterested: clientPreferences.notInterested }}
        catalogueSummaries={catalogueSummaries}
        preselectedPropertyId={preselectedPropertyId}
        outcomeOverrideVisitId={outcomeOverrideVisitId}
      />
    </div>
  );
}

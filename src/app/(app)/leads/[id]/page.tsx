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

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId },
    include: {
      assignedTo: { select: assignedToSelect },
      activities: { orderBy: { createdAt: "desc" }, include: { actor: { select: assignedToSelect } } },
      followUps: { orderBy: { dueDate: "asc" }, include: { owner: { select: assignedToSelect } } },
      visits: { orderBy: { visitDate: "desc" }, include: { property: true, assignedTo: { select: assignedToSelect } } },
      sharedProperties: { orderBy: { createdAt: "desc" } },
      matchRecommendations: { where: { status: "PENDING" }, orderBy: { score: "desc" }, include: { property: { select: { id: true, propertyCode: true, title: true, area: true, bhk: true, monthlyRent: true, salePrice: true, listingType: true, inventorySource: true, status: true, coverImage: true, lastVerifiedAt: true, pendingVerification: true } } } },
      catalogueShares: { where: { status: "ACTIVE" }, select: { id: true, title: true, version: true }, orderBy: { updatedAt: "desc" } },
      // simplified-role-workflow (spec item 5) - alternate numbers shown in
      // the at-a-glance header alongside the legacy primary `phone` column.
      phones: { orderBy: [{ type: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!lead) notFound();
  // simplified-role-workflow (targeted fix pass, Blocker B) - was a stale
  // inline check with no unassigned-lead carve-out, which 404'd a field
  // executive clicking into their own "Unassigned Leads" tab. Now shares the
  // exact same predicate assertLeadAccessible uses.
  if (!isLeadAccessibleToUser(lead, session!.user)) notFound();

  // Only id/name are ever rendered from this list (assignment dropdowns) - see
  // src/lib/user-select.ts for why this excludes passwordHash and other
  // account fields that used to be serialized into the RSC payload here.
  const employees = await prisma.user.findMany({
    where: { organizationId, role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] }, status: "ACTIVE" },
    select: assignedToSelect,
  });
  const canManage = session!.user.role === "ADMIN" || session!.user.role === "DATA_MANAGER";
  const [health, suggestions] = await Promise.all([getLeadHealth(lead.id, organizationId), getLeadSuggestions(lead.id, canManage)]);
  // At-a-glance header (spec item 4) - nearest upcoming, not-yet-terminal visit.
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
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-xs text-[#8A94A6]">{lead.leadCode}</span>
              <Badge tone={LEAD_STATUS_TONE[lead.status]}>{enumToLabel(lead.status)}</Badge>
              <Badge tone={LEAD_PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
            </div>
            <h1 className="text-xl font-semibold text-[#1B2430]">{lead.clientName}</h1>
            <LeadPhonesPanel leadId={lead.id} primaryPhone={lead.phone} phones={lead.phones} />
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#596579]">
              {lead.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {lead.email}</span>}
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {lead.preferredLocation}</span>
              <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}</span>
            </div>
          </div>
          <div className="text-right text-xs text-[#8A94A6]">
            <p>{lead.requirementType === "RENT" ? "Looking to Rent" : "Looking to Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any BHK"}</p>
            <p>Created {formatDate(lead.createdAt)} &middot; Source {enumToLabel(lead.source)}</p>
            <p>Assigned to <span className="font-semibold text-[#1B2430]">{lead.assignedTo?.name ?? "Unassigned"}</span></p>
            {lead.nextFollowUpAt && <p>Next follow-up: {formatDate(lead.nextFollowUpAt)}</p>}
            {upcomingVisit && <p>Upcoming visit: {formatDate(upcomingVisit.visitDate)} at {upcomingVisit.visitTime}</p>}
          </div>
        </div>
        {lead.additionalRequirements && <p className="mt-3 rounded-xl bg-[#FAFBFC] border border-[#E7ECF2] p-3 text-sm text-[#596579]">{lead.additionalRequirements}</p>}
      </div>

      <LeadWorkspace
        lead={lead}
        employees={employees}
        role={session!.user.role}
        health={health}
        suggestions={suggestions}
        visitSuggestions={visitSuggestions}
        providerSendConfigured={getWhatsAppConfigStatus().metaReady}
        clientPreferences={{ liked: clientPreferences.liked, notInterested: clientPreferences.notInterested }}
        catalogueSummaries={catalogueSummaries}
      />
    </div>
  );
}

import Link from "next/link";
import { getLeadsAwaitingShortlist } from "@/lib/dashboard-data";
import { resolveOrganizationIdForUser } from "@/lib/organization";
import { formatINR, timeAgo, enumToLabel } from "@/lib/utils";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { EmptyState } from "@/components/ui/states";
import { Search, Phone, MessageCircle, ArrowRight, UserCog } from "lucide-react";

export async function LeadsAwaitingShortlistPanel({ userId }: { userId: string }) {
  const organizationId = await resolveOrganizationIdForUser(userId);
  const { leads, totalCount } = await getLeadsAwaitingShortlist(organizationId);

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#09090B]">Leads Awaiting Shortlist</h3>
          <p className="text-xs text-[#71717A]">
            {totalCount} lead{totalCount === 1 ? "" : "s"} with no properties shared yet &middot; oldest first
          </p>
        </div>
        <Link href="/leads?status=NEW" className="inline-flex items-center gap-1 text-xs font-semibold text-[#09090B] hover:underline">
          View all leads <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {leads.length === 0 ? (
        <EmptyState title="All caught up" description="Every early-pipeline lead has already had properties shortlisted & shared." />
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const waNumber = normalizeIndianPhone(lead.phone);
            const waHref = waNumber
              ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${lead.clientName}, checking in on your property requirement.`)}`
              : null;
            return (
              <div
                key={lead.id}
                className="flex flex-col gap-3 border-b border-[#E4E4E7] pb-3.5 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-[#09090B] hover:underline transition-colors">
                      {lead.clientName}
                    </Link>{" "}
                    <span className="text-[#71717A]">&middot; {timeAgo(lead.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#52525B]">
                    {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any"} &middot; {lead.preferredLocation}
                    {" "}&middot; <span className="font-semibold text-[#09090B]">{formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#71717A]">
                    {enumToLabel(lead.source)} &middot; {lead.assignedTo ? lead.assignedTo.name : <span className="font-semibold text-[#D97706]">Unassigned</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={`/leads/${lead.id}/match`}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0A0A0A] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#27272A] border border-[#0A0A0A] shadow-2xs transition-colors"
                  >
                    <Search className="h-3 w-3" /> Review Matches
                  </Link>
                  <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs font-medium text-[#09090B] hover:bg-[#F4F4F5] transition-colors">
                    <Phone className="h-3 w-3 text-[#71717A]" /> Call
                  </a>
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-xs font-medium text-[#15803D] hover:bg-[#DCFCE7] transition-colors">
                      <MessageCircle className="h-3 w-3 text-[#16A34A]" /> WhatsApp
                    </a>
                  )}
                  <Link
                    href={`/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs font-medium text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors"
                  >
                    <UserCog className="h-3 w-3" /> Assign
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

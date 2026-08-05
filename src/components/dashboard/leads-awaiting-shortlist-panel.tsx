import Link from "next/link";
import { getLeadsAwaitingShortlist } from "@/lib/dashboard-data";
import { getOrganizationId } from "@/lib/organization";
import { formatINR, timeAgo, enumToLabel } from "@/lib/utils";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { EmptyState } from "@/components/ui/states";
import { Search, Phone, MessageCircle, ArrowRight, UserCog } from "lucide-react";

/**
 * "Leads Awaiting Shortlist" - early-pipeline leads (NEW/CONTACTED/QUALIFIED)
 * that have no active catalogue share yet, i.e. nobody has shortlisted &
 * sent them any properties. Backed by getLeadsAwaitingShortlist in
 * src/lib/dashboard-data.ts, which deliberately skips a live match count
 * per row for performance - see the TODO on that function.
 */
export async function LeadsAwaitingShortlistPanel({ userId }: { userId: string }) {
  const organizationId = getOrganizationId(userId);
  const { leads, totalCount } = await getLeadsAwaitingShortlist(organizationId);

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#F8FAFC]">Leads Awaiting Shortlist</h3>
          <p className="text-xs text-[#94A3B8]">
            {totalCount} lead{totalCount === 1 ? "" : "s"} with no properties shared yet &middot; oldest first
          </p>
        </div>
        <Link href="/leads?status=NEW" className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F8CFF] hover:text-[#6BA0FF]">
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
                className="flex flex-col gap-3 border-b border-[rgba(255,255,255,0.06)] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-[#F8FAFC] hover:text-[#4F8CFF] transition-colors">
                      {lead.clientName}
                    </Link>{" "}
                    <span className="text-[#64748B]">&middot; {timeAgo(lead.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">
                    {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any"} &middot; {lead.preferredLocation}
                    {" "}&middot; <span className="font-semibold text-[#4F8CFF]">{formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#64748B]">
                    {enumToLabel(lead.source)} &middot; {lead.assignedTo ? lead.assignedTo.name : <span className="font-semibold text-[#F59E0B]">Unassigned</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={`/leads/${lead.id}/match`}
                    className="inline-flex items-center gap-1 rounded-md bg-[#4F8CFF]/15 px-2 py-1 text-[11px] font-semibold text-[#4F8CFF] hover:bg-[#4F8CFF]/25"
                  >
                    <Search className="h-3 w-3" /> Review Matches
                  </Link>
                  <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:bg-[#1E2533]">
                    <Phone className="h-3 w-3" /> Call
                  </a>
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-[#25D366]/15 px-2 py-1 text-[11px] font-semibold text-[#25D366] hover:bg-[#25D366]/25">
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  )}
                  <Link
                    href={`/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:bg-[#1E2533]"
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

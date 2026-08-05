import Link from "next/link";
import { getLeadsAwaitingShortlist } from "@/lib/dashboard-data";
import { getOrganizationId } from "@/lib/organization";
import { formatINR, timeAgo, enumToLabel } from "@/lib/utils";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { EmptyState } from "@/components/ui/states";
import { Search, Phone, MessageCircle, ArrowRight, UserCog } from "lucide-react";

export async function LeadsAwaitingShortlistPanel({ userId }: { userId: string }) {
  const organizationId = getOrganizationId(userId);
  const { leads, totalCount } = await getLeadsAwaitingShortlist(organizationId);

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#1B2430]">Leads Awaiting Shortlist</h3>
          <p className="text-xs text-[#596579]">
            {totalCount} lead{totalCount === 1 ? "" : "s"} with no properties shared yet &middot; oldest first
          </p>
        </div>
        <Link href="/leads?status=NEW" className="inline-flex items-center gap-1 text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
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
                className="flex flex-col gap-3 border-b border-[#EFF4FF] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-[#1B2430] hover:text-[#3366FF] transition-colors">
                      {lead.clientName}
                    </Link>{" "}
                    <span className="text-[#8A94A6]">&middot; {timeAgo(lead.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#596579]">
                    {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any"} &middot; {lead.preferredLocation}
                    {" "}&middot; <span className="font-semibold text-[#3366FF]">{formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#8A94A6]">
                    {enumToLabel(lead.source)} &middot; {lead.assignedTo ? lead.assignedTo.name : <span className="font-semibold text-[#E6A23C]">Unassigned</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={`/leads/${lead.id}/match`}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#EFF4FF] px-2.5 py-1 text-[11px] font-semibold text-[#3366FF] hover:bg-[#DCE1FF]"
                  >
                    <Search className="h-3 w-3" /> Review Matches
                  </Link>
                  <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 rounded-xl border border-[#E7ECF2] px-2.5 py-1 text-[11px] font-semibold text-[#596579] hover:bg-[#F3F6FA]">
                    <Phone className="h-3 w-3" /> Call
                  </a>
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-[#E6F9EE] px-2.5 py-1 text-[11px] font-semibold text-[#25D366] hover:bg-[#B8F3D1]">
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  )}
                  <Link
                    href={`/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#E7ECF2] px-2.5 py-1 text-[11px] font-semibold text-[#596579] hover:bg-[#F3F6FA]"
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

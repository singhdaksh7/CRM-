"use client";

import Link from "next/link";
import { PhoneCall, MessageCircle, BellPlus, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { timeAgo, enumToLabel } from "@/lib/utils";
import type { NewLeadRow } from "@/lib/dm-dashboard-data";

/**
 * simplified-role-workflow (continuation pass, spec item 14) - DM dashboard's
 * "New/Unprocessed Leads". [Call]/[WhatsApp] are the same manual, no-send
 * patterns used everywhere else (tel: link + fire-and-forget CALL_INITIATED
 * log; wa.me opens the WhatsApp app with nothing pre-sent - the person still
 * has to type and hit send). [Follow-up] opens the lead workspace, where
 * "Add Follow-up" is already a one-click primary action - not duplicated
 * here as a second form.
 */
export function NewLeadsPanel({ leads, totalCount }: { leads: NewLeadRow[]; totalCount: number }) {
  function logCall(leadId: string) {
    fetch(`/api/leads/${leadId}/call-initiated`, { method: "POST" }).catch(() => {});
  }

  if (leads.length === 0) {
    return <p className="py-6 text-center text-sm text-[#8A94A6]">No new or unassigned leads right now.</p>;
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => (
        <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7ECF2] bg-white p-3 shadow-xs">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#1B2430]">{lead.clientName}</p>
            <p className="text-xs text-[#8A94A6]">
              {lead.phone} &middot; {enumToLabel(lead.source)} &middot; {timeAgo(lead.createdAt)}
              {!lead.assignedToId && " · Unassigned"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={lead.status === "NEW" ? "amber" : "slate"}>{enumToLabel(lead.status)}</Badge>
            <a href={`tel:${lead.phone}`} onClick={() => logCall(lead.id)} className="rounded-lg border border-[#E7ECF2] p-1.5 text-[#1FA971] hover:bg-[#F3F6FA]" title="Call">
              <PhoneCall className="h-4 w-4" />
            </a>
            <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[#E7ECF2] p-1.5 text-[#25D366] hover:bg-[#F3F6FA]" title="WhatsApp">
              <MessageCircle className="h-4 w-4" />
            </a>
            <Link href={`/leads/${lead.id}`} className="rounded-lg border border-[#E7ECF2] p-1.5 text-[#3366FF] hover:bg-[#F3F6FA]" title="Add follow-up / Open lead">
              <BellPlus className="h-4 w-4" />
            </Link>
            <Link href={`/leads/${lead.id}`} className="rounded-lg bg-[#3366FF] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2952CC]">
              Open
            </Link>
          </div>
        </div>
      ))}
      {totalCount > leads.length && (
        <Link href="/leads?assignedToId=unassigned" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
          View all {totalCount} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

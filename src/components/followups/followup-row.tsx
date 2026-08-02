"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Badge, FOLLOWUP_STATUS_TONE } from "@/components/ui/badge";
import { formatDateTime, enumToLabel } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import type { FollowUp, Lead, User } from "@prisma/client";

export function FollowUpRow({ followUp }: { followUp: FollowUp & { lead: Lead; owner: User | null } }) {
  const router = useRouter();

  async function complete() {
    const res = await fetch(`/api/follow-ups/${followUp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    if (res.ok) { toast.success("Marked completed"); router.refresh(); } else toast.error("Failed");
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-700">
          <Link href={`/leads/${followUp.leadId}`} className="hover:text-indigo-600">{followUp.lead.clientName}</Link>
          <span className="text-slate-400"> &middot; {enumToLabel(followUp.type)}</span>
        </p>
        <p className="text-xs text-slate-400">{formatDateTime(followUp.dueDate)} &middot; {followUp.owner?.name ?? "Unassigned"}{followUp.notes ? ` · ${followUp.notes}` : ""}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={FOLLOWUP_STATUS_TONE[followUp.status]}>{enumToLabel(followUp.status)}</Badge>
        {followUp.status !== "COMPLETED" && (
          <button onClick={complete} className="text-slate-400 hover:text-emerald-600" title="Mark completed" aria-label="Mark completed">
            <CheckCircle2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

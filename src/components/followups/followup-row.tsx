"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Badge, FOLLOWUP_STATUS_TONE } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { formatDateTime, enumToLabel } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import type { FollowUp } from "@prisma/client";
import type { PreviousCustomerContext } from "@/lib/followup-context";

type FollowUpOwner = { id: string; name: string } | null;
type FollowUpLead = { id: string; clientName: string };

function inputDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

export function FollowUpRow({ followUp, previousContext }: { followUp: FollowUp & { lead: FollowUpLead; owner: FollowUpOwner }; previousContext: PreviousCustomerContext }) {
  const router = useRouter();
  const initial = inputDateTime(new Date(followUp.dueDate));
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [saving, setSaving] = useState(false);
  const isActive = !["COMPLETED", "CANCELLED"].includes(followUp.status);

  async function complete() {
    const res = await fetch(`/api/follow-ups/${followUp.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) });
    if (res.ok) { toast.success("Marked completed"); router.refresh(); } else toast.error("Failed");
  }

  async function reschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time) return toast.error("Choose a new date and time");
    const dueDate = new Date(`${date}T${time}:00+05:30`);
    if (Number.isNaN(dueDate.getTime())) return toast.error("Enter a valid date and time");
    setSaving(true);
    const res = await fetch(`/api/follow-ups/${followUp.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate: dueDate.toISOString(), status: "PENDING" }) });
    setSaving(false);
    if (res.ok) { setRescheduleOpen(false); toast.success("Follow-up rescheduled"); router.refresh(); }
    else { const body = await res.json().catch(() => ({})); toast.error(body.error ?? "Failed to reschedule follow-up"); }
  }

  return (
    <div className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#09090B]">
          <Link href={`/leads/${followUp.leadId}`} className="hover:underline">
            {followUp.lead.clientName}
          </Link>
          <span className="text-[#71717A] font-normal"> &middot; {enumToLabel(followUp.type)}</span>
        </p>
        <p className="mt-0.5 text-xs text-[#71717A]">
          Due: {formatDateTime(followUp.dueDate)} &middot; Assigned: {followUp.owner?.name ?? "Unassigned"}
        </p>
        <p className="mt-1 text-xs text-[#52525B]">
          {previousContext ? (
            <>
              <span className="font-medium text-[#09090B]">Last response: {previousContext.response}</span>
              {previousContext.note ? <span className="block truncate text-[#71717A] sm:max-w-xl">“{previousContext.note}”</span> : null}
            </>
          ) : (
            "No previous interaction"
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge tone={FOLLOWUP_STATUS_TONE[followUp.status]}>{enumToLabel(followUp.status)}</Badge>
        {isActive && (
          <>
            <button
              onClick={complete}
              className="text-[#71717A] hover:text-emerald-600 transition-colors p-1"
              title="Mark completed"
              aria-label="Mark completed"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setRescheduleOpen(true)}
              className="text-xs font-semibold text-[#09090B] hover:underline px-1.5 py-1"
            >
              Reschedule
            </button>
          </>
        )}
        <Link
          href={`/leads/${followUp.leadId}`}
          className="text-xs font-semibold text-[#09090B] hover:underline px-1.5 py-1"
        >
          Open Lead
        </Link>
      </div>
      <Dialog open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Reschedule Follow-up" description={`Current due time: ${formatDateTime(followUp.dueDate)}`}>
        <form onSubmit={reschedule} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="New Date" required>
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="New Time" required>
              <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E4E4E7]">
            <Button type="button" variant="secondary" onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save New Time
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

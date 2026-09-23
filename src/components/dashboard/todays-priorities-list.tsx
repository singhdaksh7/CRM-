"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { PhoneCall, MessageCircle, CalendarClock, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { TodaysWorkItem, TodaysWorkKind } from "@/lib/todays-work";

const KIND_LABEL: Record<TodaysWorkKind, string> = {
  CALL_TODAY: "Call Today",
  WHATSAPP_TODAY: "WhatsApp Today",
  VISIT_EXPECTED_TODAY: "Customer Expected",
  GENERAL_FOLLOW_UP_TODAY: "Follow-up",
  VISIT_TODAY: "Visit",
  OVERDUE: "Overdue",
};

const KIND_ICON: Record<TodaysWorkKind, React.ComponentType<{ className?: string }>> = {
  CALL_TODAY: PhoneCall,
  WHATSAPP_TODAY: MessageCircle,
  VISIT_EXPECTED_TODAY: Clock,
  GENERAL_FOLLOW_UP_TODAY: Clock,
  VISIT_TODAY: CalendarClock,
  OVERDUE: AlertTriangle,
};

const KIND_TONE: Record<TodaysWorkKind, "blue" | "green" | "amber" | "red" | "purple" | "slate"> = {
  CALL_TODAY: "blue",
  WHATSAPP_TODAY: "green",
  VISIT_EXPECTED_TODAY: "purple",
  GENERAL_FOLLOW_UP_TODAY: "slate",
  VISIT_TODAY: "blue",
  OVERDUE: "red",
};

export function TodaysPrioritiesList({ items }: { items: TodaysWorkItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function completeFollowUp(item: TodaysWorkItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/follow-ups/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to complete");
      toast.success("Marked complete");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmVisit(item: TodaysWorkItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/visits/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to confirm");
      toast.success("Visit confirmed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-[#71717A]">Nothing on today&apos;s plate. Great work!</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        const isVisit = item.kind === "VISIT_TODAY";
        const busy = busyId === item.id;
        return (
          <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E4E4E7] bg-white p-3 shadow-2xs hover:border-[#D4D4D8] transition-colors">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#09090B]">
                  {item.leadName}
                  {isVisit && item.propertyCount ? ` · ${item.propertyCount} ${item.propertyCount === 1 ? "property" : "properties"}` : ""}
                </p>
                <p className="text-xs text-[#71717A]">
                  {isVisit ? item.visitTime : formatDateTime(item.dueAt)}
                  {item.ownerName ? ` · ${item.ownerName}` : ""}
                  {isVisit && item.meetingLocation ? ` · ${item.meetingLocation}` : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Badge>
              {isVisit ? (
                <>
                  <Link href={`/visits/${item.id}`} className="rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] transition-colors">
                    Open Visit
                  </Link>
                  <button onClick={() => confirmVisit(item)} disabled={busy} className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1.5 text-xs font-semibold text-[#15803D] hover:bg-[#DCFCE7] disabled:opacity-50 transition-colors cursor-pointer">
                    Confirm
                  </button>
                  <Link href={`/visits/${item.id}`} className="rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors">
                    Reschedule
                  </Link>
                </>
              ) : (
                <>
                  {item.leadId && (
                    <Link href={`/leads/${item.leadId}`} className="rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] transition-colors">
                      Open Lead
                    </Link>
                  )}
                  <button onClick={() => completeFollowUp(item)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-[#0A0A0A] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#27272A] disabled:opacity-50 transition-colors shadow-2xs border border-[#0A0A0A] cursor-pointer">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

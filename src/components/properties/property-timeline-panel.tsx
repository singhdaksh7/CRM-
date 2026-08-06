"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock } from "lucide-react";
import { formatDateTime, timeAgo } from "@/lib/utils";

export interface PropertyTimelineEventData {
  id: string;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  createdAt: string;
  actor: { name: string } | null;
}

function eventLabel(e: PropertyTimelineEventData): string {
  const type = e.eventType.replace(/_/g, " ").toLowerCase();
  if (e.fromValue && e.toValue) return `${type}: ${e.fromValue} → ${e.toValue}`;
  if (e.toValue) return `${type}: ${e.toValue}`;
  return type;
}

/** Objective 8 - complete property history, append-only. Change 11 - "Last Verified" badge + a lightweight Verify action. */
export function PropertyTimelinePanel({ propertyId, lastVerifiedAt, events }: { propertyId: string; lastVerifiedAt: string | null; events: PropertyTimelineEventData[] }) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);

  async function markVerified() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/verify`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to verify");
      toast.success("Marked as verified");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
            <Clock className="h-4 w-4 text-[#3366FF]" /> Property Timeline
          </h3>
          <p className="text-xs text-[#596579] mt-1">
            {lastVerifiedAt ? `Verified ${timeAgo(new Date(lastVerifiedAt))}` : "Never verified"}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={markVerified} disabled={verifying}>
          <CheckCircle2 className="h-4 w-4" /> {verifying ? "Verifying..." : "Mark Verified"}
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-[#8A94A6]">No history recorded yet.</p>
      ) : (
        <ol className="space-y-3 max-h-96 overflow-y-auto">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="relative border-l-2 border-[#E7ECF2] pl-4">
              <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#3366FF]" />
              <p className="text-sm font-medium text-[#1B2430] capitalize">{eventLabel(e)}</p>
              {e.note && <p className="text-xs text-[#596579]">{e.note}</p>}
              <p className="text-xs text-[#8A94A6]">{e.actor ? `${e.actor.name} · ` : ""}{formatDateTime(new Date(e.createdAt))}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

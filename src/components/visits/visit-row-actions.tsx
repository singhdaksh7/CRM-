"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { VisitFeedbackDialog } from "./visit-feedback-dialog";
import { enumToLabel } from "@/lib/utils";

const VISIT_STATUSES = ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "IN_PROGRESS", "COMPLETED", "RESCHEDULED", "CANCELLED", "CLIENT_NO_SHOW"];
const OUTCOMES = [
  "HIGHLY_INTERESTED", "INTERESTED", "NEEDS_TIME", "NOT_INTERESTED", "WANTS_ANOTHER_PROPERTY", "READY_FOR_NEGOTIATION",
  // Phase 4 - Field Operations
  "CUSTOMER_NO_SHOW", "OWNER_NO_SHOW", "NEGOTIATION_IN_PROGRESS", "SHORTLISTED", "REJECTED", "FOLLOW_UP_NEEDED",
];

export function VisitRowActions({ visitId, status, outcome }: { visitId: string; status: string; outcome: string | null }) {
  const router = useRouter();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function update(data: Record<string, unknown>) {
    const res = await fetch(`/api/visits/${visitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { toast.success("Visit updated"); router.refresh(); } else toast.error("Update failed");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select className="w-auto text-xs" defaultValue={status} onChange={(e) => update({ status: e.target.value })}>
        {VISIT_STATUSES.map((s) => (<option key={s} value={s}>{enumToLabel(s)}</option>))}
      </Select>
      <Select className="w-auto text-xs" defaultValue={outcome ?? ""} onChange={(e) => update({ outcome: e.target.value })}>
        <option value="">Outcome...</option>
        {OUTCOMES.map((o) => (<option key={o} value={o}>{enumToLabel(o)}</option>))}
      </Select>
      <Button size="sm" variant="outline" onClick={() => setFeedbackOpen(true)}>Feedback</Button>
      <VisitFeedbackDialog visitId={visitId} open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}

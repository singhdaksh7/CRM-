"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Textarea, Field } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const ISSUE_FLAGS: { key: "budgetIssue" | "areaIssue" | "parkingIssue" | "familyRejected" | "ownerRejected" | "willVisitAgain" | "negotiationRequired"; label: string }[] = [
  { key: "budgetIssue", label: "Budget issue" },
  { key: "areaIssue", label: "Area issue" },
  { key: "parkingIssue", label: "Parking issue" },
  { key: "familyRejected", label: "Family rejected" },
  { key: "ownerRejected", label: "Owner rejected" },
  { key: "willVisitAgain", label: "Will visit again" },
  { key: "negotiationRequired", label: "Negotiation required" },
];

export function VisitFeedbackDialog({ visitId, open, onClose }: { visitId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...flags, additionalNotes: notes || null, rating }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save feedback");
      toast.success("Feedback saved");
      router.refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Visit Feedback" description="Objective 11 - feeds Lead Health and Property Health automatically.">
      <div className="space-y-3">
        <Field label="Customer rating">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} className="p-0.5">
                <Star className={cn("h-6 w-6", rating !== null && n <= rating ? "fill-[#F5A623] text-[#F5A623]" : "text-[#C3C5D8]")} />
              </button>
            ))}
            {rating !== null && (
              <button type="button" onClick={() => setRating(null)} className="ml-2 text-xs text-[#8A94A6] hover:text-[#1B2430]">
                Clear
              </button>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {ISSUE_FLAGS.map((f) => (
            <Checkbox key={f.key} label={f.label} checked={Boolean(flags[f.key])} onChange={(e) => setFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))} />
          ))}
        </div>
        <Field label="Additional Notes">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Customer liked the balcony, disliked the parking..." />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Saving..." : "Save Feedback"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

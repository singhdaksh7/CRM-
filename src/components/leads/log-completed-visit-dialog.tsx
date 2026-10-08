"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { User } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PropertyPickerDialog, type PickerProperty } from "@/components/properties/property-picker-dialog";
import { VISIT_REQUIRED_MESSAGE, VISIT_REQUIRED_TITLE } from "@/lib/visit-required";
import { enumToLabel } from "@/lib/utils";

type Assignee = Pick<User, "id" | "name" | "role">;

/**
 * "No visit on record": shown when a lead is moved to Visit Completed but has no active visit to complete.
 * Submitting creates one COMPLETED visit and moves the lead to Visit Completed in a single server transaction
 * (POST /api/leads/[id]/completed-visit). Cancelling changes nothing.
 */
export function LogCompletedVisitDialog({
  open,
  onClose,
  leadId,
  assignees,
  defaultAssigneeId,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  assignees: Assignee[];
  defaultAssigneeId?: string | null;
}) {
  const router = useRouter();
  const [property, setProperty] = useState<PickerProperty | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assignedToId, setAssignedToId] = useState(defaultAssigneeId && assignees.some((a) => a.id === defaultAssigneeId) ? defaultAssigneeId : "");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("11:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!property || !assignedToId || !visitDate || !visitTime) {
      toast.error("Property, employee and visit date/time are required");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/completed-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: property.id, assignedToId, visitDate, visitTime, notes: notes.trim() || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Completed visit logged and lead marked Visit Completed");
      onClose();
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to log the completed visit");
    }
  }

  return (
    <>
      <Dialog open={open && !pickerOpen} onClose={onClose} title={VISIT_REQUIRED_TITLE} description={VISIT_REQUIRED_MESSAGE}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Property" required>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-lg border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B]" data-testid="completed-visit-property">
                {property ? `${property.title} · ${property.area}` : <span className="text-[#71717A]">No property selected</span>}
              </div>
              <Button type="button" variant="secondary" onClick={() => setPickerOpen(true)}>
                {property ? "Change" : "Select"}
              </Button>
            </div>
          </Field>
          <Field label="Assigned employee" required>
            <Select required value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Select employee...</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {enumToLabel(a.role)}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Visit date" required>
              <Input type="date" required max={new Date().toISOString().slice(0, 10)} value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
            </Field>
            <Field label="Visit time" required>
              <Input type="time" required value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional - what happened on the visit" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-[#E4E4E7] pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>Log visit &amp; mark Visit Completed</Button>
          </div>
        </form>
      </Dialog>
      <PropertyPickerDialog
        open={open && pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(p) => {
          setProperty(p);
          setPickerOpen(false);
        }}
        excludeIds={new Set()}
        title="Select the visited property"
        description="Search the inventory for the property the client visited."
        actionLabel="Select"
      />
    </>
  );
}

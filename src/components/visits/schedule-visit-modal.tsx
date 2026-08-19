"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Plus, X } from "lucide-react";
import type { Lead, Property, User } from "@prisma/client";

export function ScheduleVisitModal({
  leads,
  properties,
  employees,
  initialLeadId,
  initialPropertyId,
}: {
  leads: Lead[];
  properties: Property[];
  employees: User[];
  /** Deep-linked from the Demand Pool "Schedule Visit" bridge (VISIT_REQUESTED response) - opens this modal pre-filled instead of auto-creating a visit. */
  initialLeadId?: string;
  initialPropertyId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialLeadId || initialPropertyId));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ leadId: initialLeadId ?? "", propertyId: initialPropertyId ?? "", assignedToId: "", visitDate: "", visitTime: "11:00", meetingLocation: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.leadId || !form.propertyId || !form.visitDate) return toast.error("Lead, property and date are required");
    setSaving(true);
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Visit scheduled");
      setOpen(false);
      router.refresh();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to schedule visit");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Schedule Visit</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Schedule Visit</h3>
              <button aria-label="Close" onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Lead" required>
                <Select required value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
                  <option value="">Select lead...</option>
                  {leads.map((l) => (<option key={l.id} value={l.id}>{l.clientName} ({l.leadCode})</option>))}
                </Select>
              </Field>
              <Field label="Property" required>
                <Select required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
                  <option value="">Select property...</option>
                  {properties.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
                </Select>
              </Field>
              <Field label="Assign Field Executive">
                <Select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" required>
                  <Input type="date" required value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} />
                </Field>
                <Field label="Time" required>
                  <Input type="time" required value={form.visitTime} onChange={(e) => setForm({ ...form, visitTime: e.target.value })} />
                </Field>
              </div>
              <Field label="Meeting Location">
                <Input value={form.meetingLocation} onChange={(e) => setForm({ ...form, meetingLocation: e.target.value })} placeholder="Property site / landmark" />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={saving}>Schedule</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

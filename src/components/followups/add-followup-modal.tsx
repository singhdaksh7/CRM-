"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Plus, X } from "lucide-react";
import type { Lead } from "@prisma/client";
import { HUMAN_FOLLOWUP_TYPES, DEFAULT_FOLLOWUP_TYPE } from "@/lib/follow-up-types";

// Only id/name are ever rendered here - see src/lib/user-select.ts for why
// the server component that provides `employees` deliberately excludes
// passwordHash and other account fields rather than passing a full User row.
type EmployeeOption = { id: string; name: string };

export function AddFollowUpModal({ leads, employees }: { leads: Lead[]; employees: EmployeeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ leadId: "", type: DEFAULT_FOLLOWUP_TYPE as string, dueDate: "", ownerId: "", notes: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.leadId || !form.dueDate) return toast.error("Lead and due date are required");
    setSaving(true);
    const res = await fetch("/api/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ownerId: form.ownerId || null, notes: form.notes || null }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Follow-up scheduled");
      setOpen(false);
      router.refresh();
    } else toast.error("Failed to schedule follow-up");
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Follow-up</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Add Follow-up</h3>
              <button aria-label="Close" onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Lead" required>
                <Select required value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
                  <option value="">Select lead...</option>
                  {leads.map((l) => (<option key={l.id} value={l.id}>{l.clientName} ({l.leadCode})</option>))}
                </Select>
              </Field>
              <Field label="Type" required>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {HUMAN_FOLLOWUP_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </Select>
              </Field>
              <Field label="Due Date & Time" required>
                <Input type="datetime-local" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </Field>
              <Field label="Owner">
                <Select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
                </Select>
              </Field>
              <Field label="Notes">
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

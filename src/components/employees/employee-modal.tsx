"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Plus, X } from "lucide-react";
import { SetupLinkActions } from "./setup-link-actions";

export function AddEmployeeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; setupUrl: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "FIELD_EXECUTIVE",
    speciality: "ALL",
    maxActiveLeads: 20,
    serviceAreas: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        serviceAreas: form.serviceAreas
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    setSaving(false);
    if (res.ok) {
      const body = await res.json();
      toast.success("Employee created in Pending Setup status");
      setCreated({ id: body.employee.id, name: body.employee.name, setupUrl: body.setupUrl });
      setForm({ name: "", email: "", phone: "", role: "FIELD_EXECUTIVE", speciality: "ALL", maxActiveLeads: 20, serviceAreas: "" });
      router.refresh();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to add employee");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Employee
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Add Employee</h3>
              <button aria-label="Close" onClick={() => { setOpen(false); setCreated(null); }}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            {created ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">Employee created successfully. Share this one-time setup link manually.</p>
                <SetupLinkActions employeeId={created.id} employeeName={created.name} initialSetupUrl={created.setupUrl} />
                <div className="flex justify-end"><Button onClick={() => { setOpen(false); setCreated(null); }}>Done</Button></div>
              </div>
            ) : (
            <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              <Field label="Full Name" required>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email" required>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Role" required>
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="FIELD_EXECUTIVE">Field Executive</option>
                  <option value="DATA_MANAGER">Data Manager</option>
                  <option value="ADMIN">Admin</option>
                </Select>
              </Field>
              {form.role === "FIELD_EXECUTIVE" && (
                <>
                  <Field label="Speciality" hint="Used by the Speciality auto-assignment strategy">
                    <Select value={form.speciality} onChange={(e) => setForm({ ...form, speciality: e.target.value })}>
                      <option value="ALL">All</option>
                      <option value="RENT">Rent</option>
                      <option value="SALE">Sale</option>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="RESIDENTIAL">Residential</option>
                    </Select>
                  </Field>
                  <Field label="Max Active Leads" hint="Auto-assignment stops once this capacity is reached">
                    <Input type="number" min={1} value={form.maxActiveLeads} onChange={(e) => setForm({ ...form, maxActiveLeads: Number(e.target.value) })} />
                  </Field>
                  <Field label="Service Areas" hint="Comma-separated Delhi localities, used by Location-based assignment">
                    <Input value={form.serviceAreas} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} placeholder="Janakpuri, Dwarka, Uttam Nagar" />
                  </Field>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={saving}>Add Employee</Button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

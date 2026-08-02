"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import type { EmployeeServiceArea, EmployeeSpeciality } from "@prisma/client";

export function EmployeeAssignmentSettings({
  employeeId,
  speciality,
  maxActiveLeads,
  isAvailable,
  autoAssignEnabled,
  serviceAreas,
}: {
  employeeId: string;
  speciality: EmployeeSpeciality;
  maxActiveLeads: number;
  isAvailable: boolean;
  autoAssignEnabled: boolean;
  serviceAreas: EmployeeServiceArea[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    speciality,
    maxActiveLeads,
    isAvailable,
    autoAssignEnabled,
    serviceAreas: serviceAreas.map((a) => a.locality).join(", "),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speciality: form.speciality,
        maxActiveLeads: form.maxActiveLeads,
        isAvailable: form.isAvailable,
        autoAssignEnabled: form.autoAssignEnabled,
        serviceAreas: form.serviceAreas.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Assignment settings updated");
      router.refresh();
    } else toast.error("Failed to update settings");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Auto-Assignment Profile</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Speciality">
          <Select value={form.speciality} onChange={(e) => setForm({ ...form, speciality: e.target.value as EmployeeSpeciality })}>
            <option value="ALL">All</option>
            <option value="RENT">Rent</option>
            <option value="SALE">Sale</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="RESIDENTIAL">Residential</option>
          </Select>
        </Field>
        <Field label="Max Active Leads">
          <Input type="number" min={1} value={form.maxActiveLeads} onChange={(e) => setForm({ ...form, maxActiveLeads: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Service Areas" hint="Comma-separated Delhi localities">
        <Input value={form.serviceAreas} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} placeholder="Janakpuri, Dwarka" />
      </Field>
      <div className="mt-3 flex flex-wrap gap-4">
        <Checkbox label="Available for new leads" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} />
        <Checkbox label="Auto-assignment enabled" checked={form.autoAssignEnabled} onChange={(e) => setForm({ ...form, autoAssignEnabled: e.target.checked })} />
      </div>
      <Button size="sm" className="mt-3" onClick={save} loading={saving}>Save</Button>
    </div>
  );
}

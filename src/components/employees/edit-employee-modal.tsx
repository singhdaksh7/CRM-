"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Pencil } from "lucide-react";

type Role = "ADMIN" | "DATA_MANAGER" | "FIELD_EXECUTIVE";

/**
 * Edit an existing employee's profile fields. Deliberately excludes email:
 * it is the Auth.js login identifier and changing it here would be a
 * separate, higher-risk credential-identity change than this simple profile
 * form should casually allow (see account-lifecycle.ts for how status
 * changes are already isolated from this kind of generic PATCH for the same
 * reason). Role IS editable - PATCH /api/employees/[id] already accepts it
 * and ADMIN-only access to this whole page is the existing authorization
 * boundary for that.
 */
export function EditEmployeeModal({
  employeeId,
  initial,
}: {
  employeeId: string;
  initial: { name: string; phone: string | null; role: Role; notes: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initial.name,
    phone: initial.phone ?? "",
    role: initial.role,
    notes: initial.notes ?? "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || null,
        role: form.role,
        notes: form.notes || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Employee updated");
      setOpen(false);
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to update employee");
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Edit
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit Employee">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full Name" required>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Role" required hint="Changes what this account can access immediately.">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="FIELD_EXECUTIVE">Field Executive</option>
              <option value="DATA_MANAGER">Data Manager</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E4E4E7]">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

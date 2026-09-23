"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

const DEFAULT_LABEL = "Team";

export function EmployeeDirectoryLabelSettings() {
  const router = useRouter();
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/organization/employee-directory-label")
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => setLabel(body?.employeeDirectoryLabel ?? DEFAULT_LABEL));
  }, []);

  async function save() {
    setSaving(true);
    const response = await fetch("/api/organization/employee-directory-label", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeDirectoryLabel: label }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      toast.error(body.error ?? "Failed to save employee directory name");
      return;
    }
    setLabel(body.employeeDirectoryLabel);
    toast.success("Employee directory name updated");
    router.refresh();
  }

  return (
    <div className="space-y-2 border-t border-zinc-200 pt-3">
      <Field label="Employee Directory Name" hint="Controls how the employee directory is named throughout the CRM." required>
        <Input value={label} maxLength={40} onChange={(event) => setLabel(event.target.value)} />
      </Field>
      <Button size="sm" onClick={save} loading={saving}>Save</Button>
    </div>
  );
}

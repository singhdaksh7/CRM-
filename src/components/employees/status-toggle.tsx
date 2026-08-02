"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function StatusToggle({ employeeId, status }: { employeeId: string; status: "ACTIVE" | "INACTIVE" }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Status updated"); router.refresh(); } else toast.error("Failed to update status");
  }

  return (
    <button onClick={toggle} disabled={saving} className="disabled:opacity-50">
      <Badge tone={status === "ACTIVE" ? "green" : "slate"}>{status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
    </button>
  );
}

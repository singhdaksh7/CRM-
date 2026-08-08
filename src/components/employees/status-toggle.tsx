"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function StatusToggle({ employeeId, status }: { employeeId: string; status: "PENDING_SETUP" | "ACTIVE" | "INACTIVE" }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (status === "PENDING_SETUP") return;
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
    <button onClick={toggle} disabled={saving || status === "PENDING_SETUP"} className="disabled:cursor-default disabled:opacity-70">
      <Badge tone={status === "ACTIVE" ? "green" : status === "PENDING_SETUP" ? "amber" : "slate"}>{status === "ACTIVE" ? "Active" : status === "PENDING_SETUP" ? "Pending Setup" : "Disabled"}</Badge>
    </button>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BulkAutoAssignButton({ unassignedCount }: { unassignedCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const res = await fetch("/api/leads/bulk-auto-assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(`${data.assigned} of ${data.total} unassigned leads auto-assigned`);
      router.refresh();
    } else {
      toast.error("Bulk auto-assignment failed");
    }
  }

  if (unassignedCount === 0) return null;

  return (
    <Button variant="secondary" onClick={run} loading={loading}>
      <Zap className="h-4 w-4" /> Run Auto Assignment ({unassignedCount})
    </Button>
  );
}

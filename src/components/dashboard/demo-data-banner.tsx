"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** ADMIN-only. Server-rendered conditionally in dashboard/page.tsx (never shown to non-admins, never rendered at all when no demo data is loaded). */
export function DemoDataBanner({ initialLoaded }: { initialLoaded: boolean }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(initialLoaded);
  const [deleting, setDeleting] = useState(false);

  if (!loaded) return null;

  async function handleDelete() {
    if (!confirm("Delete all KP-DEMO- demo data? This only removes records created by the demo seed script - real production data is never touched.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/demo-data", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to delete demo data");
      }
      const { totalDeleted } = await res.json();
      toast.success(`Demo data removed (${totalDeleted} records deleted).`);
      setLoaded(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#FFD591] bg-[#FFFBE6] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D48806]" />
        <div>
          <p className="text-sm font-semibold text-[#874D00]">Demo data loaded</p>
          <p className="text-xs text-[#874D00]/80">
            This organization currently contains KP Properties demo/test data (prefixed KP-DEMO-), visible alongside real records.
          </p>
        </div>
      </div>
      <Button type="button" variant="secondary" loading={deleting} onClick={handleDelete} className="shrink-0 border-[#FFD591] text-[#874D00] hover:bg-[#FFF1B8]">
        Delete Demo Data
      </Button>
    </div>
  );
}

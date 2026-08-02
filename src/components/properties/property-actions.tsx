"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, LinkButton } from "@/components/ui/button";
import { Pencil, Ban, Link2 } from "lucide-react";

export function PropertyActions({ propertyId, status }: { propertyId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDeactivate() {
    if (!confirm("Deactivate this property? It will no longer appear in active inventory or matching.")) return;
    setLoading(true);
    const res = await fetch(`/api/properties/${propertyId}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      toast.success("Property deactivated");
      router.refresh();
    } else {
      toast.error("Failed to deactivate property");
    }
  }

  function copyPublicLink() {
    const url = `${window.location.origin}/p/${propertyId}`;
    navigator.clipboard.writeText(url);
    toast.success("Public link copied to clipboard");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <LinkButton href={`/properties/${propertyId}/edit`} variant="secondary" size="sm">
        <Pencil className="h-3.5 w-3.5" /> Edit
      </LinkButton>
      <Button variant="secondary" size="sm" onClick={copyPublicLink}>
        <Link2 className="h-3.5 w-3.5" /> Copy Public Link
      </Button>
      {status !== "INACTIVE" && (
        <Button variant="danger" size="sm" loading={loading} onClick={handleDeactivate}>
          <Ban className="h-3.5 w-3.5" /> Deactivate
        </Button>
      )}
    </div>
  );
}

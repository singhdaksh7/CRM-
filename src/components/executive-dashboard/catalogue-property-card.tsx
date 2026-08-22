"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickActions } from "./quick-actions";
import type { ExecutiveCatalogueProperty } from "@/lib/catalogue-dto";

const STATUS_OPTIONS: { value: ExecutiveCatalogueProperty["executiveStatus"]; label: string }[] = [
  { value: "SHOWN", label: "Showed" },
  { value: "CUSTOMER_LIKED", label: "Customer Liked" },
  { value: "SHORTLISTED", label: "Shortlisted" },
  { value: "REJECTED", label: "Rejected" },
];

const STATUS_TONE: Record<string, "slate" | "green" | "blue" | "red"> = {
  PENDING: "slate",
  SHOWN: "blue",
  CUSTOMER_LIKED: "green",
  SHORTLISTED: "green",
  REJECTED: "red",
};

export function CataloguePropertyCard({ catalogueId, property }: { catalogueId: string; property: ExecutiveCatalogueProperty }) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState(property.executiveStatus);

  async function updateStatus(next: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/catalogues/${catalogueId}/properties/${property.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executiveStatus: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update");
      setStatus(next);
      toast.success("Updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
      {property.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element -- signed/legacy cover URLs
        <img src={property.coverImage} alt="" className="h-36 w-full rounded-xl object-cover bg-[#F5F7FA]" />
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#1B2430]">{property.title}</p>
          <p className="text-xs text-[#596579] mt-0.5">
            {property.buildingName && `${property.buildingName}, `}
            {property.flatNumber && `Flat ${property.flatNumber}, `}
            {property.address}
            {property.gateNumber && ` (${property.gateNumber})`}
          </p>
          {property.landmark && <p className="text-xs text-[#8A94A6]">Near {property.landmark}</p>}
        </div>
        <Badge tone={STATUS_TONE[status] ?? "slate"}>{status.replace(/_/g, " ")}</Badge>
      </div>

      <p className="text-lg font-bold text-[#3366FF]">{property.price}</p>

      <div className="rounded-xl bg-[#F5F7FA] p-3 text-xs space-y-1">
        {property.inventorySource === "DIRECT" ? (
          <>
            <p><span className="font-semibold">Owner:</span> {property.ownerName ?? "-"}</p>
            <p><span className="font-semibold">Phone:</span> {property.ownerPhone ?? "-"}</p>
          </>
        ) : (
          <>
            <p><span className="font-semibold">Partner:</span> {property.partnerName ?? "-"}</p>
            <p><span className="font-semibold">Phone:</span> {property.partnerPhone ?? "-"}</p>
          </>
        )}
        {property.keyAvailability && <p><span className="font-semibold">Keys:</span> {property.keyAvailability}</p>}
        {property.entryInstructions && <p><span className="font-semibold">Entry:</span> {property.entryInstructions}</p>}
        {property.internalNotes && <p><span className="font-semibold">Notes:</span> {property.internalNotes}</p>}
        {property.negotiationNotes && <p><span className="font-semibold">Negotiation:</span> {property.negotiationNotes}</p>}
      </div>

      <QuickActions
        ownerPhone={property.inventorySource === "DIRECT" ? property.ownerPhone : property.partnerPhone}
        latitude={property.latitude}
        longitude={property.longitude}
      />

      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#EFF4FF]">
        {STATUS_OPTIONS.map((opt) => (
          <Button key={opt.value} size="sm" variant={status === opt.value ? "primary" : "secondary"} disabled={updating} onClick={() => updateStatus(opt.value)}>
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

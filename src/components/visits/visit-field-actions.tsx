"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Navigation, Copy, Phone, MessageCircle, CheckCircle2, Flag } from "lucide-react";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { bestDirectionsUrl } from "@/lib/external-directions";

interface VisitFieldActionsProps {
  visitId: string;
  status: string;
  propertyAddress: string;
  latitude: number | null;
  longitude: number | null;
  clientName: string;
  clientPhone: string;
  ownerPhone: string | null;
  canSeeOwnerPhone: boolean;
}

/**
 * Quick actions for the Field Executive doing the visit - all external
 * links (Maps/tel/wa.me) work with zero API key or MAPS_PROVIDER
 * configuration; only "Mark Arrived"/"Complete Visit" touch the app's own
 * API. Owner phone is only rendered at all when the server has already
 * decided `canSeeOwnerPhone` - this component never re-derives that.
 */
export function VisitFieldActions({ visitId, status, propertyAddress, latitude, longitude, clientName, clientPhone, ownerPhone, canSeeOwnerPhone }: VisitFieldActionsProps) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  async function updateStatus(nextStatus: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast.success(nextStatus === "COMPLETED" ? "Visit marked complete" : "Marked as arrived");
        router.refresh();
      } else {
        toast.error("Could not update the visit");
      }
    } finally {
      setUpdating(false);
    }
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(propertyAddress);
    toast.success("Address copied");
  }

  const directionsHref = bestDirectionsUrl({ latitude, longitude, address: propertyAddress });
  const clientWaNumber = normalizeIndianPhone(clientPhone);
  const clientWaHref = clientWaNumber ? `https://wa.me/${clientWaNumber}?text=${encodeURIComponent(`Hi ${clientName}, I'm on my way for the property visit.`)}` : null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <a href={directionsHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-[#25D366]/15 px-2 py-1 text-[11px] font-semibold text-[#25D366] hover:bg-[#25D366]/25">
        <Navigation className="h-3 w-3" /> Directions
      </a>
      <button onClick={copyAddress} className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:bg-[#1E2533]">
        <Copy className="h-3 w-3" /> Copy Address
      </button>
      <a href={`tel:${clientPhone}`} className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:bg-[#1E2533]">
        <Phone className="h-3 w-3" /> Call Client
      </a>
      {clientWaHref && (
        <a href={clientWaHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-[#25D366]/15 px-2 py-1 text-[11px] font-semibold text-[#25D366] hover:bg-[#25D366]/25">
          <MessageCircle className="h-3 w-3" /> WhatsApp Client
        </a>
      )}
      {canSeeOwnerPhone && ownerPhone && (
        <a href={`tel:${ownerPhone}`} className="inline-flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.1)] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:bg-[#1E2533]">
          <Phone className="h-3 w-3" /> Call Owner
        </a>
      )}
      {status !== "COMPLETED" && status !== "CANCELLED" && (
        <>
          {status !== "EMPLOYEE_REACHED" && (
            <button onClick={() => updateStatus("EMPLOYEE_REACHED")} disabled={updating} className="inline-flex items-center gap-1 rounded-md bg-[#4F8CFF]/15 px-2 py-1 text-[11px] font-semibold text-[#4F8CFF] hover:bg-[#4F8CFF]/25 disabled:opacity-50">
              <Flag className="h-3 w-3" /> Mark Arrived
            </button>
          )}
          <button onClick={() => updateStatus("COMPLETED")} disabled={updating} className="inline-flex items-center gap-1 rounded-md bg-[#22C55E]/15 px-2 py-1 text-[11px] font-semibold text-[#22C55E] hover:bg-[#22C55E]/25 disabled:opacity-50">
            <CheckCircle2 className="h-3 w-3" /> Complete Visit
          </button>
        </>
      )}
    </div>
  );
}

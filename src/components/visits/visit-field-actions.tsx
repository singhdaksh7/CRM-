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
export function VisitFieldActions({
  visitId,
  status,
  propertyAddress,
  latitude,
  longitude,
  clientName,
  clientPhone,
  ownerPhone,
  canSeeOwnerPhone,
}: VisitFieldActionsProps) {
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
  const clientWaHref = clientWaNumber
    ? `https://wa.me/${clientWaNumber}?text=${encodeURIComponent(`Hi ${clientName}, I'm on my way for the property visit.`)}`
    : null;

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={directionsHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-2xs hover:bg-zinc-50"
      >
        <Navigation className="h-3.5 w-3.5 text-zinc-600" /> Directions
      </a>
      <button
        type="button"
        onClick={copyAddress}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-2xs hover:bg-zinc-50"
      >
        <Copy className="h-3.5 w-3.5 text-zinc-600" /> Copy Address
      </button>
      <a
        href={`tel:${clientPhone}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-2xs hover:bg-zinc-50"
      >
        <Phone className="h-3.5 w-3.5 text-zinc-600" /> Call Client
      </a>
      {clientWaHref && (
        <a
          href={clientWaHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-2xs hover:bg-emerald-100"
        >
          <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp Client
        </a>
      )}
      {canSeeOwnerPhone && ownerPhone && (
        <a
          href={`tel:${ownerPhone}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-2xs hover:bg-zinc-50"
        >
          <Phone className="h-3.5 w-3.5 text-zinc-600" /> Call Owner
        </a>
      )}
      {status !== "COMPLETED" && status !== "CANCELLED" && (
        <>
          {status !== "EMPLOYEE_REACHED" && (
            <button
              type="button"
              onClick={() => updateStatus("EMPLOYEE_REACHED")}
              disabled={updating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-zinc-800 disabled:opacity-50"
            >
              <Flag className="h-3.5 w-3.5" /> Mark Arrived
            </button>
          )}
          <button
            type="button"
            onClick={() => updateStatus("COMPLETED")}
            disabled={updating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete Visit
          </button>
        </>
      )}
    </div>
  );
}

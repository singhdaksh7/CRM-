"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A7 - minimal, explicit "Capture Location" action for a field executive
 * standing at an assigned property. Deliberately does nothing until
 * clicked: no capture on mount, no polling, no continuous tracking. One
 * getCurrentPosition() call per click, submitted to
 * POST /api/properties/[id]/capture-location, which enforces the same
 * assigned-visit/catalogue-lead access check as the rest of the internal
 * property view.
 */
export function CaptureLocationButton({ propertyId }: { propertyId: string }) {
  const [status, setStatus] = useState<"idle" | "capturing" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function handleCapture() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setMessage("This device/browser doesn't support location capture.");
      return;
    }

    setStatus("capturing");
    setMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch(`/api/properties/${propertyId}/capture-location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Could not save the captured location");
          }
          setStatus("success");
          const accuracyLabel = Number.isFinite(position.coords.accuracy) ? ` (±${Math.round(position.coords.accuracy)}m)` : "";
          setMessage(`Location captured${accuracyLabel}.`);
          toast.success("Location captured");
        } catch (err) {
          setStatus("error");
          const msg = err instanceof Error ? err.message : "Could not save the captured location";
          setMessage(msg);
          toast.error(msg);
        }
      },
      (geoError) => {
        setStatus("error");
        const msg =
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was denied. Enable it for this site and try again."
            : geoError.code === geoError.TIMEOUT
              ? "Getting your location took too long. Try again with a clearer view of the sky."
              : "Could not determine your location. Try again.";
        setMessage(msg);
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="secondary" onClick={handleCapture} disabled={status === "capturing"}>
        {status === "capturing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
        Capture Location
      </Button>
      {message && (
        <p className={`text-xs ${status === "error" ? "text-red-600" : "text-emerald-600"}`} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { MapPin, Navigation, Copy, RefreshCw, EyeOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { bestDirectionsUrl, viewOnMapUrl } from "@/lib/external-directions";
import { useMapsCapabilities } from "@/components/maps/use-maps-capabilities";

interface PropertyMapPanelProps {
  propertyId: string;
  address: string;
  area: string;
  landmark: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  geocodeStatus: string;
  locationPrecision: string;
  publicLocationMode: string;
}

const GEOCODE_STATUS_TONE: Record<string, BadgeTone> = {
  NOT_ATTEMPTED: "slate",
  PENDING: "amber",
  SUCCESS: "green",
  FAILED: "red",
  MANUAL: "blue",
};

const LOCATION_MODE_LABEL: Record<string, string> = {
  EXACT: "Exact location shown publicly",
  APPROXIMATE: "Approximate pin shown publicly",
  LOCALITY_ONLY: "Locality only (default)",
  HIDDEN: "Location hidden from public catalogue",
};

export function PropertyMapPanel(props: PropertyMapPanelProps) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManage = role === "ADMIN" || role === "DATA_MANAGER";
  const { capabilities } = useMapsCapabilities();

  const [geocoding, setGeocoding] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);
  const [location, setLocation] = useState(props);

  const hasCoordinates = location.latitude !== null && location.longitude !== null;
  const destinationAddress = [location.address, location.area, "Delhi"].filter(Boolean).join(", ");

  async function reGeocode() {
    setGeocoding(true);
    try {
      const res = await fetch(`/api/properties/${props.propertyId}/geocode`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not verify this address");
        return;
      }
      setLocation((prev) => ({ ...prev, ...data.property }));
      toast.success("Location verified");
    } finally {
      setGeocoding(false);
    }
  }

  async function copyLocation() {
    const text = hasCoordinates ? `${location.latitude}, ${location.longitude}` : destinationAddress;
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  async function markApproximate() {
    const res = await fetch(`/api/properties/${props.propertyId}/location`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markApproximate: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setLocation((prev) => ({ ...prev, ...data.property }));
      toast.success("Marked as approximate");
    } else {
      toast.error("Could not update location precision");
    }
  }

  async function changePublicMode(mode: string) {
    setUpdatingMode(true);
    try {
      const res = await fetch(`/api/properties/${props.propertyId}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicLocationMode: mode }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocation((prev) => ({ ...prev, ...data.property }));
        toast.success("Public catalogue visibility updated");
      } else {
        toast.error("Could not update visibility");
      }
    } finally {
      setUpdatingMode(false);
    }
  }

  const directionsHref = bestDirectionsUrl({ latitude: location.latitude, longitude: location.longitude, address: destinationAddress });
  const mapHref = hasCoordinates ? viewOnMapUrl({ latitude: location.latitude!, longitude: location.longitude! }) : directionsHref;

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
          <MapPin className="h-4 w-4 text-[#4F8CFF]" /> Location
        </h3>
        <Badge tone={GEOCODE_STATUS_TONE[location.geocodeStatus] ?? "slate"}>{location.geocodeStatus.replace(/_/g, " ")}</Badge>
      </div>

      <p className="text-sm text-[#CBD5E1]">{location.formattedAddress ?? destinationAddress}</p>
      <p className="mt-1 text-xs text-[#94A3B8]">
        {location.area}
        {location.pincode ? ` · ${location.pincode}` : ""}
        {location.landmark ? ` · Near ${location.landmark}` : ""}
      </p>

      {capabilities?.browserKeyConfigured && hasCoordinates && (
        <div className="mt-3 overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)]">
          <iframe
            title={`Map showing ${location.area}`}
            width="100%"
            height="180"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps/embed/v1/view?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY ?? ""}&center=${location.latitude},${location.longitude}&zoom=15`}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={directionsHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#22bf5b]">
          <Navigation className="h-3.5 w-3.5" /> Get Directions
        </a>
        <a href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E2533] px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] hover:bg-[#252D3D]">
          <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
        </a>
        <button onClick={copyLocation} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:bg-[#1E2533]">
          <Copy className="h-3.5 w-3.5" /> Copy Location
        </button>
      </div>

      {canManage && (
        <div className="mt-4 space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={reGeocode} loading={geocoding} disabled={!capabilities?.configured}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-geocode
            </Button>
            {hasCoordinates && location.locationPrecision !== "APPROXIMATE" && (
              <Button type="button" size="sm" variant="secondary" onClick={markApproximate}>
                Mark Approximate
              </Button>
            )}
          </div>
          {!capabilities?.configured && <p className="text-[11px] text-[#94A3B8]">Re-geocoding requires Maps to be configured (currently disabled).</p>}

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
              <EyeOff className="h-3 w-3" /> Public Catalogue Visibility
            </label>
            <Select value={location.publicLocationMode} onChange={(e) => changePublicMode(e.target.value)} disabled={updatingMode}>
              {Object.entries(LOCATION_MODE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

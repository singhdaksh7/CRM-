"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Select } from "@/components/ui/form";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/states";
import { formatINR, enumToLabel } from "@/lib/utils";
import type { Property } from "@prisma/client";

const RADIUS_OPTIONS = [
  { value: 1000, label: "1 km" },
  { value: 3000, label: "3 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
];

interface NearbyResult {
  property: Property;
  distanceMeters: number;
}

/** Simple proximity browse - a separate feature from the weighted lead-matching engine, not a replacement for it. */
export function NearbyPropertiesPanel({ propertyId }: { propertyId: string }) {
  const [radius, setRadius] = useState(3000);
  const [results, setResults] = useState<NearbyResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- entering a loading state for the radius-driven fetch below
    setLoading(true);
    fetch(`/api/properties/${propertyId}/nearby?radiusMeters=${radius}`)
      .then((res) => res.json())
      .then((data) => {
        setResults(data.results ?? []);
        setReason(data.reason ?? null);
      })
      .finally(() => setLoading(false));
  }, [propertyId, radius]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          <MapPin className="h-4 w-4 text-zinc-700" /> Nearby Properties
        </h3>
        <Select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-auto text-xs font-semibold" aria-label="Search radius">
          {RADIUS_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>Within {r.label}</option>
          ))}
        </Select>
      </div>

      {loading && <LoadingState label="Finding nearby properties..." />}
      {!loading && reason && <p className="text-xs text-zinc-500">{reason}</p>}
      {!loading && !reason && results?.length === 0 && <p className="text-xs text-zinc-500">No other properties found within this radius.</p>}
      {!loading && results && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.property.id}>
              <Link href={`/properties/${r.property.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs shadow-2xs transition-colors hover:bg-zinc-50/60">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-900">{r.property.title}</p>
                  <p className="text-zinc-500">
                    {r.property.area} · {(r.distanceMeters / 1000).toFixed(1)} km away ·{" "}
                    {r.property.listingType === "RENT" ? formatINR(r.property.monthlyRent, { suffix: "month" }) : formatINR(r.property.salePrice, { compact: true })}
                  </p>
                </div>
                <Badge tone={PROPERTY_STATUS_TONE[r.property.status]}>{enumToLabel(r.property.status)}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

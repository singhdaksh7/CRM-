"use client";

import { useEffect, useState } from "react";
import { Route, ExternalLink, AlertTriangle } from "lucide-react";
import { LoadingState } from "@/components/ui/states";

interface RouteStop {
  visitId: string;
  clientName: string;
  propertyTitle: string;
  visitTime: string;
  coordinates: { latitude: number; longitude: number } | null;
  travelFromPreviousMinutes: number | null;
  travelFromPreviousMeters: number | null;
  travelSource: "GOOGLE" | "ESTIMATED" | "NONE";
}

interface SuggestedRoute {
  stops: RouteStop[];
  unmappedCount: number;
  fullRouteUrl: string | null;
}

export function SuggestedRoutePanel({ employeeId, date }: { employeeId: string; date?: string }) {
  const [route, setRoute] = useState<SuggestedRoute | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- entering a loading state for the employee/date-driven fetch below
    setLoading(true);
    const params = new URLSearchParams({ employeeId, ...(date ? { date } : {}) });
    fetch(`/api/visits/suggested-route?${params}`)
      .then((res) => res.json())
      .then((data) => setRoute(data))
      .finally(() => setLoading(false));
  }, [employeeId, date]);

  if (loading) return <LoadingState label="Building suggested route..." />;
  if (!route || route.stops.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#09090B]">
          <Route className="h-4 w-4 text-[#09090B]" /> Suggested Route (today&apos;s schedule order)
        </h3>
        {route.fullRouteUrl && (
          <a href={route.fullRouteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-[#09090B] hover:underline">
            Open Full Route <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {route.unmappedCount > 0 && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {route.unmappedCount} stop{route.unmappedCount > 1 ? "s have" : " has"} no map location yet - travel time can&apos;t be estimated for it.
        </p>
      )}

      <ol className="space-y-2 text-xs text-[#52525B]">
        {route.stops.map((stop, i) => (
          <li key={stop.visitId} className="flex items-center gap-2.5 p-2 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A] text-[10px] font-bold text-white">{i + 1}</span>
            <span className="font-semibold text-[#09090B]">{stop.visitTime}</span>
            <span className="text-[#52525B]">{stop.clientName} - {stop.propertyTitle}</span>
            {stop.travelFromPreviousMinutes !== null && (
              <span className="text-[#71717A]">({stop.travelFromPreviousMinutes} min {stop.travelSource === "ESTIMATED" ? "est." : ""} from previous)</span>
            )}
            {stop.travelFromPreviousMeters !== null && stop.travelFromPreviousMinutes === null && (
              <span className="text-[#71717A]">(~{(stop.travelFromPreviousMeters / 1000).toFixed(1)} km from previous, estimated)</span>
            )}
            {!stop.coordinates && <span className="text-amber-600 font-medium">(no location)</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

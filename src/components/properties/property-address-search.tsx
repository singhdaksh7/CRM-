"use client";

import { useEffect, useRef, useState } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useMapsCapabilities } from "@/components/maps/use-maps-capabilities";
import { MapsDisabledState } from "@/components/maps/maps-disabled-state";
import { viewOnMapUrl } from "@/lib/external-directions";

interface PlaceSuggestion {
  placeId: string;
  description: string;
}

interface GeocodeResult {
  formattedAddress: string;
  placeId: string;
  location: { latitude: number; longitude: number };
  isPreciseMatch: boolean;
}

export interface AppliedLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: string;
}

/**
 * Address search + confirm-before-apply preview. Never overwrites the
 * form's existing address/area/landmark fields on its own - the caller's
 * `onApply` is only invoked when the user explicitly clicks "Use this
 * address", and even then only fills the free-text `address` field (area,
 * a fixed locality dropdown, is left for the user to pick).
 */
export function PropertyAddressSearch({ onApply, onClear, hasExistingLocation }: { onApply: (location: AppliedLocation) => void; onClear: () => void; hasExistingLocation: boolean }) {
  const { capabilities, loading: capsLoading } = useMapsCapabilities();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<GeocodeResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale suggestions once the query drops below the minimum length
      setSuggestions([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/maps/autocomplete?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setSuggestions(data.results ?? []))
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function selectSuggestion(suggestion: PlaceSuggestion) {
    setSuggestions([]);
    setQuery(suggestion.description);
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/geocode?q=${encodeURIComponent(suggestion.description)}`);
      const data = await res.json();
      if (!res.ok || !data.results?.length) {
        setError(data.error ?? "Could not verify this address. Try a more specific search, or enter the address manually.");
        return;
      }
      setPreview(data.results[0]);
    } finally {
      setPreviewLoading(false);
    }
  }

  function applyPreview() {
    if (!preview) return;
    onApply({ latitude: preview.location.latitude, longitude: preview.location.longitude, formattedAddress: preview.formattedAddress, placeId: preview.placeId });
    setPreview(null);
    setQuery("");
  }

  if (capsLoading) return null;
  if (!capabilities?.configured) return <MapsDisabledState compact />;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an address in Delhi..."
          className="pl-9"
          aria-label="Search for a property address"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#64748B]" />}
      </div>

      {suggestions.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#11151F]" role="listbox" aria-label="Address suggestions">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => selectSuggestion(s)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#CBD5E1] hover:bg-[#1E2533]"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#4F8CFF]" /> {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}

      {previewLoading && <p className="text-xs text-[#94A3B8]">Verifying address…</p>}
      {error && <p className="text-xs font-medium text-[#EF4444]" role="alert">{error}</p>}

      {preview && (
        <div className="rounded-lg border border-[rgba(79,140,255,0.3)] bg-[rgba(79,140,255,0.06)] p-3">
          <p className="text-xs font-semibold text-[#F8FAFC]">{preview.formattedAddress}</p>
          <p className="mt-0.5 text-[11px] text-[#94A3B8]">
            {preview.isPreciseMatch ? "Precise match" : "Approximate match"} ·{" "}
            <a href={viewOnMapUrl(preview.location)} target="_blank" rel="noreferrer" className="text-[#4F8CFF] hover:underline">
              Preview on Google Maps
            </a>
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={applyPreview}>
              Use this address
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setPreview(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {hasExistingLocation && (
        <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#EF4444]">
          <X className="h-3 w-3" /> Clear saved location
        </button>
      )}
    </div>
  );
}

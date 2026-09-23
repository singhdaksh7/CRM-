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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an address in Delhi..."
          className="pl-9"
          aria-label="Search for a property address"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />}
      </div>

      {suggestions.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg" role="listbox" aria-label="Address suggestions">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => selectSuggestion(s)}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs text-zinc-800 hover:bg-zinc-50"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" /> {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}

      {previewLoading && <p className="text-xs text-zinc-500">Verifying address…</p>}
      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}

      {preview && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5">
          <p className="text-xs font-semibold text-zinc-900">{preview.formattedAddress}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {preview.isPreciseMatch ? "Precise match" : "Approximate match"} ·{" "}
            <a href={viewOnMapUrl(preview.location)} target="_blank" rel="noreferrer" className="text-zinc-900 font-medium underline hover:text-black">
              Preview on Google Maps
            </a>
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button type="button" size="sm" onClick={applyPreview}>
              Use this address
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setPreview(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {hasExistingLocation && !preview && (
        <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <span>Map coordinates attached to this listing</span>
          <button type="button" onClick={onClear} className="flex items-center gap-1 font-semibold text-red-600 hover:underline">
            <X className="h-3 w-3" /> Clear map location
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export interface MapsCapabilities {
  provider: "GOOGLE" | "DISABLED";
  configured: boolean;
  browserKeyConfigured: boolean;
  defaultRegion: string;
  defaultLanguage: string;
  defaultCity: string;
}

let cache: { value: MapsCapabilities; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

/** Client-side cache of GET /api/system/maps-capabilities - mirrors useStorageCapabilities so every address-search/map component shares one fetch per session. */
export function useMapsCapabilities() {
  const [capabilities, setCapabilities] = useState<MapsCapabilities | null>(cache?.value ?? null);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- serving an already-fetched module-level cache on mount
      setCapabilities(cache.value);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/system/maps-capabilities")
      .then((res) => {
        if (!res.ok) throw new Error("Could not determine maps status");
        return res.json();
      })
      .then((data: MapsCapabilities) => {
        if (cancelled) return;
        cache = { value: data, fetchedAt: Date.now() };
        setCapabilities(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not determine maps status");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { capabilities, loading, error };
}

"use client";

import { useEffect, useState } from "react";

export interface StorageCapabilities {
  provider: "FIREBASE" | "S3" | "R2" | "MOCK" | "DISABLED";
  configured: boolean;
  uploadsEnabled: boolean;
  propertyImages: { enabled: boolean; maxSizeBytes: number; maxCount?: number; allowedMimeTypes: string[] };
  documents: { enabled: boolean; maxSizeBytes: number; allowedMimeTypes: string[] };
}

let cache: { value: StorageCapabilities; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

/** Client-side cache of GET /api/system/storage-capabilities - shared across every uploader/vault component mounted in the same session so navigating between pages doesn't refetch every time. */
export function useStorageCapabilities() {
  const [capabilities, setCapabilities] = useState<StorageCapabilities | null>(cache?.value ?? null);
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
    fetch("/api/system/storage-capabilities")
      .then((res) => {
        if (!res.ok) throw new Error("Could not determine storage status");
        return res.json();
      })
      .then((data: StorageCapabilities) => {
        if (cancelled) return;
        cache = { value: data, fetchedAt: Date.now() };
        setCapabilities(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not determine storage status");
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

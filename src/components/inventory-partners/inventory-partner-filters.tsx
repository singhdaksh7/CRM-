"use client";

import { useRouter, usePathname } from "next/navigation";
import { Input, Select } from "@/components/ui/form";
import { Search, MapPin, X } from "lucide-react";

/**
 * Search + filter bar for Inventory Partners, URL-query-state driven (same
 * pattern as lead-filters.tsx) so filters are shareable/bookmarkable and
 * survive a refresh. `locality` is the important one per spec: it filters
 * partners by where they operate/deal (InventoryPartner.localities), not by
 * exact property address.
 */
export function InventoryPartnerFilters({
  currentParams,
  resultCount,
}: {
  currentParams: Record<string, string | undefined>;
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function update(key: string, value: string) {
    const params = new URLSearchParams(
      Object.entries(currentParams).filter(([k, v]) => !!v && k !== "page") as [string, string][]
    );
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  const q = currentParams.q ?? "";
  const locality = currentParams.locality ?? "";
  const isActive = currentParams.isActive ?? "";
  const activeFilters: { key: string; label: string }[] = [
    q ? { key: "q", label: `Search: "${q}"` } : null,
    locality ? { key: "locality", label: `Operates in: ${locality}` } : null,
    isActive ? { key: "isActive", label: isActive === "true" ? "Active only" : "Inactive only" } : null,
  ].filter((f): f is { key: string; label: string } => f !== null);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-xs space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder="Search name, phone, company, code..." defaultValue={q} onChange={(e) => update("q", e.target.value)} className="pl-9" />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Filter by operating area, e.g. Noida"
            defaultValue={locality}
            onChange={(e) => update("locality", e.target.value)}
            className="pl-9"
            aria-label="Filter partners by where they operate/deal"
          />
        </div>
        <Select defaultValue={isActive} onChange={(e) => update("isActive", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">All Partners</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </Select>
      </div>

      {(activeFilters.length > 0 || resultCount >= 0) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {activeFilters.map((f) => (
            <span key={f.key} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
              {f.label}
              <button type="button" onClick={() => update(f.key, "")} aria-label={`Remove filter ${f.label}`} className="hover:text-zinc-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {activeFilters.length > 0 && (
            <button type="button" onClick={clearAll} className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 hover:underline">
              Clear all
            </button>
          )}
          <span className="ml-auto text-xs text-zinc-400">{resultCount} result{resultCount === 1 ? "" : "s"}</span>
        </div>
      )}
    </div>
  );
}

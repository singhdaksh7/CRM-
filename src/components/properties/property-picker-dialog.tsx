"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { formatINR, enumToLabel } from "@/lib/utils";
import { Search, Plus, ImageOff } from "lucide-react";
import { LocalityCombobox } from "@/components/properties/locality-combobox";

export interface PickerProperty {
  id: string;
  propertyCode: string;
  title: string;
  area: string;
  listingType: "RENT" | "SALE";
  monthlyRent: number | null;
  salePrice: number | null;
  bhk: number;
  furnishing: string;
  coverImage: string | null;
  status: string;
}

/**
 * Debounced org-scoped search over GET /api/properties/search - lets a
 * broker add a property to the shortlist that the matching engine didn't
 * surface (out of budget tolerance, missing locality data, etc). Selecting
 * a result closes the dialog and hands the property back to the caller;
 * the caller is responsible for marking it `addedManually: true`.
 */
export function PropertyPickerDialog({
  open,
  onClose,
  onSelect,
  excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (property: PickerProperty) => void;
  excludeIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [locality, setLocality] = useState("");
  const [results, setResults] = useState<PickerProperty[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- entering a loading state for the debounced search below
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (locality) params.set("area", locality);
      fetch(`/api/properties/search?${params.toString()}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => setResults(data.properties ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locality, open]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset search state each time the dialog closes
      setQuery("");
      setLocality("");
      setResults([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="Add More Properties" description="Search the full inventory to manually add a property to this shortlist." sheet wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code, title, locality, address..."
              className="pl-9"
            />
          </div>
          <LocalityCombobox
            value={locality}
            onChange={setLocality}
            allowCreate={false}
            placeholder="All localities"
            aria-label="Filter by locality"
          />
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {loading && <p className="py-6 text-center text-xs text-[#94A3B8]">Searching...</p>}
          {!loading && results.length === 0 && <p className="py-6 text-center text-xs text-[#94A3B8]">No properties found.</p>}
          {!loading &&
            results.map((p) => {
              const alreadyAdded = excludeIds.has(p.id);
              const price = p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true });
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#11151F] p-2.5">
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-[#181E2A]">
                    {p.coverImage ? (
                      <Image src={p.coverImage} alt={p.title} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#64748B]">
                        <ImageOff className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-[#F8FAFC]">{p.title}</span>
                      <Badge tone={PROPERTY_STATUS_TONE[p.status] ?? "slate"} className="shrink-0">{enumToLabel(p.status)}</Badge>
                    </div>
                    <p className="truncate text-xs text-[#94A3B8]">
                      {p.propertyCode} &middot; {p.area} &middot; {p.bhk} BHK &middot; {enumToLabel(p.furnishing)} &middot; {price}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => onSelect(p)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#4F8CFF] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3D7AEF] disabled:cursor-not-allowed disabled:bg-[#1E2533] disabled:text-[#64748B]"
                  >
                    <Plus className="h-3.5 w-3.5" /> {alreadyAdded ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </Dialog>
  );
}

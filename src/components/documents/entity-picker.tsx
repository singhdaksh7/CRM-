"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/form";
import type { DocumentEntityType } from "./document-types";

interface Option {
  id: string;
  label: string;
}

const ENDPOINTS: Record<DocumentEntityType, { url: string; listKey: string; toOption: (item: unknown) => Option }> = {
  PROPERTY: { url: "/api/properties", listKey: "properties", toOption: (p) => ({ id: (p as { id: string }).id, label: `${(p as { title: string }).title} (${(p as { propertyCode: string }).propertyCode})` }) },
  LEAD: { url: "/api/leads", listKey: "leads", toOption: (l) => ({ id: (l as { id: string }).id, label: `${(l as { clientName: string }).clientName} (${(l as { leadCode: string }).leadCode})` }) },
  OWNER: { url: "/api/owners", listKey: "owners", toOption: (o) => ({ id: (o as { id: string }).id, label: `${(o as { name: string }).name} (${(o as { ownerCode: string }).ownerCode})` }) },
  DEAL: { url: "/api/deals", listKey: "deals", toOption: (d) => ({ id: (d as { id: string }).id, label: `${(d as { dealCode: string }).dealCode}` }) },
  PAYMENT: { url: "/api/payments", listKey: "payments", toOption: (p) => ({ id: (p as { id: string }).id, label: `Payment ${(p as { id: string }).id.slice(-6)}` }) },
};

/** Type-to-search picker over the entity's existing list API - used by the document upload dialog to resolve a linked-entity id without a dedicated combobox library. */
export function EntityPicker({ entityType, value, onChange }: { entityType: DocumentEntityType; value: string | null; onChange: (id: string | null, label: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when the entity type changes
    setQuery("");
    setOptions([]);
  }, [entityType]);

  useEffect(() => {
    if (!open) return;
    const config = ENDPOINTS[entityType];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- entering a loading state for the debounced search below
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${config.url}?${query ? `q=${encodeURIComponent(query)}&` : ""}take=10`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setOptions((data[config.listKey] ?? []).map(config.toOption)))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, entityType, open]);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={`Search ${entityType.toLowerCase()}s...`}
        aria-label={`Search and select a ${entityType.toLowerCase()}`}
      />
      {value && !open && <p className="mt-1 text-xs text-[#22C55E]">Selected: {query}</p>}
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#11151F] shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-[#94A3B8]">Searching...</p>}
          {!loading && options.length === 0 && <p className="px-3 py-2 text-xs text-[#94A3B8]">No matches</p>}
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="block w-full truncate px-3 py-2 text-left text-xs text-[#CBD5E1] hover:bg-[#1E2533]"
              onClick={() => {
                onChange(opt.id, opt.label);
                setQuery(opt.label);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

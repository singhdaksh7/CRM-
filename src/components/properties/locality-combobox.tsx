"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/form";

interface Locality {
  id: string;
  name: string;
}

/**
 * Searchable, org-scoped locality picker backed by GET/POST /api/localities
 * - replaces the three independently hand-copied hardcoded `AREAS` arrays
 * that used to live in property-form.tsx, property-filters.tsx, and
 * lead-form.tsx. Value is the locality NAME (a plain string), matching
 * `Property.area` / `Lead.preferredLocation`, not an id - `PropertyLocality`
 * itself is written server-side (resolveOrCreatePropertyLocality) whenever
 * a property is actually saved, so this component's own "+ Add" action
 * (when `allowCreate`) is a convenience that makes a brand-new locality
 * immediately available/reusable, not the only way one can come to exist.
 */
export function LocalityCombobox({
  value,
  onChange,
  onSelectLocality,
  allowCreate = true,
  placeholder = "Search locality...",
  "aria-label": ariaLabel = "Search locality",
}: {
  value: string;
  onChange: (name: string) => void;
  /**
   * Optional - fires with the full { id, name } record whenever an existing
   * locality is picked from the dropdown, AND when "+ Add" successfully
   * creates a new one (the create round-trip returns its id). Never fires on
   * free typing alone. Additive: existing callers that only need the name
   * (property-form, property-filters) are unaffected by omitting it.
   */
  onSelectLocality?: (locality: Locality) => void;
  allowCreate?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<Locality[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the displayed text in sync when the parent form resets/loads a different value
  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- entering a loading state for the debounced search below
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/localities?q=${encodeURIComponent(query)}&take=20`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setOptions(data.localities ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(name: string) {
    onChange(name);
    setQuery(name);
    setOpen(false);
  }

  async function addNew() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/localities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const { locality } = await res.json();
        select(locality.name);
        // Unlike a picked existing option, the id wasn't known until the
        // create round-trip resolved - fire it now so an id-based caller
        // (e.g. the lead requirement locality chip-list) can wire it up
        // without a second lookup.
        onSelectLocality?.(locality);
      } else {
        // Server-side save still auto-creates from the typed area text even
        // if this convenience call failed (e.g. a non-privileged viewer) -
        // select the typed value so the form isn't blocked.
        select(name);
      }
    } catch {
      select(name);
    } finally {
      setCreating(false);
    }
  }

  const trimmedQuery = query.trim();
  const hasExactMatch = options.some((o) => o.name.toLowerCase() === trimmedQuery.toLowerCase());
  const showAddOption = allowCreate && trimmedQuery.length >= 2 && !hasExactMatch && !loading;

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-zinc-500">Searching...</p>}
          {!loading && options.length === 0 && !showAddOption && <p className="px-3 py-2 text-xs text-zinc-500">No matches</p>}
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="block w-full truncate px-3 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-100 transition-colors"
              onClick={() => {
                select(opt.name);
                onSelectLocality?.(opt);
              }}
            >
              {opt.name}
            </button>
          ))}
          {showAddOption && (
            <button
              type="button"
              disabled={creating}
              className="block w-full truncate border-t border-zinc-200 px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-100 transition-colors disabled:opacity-50"
              onClick={addNew}
            >
              {creating ? "Adding..." : `+ Add "${trimmedQuery}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

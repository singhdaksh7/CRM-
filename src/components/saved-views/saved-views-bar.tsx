"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Bookmark, X, Plus } from "lucide-react";
import { toast } from "sonner";

interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
}

const EXCLUDED_PARAM_KEYS = new Set(["page"]);

/**
 * Save/apply/delete named filter presets for a Leads or Properties list
 * page. Filters are read straight from the page's own URL query params
 * (the same ?key=value shape LeadFilters/PropertyFilters already write) -
 * applying a saved view is just a router.push with those params restored.
 */
export function SavedViewsBar({ entityType }: { entityType: "LEAD" | "PROPERTY" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/saved-views?entityType=${entityType}`);
    if (res.ok) {
      const data = await res.json();
      setViews(data.views);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount / entity change
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  function currentFilters(): Record<string, string> {
    const out: Record<string, string> = {};
    sp.forEach((value, key) => {
      if (!EXCLUDED_PARAM_KEYS.has(key) && value) out[key] = value;
    });
    return out;
  }

  function applyView(view: SavedView) {
    const params = new URLSearchParams(view.filters);
    router.push(`${pathname}?${params.toString()}`);
  }

  async function saveCurrentView() {
    if (!name.trim()) return;
    const filters = currentFilters();
    if (Object.keys(filters).length === 0) {
      toast.error("Set at least one filter before saving a view");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, name: name.trim(), filters }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("View saved");
      setName("");
      setSaveOpen(false);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save view");
    }
  }

  async function deleteView(id: string) {
    const res = await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("View deleted");
      setViews((prev) => prev.filter((v) => v.id !== id));
    } else {
      toast.error("Failed to delete view");
    }
  }

  if (loading) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <div key={v.id} className="group flex items-center gap-1 rounded-full border border-[#E7ECF2] bg-white pl-3 pr-1.5 py-1 text-xs font-semibold text-[#596579] hover:border-[#3366FF] hover:text-[#1B2430] transition-colors">
          <button onClick={() => applyView(v)} className="flex items-center gap-1.5">
            <Bookmark className="h-3 w-3 text-[#3366FF]" /> {v.name}
          </button>
          <button onClick={() => deleteView(v.id)} aria-label={`Delete ${v.name}`} className="rounded-full p-0.5 text-[#8A94A6] opacity-0 hover:bg-[#FFECEC] hover:text-[#E5484D] group-hover:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      <button onClick={() => setSaveOpen(true)} className="flex items-center gap-1 rounded-full border border-dashed border-[#E7ECF2] px-3 py-1 text-xs font-semibold text-[#8A94A6] hover:border-[#3366FF] hover:text-[#3366FF] transition-colors">
        <Plus className="h-3 w-3" /> Save view
      </button>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save current view" description="Save the active filters as a named view you can reapply later.">
        <div className="space-y-3">
          <Input placeholder="e.g. Rajouri Rentals" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveCurrentView} loading={saving} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

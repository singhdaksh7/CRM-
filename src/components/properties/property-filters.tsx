"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, Input } from "@/components/ui/form";
import { LayoutGrid, List, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const AREAS = ["Janakpuri", "Dwarka", "Rajouri Garden", "Uttam Nagar", "Rohini", "Pitampura", "Vasant Kunj", "Saket", "Greater Kailash", "Lajpat Nagar", "Karol Bagh", "Paschim Vihar"];

export function PropertyFilters({ view }: { view: "table" | "card" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [showMore, setShowMore] = useState(false);

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function setView(v: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", v);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-3.5 shadow-xs space-y-3">
      {/* Primary Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" />
          <Input
            placeholder="Search title, area, code..."
            defaultValue={sp.get("q") ?? ""}
            onChange={(e) => update("q", e.target.value)}
            className="pl-9"
          />
        </div>
        <Select defaultValue={sp.get("area") ?? ""} onChange={(e) => update("area", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">All Locations</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1.5 font-semibold text-slate-700"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {showMore ? "Hide Filters" : "More Filters"}
        </Button>
        <div className="sm:ml-auto flex items-center gap-1 rounded-xl bg-[#FAFBFC] border border-[#E7ECF2] p-1 self-start sm:self-auto">
          <button onClick={() => setView("card")} className={cn("rounded-lg p-1.5 transition-colors", view === "card" ? "bg-[#3366FF] text-white shadow-xs" : "text-[#8A94A6] hover:text-[#1B2430]")} aria-label="Card view">
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setView("table")} className={cn("rounded-lg p-1.5 transition-colors", view === "table" ? "bg-[#3366FF] text-white shadow-xs" : "text-[#8A94A6] hover:text-[#1B2430]")} aria-label="Table view">
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Advanced Filters Row */}
      {showMore && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 pt-3 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available For</label>
            <Select defaultValue={sp.get("listingType") ?? ""} onChange={(e) => update("listingType", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All (Rent/Sale)</option>
              <option value="RENT">For Rent</option>
              <option value="SALE">For Sale</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Property Category</label>
            <Select defaultValue={sp.get("assetClass") ?? ""} onChange={(e) => update("assetClass", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All Categories</option>
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">BHK</label>
            <Select defaultValue={sp.get("bhk") ?? ""} onChange={(e) => update("bhk", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All BHK</option>
              {[1, 2, 3, 4, 5].map((b) => (
                <option key={b} value={b}>{b} BHK</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Furnishing</label>
            <Select defaultValue={sp.get("furnishing") ?? ""} onChange={(e) => update("furnishing", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All Furnishing</option>
              <option value="FURNISHED">Furnished</option>
              <option value="SEMI_FURNISHED">Semi-Furnished</option>
              <option value="UNFURNISHED">Unfurnished</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
            <Select defaultValue={sp.get("status") ?? "AVAILABLE"} onChange={(e) => update("status", e.target.value)} className="w-full text-xs font-semibold">
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="RENTED">Closed (Rent)</option>
              <option value="SOLD">Closed (Sale)</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

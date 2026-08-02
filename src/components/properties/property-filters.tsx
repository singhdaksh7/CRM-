"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, Input } from "@/components/ui/form";
import { LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const AREAS = ["Janakpuri", "Dwarka", "Rajouri Garden", "Uttam Nagar", "Rohini", "Pitampura", "Vasant Kunj", "Saket", "Greater Kailash", "Lajpat Nagar", "Karol Bagh", "Paschim Vihar"];

export function PropertyFilters({ view }: { view: "table" | "card" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

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
    <div className="flex flex-col gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-3.5 shadow-sm sm:flex-row sm:items-center sm:flex-wrap">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
        <Input
          placeholder="Search title, area, code..."
          defaultValue={sp.get("q") ?? ""}
          onChange={(e) => update("q", e.target.value)}
          className="pl-9"
        />
      </div>
      <Select defaultValue={sp.get("listingType") ?? ""} onChange={(e) => update("listingType", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All (Rent/Sale)</option>
        <option value="RENT">For Rent</option>
        <option value="SALE">For Sale</option>
      </Select>
      <Select defaultValue={sp.get("area") ?? ""} onChange={(e) => update("area", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All Locations</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </Select>
      <Select defaultValue={sp.get("bhk") ?? ""} onChange={(e) => update("bhk", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All BHK</option>
        {[1, 2, 3, 4, 5].map((b) => (
          <option key={b} value={b}>{b} BHK</option>
        ))}
      </Select>
      <Select defaultValue={sp.get("furnishing") ?? ""} onChange={(e) => update("furnishing", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All Furnishing</option>
        <option value="FURNISHED">Furnished</option>
        <option value="SEMI_FURNISHED">Semi-Furnished</option>
        <option value="UNFURNISHED">Unfurnished</option>
      </Select>
      <Select defaultValue={sp.get("status") ?? ""} onChange={(e) => update("status", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All Status</option>
        <option value="AVAILABLE">Available</option>
        <option value="RESERVED">Reserved</option>
        <option value="RENTED">Rented</option>
        <option value="SOLD">Sold</option>
        <option value="INACTIVE">Inactive</option>
      </Select>
      <Select defaultValue={sp.get("sort") ?? "newest"} onChange={(e) => update("sort", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="price_low">Price: Low to High</option>
        <option value="price_high">Price: High to Low</option>
      </Select>
      <div className="ml-auto flex items-center gap-1 rounded-lg bg-[#11151F] border border-[rgba(255,255,255,0.08)] p-1">
        <button onClick={() => setView("card")} className={cn("rounded-md p-1.5 transition-colors", view === "card" ? "bg-[#4F8CFF] text-white shadow-sm" : "text-[#94A3B8] hover:text-white")} aria-label="Card view">
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button onClick={() => setView("table")} className={cn("rounded-md p-1.5 transition-colors", view === "table" ? "bg-[#4F8CFF] text-white shadow-sm" : "text-[#94A3B8] hover:text-white")} aria-label="Table view">
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, Input } from "@/components/ui/form";
import { Search, SlidersHorizontal } from "lucide-react";
import type { User } from "@prisma/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LeadFilters({ employees }: { employees: Pick<User, "id" | "name">[] }) {
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

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-3.5 shadow-xs space-y-3">
      {/* Primary Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" />
          <Input placeholder="Search name, phone, code..." defaultValue={sp.get("q") ?? ""} onChange={(e) => update("q", e.target.value)} className="pl-9" />
        </div>
        <Select defaultValue={sp.get("status") ?? ""} onChange={(e) => update("status", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">All Statuses</option>
          {["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
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
      </div>

      {/* Advanced Filters Row */}
      {showMore && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 pt-3 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Listing Source</label>
            <Select defaultValue={sp.get("source") ?? ""} onChange={(e) => update("source", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All Sources</option>
              {["ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN", "MANUAL"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Priority</label>
            <Select defaultValue={sp.get("priority") ?? ""} onChange={(e) => update("priority", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All Priorities</option>
              <option value="HOT">Hot</option>
              <option value="WARM">Warm</option>
              <option value="COLD">Cold</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Looking To</label>
            <Select defaultValue={sp.get("requirementType") ?? ""} onChange={(e) => update("requirementType", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">Rent / Buy</option>
              <option value="RENT">Rent</option>
              <option value="BUY">Buy</option>
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rent / Sale</label>
            <Select defaultValue={sp.get("transactionType") ?? ""} onChange={(e) => update("transactionType", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All Transactions</option>
              <option value="RENT">Rent</option>
              <option value="SALE">Sale</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Employee</label>
            <Select defaultValue={sp.get("assignedToId") ?? ""} onChange={(e) => update("assignedToId", e.target.value)} className="w-full text-xs font-semibold">
              <option value="">All Employees</option>
              <option value="unassigned">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

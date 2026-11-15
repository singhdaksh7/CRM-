"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Calendar } from "lucide-react";

export function DealFilters({
  employees,
  selectedStatus,
  selectedCloserId,
  selectedOwnerId,
  selectedMarkerId,
  selectedPeriod,
  customFrom,
  customTo,
  isFieldExecutive,
}: {
  employees: Array<{ id: string; name: string; role: string }>;
  selectedStatus: string;
  selectedCloserId: string;
  selectedOwnerId: string;
  selectedMarkerId: string;
  selectedPeriod: string;
  customFrom?: string;
  customTo?: string;
  isFieldExecutive?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [from, setFrom] = useState(customFrom ?? "");
  const [to, setTo] = useState(customTo ?? "");

  function updateQuery(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handlePeriodChange(newPeriod: string) {
    if (newPeriod !== "custom") {
      updateQuery({ period: newPeriod, from: undefined, to: undefined });
    } else {
      updateQuery({ period: "custom" });
    }
  }

  function applyCustomRange() {
    if (from && to) {
      updateQuery({ period: "custom", from, to });
    }
  }

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status Filter */}
        <div className="w-full sm:w-36">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">
            Deal Status
          </label>
          <Select
            value={selectedStatus}
            onChange={(e) => updateQuery({ status: e.target.value || undefined })}
            className="text-xs font-semibold"
          >
            <option value="">All Statuses</option>
            <option value="WON">Deal Won</option>
            <option value="OPEN">Open / Active</option>
            <option value="LOST">Lost</option>
          </Select>
        </div>

        {/* Closed By (Closer) */}
        {!isFieldExecutive && (
          <div className="w-full sm:w-44">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">
              Deal Closed By
            </label>
            <Select
              value={selectedCloserId}
              onChange={(e) => updateQuery({ closerId: e.target.value || undefined })}
              className="text-xs font-semibold"
            >
              <option value="">All Closers</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Lead Owner */}
        {!isFieldExecutive && (
          <div className="w-full sm:w-44">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">
              Lead Owner
            </label>
            <Select
              value={selectedOwnerId}
              onChange={(e) => updateQuery({ ownerId: e.target.value || undefined })}
              className="text-xs font-semibold"
            >
              <option value="">All Lead Owners</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Marked Closed By */}
        {!isFieldExecutive && (
          <div className="w-full sm:w-44">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">
              Marked Closed By
            </label>
            <Select
              value={selectedMarkerId}
              onChange={(e) => updateQuery({ markerId: e.target.value || undefined })}
              className="text-xs font-semibold"
            >
              <option value="">All Markers</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Date Period Filter */}
        <div className="w-full sm:w-40">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">
            Closed Date Range
          </label>
          <Select
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="text-xs font-semibold"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="thisMonth">This Month</option>
            <option value="prevMonth">Previous Month</option>
            <option value="custom">Custom Range</option>
          </Select>
        </div>

        {selectedPeriod === "custom" && (
          <div className="flex flex-wrap items-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-medium text-[#09090B] shadow-2xs focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs font-medium text-[#09090B] shadow-2xs focus:outline-hidden"
              />
            </div>
            <Button size="sm" onClick={applyCustomRange} disabled={!from || !to}>
              <Calendar className="h-3.5 w-3.5" /> Apply
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

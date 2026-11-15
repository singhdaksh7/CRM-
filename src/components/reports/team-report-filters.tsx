"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Calendar } from "lucide-react";

export function TeamReportFilters({
  members,
  selectedUserId,
  period,
  customFrom,
  customTo,
}: {
  members: Array<{ id: string; name: string; role: string }>;
  selectedUserId: string;
  period: string;
  customFrom?: string;
  customTo?: string;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-64">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">
              Team Member
            </label>
            <Select
              value={selectedUserId}
              onChange={(e) => updateQuery({ userId: e.target.value })}
              className="text-xs font-semibold"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role.replace(/_/g, " ")})
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-48">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] mb-1 block">
              Date Period
            </label>
            <Select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="text-xs font-semibold"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </Select>
          </div>
        </div>

        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0">
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

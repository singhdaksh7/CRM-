"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, Input } from "@/components/ui/form";
import { Search } from "lucide-react";
import type { User } from "@prisma/client";

export function LeadFilters({ employees }: { employees: User[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-3.5 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
        <Input placeholder="Search name, phone, code..." defaultValue={sp.get("q") ?? ""} onChange={(e) => update("q", e.target.value)} className="pl-9" />
      </div>
      <Select defaultValue={sp.get("source") ?? ""} onChange={(e) => update("source", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All Sources</option>
        {["ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN", "MANUAL"].map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
        ))}
      </Select>
      <Select defaultValue={sp.get("status") ?? ""} onChange={(e) => update("status", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All Status</option>
        {["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"].map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
        ))}
      </Select>
      <Select defaultValue={sp.get("priority") ?? ""} onChange={(e) => update("priority", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All Priority</option>
        <option value="HOT">Hot</option>
        <option value="WARM">Warm</option>
        <option value="COLD">Cold</option>
      </Select>
      <Select defaultValue={sp.get("requirementType") ?? ""} onChange={(e) => update("requirementType", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">Rent / Buy</option>
        <option value="RENT">Rent</option>
        <option value="BUY">Buy</option>
      </Select>
      <Select defaultValue={sp.get("assignedToId") ?? ""} onChange={(e) => update("assignedToId", e.target.value)} className="w-auto text-xs font-semibold">
        <option value="">All Employees</option>
        <option value="unassigned">Unassigned</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </Select>
    </div>
  );
}

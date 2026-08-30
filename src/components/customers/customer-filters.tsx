"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input, Select } from "@/components/ui/form";
import { Search } from "lucide-react";

export function CustomerFilters() {
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
    <div className="flex flex-col gap-3 rounded-2xl border border-[#E7ECF2] bg-white p-3.5 shadow-xs">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" aria-hidden />
        <Input
          aria-label="Search customers by name, phone, email, or locality"
          placeholder="Search name, phone, email, locality..."
          defaultValue={sp.get("q") ?? ""}
          onChange={(e) => update("q", e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Select aria-label="Property Category" defaultValue={sp.get("assetClass") ?? ""} onChange={(e) => update("assetClass", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">All Categories</option>
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
        </Select>
        <Select aria-label="Rent / Sale" defaultValue={sp.get("transactionType") ?? ""} onChange={(e) => update("transactionType", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">Rent / Sale</option>
          <option value="RENT">Rent</option>
          <option value="SALE">Sale</option>
        </Select>
        <Select aria-label="BHK" defaultValue={sp.get("bhk") ?? ""} onChange={(e) => update("bhk", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">Any BHK</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n} BHK
            </option>
          ))}
        </Select>
        <Select aria-label="Commercial subtype" defaultValue={sp.get("commercialSubtype") ?? ""} onChange={(e) => update("commercialSubtype", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">Commercial subtype</option>
          {["OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "CO_WORKING"].map((v) => (
            <option key={v} value={v}>
              {v.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Locality filter"
          placeholder="Locality"
          defaultValue={sp.get("locality") ?? ""}
          onChange={(e) => update("locality", e.target.value)}
          className="w-auto min-w-[140px] text-xs"
        />
        <Input
          aria-label="Minimum budget"
          placeholder="Min budget"
          inputMode="numeric"
          defaultValue={sp.get("budgetMin") ?? ""}
          onChange={(e) => update("budgetMin", e.target.value)}
          className="w-auto min-w-[110px] text-xs"
        />
        <Input
          aria-label="Maximum budget"
          placeholder="Max budget"
          inputMode="numeric"
          defaultValue={sp.get("budgetMax") ?? ""}
          onChange={(e) => update("budgetMax", e.target.value)}
          className="w-auto min-w-[110px] text-xs"
        />
        <Select aria-label="Active requirement" defaultValue={sp.get("activeRequirement") ?? ""} onChange={(e) => update("activeRequirement", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">Requirements</option>
          <option value="true">Active requirement</option>
          <option value="false">Include inactive</option>
        </Select>
        <Select aria-label="Lead linkage" defaultValue={sp.get("hasLead") ?? ""} onChange={(e) => update("hasLead", e.target.value)} className="w-auto text-xs font-semibold">
          <option value="">Lead linkage</option>
          <option value="true">Linked Lead</option>
          <option value="false">No Lead</option>
        </Select>
        <Select aria-label="Contact recency" defaultValue={sp.get("neverContacted") === "true" ? "never" : sp.get("contactedRecently") === "true" ? "recent" : ""} onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.delete("neverContacted");
          params.delete("contactedRecently");
          if (e.target.value === "never") params.set("neverContacted", "true");
          if (e.target.value === "recent") params.set("contactedRecently", "true");
          router.push(`${pathname}?${params.toString()}`);
        }} className="w-auto text-xs font-semibold">
          <option value="">Contact activity</option>
          <option value="never">Never contacted</option>
          <option value="recent">Contacted recently</option>
        </Select>
        <Select aria-label="WhatsApp eligibility" defaultValue={sp.get("whatsAppEligible") === "true" ? "eligible" : sp.get("whatsAppOptOut") === "true" ? "optout" : sp.get("doNotContact") === "true" ? "dnc" : ""} onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.delete("whatsAppEligible");
          params.delete("whatsAppOptOut");
          params.delete("doNotContact");
          if (e.target.value === "eligible") params.set("whatsAppEligible", "true");
          if (e.target.value === "optout") params.set("whatsAppOptOut", "true");
          if (e.target.value === "dnc") params.set("doNotContact", "true");
          router.push(`${pathname}?${params.toString()}`);
        }} className="w-auto text-xs font-semibold">
          <option value="">Contact preferences</option>
          <option value="eligible">WhatsApp eligible</option>
          <option value="optout">Opted out</option>
          <option value="dnc">Do Not Contact</option>
        </Select>
      </div>
    </div>
  );
}

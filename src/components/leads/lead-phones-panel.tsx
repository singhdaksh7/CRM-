"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, Plus, X } from "lucide-react";

export interface LeadPhoneRow {
  id: string;
  phone: string;
  label: string | null;
  type: string;
}

const LABEL_PRESETS = ["Personal", "Office", "Family", "Other"];

export function LeadPhonesPanel({ leadId, primaryPhone, phones }: { leadId: string; primaryPhone: string; phones: LeadPhoneRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("Personal");
  const [makePrimary, setMakePrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!phone.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), label, type: makePrimary ? "PRIMARY" : "ALTERNATE" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to add number");
      toast.success("Number added");
      setPhone("");
      setAdding(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#52525B]">
      <span className="flex items-center gap-1 font-mono text-xs">
        <Phone className="h-3.5 w-3.5 text-[#71717A]" /> {primaryPhone} <span className="text-[10px] font-semibold uppercase text-[#71717A]">(primary)</span>
      </span>
      {phones.map((p) => (
        <span key={p.id} className="flex items-center gap-1 font-mono text-xs">
          <Phone className="h-3.5 w-3.5 text-[#71717A]" /> {p.phone}
          {(p.label || p.type === "PRIMARY") && <span className="text-[10px] font-semibold uppercase text-[#71717A]">({p.label ?? "Primary"})</span>}
        </span>
      ))}

      {!adding ? (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#09090B] hover:underline cursor-pointer">
          <Plus className="h-3.5 w-3.5" /> Add Number
        </button>
      ) : (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            className="min-w-[160px] flex-1 rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-[#09090B] focus:outline-none focus:border-[#0A0A0A]"
          />
          <select value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-[#09090B]">
            {LABEL_PRESETS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-[#52525B]">
            <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} className="rounded border-[#E4E4E7] text-[#0A0A0A]" /> Make primary
          </label>
          <button onClick={submit} disabled={saving || !phone.trim()} className="rounded-md bg-[#0A0A0A] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#27272A] cursor-pointer">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setAdding(false)} className="rounded-md p-1.5 text-[#71717A] hover:bg-[#F4F4F5] cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

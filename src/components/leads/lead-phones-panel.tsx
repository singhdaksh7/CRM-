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

/**
 * simplified-role-workflow (continuation pass, spec item 5) - the lead
 * header's "Primary + Other numbers + [+ Add Number]" UI, on top of the
 * LeadPhone backend built in the previous pass (src/lib/lead-phones.ts,
 * GET/POST /api/leads/[id]/phones). Normalization, per-lead dedupe, and the
 * at-most-one-PRIMARY rule all happen server-side - this component just
 * displays what's there and submits new numbers.
 */
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
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#596579]">
      <span className="flex items-center gap-1">
        <Phone className="h-3.5 w-3.5" /> {primaryPhone} <span className="text-[10px] font-semibold uppercase text-[#8A94A6]">(primary)</span>
      </span>
      {phones.map((p) => (
        <span key={p.id} className="flex items-center gap-1">
          <Phone className="h-3.5 w-3.5" /> {p.phone}
          {(p.label || p.type === "PRIMARY") && <span className="text-[10px] font-semibold uppercase text-[#8A94A6]">({p.label ?? "Primary"})</span>}
        </span>
      ))}

      {!adding ? (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
          <Plus className="h-3.5 w-3.5" /> Add Number
        </button>
      ) : (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            className="min-w-[160px] flex-1 rounded-lg border border-[#E7ECF2] bg-white px-2.5 py-1.5 text-sm"
          />
          <select value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-lg border border-[#E7ECF2] bg-white px-2.5 py-1.5 text-sm">
            {LABEL_PRESETS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-[#596579]">
            <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} /> Make primary
          </label>
          <button onClick={submit} disabled={saving || !phone.trim()} className="rounded-lg bg-[#3366FF] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setAdding(false)} className="rounded-lg p-1.5 text-[#8A94A6] hover:bg-[#F3F6FA]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { Download } from "lucide-react";

type ReportType = "leads" | "visits" | "employees" | "brokerage" | "properties";
const REPORT_TYPES: ReportType[] = ["leads", "visits", "employees", "brokerage", "properties"];

const TYPE_LABELS: Record<ReportType, string> = {
  leads: "Lead Report",
  visits: "Visit Report",
  employees: "Employee Report",
  brokerage: "Brokerage Report",
  properties: "Property Report",
};

export function ReportBuilderForm() {
  const [type, setType] = useState<ReportType>("leads");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function exportUrl() {
    const params = new URLSearchParams({ type });
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    return `/api/reports/export?${params.toString()}`;
  }

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Report Type">
          <Select value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="From Date">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To Date">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="pt-2">
        <a
          href={exportUrl()}
          download
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0A0A0A] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#27272A]"
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>
      <p className="text-xs text-[#71717A]">
        Excel-compatible CSV branded with KP Properties, generation date, and active filters. Leave dates blank for all-time.
      </p>
    </div>
  );
}

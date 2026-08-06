"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";

// Kept in sync with REPORT_TYPES in src/lib/report-builder.ts - duplicated
// here (rather than imported) because that module pulls in the Prisma
// client, which must never end up in a client-side bundle.
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
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Report Type">
          <Select value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <a
        href={exportUrl()}
        download
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3366FF] px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition-all hover:bg-[#2952CC]"
      >
        Export CSV
      </a>
      <p className="text-xs text-[#8A94A6]">
        Excel-compatible CSV branded with KP Properties, generation date, generated-by, and the filters used. Leave dates blank for all-time. PDF and native .xlsx export are not available yet.
      </p>
    </div>
  );
}

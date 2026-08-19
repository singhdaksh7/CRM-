"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { demandPoolApi, DemandPoolApiError } from "@/lib/demand-pool/api";
import { CONTACT_IMPORT_FIELDS, parseCsvText, suggestContactMapping } from "@/lib/demand-pool/import-parse";
import type { ContactImportPreviewRow, ContactImportResultSummary } from "@/lib/demand-pool/types";

const steps = ["Upload", "Sheet", "Map columns", "Preview", "Validation", "Duplicates", "Import mode", "Confirm", "Result"];

export function CustomerImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>(["Sheet1"]);
  const [selectedSheet, setSelectedSheet] = useState("Sheet1");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ContactImportPreviewRow[]>([]);
  const [mode, setMode] = useState("CREATE_ONLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ContactImportResultSummary | null>(null);

  const step = result ? 8 : preview.length ? 4 : headers.length ? 2 : 0;
  const counts = useMemo(() => {
    return {
      ready: preview.filter((r) => r.state === "READY").length,
      errors: preview.filter((r) => r.state === "ERROR").length,
      duplicates: preview.filter((r) => r.duplicateClass !== "NEW" && r.duplicateClass !== "INVALID").length,
    };
  }, [preview]);

  async function parseFile() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    setPreview([]);
    try {
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/customers/import/parse", { method: "POST", body: form });
        if (response.ok) {
          const body = await response.json();
          setFileName(body.fileName ?? file.name);
          setHeaders(body.headers ?? []);
          setRows(body.rows ?? []);
          setSheetNames(body.sheetNames ?? ["Sheet1"]);
          setSelectedSheet(body.selectedSheet ?? "Sheet1");
          setMapping(body.suggestedMapping ?? suggestContactMapping(body.headers ?? []));
          return;
        }
        if (response.status !== 404) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? "Could not parse spreadsheet");
        }
      }
      const text = await file.text();
      const parsed = parseCsvText(text);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setSheetNames(parsed.sheetNames);
      setSelectedSheet(parsed.sheetNames[0] ?? "Sheet1");
      setMapping(suggestContactMapping(parsed.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function buildPreview() {
    setBusy(true);
    setError("");
    try {
      const data = await demandPoolApi.previewContactImport({ rows, mapping, mode });
      setPreview(data.rows);
    } catch (err) {
      setError(err instanceof DemandPoolApiError ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    const actionable = preview.filter((r) => r.action !== "SKIP" && r.state !== "ERROR").length;
    if (!window.confirm(`Import ${actionable} actionable rows? Nothing is written until you confirm here.`)) return;
    setBusy(true);
    setError("");
    try {
      const body = await demandPoolApi.executeContactImport({
        fileName,
        rows,
        columnMapping: mapping,
        mode,
      });
      setResult(
        "summary" in body && body.summary
          ? body.summary
          : {
              newContacts: actionable,
              existingContacts: 0,
              newRequirements: 0,
              updatedRequirements: 0,
              skipped: preview.filter((r) => r.action === "SKIP").length,
              invalid: preview.filter((r) => r.state === "ERROR").length,
            }
      );
    } catch (err) {
      setError(err instanceof DemandPoolApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-9">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-xl border p-2 text-center text-[11px] font-semibold ${
              index <= step ? "border-blue-300 bg-blue-50 text-blue-800" : "text-slate-400"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!headers.length && (
        <section className="space-y-4 rounded-2xl border bg-white p-6">
          <h2 className="font-bold">Upload customer demand file</h2>
          <p className="text-sm text-slate-600">Accepted: .csv and .xlsx. No rows are written until the final confirmation step.</p>
          <Input
            aria-label="Customer spreadsheet"
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button onClick={() => void parseFile()} loading={busy} disabled={!file}>
            Parse file
          </Button>
        </section>
      )}

      {headers.length > 0 && !preview.length && !result && (
        <>
          {sheetNames.length > 1 && (
            <section className="rounded-2xl border bg-white p-4">
              <h2 className="mb-2 font-bold">Select worksheet</h2>
              <Select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
                {sheetNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </Select>
            </section>
          )}
          <section className="space-y-3 rounded-2xl border bg-white p-4">
            <h2 className="font-bold">Map columns</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {CONTACT_IMPORT_FIELDS.map((field) => (
                <label key={field} className="grid grid-cols-2 items-center gap-2 text-xs">
                  <span className="font-semibold">{field}</span>
                  <Select
                    value={mapping[field] ?? ""}
                    onChange={(e) => setMapping((current) => ({ ...current, [field]: e.target.value }))}
                  >
                    <option value="">Not mapped</option>
                    {headers.map((header) => (
                      <option key={header}>{header}</option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            <label className="block text-xs font-semibold">
              Import mode
              <Select className="mt-1" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="CREATE_ONLY">Create only (safest)</option>
                <option value="UPSERT_SAFE">Reuse contacts, add new requirements</option>
              </Select>
            </label>
            <Button onClick={() => void buildPreview()} loading={busy}>
              Build validation preview
            </Button>
          </section>
        </>
      )}

      {preview.length > 0 && !result && (
        <section className="space-y-3">
          <div className="rounded-2xl border bg-white p-4">
            <h2 className="font-bold">Preview & validation</h2>
            <p className="text-sm text-slate-600">
              {preview.length} rows · {counts.ready} ready · {counts.errors} invalid · {counts.duplicates} existing-contact candidates
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>
                  {["Row", "Name / phone", "Requirement", "State", "Duplicate", "Action"].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber} className="border-t align-top">
                    <td className="p-3">{row.rowNumber}</td>
                    <td className="p-3">
                      <strong>{String(row.data.name ?? "—")}</strong>
                      <br />
                      {String(row.data.phone ?? "—")}
                    </td>
                    <td className="p-3">
                      {String(row.data.assetClass ?? "—")} {String(row.data.transactionType ?? "")}
                      <br />
                      {String(row.data.locality ?? "")}
                    </td>
                    <td className="p-3">
                      <strong>{row.state}</strong>
                      {row.issues.map((issue, i) => (
                        <p key={i} className={issue.severity === "ERROR" ? "text-red-700" : "text-amber-700"}>
                          {issue.field}: {issue.message}
                        </p>
                      ))}
                    </td>
                    <td className="p-3">{row.duplicateClass}</td>
                    <td className="p-3">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <Checkbox label="I understand nothing is written until I confirm" defaultChecked readOnly />
            <Button onClick={() => void execute()} loading={busy}>
              Confirm and import
            </Button>
          </div>
        </section>
      )}

      {result && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-6 space-y-2">
          <h2 className="text-lg font-bold text-green-900">Import completed</h2>
          <ul className="text-sm text-green-900 space-y-1">
            <li>New Contacts: {result.newContacts}</li>
            <li>Existing Contacts: {result.existingContacts}</li>
            <li>New Requirements: {result.newRequirements}</li>
            <li>Updated Requirements: {result.updatedRequirements}</li>
            <li>Skipped: {result.skipped}</li>
            <li>Invalid: {result.invalid}</li>
          </ul>
          <Link href="/customers" className="inline-flex rounded-xl bg-green-800 px-3 py-2 text-sm font-semibold text-white">
            Return to customers
          </Link>
        </section>
      )}
    </div>
  );
}

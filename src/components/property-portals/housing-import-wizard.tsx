"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { HOUSING_FILE_IMPORT_COLUMNS, type HousingFileImportColumn } from "@/integrations/housing/file-import-schema";

const steps = ["Upload", "Map columns", "Preview & validate", "Confirm", "Result"];

interface PreviewRow {
  rowNumber: number;
  display: {
    leadName: string;
    phone: string;
    leadDate: string;
    locality: string;
    propertyType: string;
    configuration: string;
    price: string;
    project: string;
    housingPropertyId: string;
    housingStatus: string;
  };
  state: "VALID" | "NEEDS_REVIEW" | "INVALID" | "DUPLICATE";
  issues: string[];
}

interface PreviewSummary { total: number; valid: number; invalid: number; duplicate: number; needsReview: number }

interface ResultSummary { total: number; imported: number; duplicatesSkippedOrMatched: number; needsReview: number; invalid: number; failed: number }

interface HistoryJob {
  id: string;
  fileName: string;
  createdAt: string;
  createdBy: { name: string } | null;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  warningRows: number;
  invalidRows: number;
  failedRows: number;
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

export function HousingImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<HousingFileImportColumn, string>>>({});
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; summary: PreviewSummary } | null>(null);
  const [result, setResult] = useState<ResultSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryJob[]>([]);

  const step = result ? 4 : preview ? 2 : headers.length ? 1 : 0;

  useEffect(() => {
    fetch("/api/imports?entityType=HOUSING_LEADS&take=10")
      .then((r) => r.json())
      .then((body) => setHistory(body.jobs ?? []))
      .catch(() => {});
  }, [result]);

  async function parseFile() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    setPreview(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const body = await readJson(await fetch("/api/imports/housing/parse", { method: "POST", body: form }));
      setFileName(body.fileName ?? file.name);
      setHeaders(body.headers ?? []);
      setRows(body.rows ?? []);
      setMapping(body.suggestedMapping ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse the file");
    } finally {
      setBusy(false);
    }
  }

  async function buildPreview() {
    setBusy(true);
    setError("");
    try {
      const body = await readJson(
        await fetch("/api/imports/housing/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows, columnMapping: mapping }),
        })
      );
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!preview) return;
    const actionable = preview.summary.valid + preview.summary.needsReview;
    if (!window.confirm(`Import ${actionable} row(s) into the existing Lead system? Duplicate/invalid rows are skipped. This cannot be undone automatically.`)) return;
    setBusy(true);
    setError("");
    try {
      const body = await readJson(
        await fetch("/api/imports/housing", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows, columnMapping: mapping, fileName, confirm: true }),
        })
      );
      setResult(body.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError("");
  }

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {steps.map((label, index) => (
          <li key={label} className={`rounded-xl border p-2 text-center text-[11px] font-semibold ${index <= step ? "border-blue-300 bg-blue-50 text-blue-800" : "text-slate-400"}`}>
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
          <h2 className="font-bold">Upload Housing lead export</h2>
          <p className="text-sm text-slate-600">Accepted: .csv and .xlsx. This never replaces or disables the live Housing webhook. Nothing is written until you confirm at the final step.</p>
          <Input aria-label="Housing lead export file" type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={() => void parseFile()} loading={busy} disabled={!file}>
            Parse file
          </Button>
        </section>
      )}

      {headers.length > 0 && !preview && !result && (
        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <h2 className="font-bold">Map columns</h2>
          <p className="text-sm text-slate-600">Lead Name, Lead Phone Number, and Locality must be mapped before a preview can be built.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {HOUSING_FILE_IMPORT_COLUMNS.map((column) => (
              <label key={column} className="grid grid-cols-2 items-center gap-2 text-xs">
                <span className="font-semibold">{column}</span>
                <Select value={mapping[column] ?? ""} onChange={(e) => setMapping((current) => ({ ...current, [column]: e.target.value || undefined }))}>
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void buildPreview()} loading={busy}>
              Build validation preview
            </Button>
            <Button onClick={reset} variant="secondary">
              Start over
            </Button>
          </div>
        </section>
      )}

      {preview && !result && (
        <section className="space-y-3">
          <div className="rounded-2xl border bg-white p-4">
            <h2 className="font-bold">Preview & validation</h2>
            <p className="text-sm text-slate-600">
              {preview.summary.total} rows · {preview.summary.valid} valid · {preview.summary.needsReview} needs review · {preview.summary.duplicate} duplicate ·{" "}
              {preview.summary.invalid} invalid
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>
                  {["Row", "Lead Name", "Phone", "Lead Date", "Locality", "Property Type", "Configuration", "Price", "Project", "Housing Property ID", "Housing Status", "State", "Issues"].map(
                    (h) => (
                      <th key={h} className="p-2">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 200).map((row) => (
                  <tr key={row.rowNumber} className="border-t align-top">
                    <td className="p-2">{row.rowNumber}</td>
                    <td className="p-2">{row.display.leadName}</td>
                    <td className="p-2">{row.display.phone}</td>
                    <td className="p-2">{row.display.leadDate}</td>
                    <td className="p-2">{row.display.locality}</td>
                    <td className="p-2">{row.display.propertyType}</td>
                    <td className="p-2">{row.display.configuration}</td>
                    <td className="p-2">{row.display.price}</td>
                    <td className="p-2">{row.display.project}</td>
                    <td className="p-2">{row.display.housingPropertyId}</td>
                    <td className="p-2">{row.display.housingStatus}</td>
                    <td className="p-2">
                      <strong
                        className={
                          row.state === "INVALID" ? "text-red-700" : row.state === "NEEDS_REVIEW" ? "text-amber-700" : row.state === "DUPLICATE" ? "text-slate-500" : "text-green-700"
                        }
                      >
                        {row.state}
                      </strong>
                    </td>
                    <td className="p-2">
                      {row.issues.map((issue, i) => (
                        <p key={i}>{issue}</p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <Checkbox label="I understand nothing is written until I confirm" defaultChecked readOnly />
            <div className="flex gap-2">
              <Button onClick={() => void execute()} loading={busy} disabled={preview.summary.valid + preview.summary.needsReview === 0}>
                Confirm and import
              </Button>
              <Button onClick={reset} variant="secondary">
                Start over
              </Button>
            </div>
          </div>
        </section>
      )}

      {result && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-6 space-y-2">
          <h2 className="text-lg font-bold text-green-900">Import completed</h2>
          <ul className="text-sm text-green-900 space-y-1">
            <li>Imported: {result.imported}</li>
            <li>Duplicates skipped or matched: {result.duplicatesSkippedOrMatched}</li>
            <li>Needs review: {result.needsReview}</li>
            <li>Invalid: {result.invalid}</li>
            <li>Failed: {result.failed}</li>
          </ul>
          <Button onClick={reset}>Import another file</Button>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="mb-2 font-bold">Recent Housing imports</h2>
        {history.length === 0 && <p className="text-sm text-slate-500">No Housing lead imports yet.</p>}
        {history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>{["File", "Uploaded by", "Date/time", "Total", "Imported", "Duplicates", "Needs review", "Invalid", "Failed"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {history.map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="p-2">{job.fileName}</td>
                    <td className="p-2">{job.createdBy?.name ?? "—"}</td>
                    <td className="p-2">{new Date(job.createdAt).toLocaleString()}</td>
                    <td className="p-2">{job.totalRows}</td>
                    <td className="p-2">{job.importedRows}</td>
                    <td className="p-2">{job.duplicateRows}</td>
                    <td className="p-2">{job.warningRows}</td>
                    <td className="p-2">{job.invalidRows}</td>
                    <td className="p-2">{job.failedRows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

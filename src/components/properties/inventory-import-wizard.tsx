"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { IMPORTABLE_PROPERTY_FIELDS, headerSignature, type ImportActionValue } from "@/lib/inventory-import-shared";

type Parsed = { fileName: string; fileHash: string; sheetNames: string[]; selectedSheet: string; headerRow: number; headers: string[]; rows: Record<string, string>[]; suggestedMapping: Record<string, string>; ambiguousMappings: Record<string, string[]>; truncated: boolean };
type PreviewRow = { rowNumber: number; data: Record<string, unknown>; issues: Array<{ field: string; originalValue?: string; message: string; severity: string }>; duplicateClass: string; duplicateReasons: string[]; action: ImportActionValue; state: string; matchedProperty: { id: string; propertyCode: string; title: string } | null; diff: Array<{ field: string; before: unknown; after: unknown }>; partnerResolution: string };
type Partner = { id: string; name: string; company: string | null };
type Resolution = { action?: ImportActionValue; partnerId?: string; existingPropertyId?: string };
type Preset = { id: string; name: string; mapping: Record<string, string> };

const labels: Record<string, string> = { area: "Locality", address: "Specific / complete address", builtUpAreaSqft: "Built-up area (sq ft)", ownerAlternatePhone: "Alternate phone", parkingLift: "Combined parking/lift" };
const steps = ["Upload", "Sheet", "Headers & mapping", "Preview & validate", "Duplicates", "Confirm", "Result"];

export function InventoryImportWizard() {
  const [file, setFile] = useState<File | null>(null); const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}); const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [mode, setMode] = useState("CREATE_ONLY"); const [partialPolicy, setPartialPolicy] = useState("REQUIRE_ALL_ROWS_VALID");
  const [allowBlankClear, setAllowBlankClear] = useState(false); const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [partners, setPartners] = useState<Partner[]>([]); const [filter, setFilter] = useState("ALL"); const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]); const [previewPage, setPreviewPage] = useState(1);
  const [error, setError] = useState(""); const [result, setResult] = useState<{ job: { id: string }; counts: Record<string, number> } | null>(null);
  const step = result ? 6 : preview.length ? 4 : parsed ? 2 : 0;
  const filtered = useMemo(() => preview.filter((row) => filter === "ALL" || row.state === filter), [preview, filter]);
  const visible = useMemo(() => filtered.slice((previewPage - 1) * 100, previewPage * 100), [filtered, previewPage]);

  async function parse(selectedSheet?: string) {
    if (!file) return; setBusy(true); setError("");
    const form = new FormData(); form.set("file", file); if (selectedSheet) form.set("sheetName", selectedSheet);
    const response = await fetch("/api/properties/import/parse", { method: "POST", body: form }); const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not parse spreadsheet");
    setParsed(body); setMapping(body.suggestedMapping); setPreview([]);
    const partnerResponse = await fetch("/api/inventory-partners?isActive=true&take=100");
    if (partnerResponse.ok) setPartners((await partnerResponse.json()).inventoryPartners);
    const presetResponse = await fetch(`/api/properties/import/presets?signature=${encodeURIComponent(headerSignature(body.headers))}`);
    if (presetResponse.ok) setPresets((await presetResponse.json()).presets);
  }

  async function loadPreview(nextResolutions = resolutions) {
    if (!parsed) return; setBusy(true); setError("");
    const response = await fetch("/api/properties/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: parsed.rows, mapping, mode, allowBlankClear, resolutions: nextResolutions }) });
    const body = await response.json(); setBusy(false); if (!response.ok) return setError(body.error ?? "Preview failed"); setPreview(body.rows);
  }

  function resolve(rowNumber: number, value: Resolution) {
    const next = { ...resolutions, [String(rowNumber)]: { ...resolutions[String(rowNumber)], ...value } }; setResolutions(next); void loadPreview(next);
  }

  function resolveAllExact(action: ImportActionValue) {
    const next = { ...resolutions }; for (const row of preview) if (row.duplicateClass === "EXACT_DUPLICATE") next[String(row.rowNumber)] = { ...next[String(row.rowNumber)], action };
    setResolutions(next); void loadPreview(next);
  }

  async function savePreset() {
    if (!parsed) return; const name = window.prompt("Preset name", "Inventory Sheet"); if (!name) return;
    const response = await fetch("/api/properties/import/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, headers: parsed.headers, mapping }) });
    if (!response.ok) setError((await response.json()).error ?? "Could not save preset"); else { const body = await response.json(); setPresets((current) => [{ ...body.preset, mapping }, ...current]); }
  }

  async function applySuggestedPreset() {
    if (presets[0]) setMapping(presets[0].mapping); else setError("No saved mapping matches these headers");
  }

  async function renamePreset(preset: Preset) { const name = window.prompt("Rename mapping preset", preset.name); if (!name) return; const response = await fetch(`/api/properties/import/presets/${preset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); if (response.ok) setPresets((current) => current.map((item) => item.id === preset.id ? { ...item, name } : item)); }
  async function deletePreset(preset: Preset) { if (!window.confirm(`Delete mapping preset “${preset.name}”?`)) return; const response = await fetch(`/api/properties/import/presets/${preset.id}`, { method: "DELETE" }); if (response.ok) setPresets((current) => current.filter((item) => item.id !== preset.id)); }

  async function execute() {
    if (!parsed) return; if (!window.confirm(`Import ${preview.filter((row) => row.action !== "SKIP" && row.state !== "ERROR").length} actionable rows? No spreadsheet row is written until you confirm here.`)) return;
    setBusy(true); setError(""); const response = await fetch("/api/properties/import/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: parsed.fileName, fileHash: parsed.fileHash, sheetName: parsed.selectedSheet, rows: parsed.rows, mapping, mode, partialPolicy, allowBlankClear, resolutions }) });
    const body = await response.json(); setBusy(false); if (!response.ok) return setError(body.error ?? "Import failed"); setResult(body);
  }

  return <div className="space-y-5">
    <ol className="grid grid-cols-2 gap-2 md:grid-cols-7">{steps.map((label, index) => <li key={label} className={`rounded-xl border p-2 text-center text-xs font-semibold ${index <= step ? "border-blue-300 bg-blue-50 text-blue-800" : "text-slate-400"}`}>{index + 1}. {label}</li>)}</ol>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!parsed && <section className="rounded-2xl border bg-white p-6 space-y-4"><h2 className="font-bold">Upload inventory file</h2><p className="text-sm text-slate-600">Accepted: .xlsx and .csv, up to 10 MB and 5,000 rows. Legacy .xls must be saved as .xlsx first.</p><Input aria-label="Inventory spreadsheet" type="file" accept=".xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/><div className="flex gap-2"><Button onClick={() => void parse()} loading={busy} disabled={!file}>Parse file</Button><Link className="rounded-xl border px-3 py-2 text-sm font-semibold" href="/api/properties/import/template">Download Import Template</Link></div><p className="text-xs text-slate-500">Parsing and previewing perform no database writes.</p></section>}
    {parsed && !preview.length && <>
      {parsed.sheetNames.length > 1 && <section className="rounded-2xl border bg-white p-4"><h2 className="mb-2 font-bold">Select worksheet</h2><Select value={parsed.selectedSheet} onChange={(event) => void parse(event.target.value)}>{parsed.sheetNames.map((name) => <option key={name}>{name}</option>)}</Select></section>}
      <section className="rounded-2xl border bg-white p-4 space-y-3"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-bold">Review column mapping</h2><p className="text-xs text-slate-500">Detected headers on row {parsed.headerRow}. Ambiguous fields are intentionally left for review.</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => void applySuggestedPreset()}>Use matching preset</Button><Button size="sm" variant="secondary" onClick={() => void savePreset()}>Save preset</Button></div></div>
      {Object.keys(parsed.ambiguousMappings).length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Ambiguous: {Object.entries(parsed.ambiguousMappings).map(([field, values]) => `${field} (${values.join(" / ")})`).join(", ")}</p>}
      {presets.length > 0 && <div className="rounded-xl bg-slate-50 p-3 text-xs"><strong>Matching presets</strong>{presets.map((preset)=><div className="mt-1 flex items-center gap-2" key={preset.id}><button className="text-blue-700 underline" onClick={()=>setMapping(preset.mapping)}>{preset.name}</button><button onClick={()=>void renamePreset(preset)}>Rename</button><button className="text-red-700" onClick={()=>void deletePreset(preset)}>Delete</button></div>)}</div>}
      <div className="grid gap-2 md:grid-cols-2">{IMPORTABLE_PROPERTY_FIELDS.map((field) => <label key={field} className="grid grid-cols-2 items-center gap-2 text-xs"><span className="font-semibold">{labels[field] ?? field}</span><Select value={mapping[field] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header}>{header}</option>)}</Select></label>)}</div>
      <div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-semibold">Import mode<Select value={mode} onChange={(event) => setMode(event.target.value)}><option value="CREATE_ONLY">Create only (safest)</option><option value="UPSERT_SAFE">Safe upsert exact matches</option><option value="UPDATE_EXISTING_ONLY">Update existing only</option></Select></label><label className="text-xs font-semibold">Partial policy<Select value={partialPolicy} onChange={(event) => setPartialPolicy(event.target.value)}><option value="REQUIRE_ALL_ROWS_VALID">Require all rows valid</option><option value="IMPORT_VALID_ROWS">Import valid rows only</option></Select></label><Checkbox label="Allow blank cells to clear CRM values" checked={allowBlankClear} onChange={(event) => setAllowBlankClear(event.target.checked)}/></div>
      <Button onClick={() => void loadPreview()} loading={busy}>Build validation preview</Button></section></>}
    {preview.length > 0 && !result && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Preview and duplicate resolution</h2><p className="text-sm text-slate-600">{preview.length} rows · {preview.filter((row) => row.state === "ERROR").length} errors · {preview.filter((row) => row.duplicateClass !== "NEW").length} duplicate candidates</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={()=>resolveAllExact("SKIP")}>Skip all exact</Button>{mode !== "CREATE_ONLY" && <Button size="sm" variant="secondary" onClick={()=>resolveAllExact("UPDATE_EXISTING")}>Update all exact</Button>}<Select className="w-auto" value={filter} onChange={(event) => { setFilter(event.target.value); setPreviewPage(1); }}><option>ALL</option>{["READY","WARNING","ERROR","DUPLICATE","SKIPPED"].map((value) => <option key={value}>{value}</option>)}</Select></div></div>
      <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-xs"><thead className="bg-slate-50 text-left"><tr>{["Row","Code / title","Location","Source","Price","Owner","State","Duplicate","Action"].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.rowNumber} className="border-t align-top"><td className="p-3">{row.rowNumber}</td><td className="p-3">{String(row.data.propertyCode ?? "—")}<br/><strong>{String(row.data.title ?? "—")}</strong></td><td className="p-3">{String(row.data.area ?? "—")}<br/>{String(row.data.address ?? "")}</td><td className="p-3">{String(row.data.inventorySource ?? "—")}</td><td className="p-3">{String(row.data.monthlyRent ?? row.data.salePrice ?? "—")}</td><td className="p-3">{String(row.data.ownerName ?? "—")}</td><td className="p-3"><strong>{row.state}</strong>{row.issues.map((issue, i) => <p key={i} className={issue.severity === "ERROR" ? "text-red-700" : "text-amber-700"}>{issue.field}: {issue.message}</p>)}</td><td className="p-3">{row.duplicateClass}{row.matchedProperty && <p>{row.matchedProperty.propertyCode}</p>}{row.diff.map((diff) => <p key={diff.field}>{diff.field}: {String(diff.before ?? "—")} → {String(diff.after ?? "—")}</p>)}</td><td className="p-3 space-y-2"><Select value={row.action} onChange={(event) => resolve(row.rowNumber, { action: event.target.value as ImportActionValue })}><option value="SKIP">Skip</option><option value="CREATE">Create anyway</option><option value="UPDATE_EXISTING">Update existing</option></Select>{row.partnerResolution === "NOT_FOUND" && <Select value={resolutions[String(row.rowNumber)]?.partnerId ?? ""} onChange={(event) => resolve(row.rowNumber, { partnerId: event.target.value })}><option value="">Choose partner</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}{partner.company ? ` · ${partner.company}` : ""}</option>)}</Select>}</td></tr>)}</tbody></table></div>
      {filtered.length > 100 && <div className="flex items-center justify-end gap-2 text-xs"><Button size="sm" variant="secondary" disabled={previewPage===1} onClick={()=>setPreviewPage((page)=>page-1)}>Previous</Button><span>Page {previewPage} of {Math.ceil(filtered.length/100)}</span><Button size="sm" variant="secondary" disabled={previewPage>=Math.ceil(filtered.length/100)} onClick={()=>setPreviewPage((page)=>page+1)}>Next</Button></div>}
      <div className="rounded-xl border bg-white p-4"><p className="mb-3 text-sm">Final confirmation will re-run validation and duplicate detection on the server. Blank clearing is <strong>{allowBlankClear ? "enabled" : "disabled"}</strong>.</p><Button onClick={() => void execute()} loading={busy}>Confirm and import</Button></div></section>}
    {result && <section className="rounded-2xl border border-green-200 bg-green-50 p-6"><h2 className="text-lg font-bold text-green-900">Import completed</h2><p className="mt-2 text-sm">Created {result.counts.created}, updated {result.counts.updated}, skipped {result.counts.skipped}, failed {result.counts.failed}.</p><div className="mt-4 flex gap-2"><Link href={`/properties/import/history/${result.job.id}`} className="rounded-xl bg-green-800 px-3 py-2 text-sm font-semibold text-white">View row results</Link><Link href="/properties" className="rounded-xl border px-3 py-2 text-sm font-semibold">Return to inventory</Link></div></section>}
  </div>;
}

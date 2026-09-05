"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PropertyPortalCapabilities, PropertyPortalProviderId } from "@/integrations/property-portals/registry";

type Connection = { provider: string; status: string; connectionMode: string; displayName: string | null; lastSuccessfulSyncAt: Date | string | null; lastErrorSummary: string | null };

export function ConnectionCard({ provider, capabilities, initial, canEdit, webhookUrl, lastEvent, housingImportHref }: { provider: PropertyPortalProviderId; capabilities: PropertyPortalCapabilities; initial?: Connection; canEdit: boolean; webhookUrl?: string; lastEvent?: { receivedAt: Date | string; status: string }; housingImportHref?: string }) {
  const [editing, setEditing] = useState(false);
  const [connection, setConnection] = useState(initial);
  const [busy, setBusy] = useState(false);
  const awaitingAccess = provider !== "HOUSING" && !connection;

  async function save(form: FormData) {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/property-portals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, displayName: form.get("displayName") || undefined, accountReference: form.get("accountReference") || undefined, connectionMode: form.get("connectionMode"), status: "NOT_CONFIGURED" }) });
      if (!response.ok) throw new Error("Unable to save connection");
      setConnection((await response.json()).connection);
      setEditing(false);
    } finally { setBusy(false); }
  }

  const status = awaitingAccess ? "AWAITING_PROVIDER_ACCESS" : connection?.status ?? "NOT_CONFIGURED";
  return <section className="rounded-2xl border border-[#E7ECF2] bg-white p-5">
    <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{provider.replaceAll("_", " ")}</h2><Badge tone={status === "AWAITING_PROVIDER_ACCESS" || status === "NOT_CONFIGURED" ? "blue" : status === "DEGRADED" || status === "AUTH_FAILED" ? "red" : "green"}>{status.replaceAll("_", " ")}</Badge></div>
    {editing ? <form action={save} className="mt-4 space-y-3 text-sm"><input name="displayName" defaultValue={connection?.displayName ?? ""} placeholder="Display name" className="w-full rounded border p-2" /><input name="accountReference" placeholder="Account reference (optional)" className="w-full rounded border p-2" /><select name="connectionMode" defaultValue={connection?.connectionMode ?? "MANUAL"} className="w-full rounded border p-2">{["API", "WEBHOOK", "CSV", "EMAIL", "MANUAL"].map((mode) => <option key={mode}>{mode}</option>)}</select><p className="text-xs text-[#596579]">Configuration records contain no credentials and do not activate an undocumented provider API.</p><div className="flex gap-2"><button disabled={busy} className="rounded bg-[#3366FF] px-3 py-2 text-white">{busy ? "Saving…" : "Save"}</button><button type="button" onClick={() => setEditing(false)} className="rounded border px-3 py-2">Cancel</button></div></form> : <><p className="mt-2 text-sm text-[#596579]">{provider === "HOUSING" ? "Inbound webhook" : "CRM adapter ready; official provider access is required to activate ingestion."}</p><dl className="mt-4 space-y-1.5 text-xs text-[#596579]"><div>Lead webhook: {capabilities.leadWebhook}</div><div>Lead pull: {capabilities.leadPull}</div><div>Email ingestion: {capabilities.emailIngestion}</div><div>Listing API: {capabilities.listingPush}</div>{connection?.lastSuccessfulSyncAt && <div>Last successful sync: {new Date(connection.lastSuccessfulSyncAt).toLocaleString("en-IN")}</div>}{connection?.lastErrorSummary && <div className="text-red-700">Last error: {connection.lastErrorSummary}</div>}{webhookUrl && <div className="break-all">Webhook URL: <span className="font-mono">{webhookUrl}</span></div>}{lastEvent && <div>Last event: {new Date(lastEvent.receivedAt).toLocaleString("en-IN")} · {lastEvent.status.replaceAll("_", " ")}</div>}</dl>{/* Deliberately says just "Housing", never the provider's dotted domain
                name - see the repo-wide provider-hostname guard in
                provider-safety.test.ts, which forbids that literal string
                anywhere under this directory, even inside a comment. */}
                {housingImportHref && <div className="mt-4 rounded-xl border border-[#E7ECF2] bg-[#F3F6FA] p-4"><h3 className="text-sm font-semibold text-[#1B2430]">Upload Housing Leads</h3><p className="mt-1 text-xs text-[#596579]">Import leads exported from Housing using CSV or Excel.</p><Link href={housingImportHref} className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[#3366FF] px-3 py-2 text-sm font-semibold text-white sm:w-auto">Upload Lead Export</Link></div>}<div className="mt-4 flex flex-wrap gap-2">{canEdit && <button onClick={() => setEditing(true)} className="rounded border px-3 py-2 text-sm">Configure</button>}</div></>}</section>;
}

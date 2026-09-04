"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

type SyncStatus = {
  connection: { status: string; lastSyncAt: string | null; lastSuccessfulSyncAt: string | null; lastErrorAt: string | null; lastErrorSummary: string | null } | null;
  olxLeadEventCount: number;
  selldo: { pending: number; retryable: number; deadLetter: number; succeeded: number };
};

/**
 * OLX operational status + Sell.Do outbox status, ADMIN-only. Never renders
 * OLX password/token/API key or the Sell.Do API key anywhere - only
 * derived, sanitized status (timestamps, counts, a truncated last-error
 * summary that ingestion/sync code already scrubs of secrets before storing).
 */
export function OlxSelldoPanel({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/integrations/property-portals/olx/sync");
    if (response.ok) setStatus(await response.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/property-portals/olx/sync", { method: "POST" });
      if (response.status === 429) {
        setMessage("Too many sync requests - please wait a few minutes and try again.");
        return;
      }
      if (!response.ok) {
        setMessage("Sync could not be started.");
        return;
      }
      const data = await response.json();
      setMessage(data.configured ? "Sync completed." : "OLX credentials are not configured in this environment.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const connectionStatus = status?.connection?.status ?? "NOT_CONFIGURED";

  return (
    <section className="rounded-2xl border border-[#E7ECF2] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">OLX Dealer API + Sell.Do sync</h2>
        <Badge tone={connectionStatus === "CONNECTED" ? "green" : connectionStatus === "AUTH_FAILED" || connectionStatus === "DEGRADED" ? "red" : "blue"}>{connectionStatus.replaceAll("_", " ")}</Badge>
      </div>
      <dl className="mt-4 space-y-1.5 text-xs text-[#596579]">
        <div>Last attempted sync: {status?.connection?.lastSyncAt ? new Date(status.connection.lastSyncAt).toLocaleString("en-IN") : "Never"}</div>
        <div>Last successful sync: {status?.connection?.lastSuccessfulSyncAt ? new Date(status.connection.lastSuccessfulSyncAt).toLocaleString("en-IN") : "Never"}</div>
        <div>Total OLX lead events received: {status?.olxLeadEventCount ?? 0}</div>
        {status?.connection?.lastErrorSummary && <div className="text-red-700">Last error: {status.connection.lastErrorSummary}</div>}
        <div className="pt-2 font-semibold text-[#1B2430]">Sell.Do outbox</div>
        <div>Pending: {status?.selldo.pending ?? 0} · Retryable: {status?.selldo.retryable ?? 0} · Dead-lettered: {status?.selldo.deadLetter ?? 0} · Synced: {status?.selldo.succeeded ?? 0}</div>
      </dl>
      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={syncNow} disabled={busy} className="rounded bg-[#3366FF] px-3 py-2 text-sm text-white disabled:opacity-60">{busy ? "Syncing…" : "Sync Now"}</button>
          {message && <span className="text-xs text-[#596579]">{message}</span>}
        </div>
      )}
    </section>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Staff actions for a single portal lead event, calling the existing
 * PATCH /api/portal-leads/[id] action endpoint (LINK_EXISTING / REJECT /
 * RETRY). There is deliberately no separate "create Lead" action here: the
 * ingestion policy already auto-creates a Lead for any event that resolves
 * as NEW (a safe, unique identity match) - the review queue only ever holds
 * events that resolved MATCHED_EXISTING (already linked) or AMBIGUOUS
 * (multiple candidates; a human must choose which one, or none).
 */
export function PortalLeadActions({ eventId, status, alreadyLinked }: { eventId: string; status: string; alreadyLinked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/portal-leads/${eventId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Action failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (status === "REJECTED" || alreadyLinked) return <span className="text-xs text-[#596579]">{status.replaceAll("_", " ")}</span>;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="Lead ID" className="w-24 rounded border p-1 text-xs" />
        <button disabled={busy || !leadId} onClick={() => act({ action: "LINK_EXISTING", leadId })} className="rounded border px-2 py-1 text-xs font-semibold text-[#3366FF] disabled:opacity-50">
          Link
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <button disabled={busy} onClick={() => act({ action: "RETRY" })} className="rounded border px-2 py-1 text-xs disabled:opacity-50">
          Retry
        </button>
        <button disabled={busy} onClick={() => act({ action: "REJECT" })} className="rounded border px-2 py-1 text-xs text-red-700 disabled:opacity-50">
          Reject
        </button>
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

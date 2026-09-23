"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export type ConflictListing = {
  id: string;
  provider: string;
  propertyId: string;
  propertyTitle: string;
  propertyCode: string;
  conflictFields: string[];
  crmSnapshot: Record<string, unknown>;
  portalSnapshot: Record<string, unknown>;
  conflictDetectedAt: string | null;
  conflictResolution: string | null;
};

const FIELD_LABELS: Record<string, { crm: string[]; portal: string[] }> = {
  price: { crm: ["price", "monthlyRent", "salePrice"], portal: ["price", "monthlyRent", "salePrice"] },
  availability: { crm: ["status", "availableFrom"], portal: ["status", "availableFrom"] },
  listingMetadata: { crm: ["title", "description", "locality"], portal: ["title", "description", "locality"] },
  providerSyncState: { crm: ["syncState"], portal: ["syncState"] },
};

export function ConflictList({ conflicts, canResolve }: { conflicts: ConflictListing[]; canResolve: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, resolution: "KEEP_CRM" | "ACCEPT_PORTAL" | "REVIEW") {
    setBusy(id + resolution);
    setError(null);
    try {
      const res = await fetch(`/api/portal-listings/${id}/conflict`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Unable to resolve conflict");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resolve conflict");
    } finally {
      setBusy(null);
    }
  }

  if (conflicts.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No open sync conflicts. Listings only land here when a provider snapshot differs from CRM state on a supported field.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {conflicts.map((c) => (
        <div key={c.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-zinc-900">{c.propertyTitle}</span>{" "}
              <span className="font-mono text-xs text-zinc-500">({c.propertyCode})</span>
              <div className="text-xs text-zinc-500">
                {c.provider.replaceAll("_", " ")}{" "}
                {c.conflictDetectedAt ? `· detected ${new Date(c.conflictDetectedAt).toLocaleString("en-IN")}` : ""}
              </div>
            </div>
            {c.conflictResolution ? (
              <Badge tone="green">Resolved: {c.conflictResolution.replaceAll("_", " ")}</Badge>
            ) : (
              <Badge tone="amber">Open conflict</Badge>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-1 pr-3 font-semibold">Field</th>
                  <th className="py-1 pr-3 font-semibold">CRM value</th>
                  <th className="py-1 font-semibold">Portal value</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800">
                {c.conflictFields.map((field) => {
                  const keys = FIELD_LABELS[field]?.crm ?? [field];
                  return keys
                    .filter((k) => k in c.crmSnapshot || k in c.portalSnapshot)
                    .map((key) => (
                      <tr key={field + key} className="border-t border-amber-100">
                        <td className="py-1 pr-3 font-medium">
                          {field} <span className="text-zinc-400">({key})</span>
                        </td>
                        <td className="py-1 pr-3">{String(c.crmSnapshot[key] ?? "-")}</td>
                        <td className="py-1">{String(c.portalSnapshot[key] ?? "-")}</td>
                      </tr>
                    ));
                })}
              </tbody>
            </table>
          </div>
          {canResolve && !c.conflictResolution && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === c.id + "KEEP_CRM"}
                onClick={() => resolve(c.id, "KEEP_CRM")}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy === c.id + "KEEP_CRM" ? "…" : "Keep CRM"}
              </button>
              <button
                type="button"
                disabled={busy === c.id + "ACCEPT_PORTAL"}
                onClick={() => resolve(c.id, "ACCEPT_PORTAL")}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy === c.id + "ACCEPT_PORTAL" ? "…" : "Accept Portal"}
              </button>
              <button
                type="button"
                disabled={busy === c.id + "REVIEW"}
                onClick={() => resolve(c.id, "REVIEW")}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy === c.id + "REVIEW" ? "…" : "Mark for review"}
              </button>
            </div>
          )}
          {c.conflictResolution === "ACCEPT_PORTAL" && (
            <p className="mt-2 text-xs text-zinc-500">
              Accept Portal is recorded for human follow-up only; field values are never silently overwritten by this CRM.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

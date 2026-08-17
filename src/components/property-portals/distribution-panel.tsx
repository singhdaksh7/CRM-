"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { PropertyPortalProviderId, CapabilityStatus } from "@/integrations/property-portals/registry";

export type DistributionListing = {
  id: string;
  provider: PropertyPortalProviderId;
  status: "DRAFT" | "PUBLISHED" | "INACTIVE" | "SYNC_CONFLICT" | "FAILED";
  externalListingId: string | null;
  externalUrl: string | null;
  lastSyncedAt: string | null;
  errorSummary: string | null;
  publishedAt: string | null;
};

export type DistributionOperation = { id: string; provider: PropertyPortalProviderId; portalListingId: string | null; status: "PENDING" | "RETRYABLE" | "SUCCEEDED" | "DEAD_LETTER"; attemptCount: number; failureReason: string | null; retryEligibleAt: string | null };

export type ProviderRow = {
  provider: PropertyPortalProviderId;
  capabilities: { supportsListingPublish: CapabilityStatus; supportsListingUpdate: CapabilityStatus; supportsListingDeactivate: CapabilityStatus };
  connectionStatus: string | null; // null = no connection configured
  listing: DistributionListing | null;
  operations: DistributionOperation[];
};

const STATUS_TONE: Record<string, "green" | "blue" | "amber" | "red" | "slate"> = {
  DRAFT: "slate", PUBLISHED: "green", INACTIVE: "slate", SYNC_CONFLICT: "amber", FAILED: "red",
};

export function DistributionPanel({ propertyId, rows, preview, canEdit }: { propertyId: string; rows: ProviderRow[]; preview: { valid: boolean; errors: string[] }; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addToProvider(provider: PropertyPortalProviderId) {
    setBusy(provider); setError(null);
    try {
      const res = await fetch("/api/portal-listings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId, provider }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Unable to start distribution");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start distribution"); } finally { setBusy(null); }
  }

  async function runAction(listingId: string, action: "PUBLISH" | "UPDATE" | "DEACTIVATE") {
    setBusy(listingId + action); setError(null);
    try {
      const res = await fetch(`/api/portal-listings/${listingId}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Action not permitted");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Action not permitted"); } finally { setBusy(null); }
  }

  async function retryOperation(operationId: string) {
    setBusy(operationId); setError(null);
    try {
      const res = await fetch(`/api/portal-operations/${operationId}/retry`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Unable to retry");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to retry"); } finally { setBusy(null); }
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8A94A6]">Portal Distribution</h3>
        <button type="button" onClick={() => setPreviewOpen((v) => !v)} className="text-xs font-semibold text-[#3366FF] hover:underline">
          {previewOpen ? "Hide payload preview" : "Preview payload"}
        </button>
      </div>
      {previewOpen && (
        <div className="mb-4 rounded-lg bg-[#F7F9FC] p-3 text-xs text-[#596579]">
          {preview.valid ? "Payload is complete and would be ready for an authorized provider adapter." : (
            <span className="text-red-700">Payload incomplete - missing: {preview.errors.join(", ")}</span>
          )}
        </div>
      )}
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.provider} className="rounded-lg border border-[#EFF4FF] p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{row.provider.replaceAll("_", " ")}</span>
              <div className="flex items-center gap-2">
                {row.listing ? <Badge tone={STATUS_TONE[row.listing.status]}>{row.listing.status.replaceAll("_", " ")}</Badge> : <Badge tone="slate">Not distributed</Badge>}
                <span className="text-xs text-[#8A94A6]">{row.connectionStatus ? row.connectionStatus.replaceAll("_", " ") : "NOT CONFIGURED"}</span>
              </div>
            </div>
            <div className="mt-1.5 text-xs text-[#8A94A6]">
              Publish: {row.capabilities.supportsListingPublish.replaceAll("_", " ")} · Update: {row.capabilities.supportsListingUpdate.replaceAll("_", " ")} · Deactivate: {row.capabilities.supportsListingDeactivate.replaceAll("_", " ")}
            </div>
            {row.listing?.externalListingId && (
              <div className="mt-1 text-xs text-[#596579]">External ID: {row.listing.externalListingId}{row.listing.externalUrl && <> · <a href={row.listing.externalUrl} target="_blank" rel="noreferrer" className="text-[#3366FF] hover:underline">View listing</a></>}</div>
            )}
            {row.listing?.lastSyncedAt && <div className="mt-1 text-xs text-[#8A94A6]">Last sync: {new Date(row.listing.lastSyncedAt).toLocaleString("en-IN")}</div>}
            {row.listing?.errorSummary && <div className="mt-1 text-xs text-red-700">Last error: {row.listing.errorSummary}</div>}
            {row.listing?.status === "SYNC_CONFLICT" && (
              <div className="mt-1.5"><Link href="/integrations/property-portals/conflicts" className="text-xs font-semibold text-amber-700 hover:underline">Review sync conflict →</Link></div>
            )}
            {row.operations.length > 0 && (
              <div className="mt-2 space-y-1">
                {row.operations.map((op) => (
                  <div key={op.id} className="flex items-center justify-between rounded bg-[#FBF7EE] px-2 py-1 text-xs">
                    <span><Badge tone={op.status === "DEAD_LETTER" ? "red" : "amber"}>{op.status.replaceAll("_", " ")}</Badge> attempt {op.attemptCount} - {op.failureReason ?? "No detail"}</span>
                    {canEdit && op.status === "RETRYABLE" && (
                      <button type="button" disabled={busy === op.id} onClick={() => retryOperation(op.id)} className="rounded border px-2 py-0.5 font-semibold text-[#3366FF]">{busy === op.id ? "Retrying…" : "Retry"}</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <div className="mt-2 flex flex-wrap gap-2">
                {!row.listing ? (
                  <button type="button" disabled={busy === row.provider} onClick={() => addToProvider(row.provider)} className="rounded border px-2.5 py-1 text-xs font-semibold">{busy === row.provider ? "Adding…" : "Add to distribution"}</button>
                ) : (
                  <>
                    <ActionButton label="Publish" active={busy === row.listing.id + "PUBLISH"} onClick={() => runAction(row.listing!.id, "PUBLISH")} />
                    <ActionButton label="Update" active={busy === row.listing.id + "UPDATE"} onClick={() => runAction(row.listing!.id, "UPDATE")} />
                    <ActionButton label="Deactivate" active={busy === row.listing.id + "DEACTIVATE"} onClick={() => runAction(row.listing!.id, "DEACTIVATE")} />
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#8A94A6] border-t border-[#EFF4FF] pt-2.5">Contract-only integration: publish/update/deactivate remain blocked until an authorized partner connection reports AVAILABLE. No listings are sent to any provider by this CRM.</p>
    </div>
  );
}

function ActionButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" disabled={active} onClick={onClick} className="rounded border px-2.5 py-1 text-xs font-semibold text-[#1B2430] disabled:opacity-60">{active ? "…" : label}</button>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import type { PropertyPortalCapabilities, PropertyPortalProviderId } from "@/integrations/property-portals/registry";

type Connection = { provider: string; status: string; connectionMode: string; displayName: string | null; lastSuccessfulSyncAt: Date | string | null; lastErrorSummary: string | null };

export function ConnectionCard({
  provider,
  capabilities,
  initial,
  canEdit,
  webhookUrl,
  lastEvent,
  housingImportHref,
}: {
  provider: PropertyPortalProviderId;
  capabilities: PropertyPortalCapabilities;
  initial?: Connection;
  canEdit: boolean;
  webhookUrl?: string;
  lastEvent?: { receivedAt: Date | string; status: string };
  housingImportHref?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [connection, setConnection] = useState(initial);
  const [busy, setBusy] = useState(false);
  const awaitingAccess = provider !== "HOUSING" && !connection;

  async function save(form: FormData) {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/property-portals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          displayName: form.get("displayName") || undefined,
          accountReference: form.get("accountReference") || undefined,
          connectionMode: form.get("connectionMode"),
          status: "NOT_CONFIGURED",
        }),
      });
      if (!response.ok) throw new Error("Unable to save connection");
      setConnection((await response.json()).connection);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const status = awaitingAccess ? "AWAITING_PROVIDER_ACCESS" : connection?.status ?? "NOT_CONFIGURED";

  return (
    <section className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-[#09090B] text-base">{provider.replaceAll("_", " ")}</h2>
          <Badge tone={status === "AWAITING_PROVIDER_ACCESS" || status === "NOT_CONFIGURED" ? "slate" : status === "DEGRADED" || status === "AUTH_FAILED" ? "red" : "green"}>
            {status.replaceAll("_", " ")}
          </Badge>
        </div>

        {editing ? (
          <form action={save} className="mt-4 space-y-3 text-sm">
            <Field label="Display Name">
              <Input name="displayName" defaultValue={connection?.displayName ?? ""} placeholder="Display name" />
            </Field>
            <Field label="Account Reference (Optional)">
              <Input name="accountReference" placeholder="Account reference" />
            </Field>
            <Field label="Connection Mode">
              <Select name="connectionMode" defaultValue={connection?.connectionMode ?? "MANUAL"}>
                {["API", "WEBHOOK", "CSV", "EMAIL", "MANUAL"].map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-[#71717A]">
              Configuration records contain no credentials and do not activate an undocumented provider API.
            </p>
            <div className="flex gap-2 pt-2 border-t border-[#E4E4E7]">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button loading={busy}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="mt-2 text-xs text-[#52525B]">
              {provider === "HOUSING" ? "Inbound webhook integration" : "CRM adapter ready; official provider access is required to activate ingestion."}
            </p>
            <dl className="mt-4 space-y-1.5 text-xs text-[#52525B] border-t border-[#F4F4F5] pt-3">
              <div>Lead webhook: {capabilities.leadWebhook}</div>
              <div>Lead pull: {capabilities.leadPull}</div>
              <div>Email ingestion: {capabilities.emailIngestion}</div>
              <div>Listing API: {capabilities.listingPush}</div>
              {connection?.lastSuccessfulSyncAt && (
                <div className="text-[#71717A]">Last sync: {new Date(connection.lastSuccessfulSyncAt).toLocaleString("en-IN")}</div>
              )}
              {connection?.lastErrorSummary && (
                <div className="text-red-600">Last error: {connection.lastErrorSummary}</div>
              )}
              {webhookUrl && (
                <div className="break-all text-[#71717A]">Webhook: <span className="font-mono text-[#09090B]">{webhookUrl}</span></div>
              )}
              {lastEvent && (
                <div className="text-[#71717A]">Last event: {new Date(lastEvent.receivedAt).toLocaleString("en-IN")} · {lastEvent.status.replaceAll("_", " ")}</div>
              )}
            </dl>

            {housingImportHref && (
              <div className="mt-4 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3.5">
                <h3 className="text-xs font-semibold text-[#09090B]">Upload Housing Leads</h3>
                <p className="mt-0.5 text-xs text-[#71717A]">Import leads exported from Housing using CSV or Excel.</p>
                <Link
                  href={housingImportHref}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[#0A0A0A] px-3 py-2 text-xs font-semibold text-white sm:w-auto hover:bg-[#27272A] transition-colors"
                >
                  Upload Lead Export
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {!editing && canEdit && (
        <div className="mt-4 pt-3 border-t border-[#F4F4F5] flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Configure
          </Button>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/form";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { demandPoolApi, DemandPoolApiError } from "@/lib/demand-pool/api";
import {
  budgetStretchDisplay,
  contactSafetyWarnings,
  isRecipientBlocked,
  lastContactedLabel,
  parseLocalities,
  summarizeRequirement,
} from "@/lib/demand-pool/format";
import { canBulkRecommend, canSendRecommendations } from "@/lib/demand-pool/permissions";
import type { MatchSummary, PrepareRecommendationResult, PropertyRecommendation, RecommendationTier } from "@/lib/demand-pool/types";
import { formatINR } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { MatchExplanation } from "./match-explanation";
import { MatchTierBadge, MatchHistoryBadge } from "./badges";
import { RecommendationPreviewModal } from "./recommendation-preview";

const DEFAULT_STRETCH = 0.2;

export function MatchedCustomersPanel({
  propertyId,
  propertyTitle,
  propertyMeta,
  propertyPrice,
  role,
  stretchThresholdPct = DEFAULT_STRETCH,
}: {
  propertyId: string;
  propertyTitle: string;
  propertyMeta: string;
  propertyPrice?: number | null;
  role: Role;
  stretchThresholdPct?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<PropertyRecommendation[]>([]);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [tier, setTier] = useState("");
  const [source, setSource] = useState("");
  const [includeStretch, setIncludeStretch] = useState(false);
  const [whatsAppEligibleOnly, setWhatsAppEligibleOnly] = useState(false);
  const [notContactedRecently, setNotContactedRecently] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [prepared, setPrepared] = useState<PrepareRecommendationResult | null>(null);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = {};
      if (tier) filters.tier = tier;
      if (source) filters.source = source;
      if (notContactedRecently) filters.notContactedRecently = "true";
      const data = await demandPoolApi.getPropertyMatches(propertyId, filters);
      setRecommendations(data.recommendations);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof DemandPoolApiError ? err.message : "Could not load matched customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- explicit rematch/filter reload driven by panel controls
    void load();
    void demandPoolApi
      .getWhatsAppHealth()
      .then((health) => setProviderConfigured(Boolean(health.configured || health.providerConfigured)))
      .catch(() => setProviderConfigured(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filter knobs change
  }, [propertyId, tier, source, notContactedRecently]);

  const visible = useMemo(() => {
    return recommendations.filter((r) => {
      if (r.tier === "LOW") return false;
      if (r.tier === "STRETCH" && !includeStretch && tier !== "STRETCH") return false;
      if (whatsAppEligibleOnly && isRecipientBlocked({ doNotContact: r.customerContact?.doNotContact, whatsAppOptOut: r.customerContact?.whatsAppOptOut })) {
        return false;
      }
      return true;
    });
  }, [recommendations, includeStretch, tier, whatsAppEligibleOnly]);

  function toggle(id: string, disabled: boolean) {
    if (disabled) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectTier(target: RecommendationTier) {
    const next = new Set(selected);
    for (const row of visible) {
      if (row.tier !== target) continue;
      const blocked = isRecipientBlocked({
        doNotContact: row.customerContact?.doNotContact,
        whatsAppOptOut: row.customerContact?.whatsAppOptOut,
      });
      if (!blocked) next.add(row.id);
    }
    setSelected(next);
  }

  async function prepareSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      // Every selected recommendation must reach PREPARED (mark-sent only
      // accepts prepared, currently-contactable rows) - prepare each one,
      // but only the first supplies the editable template shown in the
      // preview modal.
      const results = await Promise.all(ids.map((id) => demandPoolApi.prepareRecommendation(id)));
      setPrepared(results[0]);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare recommendation");
    } finally {
      setBusy(false);
    }
  }

  const selectedRows = visible.filter((r) => selected.has(r.id));

  return (
    <section className="space-y-4 rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1B2430]">Matched Customers</h2>
          {summary && (
            <p className="mt-1 text-sm text-[#596579]">
              Potential Matches: <strong>{summary.total}</strong> · Exact: {summary.exact} · Strong: {summary.strong} · Stretch: {summary.stretch}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canBulkRecommend(role) && (
            <Button size="sm" variant="secondary" onClick={() => void demandPoolApi.rematchProperty(propertyId).then(load)}>
              Recalculate
            </Button>
          )}
          <Link href={`/properties/${propertyId}/matches`} className="inline-flex items-center rounded-xl border border-[#E7ECF2] px-2.5 py-1.5 text-xs font-semibold">
            Open full matches
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Select aria-label="Match tier filter" value={tier} onChange={(e) => setTier(e.target.value)} className="w-auto text-xs">
          <option value="">All visible tiers</option>
          <option value="EXACT">Exact</option>
          <option value="STRONG">Strong</option>
          <option value="STRETCH">Stretch</option>
        </Select>
        <Select aria-label="Source filter" value={source} onChange={(e) => setSource(e.target.value)} className="w-auto text-xs">
          <option value="">Customer Database + Leads</option>
          <option value="CONTACT">Customer Database</option>
          <option value="LEAD">Leads</option>
        </Select>
        <Checkbox label="Include Stretch" checked={includeStretch} onChange={(e) => setIncludeStretch(e.target.checked)} />
        <Checkbox label="WhatsApp eligible" checked={whatsAppEligibleOnly} onChange={(e) => setWhatsAppEligibleOnly(e.target.checked)} />
        <Checkbox label="Not contacted recently" checked={notContactedRecently} onChange={(e) => setNotContactedRecently(e.target.checked)} />
      </div>

      {loading && <LoadingState label="Loading matched customers..." />}
      {error && <ErrorState title="Matches unavailable" description={error} action={<Button onClick={() => void load()}>Retry</Button>} />}
      {!loading && !error && visible.length === 0 && (
        <EmptyState title="No matches" description="No customers or leads currently match this property for the selected filters." />
      )}

      {!loading && !error && visible.length > 0 && (
        <>
          {canBulkRecommend(role) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F8FAFC] p-3 text-xs">
              <Button size="sm" variant="secondary" onClick={() => selectTier("EXACT")}>Select all Exact</Button>
              <Button size="sm" variant="secondary" onClick={() => selectTier("STRONG")}>Select all Strong</Button>
              {includeStretch && <Button size="sm" variant="secondary" onClick={() => selectTier("STRETCH")}>Select visible Stretch</Button>}
              <span className="font-semibold text-[#1B2430]">{selected.size} Customers Selected</span>
              <Button size="sm" disabled={selected.size === 0} loading={busy} onClick={() => void prepareSelected()}>
                Prepare Recommendation
              </Button>
            </div>
          )}

          <div className="grid gap-3">
            {visible.map((row) => {
              const name = row.customerContact?.name ?? row.lead?.clientName ?? "Unknown";
              const blocked = isRecipientBlocked({
                doNotContact: row.customerContact?.doNotContact,
                whatsAppOptOut: row.customerContact?.whatsAppOptOut,
              });
              const warnings = contactSafetyWarnings({
                doNotContact: row.customerContact?.doNotContact,
                whatsAppOptOut: row.customerContact?.whatsAppOptOut,
                lastContactedAt: row.customerContact?.lastContactedAt ?? row.lead?.lastContactedAt,
              });
              const budget = row.requirement?.maxBudget ?? null;
              const stretch = budgetStretchDisplay({
                customerBudget: budget,
                propertyPrice,
                stretchThresholdPct,
              });
              return (
                <article key={row.id} className={`rounded-xl border p-3 ${blocked ? "border-red-200 bg-red-50/40 opacity-80" : "border-[#E7ECF2]"}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    {canBulkRecommend(role) && (
                      <Checkbox
                        label={`Select ${name}`}
                        checked={selected.has(row.id)}
                        disabled={blocked}
                        onChange={() => toggle(row.id, blocked)}
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#1B2430]">{name}</p>
                        <MatchTierBadge tier={row.tier} />
                        <MatchHistoryBadge status={row.matchHistoryStatus} />
                        <span className="text-xs font-semibold text-[#8A94A6]">{row.source}</span>
                        <span className="text-xs text-[#596579]" aria-label={`Match score ${row.score} percent`}>
                          {row.score}%
                        </span>
                      </div>
                      {row.requirement && (
                        <p className="text-xs text-[#596579]">
                          {summarizeRequirement({
                            assetClass: row.requirement.assetClass ?? "RESIDENTIAL",
                            transactionType: row.requirement.transactionType ?? "RENT",
                            bhk: row.requirement.bhk ?? null,
                            commercialPropertyType: null,
                            preferredLocalities: row.requirement.preferredLocalities,
                            minBudget: row.requirement.minBudget,
                            maxBudget: row.requirement.maxBudget,
                          })}
                        </p>
                      )}
                      <p className="text-xs text-[#8A94A6]">
                        Budget {formatINR(budget, { compact: true })} · Localities {parseLocalities(row.requirement?.preferredLocalities).join(", ") || "—"} · Last contacted {lastContactedLabel(row.customerContact?.lastContactedAt ?? row.lead?.lastContactedAt)} · Last property sent {row.customerContact?.lastPropertySentAt ? lastContactedLabel(row.customerContact.lastPropertySentAt) : "—"}
                      </p>
                      {!stretch.withinThreshold && (
                        <p className="text-xs font-medium text-[#E5484D]">Budget stretch warning: {stretch.label}</p>
                      )}
                      {warnings.length > 0 && (
                        <p className="text-xs font-medium text-[#E6A23C]">{warnings.join(" · ")}</p>
                      )}
                      <MatchExplanation tier={row.tier} score={row.score} reasons={row.reasons} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <RecommendationPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        propertyLabel={propertyTitle}
        propertyMeta={propertyMeta}
        recipients={selectedRows}
        prepared={prepared}
        providerConfigured={providerConfigured && canSendRecommendations(role)}
        confirming={busy}
        onCopy={(message) => {
          void navigator.clipboard.writeText(message);
          toast.success("Message copied");
        }}
        onOpenWhatsApp={(url) => window.open(url, "_blank", "noopener,noreferrer")}
        onMarkSent={() => {
          void Promise.all(selectedRows.map((r) => demandPoolApi.markRecommendationSent(r.id))).then(() => {
            toast.success("Marked as sent");
            void load();
          });
        }}
        onConfirmSend={() => {
          setBusy(true);
          void Promise.all(selectedRows.map((r) => demandPoolApi.markRecommendationSent(r.id)))
            .then(() => {
              toast.success("Send confirmed");
              setPreviewOpen(false);
              void load();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Send failed"))
            .finally(() => setBusy(false));
        }}
      />
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { contactSafetyWarnings, isRecipientBlocked } from "@/lib/demand-pool/format";
import type { PrepareRecommendationResult, PropertyRecommendation, RecommendationTier } from "@/lib/demand-pool/types";
import { MatchTierBadge } from "./badges";

export function RecommendationPreviewModal({
  open,
  onClose,
  propertyLabel,
  propertyMeta,
  recipients,
  prepared,
  providerConfigured,
  confirming,
  onConfirmSend,
  onCopy,
  onOpenWhatsApp,
  onMarkSent,
}: {
  open: boolean;
  onClose: () => void;
  propertyLabel: string;
  propertyMeta: string;
  recipients: PropertyRecommendation[];
  prepared: PrepareRecommendationResult | null;
  providerConfigured: boolean;
  confirming: boolean;
  onConfirmSend: () => void;
  onCopy: (message: string) => void;
  onOpenWhatsApp: (url: string) => void;
  onMarkSent: () => void;
}) {
  const [message, setMessage] = useState(prepared?.message ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const tierCounts = useMemo(() => {
    const counts: Record<RecommendationTier, number> = { EXACT: 0, STRONG: 0, STRETCH: 0, LOW: 0 };
    for (const r of recipients) counts[r.tier] += 1;
    return counts;
  }, [recipients]);

  const warnings = recipients.flatMap((r) =>
    contactSafetyWarnings({
      doNotContact: r.customerContact?.doNotContact,
      whatsAppOptOut: r.customerContact?.whatsAppOptOut,
      lastContactedAt: r.customerContact?.lastContactedAt ?? r.lead?.lastContactedAt,
    })
  );
  const excluded = recipients.filter((r) =>
    isRecipientBlocked({
      doNotContact: r.customerContact?.doNotContact,
      whatsAppOptOut: r.customerContact?.whatsAppOptOut,
    })
  ).length;

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Property recommendation">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-[#1B2430]">{propertyLabel}</p>
            <p className="text-xs text-[#596579]">{propertyMeta}</p>
          </div>
          <p className="text-sm text-[#596579]">
            Recipients: <strong className="text-[#1B2430]">{recipients.length}</strong>
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <MatchTierBadge tier="EXACT" /> <span>{tierCounts.EXACT}</span>
            <MatchTierBadge tier="STRONG" /> <span>{tierCounts.STRONG}</span>
            <MatchTierBadge tier="STRETCH" /> <span>{tierCounts.STRETCH}</span>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#596579]">Message</span>
            <Textarea
              aria-label="Recommendation message"
              rows={8}
              value={message || prepared?.message || ""}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {prepared?.publicUrl && (
            <p className="text-xs text-[#596579]">
              Safe property link:{" "}
              <a className="font-semibold text-[#3366FF]" href={prepared.publicUrl} target="_blank" rel="noreferrer">
                {prepared.publicUrl}
              </a>
            </p>
          )}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
              <p className="font-semibold">Contact safety</p>
              <ul className="mt-1 list-disc pl-4">
                {[...new Set(warnings)].map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {excluded > 0 && <p className="mt-1">{excluded} recipient(s) excluded due to opt-out / DNC policy.</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => onCopy(message || prepared?.message || "")}
            >
              Copy Message
            </Button>
            {prepared?.clickToChatUrl && (
              <Button
                variant="whatsapp"
                onClick={() => {
                  onOpenWhatsApp(prepared.clickToChatUrl!);
                  onMarkSent();
                }}
              >
                Open WhatsApp
              </Button>
            )}
            {providerConfigured && (
              <Button onClick={() => setConfirmOpen(true)}>Send</Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm send">
        <div className="space-y-3 text-sm text-[#596579]">
          <p>
            You are about to send this property recommendation to <strong className="text-[#1B2430]">{recipients.length}</strong> customers.
          </p>
          <ul className="space-y-1 text-xs">
            <li>Exact: {tierCounts.EXACT}</li>
            <li>Strong: {tierCounts.STRONG}</li>
            <li>Stretch: {tierCounts.STRETCH}</li>
          </ul>
          {(warnings.length > 0 || excluded > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Warnings: {[...new Set(warnings)].slice(0, 3).join("; ") || "none"}
              {excluded > 0 ? ` · ${excluded} excluded due to opt-out` : ""}
            </div>
          )}
          <div className="flex gap-2">
            <Button loading={confirming} onClick={onConfirmSend}>
              Confirm send
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

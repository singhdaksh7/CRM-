"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LinkButton, Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Plus, Copy, Send, Ban, Eye, ExternalLink, MessageCircle } from "lucide-react";
import type { CatalogueShare, CatalogueShareProperty, CatalogueStatus, Property } from "@prisma/client";

type CatalogueWithProperties = CatalogueShare & { properties: (CatalogueShareProperty & { property: Property })[]; createdBy: { id: string; name: string } | null };

const STATUS_TONE: Record<CatalogueStatus, "green" | "slate" | "red"> = {
  ACTIVE: "green",
  EXPIRED: "slate",
  REVOKED: "red",
};

/**
 * Catalogues tab with Cloud API send coexistence + manual wa.me fallback.
 * Recipient number comes from LeadPhone / primary phone (explicit selection).
 * Never auto-sends; human presses Send in WhatsApp.
 */
export function CataloguesTab({
  leadId,
  canManage,
  canSend,
  clientName,
  primaryPhone,
  phones,
}: {
  leadId: string;
  canManage: boolean;
  canSend: boolean;
  clientName?: string;
  primaryPhone?: string;
  phones?: { phone: string; label: string | null; type: string }[];
}) {
  const [catalogues, setCatalogues] = useState<CatalogueWithProperties[] | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [fallbackBusyId, setFallbackBusyId] = useState<string | null>(null);
  const [phoneForCatalogue, setPhoneForCatalogue] = useState<Record<string, string>>({});

  const phoneOptions = [
    ...(primaryPhone ? [{ label: "Primary", number: primaryPhone }] : []),
    ...(phones ?? []).map((p) => ({ label: p.label ?? p.type, number: p.phone })),
  ];

  async function load() {
    const res = await fetch(`/api/leads/${leadId}/catalogues`);
    if (res.ok) setCatalogues((await res.json()).catalogues);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  function publicUrl(token: string) {
    return `${window.location.origin}/share/catalogue/${token}`;
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(publicUrl(token));
    toast.success("Public link copied");
  }

  async function copyMessage(catalogueId: string) {
    const res = await fetch(`/api/leads/${leadId}/catalogues/${catalogueId}`);
    if (!res.ok) return toast.error("Failed to load message preview");
    const { previewMessage } = await res.json();
    navigator.clipboard.writeText(previewMessage);
    toast.success("Message copied");
  }

  async function send(catalogueId: string) {
    setSendingId(catalogueId);
    const res = await fetch(`/api/leads/${leadId}/catalogues/${catalogueId}/send`, { method: "POST" });
    setSendingId(null);
    if (res.ok) {
      const data = await res.json();
      if (data.clickToChatUrl) window.open(data.clickToChatUrl, "_blank");
      toast.success("Catalogue sent");
      load();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to send catalogue");
    }
  }

  async function openWhatsAppFallback(catalogue: CatalogueWithProperties) {
    const recipientPhone = phoneForCatalogue[catalogue.id] || primaryPhone || phoneOptions[0]?.number;
    if (!recipientPhone) return toast.error("No phone number available for this lead");
    setFallbackBusyId(catalogue.id);
    const res = await fetch("/api/catalogues/whatsapp-fallback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientPhone,
        clientFirstName: (clientName ?? "there").split(" ")[0],
        cataloguePublicUrl: publicUrl(catalogue.token),
      }),
    });
    setFallbackBusyId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return toast.error(err.error ?? "Could not prepare WhatsApp link");
    }
    const data = await res.json();
    window.open(data.waMeUrl, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp opened — press Send yourself. Delivery is not marked automatically.");
  }

  async function revoke(catalogueId: string) {
    if (!confirm("Revoke this catalogue? The public link will stop showing property details.")) return;
    const res = await fetch(`/api/leads/${leadId}/catalogues/${catalogueId}/revoke`, { method: "POST" });
    if (res.ok) {
      toast.success("Catalogue revoked");
      load();
    } else toast.error("Failed to revoke catalogue");
  }

  if (catalogues === null) return <LoadingState label="Loading catalogues..." />;

  return (
    <div className="space-y-4">
      {canManage && (
        <LinkButton href={`/leads/${leadId}/match`}>
          <Plus className="h-4 w-4" /> Build New Catalogue
        </LinkButton>
      )}

      {catalogues.length === 0 ? (
        <EmptyState title="No catalogues yet" description="Build a property catalogue to share a trackable, mobile-friendly link with this client." />
      ) : (
        <div className="space-y-3">
          {catalogues.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    {c.title}
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </p>
                  <p className="text-xs text-slate-400">
                    {c.properties.length} propert{c.properties.length === 1 ? "y" : "ies"} &middot; created {formatDate(c.createdAt)}
                    {c.createdBy && ` by ${c.createdBy.name}`}
                    {c.expiresAt && ` · expires ${formatDate(c.expiresAt)}`}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Eye className="h-3 w-3" /> {c.viewCount} view{c.viewCount === 1 ? "" : "s"}
                    {c.lastViewedAt && ` · last viewed ${formatDateTime(c.lastViewedAt)}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={publicUrl(c.token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Public Page
                </a>
                <Button size="sm" variant="secondary" onClick={() => copyLink(c.token)}>
                  <Copy className="h-3.5 w-3.5" /> Copy Link
                </Button>
                <Button size="sm" variant="secondary" onClick={() => copyMessage(c.id)}>
                  <Copy className="h-3.5 w-3.5" /> Copy Message
                </Button>
                {canSend && c.status === "ACTIVE" && (
                  <Button size="sm" onClick={() => send(c.id)} loading={sendingId === c.id}>
                    <Send className="h-3.5 w-3.5" /> Send via Cloud API
                  </Button>
                )}
                {canSend && c.status === "ACTIVE" && (
                  <>
                    {phoneOptions.length > 1 && (
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                        value={phoneForCatalogue[c.id] ?? primaryPhone ?? ""}
                        onChange={(e) => setPhoneForCatalogue((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        aria-label="WhatsApp recipient number"
                      >
                        {phoneOptions.map((p) => (
                          <option key={p.number} value={p.number}>
                            {p.label}: {p.number}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => openWhatsAppFallback(c)} loading={fallbackBusyId === c.id}>
                      <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp &amp; Send
                    </Button>
                  </>
                )}
                {canManage && c.status === "ACTIVE" && (
                  <Button size="sm" variant="danger" onClick={() => revoke(c.id)}>
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

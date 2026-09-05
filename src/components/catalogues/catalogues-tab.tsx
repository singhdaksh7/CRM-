"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LinkButton, Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Plus, Copy, Send, Ban, Eye, ExternalLink, MessageCircle, Pencil, X } from "lucide-react";
import type { CatalogueShare, CatalogueShareProperty, CatalogueStatus, Property } from "@prisma/client";
import { EditCatalogueDialog } from "@/components/catalogues/edit-catalogue-dialog";

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
  providerSendConfigured,
}: {
  leadId: string;
  canManage: boolean;
  canSend: boolean;
  clientName?: string;
  primaryPhone?: string;
  phones?: { phone: string; label: string | null; type: string }[];
  providerSendConfigured: boolean;
}) {
  const [catalogues, setCatalogues] = useState<CatalogueWithProperties[] | null>(null);
  const [shareCatalogue, setShareCatalogue] = useState<CatalogueWithProperties | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
                  <>
                    <Button size="sm" onClick={() => setShareCatalogue(c)} disabled={!providerSendConfigured} title={!providerSendConfigured ? "CRM WhatsApp sending is not configured" : undefined}><Send className="h-3.5 w-3.5" /> Send from CRM</Button>
                    <Button size="sm" variant="secondary" onClick={() => setShareCatalogue(c)}><MessageCircle className="h-3.5 w-3.5" /> Open in WhatsApp</Button>
                  </>
                )}
                {canManage && c.status === "ACTIVE" && (
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(c.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit Catalogue
                  </Button>
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

      {editingId && (
        <EditCatalogueDialog
          open
          onClose={() => setEditingId(null)}
          leadId={leadId}
          catalogueId={editingId}
          onSaved={load}
        />
      )}
      {!providerSendConfigured && catalogues.some((c) => c.status === "ACTIVE") && <p className="text-xs text-slate-500">CRM WhatsApp sending is not configured. You can still use Open in WhatsApp.</p>}
      {shareCatalogue && <CatalogueShareDialog catalogue={shareCatalogue} leadId={leadId} clientName={clientName ?? "Customer"} phoneOptions={phoneOptions} providerSendConfigured={providerSendConfigured} onClose={() => setShareCatalogue(null)} onSent={load} />}
    </div>
  );
}

function CatalogueShareDialog({ catalogue, leadId, clientName, phoneOptions, providerSendConfigured, onClose, onSent }: { catalogue: CatalogueWithProperties; leadId: string; clientName: string; phoneOptions: { label: string; number: string }[]; providerSendConfigured: boolean; onClose: () => void; onSent: () => void }) {
  const usable = useMemo(() => phoneOptions.filter((p, index, all) => p.number && all.findIndex((other) => other.number === p.number) === index), [phoneOptions]);
  const [method, setMethod] = useState<"crm" | "open" | null>(null);
  const [recipient, setRecipient] = useState(usable.length === 1 ? usable[0]?.number ?? "" : "");
  const [busy, setBusy] = useState(false);
  const selected = usable.find((p) => p.number === recipient);
  async function proceed() {
    if (!method) return;
    if (!recipient) return toast.error("Select a WhatsApp number");
    setBusy(true);
    const url = method === "crm" ? `/api/leads/${leadId}/catalogues/${catalogue.id}/send` : `/api/leads/${leadId}/catalogues/${catalogue.id}/whatsapp-link`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientPhone: recipient }) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Could not share catalogue");
    if (method === "open") {
      window.open(data.waMeUrl, "_blank", "noopener,noreferrer");
      toast.success("WhatsApp opened — review and press Send yourself.");
    } else if (data.message?.status === "FAILED") {
      toast.error("CRM WhatsApp send failed. You can still open WhatsApp manually.");
    } else toast.success("Catalogue sent from CRM");
    onSent(); onClose();
  }
  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Share catalogue"><div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Share Catalogue</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>{!method ? <div className="mt-5 grid gap-3"><Button onClick={() => setMethod("crm")} disabled={!providerSendConfigured}>Send from CRM</Button><Button variant="secondary" onClick={() => setMethod("open")}>Open in WhatsApp</Button>{!providerSendConfigured && <p className="text-xs text-amber-700">CRM WhatsApp sending is not configured.</p>}<p className="text-xs text-slate-500">Opening WhatsApp prepares a message only; it never sends automatically.</p></div> : <div className="mt-5 space-y-4"><div><p className="text-sm font-medium text-slate-900">Customer</p><p className="text-sm text-slate-600">{clientName}</p></div><fieldset><legend className="text-sm font-medium text-slate-900">Select WhatsApp number</legend><div className="mt-2 space-y-2">{usable.length === 0 ? <p className="text-sm text-rose-700">No valid phone number is available for this lead.</p> : usable.map((p) => <label key={p.number} className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm"><input type="radio" name="recipient" checked={recipient === p.number} onChange={() => setRecipient(p.number)} /><span>{p.number}</span><span className="ml-auto text-xs text-slate-500">{p.label}</span></label>)}</div></fieldset>{selected && <div className="rounded-lg bg-slate-50 p-3 text-sm"><p>To: {clientName} · {selected.number}</p><p>Catalogue: {catalogue.properties.length} properties</p><p>From: {method === "crm" ? "KP Properties (configured CRM sender)" : "Your WhatsApp"}</p></div>}<div className="flex gap-2"><Button variant="secondary" onClick={() => setMethod(null)} disabled={busy}>Back</Button><Button onClick={() => void proceed()} disabled={!recipient} loading={busy}>{method === "crm" ? "Send" : "Open WhatsApp"}</Button></div></div>}</div></div>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LinkButton, Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Plus, Copy, Send, Ban, Eye, ExternalLink, MessageCircle, Pencil } from "lucide-react";
import type { CatalogueShare, CatalogueShareProperty, CatalogueStatus, Property } from "@prisma/client";
import { EditCatalogueDialog } from "@/components/catalogues/edit-catalogue-dialog";

type CatalogueWithProperties = CatalogueShare & { properties: (CatalogueShareProperty & { property: Property })[]; createdBy: { id: string; name: string } | null };

const STATUS_TONE: Record<CatalogueStatus, "green" | "slate" | "red"> = {
  ACTIVE: "green",
  EXPIRED: "slate",
  REVOKED: "red",
};

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
  const [shareRequest, setShareRequest] = useState<{ catalogue: CatalogueWithProperties; method: "crm" | "open" } | null>(null);
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  function publicUrl(token: string) {
    return `${window.location.origin}/share/catalogue/${token}`;
  }

  function copyLink(token: string) {
    void navigator.clipboard.writeText(publicUrl(token));
    toast.success("Public link copied");
  }

  async function copyMessage(catalogueId: string) {
    const res = await fetch(`/api/leads/${leadId}/catalogues/${catalogueId}`);
    if (!res.ok) return toast.error("Failed to load message preview");
    const { previewMessage } = await res.json();
    void navigator.clipboard.writeText(previewMessage);
    toast.success("Message copied");
  }

  async function revoke(catalogueId: string) {
    if (!confirm("Revoke this catalogue? The public link will stop showing property details.")) return;
    const res = await fetch(`/api/leads/${leadId}/catalogues/${catalogueId}/revoke`, { method: "POST" });
    if (res.ok) {
      toast.success("Catalogue revoked");
      void load();
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
            <div key={c.id} className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#09090B]">
                    {c.title}
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </p>
                  <p className="text-xs text-[#71717A] mt-0.5">
                    {c.properties.length} propert{c.properties.length === 1 ? "y" : "ies"} &middot; created {formatDate(c.createdAt)}
                    {c.createdBy && ` by ${c.createdBy.name}`}
                    {c.expiresAt && ` · expires ${formatDate(c.expiresAt)}`}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[#52525B]">
                    <Eye className="h-3.5 w-3.5 text-[#71717A]" /> {c.viewCount} view{c.viewCount === 1 ? "" : "s"}
                    {c.lastViewedAt && ` · last viewed ${formatDateTime(c.lastViewedAt)}`}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-[#F4F4F5] flex flex-wrap gap-2">
                <a
                  href={publicUrl(c.token)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] border border-[#E4E4E7] hover:bg-[#F4F4F5] transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Public Page
                </a>
                <Button size="sm" variant="secondary" onClick={() => copyLink(c.token)}>
                  <Copy className="h-3.5 w-3.5" /> Copy Link
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void copyMessage(c.id)}>
                  <Copy className="h-3.5 w-3.5" /> Copy Message
                </Button>
                {canSend && c.status === "ACTIVE" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setShareRequest({ catalogue: c, method: "crm" })}
                      disabled={!providerSendConfigured}
                      title={!providerSendConfigured ? "CRM WhatsApp sending is not configured" : undefined}
                    >
                      <Send className="h-3.5 w-3.5" /> Send from CRM
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setShareRequest({ catalogue: c, method: "open" })}>
                      <MessageCircle className="h-3.5 w-3.5" /> Open in WhatsApp
                    </Button>
                  </>
                )}
                {canManage && c.status === "ACTIVE" && (
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(c.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit Catalogue
                  </Button>
                )}
                {canManage && c.status === "ACTIVE" && (
                  <Button size="sm" variant="danger" onClick={() => void revoke(c.id)}>
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
      {!providerSendConfigured && catalogues.some((c) => c.status === "ACTIVE") && (
        <p className="text-xs text-[#71717A]">CRM WhatsApp sending is not configured. You can still use Open in WhatsApp.</p>
      )}
      {shareRequest && (
        <CatalogueShareDialog
          catalogue={shareRequest.catalogue}
          method={shareRequest.method}
          leadId={leadId}
          clientName={clientName ?? "Customer"}
          phoneOptions={phoneOptions}
          onClose={() => setShareRequest(null)}
          onSent={load}
        />
      )}
    </div>
  );
}

function CatalogueShareDialog({
  catalogue,
  method,
  leadId,
  clientName,
  phoneOptions,
  onClose,
  onSent,
}: {
  catalogue: CatalogueWithProperties;
  method: "crm" | "open";
  leadId: string;
  clientName: string;
  phoneOptions: { label: string; number: string }[];
  onClose: () => void;
  onSent: () => void;
}) {
  const usable = useMemo(() => phoneOptions.filter((p, index, all) => p.number && all.findIndex((other) => other.number === p.number) === index), [phoneOptions]);
  const [recipient, setRecipient] = useState(usable.length === 1 ? usable[0]?.number ?? "" : "");
  const [busy, setBusy] = useState(false);
  const selected = usable.find((p) => p.number === recipient);

  function proceed() {
    if (!recipient) return toast.error("Select a WhatsApp number");
    setBusy(true);
    const waWindow = method === "open" ? window.open("", "_blank") : null;
    if (waWindow) waWindow.opener = null;
    void (async () => {
      const url = method === "crm" ? `/api/leads/${leadId}/catalogues/${catalogue.id}/send` : `/api/leads/${leadId}/catalogues/${catalogue.id}/whatsapp-link`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientPhone: recipient }) });
      setBusy(false);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        waWindow?.close();
        return toast.error(data.error ?? "Could not share catalogue");
      }
      if (method === "open") {
        if (waWindow) waWindow.location.href = data.waMeUrl;
        else window.open(data.waMeUrl, "_blank", "noopener,noreferrer");
        toast.success("WhatsApp opened — review and press Send yourself.");
      } else if (data.message?.status === "FAILED") {
        toast.error("CRM WhatsApp send failed. You can still open WhatsApp manually.");
      } else toast.success("Catalogue sent from CRM");
      onSent();
      onClose();
    })();
  }

  return (
    <Dialog open onClose={onClose} title={method === "crm" ? "Send Catalogue" : "Open Catalogue in WhatsApp"}>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">Customer</p>
          <p className="text-sm font-semibold text-[#09090B] mt-0.5">{clientName}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">Select WhatsApp number</p>
          <div className="space-y-2">
            {usable.length === 0 ? (
              <p className="text-xs text-red-600">No valid phone number is available for this lead.</p>
            ) : (
              usable.map((p) => (
                <label key={p.number} className="flex min-h-11 items-center gap-3 rounded-lg border border-[#E4E4E7] p-3 text-sm cursor-pointer hover:bg-[#FAFAFA]">
                  <input
                    type="radio"
                    name="recipient"
                    checked={recipient === p.number}
                    onChange={() => setRecipient(p.number)}
                    className="text-[#0A0A0A] focus:ring-[#0A0A0A]"
                  />
                  <span className="font-semibold text-[#09090B]">{p.number}</span>
                  <span className="ml-auto text-xs text-[#71717A]">{p.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
        {selected && (
          <div className="rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] p-3 text-xs text-[#52525B] space-y-1">
            <p><span className="font-medium text-[#09090B]">To:</span> {clientName} · {selected.number}</p>
            <p><span className="font-medium text-[#09090B]">Catalogue:</span> {catalogue.properties.length} properties</p>
            <p><span className="font-medium text-[#09090B]">Sender:</span> {method === "crm" ? "KP Properties (configured CRM sender)" : "Your WhatsApp"}</p>
          </div>
        )}
        {method === "open" && (
          <p className="text-xs text-[#71717A]">WhatsApp will open with a prepared message. Review it and press Send yourself.</p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-[#E4E4E7]">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void proceed()} disabled={!recipient} loading={busy}>
            {method === "crm" ? "Send" : "Open WhatsApp"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

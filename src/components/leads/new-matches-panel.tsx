"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Recommendation = {
  id: string;
  score: number;
  property: {
    id: string;
    propertyCode: string;
    title: string;
    area: string;
    bhk: number;
    monthlyRent: number | null;
    salePrice: number | null;
    listingType: string;
    inventorySource: string;
    status: string;
    coverImage: string | null;
    lastVerifiedAt: Date | null;
    pendingVerification: boolean;
  };
};

type Catalogue = { id: string; title: string; version: number };

export function NewMatchesPanel({
  leadId,
  recommendations,
  catalogues,
  canManage,
  providerSendConfigured,
}: {
  leadId: string;
  recommendations: Recommendation[];
  catalogues: Catalogue[];
  canManage: boolean;
  providerSendConfigured: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [catalogueId, setCatalogueId] = useState(catalogues[0]?.id ?? "");
  const [suggestion, setSuggestion] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  if (!recommendations.length) return null;

  async function ignore(ids: string[]) {
    const res = await fetch("/api/match-recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendationIds: ids, action: "IGNORE" }),
    });
    if (res.ok) {
      toast.success("Match ignored");
      router.refresh();
    } else {
      toast.error("Could not ignore match");
    }
  }

  async function approve(ids: string[]) {
    if (!catalogueId) return toast.error("Create or select an active catalogue first");
    const res = await fetch("/api/match-recommendations/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogueId, recommendationIds: ids }),
    });
    const data = await res.json();
    if (res.ok) {
      setSuggestion(data.suggestedWhatsAppMessage);
      toast.success(`${data.added} properties added in catalogue v${data.version}`);
      router.refresh();
    } else {
      toast.error(data.error ?? "Approval failed");
    }
  }

  async function sendExplicitly() {
    const res = await fetch(`/api/leads/${leadId}/whatsapp/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: suggestion, messageType: "TEXT" }),
    });
    if (res.ok) {
      toast.success("WhatsApp message sent");
    } else {
      toast.error("Provider send failed");
    }
  }

  return (
    <section className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E4E4E7] pb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#09090B]">
            New Matches &middot; {recommendations.length}
          </h3>
          <p className="text-xs text-[#71717A]">Pending algorithm recommendation candidates for this client</p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-[#09090B]"
              value={catalogueId}
              onChange={(e) => setCatalogueId(e.target.value)}
            >
              {catalogues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} &middot; v{c.version}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg bg-[#0A0A0A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#27272A] border border-[#0A0A0A] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              disabled={selected.length === 0}
              onClick={() => approve(selected)}
            >
              Add Selected ({selected.length})
            </button>
            <button
              className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#09090B] transition-colors cursor-pointer disabled:opacity-50"
              disabled={selected.length === 0}
              onClick={() => ignore(selected)}
            >
              Ignore Selected
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((r) => {
          const p = r.property;
          const price = p.listingType === "RENT" ? p.monthlyRent : p.salePrice;
          const warnings = [
            !p.coverImage && "No photo",
            p.pendingVerification && "Pending verification",
            !p.lastVerifiedAt && "Not recently verified",
          ].filter(Boolean);

          return (
            <article key={r.id} className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3.5 space-y-2 hover:border-[#D4D4D8] transition-colors">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSet.has(r.id)}
                  onChange={(e) =>
                    setSelected((v) => (e.target.checked ? [...v, r.id] : v.filter((x) => x !== r.id)))
                  }
                  className="mt-1 h-4 w-4 rounded border-[#E4E4E7] text-[#0A0A0A] focus:ring-[#0A0A0A]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-[#09090B]">{p.title || p.propertyCode}</span>
                    <Badge tone="blue">{r.score}% Match</Badge>
                  </div>
                  <p className="text-xs text-[#52525B] mt-0.5">
                    {p.bhk} BHK &middot; {p.area} &middot;{" "}
                    <span className="font-semibold text-[#09090B]">
                      {formatINR(price, { compact: true })}
                    </span>
                  </p>
                  <p className="text-[11px] text-[#71717A] mt-0.5">
                    {p.inventorySource} &middot; {p.status}
                  </p>
                  {warnings.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {warnings.map((w) => (
                        <span key={String(w)} className="text-[10px] font-medium text-[#B45309]">
                          &bull; {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E4E4E7] text-xs">
                <Link href={`/properties/${p.id}`} className="font-semibold text-[#09090B] hover:underline">
                  View Property &rarr;
                </Link>
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => approve([r.id])}
                      className="rounded-md bg-[#0A0A0A] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#27272A] cursor-pointer"
                    >
                      Add to Catalogue
                    </button>
                    <button
                      onClick={() => ignore([r.id])}
                      className="rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs font-medium text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#09090B] cursor-pointer"
                    >
                      Ignore
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {suggestion && (
        <div className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#09090B]">
            Catalogue updated. Send client WhatsApp update:
          </p>
          <textarea
            className="w-full rounded-lg border border-[#E4E4E7] bg-white p-3 text-xs text-[#09090B] focus:border-[#0A0A0A] focus:outline-none"
            rows={5}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] cursor-pointer"
              onClick={() => {
                navigator.clipboard.writeText(suggestion);
                toast.success("Copied to clipboard");
              }}
            >
              Copy
            </button>
            <a
              className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-1.5 text-xs font-semibold text-[#15803D] hover:bg-[#DCFCE7] transition-colors"
              href={`https://wa.me/?text=${encodeURIComponent(suggestion)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open WhatsApp
            </a>
            {providerSendConfigured && (
              <button
                className="rounded-lg bg-[#0A0A0A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#27272A] cursor-pointer"
                onClick={sendExplicitly}
              >
                Send via provider
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

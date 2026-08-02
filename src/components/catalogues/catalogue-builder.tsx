"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/form";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { formatINR, enumToLabel } from "@/lib/utils";
import { CheckCircle2, Circle, ArrowUp, ArrowDown, Sparkles, Copy, Send, ExternalLink } from "lucide-react";
import type { Lead, Property } from "@prisma/client";

interface MatchResult {
  property: Property;
  score: number;
  aboveBudget: boolean;
  budgetTier: string;
}

interface SelectedProperty {
  propertyId: string;
  property: Property;
  customNote: string;
}

interface CreatedCatalogue {
  id: string;
  token: string;
  previewMessage: string;
  publicUrl: string;
}

export function CatalogueBuilder({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedProperty[]>([]);
  const [title, setTitle] = useState(`Shortlist for ${lead.clientName}`);
  const [introMessage, setIntroMessage] = useState("");
  const [includePrice, setIncludePrice] = useState(true);
  const [includeAddress, setIncludeAddress] = useState(false);
  const [includeBrokerage, setIncludeBrokerage] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedCatalogue | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch matches once on mount
    setLoading(true);
    fetch(`/api/leads/${lead.id}/match?tolerance=0.2`)
      .then((r) => r.json())
      .then((data) => setMatches(data.matches))
      .finally(() => setLoading(false));
  }, [lead.id]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.propertyId)), [selected]);

  function toggle(m: MatchResult) {
    if (selectedIds.has(m.property.id)) {
      setSelected((prev) => prev.filter((s) => s.propertyId !== m.property.id));
    } else {
      setSelected((prev) => [...prev, { propertyId: m.property.id, property: m.property, customNote: "" }]);
    }
  }

  function move(index: number, direction: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setNote(propertyId: string, note: string) {
    setSelected((prev) => prev.map((s) => (s.propertyId === propertyId ? { ...s, customNote: note } : s)));
  }

  async function createCatalogue() {
    if (selected.length === 0) return toast.error("Select at least one property");
    if (!title.trim()) return toast.error("Title is required");

    setCreating(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/catalogues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          introMessage: introMessage || null,
          includePrice,
          includeAddress,
          includeBrokerage,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          properties: selected.map((s, i) => ({ propertyId: s.propertyId, sortOrder: i, customNote: s.customNote || null, priceVisible: true, addressVisible: true, brokerageVisible: true })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create catalogue");
      }
      const { catalogue } = await res.json();
      const previewRes = await fetch(`/api/leads/${lead.id}/catalogues/${catalogue.id}`);
      const previewData = await previewRes.json();
      setCreated({ id: catalogue.id, token: catalogue.token, previewMessage: previewData.previewMessage, publicUrl: `${window.location.origin}/share/catalogue/${catalogue.token}` });
      toast.success("Catalogue created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create catalogue");
    } finally {
      setCreating(false);
    }
  }

  async function sendNow() {
    if (!created) return;
    setSending(true);
    const res = await fetch(`/api/leads/${lead.id}/catalogues/${created.id}/send`, { method: "POST" });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      if (data.clickToChatUrl) window.open(data.clickToChatUrl, "_blank");
      toast.success("Catalogue sent");
      router.push(`/leads/${lead.id}`);
      router.refresh();
    } else {
      toast.error("Failed to send catalogue");
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 text-sm font-semibold text-emerald-800">Catalogue created</p>
          <p className="text-xs text-emerald-600">Share it now, or copy the link/message for later.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-slate-500">Message Preview</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">{created.previewMessage}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(created.publicUrl); toast.success("Link copied"); }}>
              <Copy className="h-3.5 w-3.5" /> Copy Link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(created.previewMessage); toast.success("Message copied"); }}>
              <Copy className="h-3.5 w-3.5" /> Copy Message
            </Button>
            <a href={created.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              <ExternalLink className="h-3.5 w-3.5" /> Preview Public Page
            </a>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={sendNow} loading={sending} className="flex-1 justify-center">
            <Send className="h-4 w-4" /> Send Now
          </Button>
          <LinkButton href={`/leads/${lead.id}`} variant="secondary">Back to Lead</LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Sparkles className="h-4 w-4 text-indigo-500" /> {matches?.length ?? 0} matching properties &middot; {selected.length} selected
          </p>
        </div>

        {loading && <LoadingState label="Finding matching properties..." />}
        {!loading && matches?.length === 0 && <EmptyState title="No matches found" description="Try the Property Matching screen with a higher budget tolerance, or add more inventory." />}

        <div className="space-y-2">
          {matches?.map((m) => (
            <button
              key={m.property.id}
              onClick={() => toggle(m)}
              className={`flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition-colors ${
                selectedIds.has(m.property.id) ? "border-indigo-400 ring-1 ring-indigo-400" : "border-slate-200"
              }`}
            >
              {selectedIds.has(m.property.id) ? <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-indigo-600" /> : <Circle className="mt-1 h-5 w-5 shrink-0 text-slate-300" />}
              <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {m.property.coverImage && <Image src={m.property.coverImage} alt={m.property.title} fill className="object-cover" unoptimized />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">{m.property.title}</p>
                  <Badge tone={m.score >= 75 ? "green" : m.score >= 50 ? "amber" : "red"}>{m.score}% match</Badge>
                </div>
                <p className="text-xs text-slate-500">{m.property.area}, Delhi &middot; {m.property.bhk} BHK &middot; {enumToLabel(m.property.furnishing)}</p>
                <p className="text-sm font-medium text-indigo-600">
                  {m.property.listingType === "RENT" ? formatINR(m.property.monthlyRent, { suffix: "month" }) : formatINR(m.property.salePrice, { compact: true })}
                  {m.aboveBudget && <Badge tone="amber" className="ml-2">{m.budgetTier}</Badge>}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="sticky top-20 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Catalogue Details</h3>
            <Field label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Intro Message" hint="Optional - overrides the default requirement summary line">
              <Textarea rows={2} value={introMessage} onChange={(e) => setIntroMessage(e.target.value)} />
            </Field>
            <Field label="Expires On" hint="Optional">
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
            <div className="mt-2 space-y-2">
              <Checkbox label="Include price" checked={includePrice} onChange={(e) => setIncludePrice(e.target.checked)} />
              <Checkbox label="Include approximate address" checked={includeAddress} onChange={(e) => setIncludeAddress(e.target.checked)} />
              <Checkbox label="Include brokerage" checked={includeBrokerage} onChange={(e) => setIncludeBrokerage(e.target.checked)} />
            </div>
          </div>

          {selected.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Selected Properties ({selected.length})</h3>
              <div className="space-y-2">
                {selected.map((s, i) => (
                  <div key={s.propertyId} className="rounded-lg border border-slate-100 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium text-slate-700">{i + 1}. {s.property.title}</p>
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => move(i, 1)} disabled={i === selected.length - 1} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <Input
                      value={s.customNote}
                      onChange={(e) => setNote(s.propertyId, e.target.value)}
                      placeholder="Custom note for this property (optional)"
                      className="mt-1.5 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={createCatalogue} loading={creating} disabled={selected.length === 0} className="w-full justify-center">
            Create Catalogue
          </Button>
        </div>
      </div>
    </div>
  );
}

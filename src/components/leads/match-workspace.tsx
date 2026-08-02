"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { formatINR, enumToLabel } from "@/lib/utils";
import { CheckCircle2, Circle, Send, Sparkles } from "lucide-react";
import type { Property } from "@prisma/client";

interface MatchResult {
  property: Property;
  score: number;
  reasons: { label: string; matched: boolean; detail: string }[];
  aboveBudget: boolean;
  budgetTier: string;
}

interface LeadSummary {
  id: string;
  clientName: string;
  phone: string;
  preferredLocation: string;
  preferredBhk: number | null;
  minBudget: number;
  maxBudget: number;
  requirementType: string;
}

export function MatchWorkspace({ lead }: { lead: LeadSummary }) {
  const router = useRouter();
  const [tolerance, setTolerance] = useState("0.2");
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [messageEdited, setMessageEdited] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount/on-deps-change pattern; deps array prevents loops
    setLoading(true);
    fetch(`/api/leads/${lead.id}/match?tolerance=${tolerance}`)
      .then((r) => r.json())
      .then((data) => setMatches(data.matches))
      .finally(() => setLoading(false));
  }, [lead.id, tolerance]);

  const selectedProperties = useMemo(() => (matches ?? []).filter((m) => selected.has(m.property.id)).map((m) => m.property), [matches, selected]);

  const generatedMessage = useMemo(() => {
    if (selectedProperties.length === 0) return "";
    const lines: string[] = [];
    lines.push(`Hello ${lead.clientName},`);
    lines.push("");
    lines.push(
      `Based on your requirement for a ${lead.preferredBhk ? lead.preferredBhk + " BHK" : ""} property in ${lead.preferredLocation} within a budget of ${formatINR(lead.minBudget, { compact: true })} - ${formatINR(lead.maxBudget, { compact: true })}, we have shortlisted the following options:`
    );
    lines.push("");
    selectedProperties.forEach((p, i) => {
      const price = p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true });
      lines.push(`${i + 1}. ${p.title}`);
      lines.push(`   Location: ${p.area}, Delhi`);
      lines.push(`   Rent/Price: ${price}`);
      lines.push(`   Furnishing: ${enumToLabel(p.furnishing)}`);
      lines.push(`   Property Link: ${typeof window !== "undefined" ? window.location.origin : ""}/p/${p.id}`);
      lines.push("");
    });
    lines.push("Please review these options and let us know which properties you would like to visit.");
    lines.push("");
    lines.push("Regards,");
    lines.push("Delhi Broker CRM");
    return lines.join("\n");
  }, [selectedProperties, lead]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the editable message textarea with the generated preview until the user edits it
    if (!messageEdited) setMessage(generatedMessage);
  }, [generatedMessage, messageEdited]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMessageEdited(false);
  }

  async function shareOnWhatsApp() {
    if (selectedProperties.length === 0) return toast.error("Select at least one property");
    setSharing(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyIds: selectedProperties.map((p) => p.id),
          customMessage: message,
        }),
      });
      if (!res.ok) throw new Error("Failed to record share");
      const data = await res.json();
      window.open(data.whatsappLink, "_blank");
      toast.success("Opened WhatsApp share link");
      router.refresh();
    } catch {
      toast.error("Sharing failed");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
        <div>
          <h2 className="text-[#F8FAFC] font-bold text-base">Matching Property Inventory</h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            {lead.clientName} &middot; {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any BHK"} &middot; {lead.preferredLocation} &middot; {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#94A3B8]">Budget Tolerance:</span>
          <Select value={tolerance} onChange={(e) => setTolerance(e.target.value)} className="w-auto text-xs font-semibold">
            <option value="0">Strict (0%)</option>
            <option value="0.1">±10%</option>
            <option value="0.2">±20%</option>
            <option value="0.3">±30%</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Computing property match scores..." />
      ) : !matches || matches.length === 0 ? (
        <EmptyState title="No matching properties found" description="Try increasing the budget tolerance or modifying lead preferences." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {matches.map((m) => {
              const isSelected = selected.has(m.property.id);
              const price = m.property.listingType === "RENT" ? formatINR(m.property.monthlyRent, { suffix: "month" }) : formatINR(m.property.salePrice, { compact: true });

              return (
                <div
                  key={m.property.id}
                  onClick={() => toggle(m.property.id)}
                  className={`cursor-pointer overflow-hidden rounded-xl border transition-all ${
                    isSelected ? "border-[#4F8CFF] bg-[#1E2533] shadow-md" : "border-[rgba(255,255,255,0.08)] bg-[#181E2A] hover:border-[rgba(255,255,255,0.14)]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="relative h-40 sm:h-auto sm:w-48 bg-[#11151F] shrink-0">
                      {m.property.coverImage ? (
                        <Image src={m.property.coverImage} alt={m.property.title} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-[#64748B]">No Image</div>
                      )}
                      <div className="absolute left-2 top-2 z-10">
                        {isSelected ? <CheckCircle2 className="h-6 w-6 text-[#4F8CFF] bg-[#11151F] rounded-full" /> : <Circle className="h-6 w-6 text-[#94A3B8]" />}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs text-[#94A3B8]">{m.property.propertyCode}</span>
                            <h3 className="font-bold text-[#F8FAFC] text-base leading-snug">{m.property.title}</h3>
                          </div>
                          <span className="shrink-0 text-base font-extrabold text-[#4F8CFF]">{price}</span>
                        </div>

                        <p className="mt-1 text-xs text-[#94A3B8] font-medium">{m.property.area}, Delhi &middot; {m.property.bhk} BHK &middot; {enumToLabel(m.property.furnishing)}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <Badge tone={m.score >= 80 ? "green" : m.score >= 50 ? "amber" : "slate"}>
                            {m.score}% Match Score
                          </Badge>
                          {m.aboveBudget && <Badge tone="amber">Above Target Budget</Badge>}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[rgba(255,255,255,0.06)] pt-2.5 text-xs">
                          {m.reasons.map((r, i) => (
                            <span key={i} className={`flex items-center gap-1 font-medium ${r.matched ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                              {r.matched ? "✓" : "✗"} {r.detail}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="sticky top-20 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#F8FAFC] flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-[#4F8CFF]" /> WhatsApp Preview
                </h3>
                <span className="text-xs font-semibold text-[#94A3B8]">{selected.size} selected</span>
              </div>

              <Textarea
                rows={12}
                value={message}
                onChange={(e) => { setMessage(e.target.value); setMessageEdited(true); }}
                placeholder="Select properties on the left to auto-generate a shareable client message..."
                className="text-xs leading-relaxed font-mono"
              />

              <Button variant="whatsapp" className="w-full justify-center text-sm py-2.5 font-bold" onClick={shareOnWhatsApp} loading={sharing} disabled={selected.size === 0}>
                <Send className="h-4 w-4" /> Share Selected via WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

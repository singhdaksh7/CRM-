"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requirementMessage, sanitizeRequirement } from "@/lib/requirement-network";

type Partner = { id: string; name: string; localities: string };
type PropertyOption = { id: string; propertyCode: string; title: string; partnerId: string | null };
type Recipient = { inventoryPartnerId: string; inventoryPartner: { name: string } };
type Row = {
  lead: {
    id: string;
    clientName: string;
    preferredLocation: string;
    preferredBhk: number | null;
    minBudget: number;
    maxBudget: number;
    requirementType: string;
    furnishingPref: string | null;
    assetClass?: string | null;
    commercialPropertyType?: string | null;
    minAreaSqft?: number | null;
    maxAreaSqft?: number | null;
    nextFollowUpAt: Date | null;
    assignedTo: { id: string; name: string } | null;
    requirementBroadcasts: { id: string; status: string; recipients: Recipient[] }[];
    matchRecommendations: { id: string }[];
  };
  matchCount: number;
  status: string;
};

/** Preview uses the exact sanitizer the API persists, so what a user copies is what gets broadcast - including the commercial asset class. */
function sanitizedMessage(row: Row) {
  const lead = row.lead;
  return requirementMessage(
    sanitizeRequirement({
      requirementType: lead.requirementType as never,
      preferredLocation: lead.preferredLocation,
      minBudget: lead.minBudget,
      maxBudget: lead.maxBudget,
      preferredBhk: lead.preferredBhk,
      furnishingPref: (lead.furnishingPref ?? null) as never,
      moveInDate: null,
      assetClass: (lead.assetClass ?? "RESIDENTIAL") as never,
      commercialPropertyType: (lead.commercialPropertyType ?? null) as never,
      minAreaSqft: lead.minAreaSqft ?? null,
      maxAreaSqft: lead.maxAreaSqft ?? null,
    })
  );
}

/** Commercial requirements have no BHK - showing "Any BHK" for them was misleading. */
function requirementLabel(lead: Row["lead"]) {
  if (lead.assetClass === "COMMERCIAL") return `${(lead.commercialPropertyType ?? "Commercial").replace(/_/g, " ")} · ${lead.preferredLocation}`;
  return `${lead.preferredBhk ?? "Any"} BHK · ${lead.preferredLocation}`;
}

export function RequirementBoard({ rows, partners, properties }: { rows: Row[]; partners: Partner[]; properties: PropertyOption[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("ALL");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Row | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [respondingPartner, setRespondingPartner] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [note, setNote] = useState("");

  const visible = useMemo(() => rows.filter(row => {
    const special = filter === "NEW" ? row.lead.matchRecommendations.length > 0 : filter === "BROADCASTED" ? row.lead.requirementBroadcasts.length > 0 : filter === "FOLLOWUP" ? !!row.lead.nextFollowUpAt && new Date(row.lead.nextFollowUpAt) <= new Date() : filter === "ALL" || row.status === filter;
    return special && (!q || `${row.lead.clientName} ${row.lead.preferredLocation} ${row.lead.assignedTo?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  }), [rows, filter, q]);

  function relevant(row: Row) {
    return partners.filter(p => {
      try {
        return (JSON.parse(p.localities) as string[]).some(x => x.toLowerCase() === row.lead.preferredLocation.toLowerCase());
      } catch {
        return false;
      }
    });
  }

  function open(row: Row) {
    setActive(row);
    setSelected(relevant(row).map(p => p.id));
    setRespondingPartner(row.lead.requirementBroadcasts[0]?.recipients[0]?.inventoryPartnerId ?? "");
  }

  async function share() {
    if (!active || selected.length === 0) return toast.error("Select at least one partner");
    const res = await fetch("/api/requirements/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: active.lead.id, partnerIds: selected, status: "SHARED" })
    });
    if (res.ok) {
      toast.success("Requirement marked shared");
      setActive(null);
      router.refresh();
    } else {
      toast.error("Could not record broadcast");
    }
  }

  async function recordResponse() {
    const broadcast = active?.lead.requirementBroadcasts[0];
    if (!broadcast || !respondingPartner) return toast.error("Choose a responding partner");
    const res = await fetch(`/api/requirements/broadcasts/${broadcast.id}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId: respondingPartner, propertyId: propertyId || undefined, note: note || undefined })
    });
    if (res.ok) {
      toast.success("Partner response recorded");
      router.refresh();
    } else {
      toast.error("Could not record response");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          placeholder="Client, locality, employee…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="ALL">All Requirements</option>
          <option value="NO_MATCHES">No Matches</option>
          <option value="LIMITED_MATCHES">Limited Matches</option>
          <option value="MATCHES_AVAILABLE">Matches Available</option>
          <option value="NEW">New Matches</option>
          <option value="BROADCASTED">Broadcasted</option>
          <option value="FOLLOWUP">Needs Follow-up</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Requirement</th>
              <th className="px-4 py-3">Matches</th>
              <th className="px-4 py-3">Broadcast</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-900">
            {visible.map(row => (
              <tr key={row.lead.id} className="transition-colors hover:bg-zinc-50/60">
                <td className="px-4 py-3">
                  <Link className="font-semibold text-zinc-900 hover:underline" href={`/leads/${row.lead.id}`}>
                    {row.lead.clientName}
                  </Link>
                  <div className="text-xs text-zinc-500">{row.lead.assignedTo?.name ?? "Unassigned"}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900">{requirementLabel(row.lead)}</div>
                  <div className="text-xs text-zinc-500">₹{row.lead.minBudget.toLocaleString("en-IN")}–₹{row.lead.maxBudget.toLocaleString("en-IN")} · {row.lead.requirementType}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900">{row.matchCount}</div>
                  <div className="text-xs text-zinc-500">{row.status.replace(/_/g, " ")}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900">{row.lead.requirementBroadcasts[0]?.status ?? "Not broadcast"}</div>
                  <div className="text-xs text-zinc-500">{row.lead.matchRecommendations.length} new</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/leads/${row.lead.id}/match`}
                      className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                    >
                      View Matches
                    </Link>
                    <button
                      onClick={() => open(row)}
                      className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-2.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Broadcast / Response
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Requirement Network</h2>
                <p className="text-xs text-zinc-500">{active.lead.clientName}</p>
              </div>
              <button
                onClick={() => setActive(null)}
                className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sanitized Message</label>
              <textarea
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800 focus:outline-none"
                rows={6}
                readOnly
                value={sanitizedMessage(active)}
              />
              <button
                className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                onClick={() => navigator.clipboard.writeText(sanitizedMessage(active))}
              >
                Copy Requirement
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Select Inventory Partners</h3>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-200 p-2 space-y-1">
                {partners.map(p => (
                  <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      checked={selected.includes(p.id)}
                      onChange={e => setSelected(v => e.target.checked ? [...v, p.id] : v.filter(x => x !== p.id))}
                    />
                    <span>{p.name}</span>
                    {relevant(active).some(r => r.id === p.id) && (
                      <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">locality match</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <button
              className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800"
              onClick={share}
            >
              Mark Shared with {selected.length} partner(s)
            </button>

            {active.lead.requirementBroadcasts[0] && (
              <div className="space-y-3 border-t border-zinc-200 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Record Partner Response</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    value={respondingPartner}
                    onChange={e => setRespondingPartner(e.target.value)}
                  >
                    <option value="">Responding partner…</option>
                    {active.lead.requirementBroadcasts[0].recipients.map(r => (
                      <option key={r.inventoryPartnerId} value={r.inventoryPartnerId}>{r.inventoryPartner.name}</option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    value={propertyId}
                    onChange={e => setPropertyId(e.target.value)}
                  >
                    <option value="">No linked property</option>
                    {properties.filter(p => p.partnerId === respondingPartner).map(p => (
                      <option key={p.id} value={p.id}>{p.propertyCode} · {p.title}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Response note"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                    onClick={recordResponse}
                  >
                    Record Response
                  </button>
                  {respondingPartner && (
                    <Link
                      className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                      href={`/properties/new?inventorySource=INDIRECT&partnerId=${respondingPartner}`}
                    >
                      Quick Add Indirect Property
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

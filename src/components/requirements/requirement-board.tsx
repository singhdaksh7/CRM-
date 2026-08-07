"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Partner = { id: string; name: string; localities: string };
type PropertyOption = { id: string; propertyCode: string; title: string; partnerId: string | null };
type Recipient = { inventoryPartnerId: string; inventoryPartner: { name: string } };
type Row = {
  lead: {
    id: string; clientName: string; preferredLocation: string; preferredBhk: number | null;
    minBudget: number; maxBudget: number; requirementType: string; furnishingPref: string | null;
    nextFollowUpAt: Date | null; assignedTo: { id: string; name: string } | null;
    requirementBroadcasts: { id: string; status: string; recipients: Recipient[] }[];
    matchRecommendations: { id: string }[];
  };
  matchCount: number;
  status: string;
};

function sanitizedMessage(row: Row) {
  const lead = row.lead;
  return ["PROPERTY REQUIREMENT", lead.preferredBhk ? `${lead.preferredBhk} BHK` : null, lead.preferredLocation,
    `Budget ₹${lead.minBudget.toLocaleString("en-IN")}–₹${lead.maxBudget.toLocaleString("en-IN")}`,
    lead.furnishingPref?.replaceAll("_", " "), "Immediate Requirement"].filter(Boolean).join("\n");
}

export function RequirementBoard({ rows, partners, properties }: { rows: Row[]; partners: Partner[]; properties: PropertyOption[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("ALL"); const [q, setQ] = useState(""); const [active, setActive] = useState<Row | null>(null);
  const [selected, setSelected] = useState<string[]>([]); const [respondingPartner, setRespondingPartner] = useState(""); const [propertyId, setPropertyId] = useState(""); const [note, setNote] = useState("");
  const visible = useMemo(() => rows.filter(row => {
    const special = filter === "NEW" ? row.lead.matchRecommendations.length > 0 : filter === "BROADCASTED" ? row.lead.requirementBroadcasts.length > 0 : filter === "FOLLOWUP" ? !!row.lead.nextFollowUpAt && new Date(row.lead.nextFollowUpAt) <= new Date() : filter === "ALL" || row.status === filter;
    return special && (!q || `${row.lead.clientName} ${row.lead.preferredLocation} ${row.lead.assignedTo?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  }), [rows, filter, q]);
  function relevant(row: Row) { return partners.filter(p => { try { return (JSON.parse(p.localities) as string[]).some(x => x.toLowerCase() === row.lead.preferredLocation.toLowerCase()); } catch { return false; } }); }
  function open(row: Row) { setActive(row); setSelected(relevant(row).map(p => p.id)); setRespondingPartner(row.lead.requirementBroadcasts[0]?.recipients[0]?.inventoryPartnerId ?? ""); }
  async function share() { if (!active || selected.length === 0) return toast.error("Select at least one partner"); const res = await fetch("/api/requirements/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: active.lead.id, partnerIds: selected, status: "SHARED" }) }); if (res.ok) { toast.success("Requirement marked shared"); setActive(null); router.refresh(); } else toast.error("Could not record broadcast"); }
  async function recordResponse() { const broadcast = active?.lead.requirementBroadcasts[0]; if (!broadcast || !respondingPartner) return toast.error("Choose a responding partner"); const res = await fetch(`/api/requirements/broadcasts/${broadcast.id}/responses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partnerId: respondingPartner, propertyId: propertyId || undefined, note: note || undefined }) }); if (res.ok) { toast.success("Partner response recorded"); router.refresh(); } else toast.error("Could not record response"); }
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2"><input className="rounded border px-3 py-2" placeholder="Client, locality, employee" value={q} onChange={e => setQ(e.target.value)}/><select className="rounded border px-3" value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">All</option><option value="NO_MATCHES">No Matches</option><option value="LIMITED_MATCHES">Limited Matches</option><option value="MATCHES_AVAILABLE">Matches Available</option><option value="NEW">New Matches</option><option value="BROADCASTED">Broadcasted</option><option value="FOLLOWUP">Needs Follow-up</option></select></div>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-[#FAFBFC] text-left"><tr><th className="p-3">Client</th><th className="p-3">Requirement</th><th className="p-3">Matches</th><th className="p-3">Broadcast</th><th className="p-3">Actions</th></tr></thead><tbody>{visible.map(row => <tr className="border-t" key={row.lead.id}><td className="p-3"><Link className="font-semibold text-blue-700" href={`/leads/${row.lead.id}`}>{row.lead.clientName}</Link><div className="text-xs">{row.lead.assignedTo?.name ?? "Unassigned"}</div></td><td className="p-3">{row.lead.preferredBhk ?? "Any"} BHK · {row.lead.preferredLocation}<div className="text-xs">₹{row.lead.minBudget.toLocaleString("en-IN")}–₹{row.lead.maxBudget.toLocaleString("en-IN")} · {row.lead.requirementType}</div></td><td className="p-3">{row.matchCount}<div className="text-xs">{row.status}</div></td><td className="p-3">{row.lead.requirementBroadcasts[0]?.status ?? "Not broadcast"}<div className="text-xs">{row.lead.matchRecommendations.length} new</div></td><td className="p-3 space-x-2"><Link href={`/leads/${row.lead.id}/match`} className="text-blue-700">View Matches</Link><button onClick={() => open(row)}>Broadcast / Response</button></td></tr>)}</tbody></table></div>
    {active && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 space-y-4"><div className="flex justify-between"><h2 className="font-bold">Requirement Network · {active.lead.clientName}</h2><button onClick={() => setActive(null)}>Close</button></div><textarea className="w-full rounded border p-2" rows={7} readOnly value={sanitizedMessage(active)}/><button className="rounded border px-3 py-1" onClick={() => navigator.clipboard.writeText(sanitizedMessage(active))}>Copy Requirement</button><div><h3 className="font-semibold">Select Inventory Partners</h3>{partners.map(p => <label className="block py-1" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={e => setSelected(v => e.target.checked ? [...v, p.id] : v.filter(x => x !== p.id))}/> {p.name}{relevant(active).some(r => r.id === p.id) ? " · locality match" : ""}</label>)}</div><button className="rounded bg-blue-700 px-3 py-2 text-white" onClick={share}>Mark Shared with {selected.length} partner(s)</button>
      {active.lead.requirementBroadcasts[0] && <div className="space-y-2 border-t pt-4"><h3 className="font-semibold">Record Partner Response</h3><select className="w-full rounded border p-2" value={respondingPartner} onChange={e => setRespondingPartner(e.target.value)}><option value="">Responding partner…</option>{active.lead.requirementBroadcasts[0].recipients.map(r => <option key={r.inventoryPartnerId} value={r.inventoryPartnerId}>{r.inventoryPartner.name}</option>)}</select><select className="w-full rounded border p-2" value={propertyId} onChange={e => setPropertyId(e.target.value)}><option value="">No linked property</option>{properties.filter(p => p.partnerId === respondingPartner).map(p => <option key={p.id} value={p.id}>{p.propertyCode} · {p.title}</option>)}</select><textarea className="w-full rounded border p-2" placeholder="Response note" value={note} onChange={e => setNote(e.target.value)}/><div className="flex gap-2"><button className="rounded border px-3 py-1" onClick={recordResponse}>Record Response</button>{respondingPartner && <Link className="rounded border px-3 py-1" href={`/properties/new?inventorySource=INDIRECT&partnerId=${respondingPartner}`}>Quick Add Indirect Property</Link>}</div></div>}
    </div></div>}
  </div>;
}

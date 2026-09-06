"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Match = { score: number; lead: { id: string; clientName: string; assignedTo: { name: string } | null }; matchedRequirement: { id: string; localities: Array<{ locality: { name: string } }>; bhkValues: Array<{ bhk: number }> }; reasons: Array<{ label: string; matched: boolean; detail: string }> };

export function LeadRequirementMatches({ propertyId }: { propertyId: string }) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  useEffect(() => { void fetch(`/api/properties/${propertyId}/lead-requirements`).then((response) => response.ok ? response.json() : null).then((data) => setMatches(data?.matches ?? [])).catch(() => setMatches([])); }, [propertyId]);
  if (matches === null) return null;
  return <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3"><div><h3 className="text-sm font-semibold uppercase tracking-wider text-[#8A94A6]">Matching buyers</h3><p className="text-xs text-[#8A94A6]">Active lead requirements only</p></div>{!matches.length ? <p className="text-sm text-[#8A94A6]">No active matching buyer requirements.</p> : <div className="space-y-2">{matches.slice(0, 12).map((match) => <div key={`${match.lead.id}-${match.matchedRequirement.id}`} className="rounded-xl border border-[#E7ECF2] p-3"><div className="flex items-center justify-between gap-2"><Link href={`/leads/${match.lead.id}`} className="font-semibold text-[#3366FF]">{match.lead.clientName}</Link><strong className="text-sm">{match.score}%</strong></div><p className="mt-1 text-xs text-[#596579]">{match.matchedRequirement.bhkValues.map((item) => `${item.bhk} BHK`).join(" / ") || "Any BHK"} · {match.matchedRequirement.localities.map((item) => item.locality.name).join(" / ") || "Any locality"}</p><p className="mt-1 text-xs text-[#8A94A6]">Assigned: {match.lead.assignedTo?.name ?? "Unassigned"}</p></div>)}</div>}</section>;
}

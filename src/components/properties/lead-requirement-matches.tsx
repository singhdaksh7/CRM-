"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Sparkles } from "lucide-react";

type Match = {
  score: number;
  lead: {
    id: string;
    clientName: string;
    assignedTo: { name: string } | null;
  };
  matchedRequirement: {
    id: string;
    localities: Array<{ locality: { name: string } }>;
    bhkValues: Array<{ bhk: number }>;
  };
  reasons: Array<{ label: string; matched: boolean; detail: string }>;
};

export function LeadRequirementMatches({ propertyId }: { propertyId: string }) {
  const [matches, setMatches] = useState<Match[] | null>(null);

  useEffect(() => {
    void fetch(`/api/properties/${propertyId}/lead-requirements`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMatches(data?.matches ?? []))
      .catch(() => setMatches([]));
  }, [propertyId]);

  if (matches === null) return null;

  return (
    <section className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#09090B]" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#71717A]">
              Best Matching Leads
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-[#71717A]">
            Active buyer requirements matching this property
          </p>
        </div>
        {matches.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-[#F4F4F5] border border-[#E4E4E7] px-2.5 py-0.5 text-xs font-semibold text-[#09090B]">
            {matches.length} {matches.length === 1 ? "lead" : "leads"}
          </span>
        )}
      </div>

      {!matches.length ? (
        <p className="text-sm text-[#71717A] py-2">
          No active matching buyer requirements found for this property.
        </p>
      ) : (
        <div className="space-y-2.5">
          {matches.slice(0, 12).map((match) => (
            <div
              key={`${match.lead.id}-${match.matchedRequirement.id}`}
              className="rounded-lg border border-[#E4E4E7] p-3.5 bg-white hover:border-[#D4D4D8] hover:bg-[#FAFAFA] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/leads/${match.lead.id}`}
                  className="font-semibold text-sm text-[#09090B] hover:underline"
                >
                  {match.lead.clientName}
                </Link>
                <span className="inline-flex items-center rounded-md bg-[#F4F4F5] border border-[#E4E4E7] px-2 py-0.5 text-xs font-semibold text-[#09090B]">
                  {match.score}% match
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#52525B]">
                {match.matchedRequirement.bhkValues
                  .map((item) => `${item.bhk} BHK`)
                  .join(" / ") || "Any BHK"}{" "}
                ·{" "}
                {match.matchedRequirement.localities
                  .map((item) => item.locality.name)
                  .join(" / ") || "Any locality"}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-[#71717A]">
                <User className="h-3 w-3 text-[#A1A1AA]" />
                <span>Assigned: {match.lead.assignedTo?.name ?? "Unassigned"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

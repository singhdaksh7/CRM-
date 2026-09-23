import Link from "next/link";
import { Badge, VISIT_STATUS_TONE, LEAD_STATUS_TONE, LEAD_PRIORITY_TONE } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatDate, enumToLabel, formatINR } from "@/lib/utils";
import { QuickActions } from "./quick-actions";
import { MapPin, Clock } from "lucide-react";
import type { ExecutiveDashboardData } from "@/lib/executive-dashboard-data";
import { computeVisitProgress } from "@/lib/visits";

type Visit = ExecutiveDashboardData["todaysVisits"][number];

export function VisitCard({ visit }: { visit: Visit }) {
  const progress = computeVisitProgress(visit.properties);
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#09090B]">{visit.lead.clientName}</p>
          <p className="text-xs text-[#52525B] flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> {new Date(visit.visitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} at {visit.visitTime}</p>
          <p className="text-xs text-[#52525B] flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" />
            {progress.total} {progress.total === 1 ? "property" : "properties"}
            {progress.remaining > 0 && progress.resolved > 0 && <> &middot; {progress.remaining} remaining</>}
          </p>
          {progress.resolved > 0 && <p className="text-xs font-semibold text-[#09090B] mt-0.5">{progress.label}</p>}
        </div>
        <Badge tone={VISIT_STATUS_TONE[visit.status] ?? "slate"}>{enumToLabel(visit.status)}</Badge>
      </div>
      <QuickActions
        clientPhone={visit.lead.phone}
        ownerPhone={visit.property.ownerPhone}
        latitude={visit.property.latitude}
        longitude={visit.property.longitude}
        catalogueHref={`/leads/${visit.lead.id}`}
        leadId={visit.lead.id}
      />
      {/* Primary action: open the visit and run the on-site workflow. Large
          touch target - this card is used on a phone, in the field. */}
      <Link
        href={`/visits/${visit.id}`}
        className="flex min-h-[48px] items-center justify-center rounded-xl bg-[#0A0A0A] text-sm font-bold text-white transition-colors hover:bg-zinc-800"
      >
        Open Visit →
      </Link>
      <Link href={`/leads/${visit.lead.id}`} className="block text-center text-xs font-semibold text-[#52525B] hover:underline">Open Lead →</Link>
    </div>
  );
}

export function VisitSection({ title, visits, emptyMessage }: { title: string; visits: Visit[]; emptyMessage: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#09090B] mb-3">{title} {visits.length > 0 && <span className="text-sm font-normal text-[#52525B]">({visits.length})</span>}</h2>
      {visits.length === 0 ? (
        <EmptyState title={emptyMessage} description="" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visits.map((v) => <VisitCard key={v.id} visit={v} />)}
        </div>
      )}
    </section>
  );
}

export function RecentlyReportedSection({ items }: { items: ExecutiveDashboardData["recentlyReported"] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#09090B] mb-3">Recently Reported</h2>
      {items.length === 0 ? (
        <EmptyState title="No issues reported recently" description="" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} href={`/properties/${item.property.id}`} className="flex items-center justify-between rounded-xl border border-[#E4E4E7] bg-white p-3 hover:border-zinc-400 transition">
              <div>
                <p className="text-sm font-semibold text-[#09090B]">{item.property.title}</p>
                <p className="text-xs text-[#52525B]">{enumToLabel(item.label)} - {formatDate(item.createdAt)}</p>
              </div>
              <Badge tone={item.status === "PENDING" ? "amber" : item.status === "APPROVED" || item.status === "RESOLVED" ? "green" : "slate"}>{enumToLabel(item.status)}</Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function AssignedLeadsSection({ leads }: { leads: ExecutiveDashboardData["assignedLeads"] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#09090B] mb-3">Assigned Leads {leads.length > 0 && <span className="text-sm font-normal text-[#52525B]">({leads.length})</span>}</h2>
      {leads.length === 0 ? (
        <EmptyState title="No leads assigned yet" description="" />
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-xl border border-[#E4E4E7] bg-white p-3 hover:border-zinc-400 transition">
              <div>
                <p className="text-sm font-semibold text-[#09090B]">{lead.clientName}</p>
                <p className="text-xs text-[#52525B]">{lead.preferredLocation}</p>
              </div>
              <div className="flex gap-1.5">
                <Badge tone={LEAD_PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
                <Badge tone={LEAD_STATUS_TONE[lead.status]}>{enumToLabel(lead.status)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function AssignedCataloguesSection({ catalogues }: { catalogues: ExecutiveDashboardData["assignedCatalogues"] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#09090B] mb-3">Assigned Catalogues {catalogues.length > 0 && <span className="text-sm font-normal text-[#52525B]">({catalogues.length})</span>}</h2>
      {catalogues.length === 0 ? (
        <EmptyState title="No catalogues shared yet" description="" />
      ) : (
        <div className="space-y-2">
          {catalogues.map((c) => (
            <Link key={c.id} href={`/catalogues/${c.id}/internal`} className="flex items-center justify-between rounded-xl border border-[#E4E4E7] bg-white p-3 hover:border-zinc-400 transition">
              <div>
                <p className="text-sm font-semibold text-[#09090B]">{c.title}</p>
                <p className="text-xs text-[#52525B]">For {c.lead.clientName} - {c._count.properties} propert{c._count.properties === 1 ? "y" : "ies"}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function PropertyMiniGrid({ title, properties }: { title: string; properties: ExecutiveDashboardData["favorites"] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#09090B] mb-3">{title}</h2>
      {properties.length === 0 ? (
        <EmptyState title="Nothing here yet" description="" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {properties.map((p) => (
            <Link key={p.id} href={`/properties/${p.id}`} className="min-w-[180px] rounded-xl border border-[#E4E4E7] bg-white p-3 shadow-xs hover:border-zinc-400 transition shrink-0">
              <p className="text-sm font-semibold text-[#09090B] truncate">{p.title}</p>
              <p className="text-xs text-[#52525B] truncate">{p.area}</p>
              <p className="text-xs font-semibold text-[#09090B] mt-1">{p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true })}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

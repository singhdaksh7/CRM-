import Link from "next/link";
import { Badge, VISIT_STATUS_TONE, LEAD_STATUS_TONE, LEAD_PRIORITY_TONE } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatDate, enumToLabel, formatINR } from "@/lib/utils";
import { QuickActions } from "./quick-actions";
import { MapPin, Clock } from "lucide-react";
import type { ExecutiveDashboardData } from "@/lib/executive-dashboard-data";

type Visit = ExecutiveDashboardData["todaysVisits"][number];

export function VisitCard({ visit }: { visit: Visit }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#1B2430]">{visit.lead.clientName}</p>
          <p className="text-xs text-[#596579] flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> {new Date(visit.visitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} at {visit.visitTime}</p>
          <p className="text-xs text-[#596579] flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {visit.property.title} - {visit.property.area}</p>
        </div>
        <Badge tone={VISIT_STATUS_TONE[visit.status]}>{enumToLabel(visit.status)}</Badge>
      </div>
      <QuickActions
        clientPhone={visit.lead.phone}
        ownerPhone={visit.property.ownerPhone}
        latitude={visit.property.latitude}
        longitude={visit.property.longitude}
        catalogueHref={`/leads/${visit.lead.id}`}
      />
      <Link href={`/visits/${visit.id}`} className="block text-center text-xs font-semibold text-[#3366FF] hover:underline">Open Visit →</Link>
    </div>
  );
}

export function VisitSection({ title, visits, emptyMessage }: { title: string; visits: Visit[]; emptyMessage: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#1B2430] mb-3">{title} {visits.length > 0 && <span className="text-sm font-normal text-[#596579]">({visits.length})</span>}</h2>
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
      <h2 className="text-lg font-semibold text-[#1B2430] mb-3">Recently Reported</h2>
      {items.length === 0 ? (
        <EmptyState title="No issues reported recently" description="" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} href={`/properties/${item.property.id}`} className="flex items-center justify-between rounded-xl border border-[#E7ECF2] bg-white p-3 hover:border-[#3366FF]/40 transition">
              <div>
                <p className="text-sm font-semibold text-[#1B2430]">{item.property.title}</p>
                <p className="text-xs text-[#596579]">{enumToLabel(item.label)} - {formatDate(item.createdAt)}</p>
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
      <h2 className="text-lg font-semibold text-[#1B2430] mb-3">Assigned Leads {leads.length > 0 && <span className="text-sm font-normal text-[#596579]">({leads.length})</span>}</h2>
      {leads.length === 0 ? (
        <EmptyState title="No leads assigned yet" description="" />
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-xl border border-[#E7ECF2] bg-white p-3 hover:border-[#3366FF]/40 transition">
              <div>
                <p className="text-sm font-semibold text-[#1B2430]">{lead.clientName}</p>
                <p className="text-xs text-[#596579]">{lead.preferredLocation}</p>
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
      <h2 className="text-lg font-semibold text-[#1B2430] mb-3">Assigned Catalogues {catalogues.length > 0 && <span className="text-sm font-normal text-[#596579]">({catalogues.length})</span>}</h2>
      {catalogues.length === 0 ? (
        <EmptyState title="No catalogues shared yet" description="" />
      ) : (
        <div className="space-y-2">
          {catalogues.map((c) => (
            <Link key={c.id} href={`/catalogues/${c.id}/internal`} className="flex items-center justify-between rounded-xl border border-[#E7ECF2] bg-white p-3 hover:border-[#3366FF]/40 transition">
              <div>
                <p className="text-sm font-semibold text-[#1B2430]">{c.title}</p>
                <p className="text-xs text-[#596579]">For {c.lead.clientName} - {c._count.properties} propert{c._count.properties === 1 ? "y" : "ies"}</p>
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
      <h2 className="text-lg font-semibold text-[#1B2430] mb-3">{title}</h2>
      {properties.length === 0 ? (
        <EmptyState title="Nothing here yet" description="" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {properties.map((p) => (
            <Link key={p.id} href={`/properties/${p.id}`} className="min-w-[180px] rounded-xl border border-[#E7ECF2] bg-white p-3 shadow-xs hover:border-[#3366FF]/40 transition shrink-0">
              <p className="text-sm font-semibold text-[#1B2430] truncate">{p.title}</p>
              <p className="text-xs text-[#596579] truncate">{p.area}</p>
              <p className="text-xs font-semibold text-[#3366FF] mt-1">{p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true })}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

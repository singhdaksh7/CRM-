"use client";

import { useState } from "react";
import Link from "next/link";
import { formatINR, formatDate, formatDateTime, enumToLabel, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Building2, Calendar, CheckSquare, Activity as ActivityIcon, Users, ExternalLink } from "lucide-react";
import type { TeamReportData } from "@/lib/team-reports-data";

export function TeamReportView({ data }: { data: TeamReportData }) {
  const [tab, setTab] = useState<"overview" | "properties" | "visits" | "followups" | "activities">("overview");

  const { member, metrics, details } = data;

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-[#71717A] mb-1">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span>Properties Added</span>
          </div>
          <p className="text-2xl font-bold text-[#09090B]">{metrics.propertiesAdded}</p>
        </div>

        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-[#71717A] mb-1">
            <Calendar className="h-4 w-4 text-purple-600" />
            <span>Visits Handled</span>
          </div>
          <p className="text-2xl font-bold text-[#09090B]">{metrics.visitsCount}</p>
        </div>

        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-[#71717A] mb-1">
            <CheckSquare className="h-4 w-4 text-emerald-600" />
            <span>Follow-ups Done</span>
          </div>
          <p className="text-2xl font-bold text-[#09090B]">{metrics.followUpsCompleted}</p>
        </div>

        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-[#71717A] mb-1">
            <Users className="h-4 w-4 text-indigo-600" />
            <span>Leads Worked</span>
          </div>
          <p className="text-2xl font-bold text-[#09090B]">{metrics.leadsWorked}</p>
        </div>

        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-[#71717A] mb-1">
            <ActivityIcon className="h-4 w-4 text-amber-600" />
            <span>Activities Logged</span>
          </div>
          <p className="text-2xl font-bold text-[#09090B]">{metrics.activitiesLogged}</p>
        </div>
      </div>

      {/* Drill-down Navigation */}
      <div className="flex flex-wrap gap-1.5 border-b border-[#E4E4E7] pb-3">
        {[
          { key: "overview", label: "Overview" },
          { key: "properties", label: `Properties Added (${details.properties.length})` },
          { key: "visits", label: `Visits (${details.visits.length})` },
          { key: "followups", label: `Follow-ups Completed (${details.followUps.length})` },
          { key: "activities", label: `Activity Log (${details.activities.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
              tab === t.key
                ? "bg-[#0A0A0A] text-white shadow-2xs"
                : "text-[#52525B] hover:text-[#09090B] hover:bg-[#F4F4F5]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Drill-down Content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">Member Profile</h3>
            <div className="text-sm space-y-1">
              <p className="font-semibold text-[#09090B] text-base">{member.name}</p>
              <p className="text-xs text-[#71717A]">{member.email}</p>
              <Badge tone="indigo">{enumToLabel(member.role)}</Badge>
            </div>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">Activity Summary</h3>
            <p className="text-xs text-[#52525B] leading-relaxed">
              In this timeframe, <strong>{member.name}</strong> added {metrics.propertiesAdded} properties, executed {metrics.visitsCount} client visits, completed {metrics.followUpsCompleted} follow-up tasks, and interacted across {metrics.leadsWorked} unique leads.
            </p>
          </div>
        </div>
      )}

      {tab === "properties" && (
        <div className="rounded-xl border border-[#E4E4E7] bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E4E4E7] text-xs">
              <thead className="bg-[#FAFAFA] text-left font-semibold text-[#71717A] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Locality</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Added Date/Time</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
                {details.properties.map((p) => (
                  <tr key={p.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-medium text-[#09090B]">
                      <div className="font-semibold">{p.title}</div>
                      <div className="text-[11px] font-mono text-[#71717A]">{p.propertyCode}</div>
                    </td>
                    <td className="px-4 py-3">{p.area}</td>
                    <td className="px-4 py-3">
                      <Badge tone={p.listingType === "RENT" ? "blue" : "purple"}>
                        {p.listingType === "RENT" ? "Rent" : "Sale"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#09090B]">
                      {p.listingType === "RENT" ? formatINR(p.price, { suffix: "month" }) : formatINR(p.price, { compact: true })}
                    </td>
                    <td className="px-4 py-3">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/properties/${p.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {details.properties.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[#71717A]">
                      No properties added by this member in the selected date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "visits" && (
        <div className="rounded-xl border border-[#E4E4E7] bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E4E4E7] text-xs">
              <thead className="bg-[#FAFAFA] text-left font-semibold text-[#71717A] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Client / Lead</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
                {details.visits.map((v) => (
                  <tr key={v.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-medium text-[#09090B]">
                      <div className="font-semibold">{v.lead.clientName}</div>
                      <div className="text-[11px] text-[#71717A]">{v.lead.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#09090B]">{v.property.title}</div>
                      <div className="text-[11px] text-[#71717A]">{v.property.area}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{formatDate(v.visitDate)}</div>
                      <div className="text-[11px] text-[#71717A]">{v.visitTime}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={v.status === "COMPLETED" ? "green" : "blue"}>{enumToLabel(v.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/leads/${v.lead.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                      >
                        Lead <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {details.visits.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[#71717A]">
                      No visits assigned to this member in the selected date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "followups" && (
        <div className="rounded-xl border border-[#E4E4E7] bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E4E4E7] text-xs">
              <thead className="bg-[#FAFAFA] text-left font-semibold text-[#71717A] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Completed At</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
                {details.followUps.map((f) => (
                  <tr key={f.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-semibold text-[#09090B]">{enumToLabel(f.type)}</td>
                    <td className="px-4 py-3">
                      {f.lead ? (
                        <Link href={`/leads/${f.lead.id}`} className="text-blue-600 hover:underline font-medium">
                          {f.lead.clientName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">{formatDate(f.dueDate)}</td>
                    <td className="px-4 py-3 font-medium text-emerald-700">{formatDateTime(f.completedAt)}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-[#71717A]">{f.notes ?? "—"}</td>
                  </tr>
                ))}
                {details.followUps.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[#71717A]">
                      No follow-ups completed by this member in the selected date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "activities" && (
        <div className="rounded-xl border border-[#E4E4E7] bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E4E4E7] text-xs">
              <thead className="bg-[#FAFAFA] text-left font-semibold text-[#71717A] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Entity Linked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
                {details.activities.map((a) => (
                  <tr key={a.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-mono text-[#71717A] whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold text-[#09090B]">
                      <Badge tone="slate">{enumToLabel(a.type)}</Badge>
                    </td>
                    <td className="px-4 py-3 max-w-md">{a.description}</td>
                    <td className="px-4 py-3">
                      {a.lead ? (
                        <Link href={`/leads/${a.lead.id}`} className="text-blue-600 hover:underline">
                          Lead: {a.lead.clientName}
                        </Link>
                      ) : a.crmOwner ? (
                        <span>Owner: {a.crmOwner.name}</span>
                      ) : a.deal ? (
                        <span>Deal: {a.deal.dealCode}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {details.activities.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-[#71717A]">
                      No activities logged for this member in the selected date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

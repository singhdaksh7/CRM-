"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PhoneCall, CalendarClock, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { Badge, LEAD_STATUS_TONE } from "@/components/ui/badge";
import { FollowUpRow } from "@/components/followups/followup-row";
import { PhoneDisplay } from "./phone-display";
import { RecordCallDialog } from "./record-call-dialog";
import { formatDate, formatDateTime, formatINR, enumToLabel, timeAgo } from "@/lib/utils";
import type { DataManagerQueues, DmLeadRow, DmVisitRow, DmCompletedRow } from "@/lib/dm-queues";

const TABS = [
  { key: "todaysLeads", label: "Today's Leads" },
  { key: "pendingCalls", label: "Pending Calls" },
  { key: "callAgain", label: "Call Again" },
  { key: "visitsComing", label: "Visits / Coming" },
  { key: "completed", label: "Completed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function DmWorkTabs({ queues }: { queues: DataManagerQueues }) {
  const [tab, setTab] = useState<TabKey>("pendingCalls");
  const [callTarget, setCallTarget] = useState<{ leadId: string; clientName: string; phone: string } | null>(null);

  const counts: Record<TabKey, number> = {
    todaysLeads: queues.todaysLeads.count,
    pendingCalls: queues.pendingCalls.count,
    callAgain: queues.callAgain.count,
    visitsComing: queues.visitsComing.count,
    completed: queues.completed.count,
  };

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white shadow-2xs">
      <div role="tablist" aria-label="Data manager work queues" className="flex gap-1.5 overflow-x-auto border-b border-[#E4E4E7] p-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`dm-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`dm-tabpanel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              tab === t.key ? "bg-[#0A0A0A] text-white shadow-2xs" : "text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5]"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      <div className="p-5">
        <div role="tabpanel" id="dm-tabpanel-todaysLeads" aria-labelledby="dm-tab-todaysLeads" hidden={tab !== "todaysLeads"}>
          <LeadListPanel rows={queues.todaysLeads.rows} emptyLabel="No leads received today yet." onRecordCall={setCallTarget} />
        </div>
        <div role="tabpanel" id="dm-tabpanel-pendingCalls" aria-labelledby="dm-tab-pendingCalls" hidden={tab !== "pendingCalls"}>
          <LeadListPanel rows={queues.pendingCalls.rows} emptyLabel="All caught up — every lead has been called at least once." onRecordCall={setCallTarget} />
        </div>
        <div role="tabpanel" id="dm-tabpanel-callAgain" aria-labelledby="dm-tab-callAgain" hidden={tab !== "callAgain"}>
          <CallAgainPanel rows={queues.callAgain.rows} onRecordCall={setCallTarget} />
        </div>
        <div role="tabpanel" id="dm-tabpanel-visitsComing" aria-labelledby="dm-tab-visitsComing" hidden={tab !== "visitsComing"}>
          <VisitsComingPanel rows={queues.visitsComing.rows} />
        </div>
        <div role="tabpanel" id="dm-tabpanel-completed" aria-labelledby="dm-tab-completed" hidden={tab !== "completed"}>
          <CompletedPanel rows={queues.completed.rows} />
        </div>
      </div>

      {callTarget && (
        <RecordCallDialog
          open
          onClose={() => setCallTarget(null)}
          leadId={callTarget.leadId}
          clientName={callTarget.clientName}
          phone={callTarget.phone}
        />
      )}
    </div>
  );
}

function LeadListPanel({ rows, emptyLabel, onRecordCall }: { rows: DmLeadRow[]; emptyLabel: string; onRecordCall: (t: { leadId: string; clientName: string; phone: string }) => void }) {
  if (rows.length === 0) return <EmptyState title={emptyLabel} />;
  return (
    <div className="space-y-3">
      {rows.map((lead) => (
        <div key={lead.id} className="flex flex-col gap-3 border-b border-[#E4E4E7] pb-3.5 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#09090B]">{lead.clientName}</span>
              <Badge tone={LEAD_STATUS_TONE[lead.status] ?? "slate"}>{enumToLabel(lead.status)}</Badge>
            </div>
            <div className="mt-1">
              <PhoneDisplay phone={lead.phone} />
            </div>
            <p className="mt-1 text-xs text-[#52525B]">
              {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredLocation} &middot;{" "}
              <span className="font-semibold text-[#09090B]">
                {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-[#71717A]">
              {enumToLabel(lead.source)} &middot; {lead.assignedToName ?? "Unassigned"} &middot; Received {timeAgo(lead.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRecordCall({ leadId: lead.id, clientName: lead.clientName, phone: lead.phone })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#27272A] border border-[#0A0A0A] shadow-2xs transition-colors cursor-pointer"
            >
              <PhoneCall className="h-3.5 w-3.5" /> Record Call
            </button>
            <Link href={`/leads/${lead.id}`} className="inline-flex items-center rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] hover:border-[#D4D4D8] transition-colors">
              Open Lead
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function CallAgainPanel({ rows, onRecordCall }: { rows: import("@/lib/dm-queues").DmCallAgainRow[]; onRecordCall: (t: { leadId: string; clientName: string; phone: string }) => void }) {
  const { overdue, dueToday, upcoming } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return {
      overdue: rows.filter((r) => r.isOverdue),
      dueToday: rows.filter((r) => !r.isOverdue && new Date(r.dueDate) <= endOfToday),
      upcoming: rows.filter((r) => !r.isOverdue && new Date(r.dueDate) > endOfToday),
    };
  }, [rows]);

  if (rows.length === 0) return <EmptyState title="No calls scheduled to retry." />;

  return (
    <div className="space-y-5">
      <CallAgainGroup title="Overdue" icon={AlertTriangle} rows={overdue} onRecordCall={onRecordCall} />
      <CallAgainGroup title="Due Today" icon={CalendarClock} rows={dueToday} onRecordCall={onRecordCall} />
      <CallAgainGroup title="Upcoming" icon={CalendarClock} rows={upcoming} onRecordCall={onRecordCall} />
    </div>
  );
}

function CallAgainGroup({
  title,
  icon: Icon,
  rows,
  onRecordCall,
}: {
  title: string;
  icon: typeof AlertTriangle;
  rows: import("@/lib/dm-queues").DmCallAgainRow[];
  onRecordCall: (t: { leadId: string; clientName: string; phone: string }) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#52525B]">
        <Icon className="h-3.5 w-3.5 text-[#71717A]" /> {title} ({rows.length})
      </h4>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="border-b border-[#E4E4E7] py-2.5 last:border-0">
            <div className="mb-1">
              <PhoneDisplay phone={row.lead.phone} />
            </div>
            <FollowUpRow followUp={row} previousContext={row.previousContext} />
            <button
              type="button"
              onClick={() => onRecordCall({ leadId: row.lead.id, clientName: row.lead.clientName, phone: row.lead.phone })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#27272A] border border-[#0A0A0A] shadow-2xs transition-colors cursor-pointer"
            >
              <PhoneCall className="h-3.5 w-3.5" /> Record Call
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisitsComingPanel({ rows }: { rows: DmVisitRow[] }) {
  if (rows.length === 0) return <EmptyState title="No visits or expected customers on the books." />;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={`${row.kind}-${row.id}`} className="flex flex-col gap-2 border-b border-[#E4E4E7] pb-3.5 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#09090B]">{row.clientName}</p>
              <Badge tone={row.kind === "PROPERTY_VISIT" ? "blue" : "purple"}>{row.kind === "PROPERTY_VISIT" ? "Property Visit" : "Coming / Office"}</Badge>
            </div>
            <div className="mt-1">
              <PhoneDisplay phone={row.phone} />
            </div>
            <p className="mt-1 text-xs text-[#52525B]">
              {formatDate(row.when)}
              {row.visitTime ? ` · ${row.visitTime}` : ""}
              {row.propertyTitle ? ` · ${row.propertyTitle}` : ""}
              {row.assignedFeName ? ` · ${row.assignedFeName}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {row.kind === "PROPERTY_VISIT" && (
              <Link href={`/visits/${row.id}`} className="inline-flex items-center rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] hover:border-[#D4D4D8] transition-colors">
                Open Visit
              </Link>
            )}
            <Link href={`/leads/${row.leadId}`} className="inline-flex items-center rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] hover:border-[#D4D4D8] transition-colors">
              Open Lead
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompletedPanel({ rows }: { rows: DmCompletedRow[] }) {
  if (rows.length === 0) return <EmptyState title="Nothing processed yet today." />;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.activityId} className="flex flex-col gap-2 border-b border-[#E4E4E7] pb-3.5 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#09090B]">
              {row.clientName} <span className="text-[#71717A] font-normal">&middot; {row.outcomeLabel}</span>
            </p>
            <p className="mt-0.5 text-xs text-[#71717A]">{formatDateTime(row.processedAt)}</p>
          </div>
          <Link href={`/leads/${row.leadId}`} className="inline-flex shrink-0 items-center rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] hover:border-[#D4D4D8] transition-colors">
            Open Lead
          </Link>
        </div>
      ))}
    </div>
  );
}

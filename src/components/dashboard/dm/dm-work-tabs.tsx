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
    <div className="rounded-2xl border border-[#E7ECF2] bg-white shadow-xs">
      <div role="tablist" aria-label="Data manager work queues" className="flex gap-1.5 overflow-x-auto border-b border-[#E7ECF2] p-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`dm-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`dm-tabpanel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
              tab === t.key ? "bg-[#3366FF] text-white" : "text-[#596579] hover:bg-[#F3F6FA]"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      <div className="p-4">
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
        <div key={lead.id} className="flex flex-col gap-3 border-b border-[#EFF4FF] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1B2430]">
              {lead.clientName} <Badge tone={LEAD_STATUS_TONE[lead.status] ?? "slate"}>{enumToLabel(lead.status)}</Badge>
            </p>
            <div className="mt-0.5">
              <PhoneDisplay phone={lead.phone} />
            </div>
            <p className="mt-1 text-xs text-[#596579]">
              {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredLocation} &middot;{" "}
              <span className="font-semibold text-[#3366FF]">
                {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-[#8A94A6]">
              {enumToLabel(lead.source)} &middot; {lead.assignedToName ?? "Unassigned"} &middot; Received {timeAgo(lead.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRecordCall({ leadId: lead.id, clientName: lead.clientName, phone: lead.phone })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3366FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2952CC]"
            >
              <PhoneCall className="h-3.5 w-3.5" /> Record Call
            </button>
            <Link href={`/leads/${lead.id}`} className="inline-flex items-center rounded-xl border border-[#E7ECF2] px-3 py-1.5 text-xs font-semibold text-[#596579] hover:bg-[#F3F6FA]">
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
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#596579]">
        <Icon className="h-3.5 w-3.5" /> {title} ({rows.length})
      </h4>
      <div>
        {rows.map((row) => (
          <div key={row.id} className="border-b border-slate-100 py-2 last:border-0">
            <div className="mb-1">
              <PhoneDisplay phone={row.lead.phone} />
            </div>
            <FollowUpRow followUp={row} previousContext={row.previousContext} />
            <button
              type="button"
              onClick={() => onRecordCall({ leadId: row.lead.id, clientName: row.lead.clientName, phone: row.lead.phone })}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[#3366FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2952CC]"
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
        <div key={`${row.kind}-${row.id}`} className="flex flex-col gap-2 border-b border-[#EFF4FF] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1B2430]">
              {row.clientName}{" "}
              <Badge tone={row.kind === "PROPERTY_VISIT" ? "blue" : "purple"}>{row.kind === "PROPERTY_VISIT" ? "Property Visit" : "Coming / Office"}</Badge>
            </p>
            <div className="mt-0.5">
              <PhoneDisplay phone={row.phone} />
            </div>
            <p className="mt-1 text-xs text-[#596579]">
              {formatDate(row.when)}
              {row.visitTime ? ` · ${row.visitTime}` : ""}
              {row.propertyTitle ? ` · ${row.propertyTitle}` : ""}
              {row.assignedFeName ? ` · ${row.assignedFeName}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {row.kind === "PROPERTY_VISIT" && (
              <Link href={`/visits/${row.id}`} className="inline-flex items-center rounded-xl border border-[#E7ECF2] px-3 py-1.5 text-xs font-semibold text-[#596579] hover:bg-[#F3F6FA]">
                Open Visit
              </Link>
            )}
            <Link href={`/leads/${row.leadId}`} className="inline-flex items-center rounded-xl border border-[#E7ECF2] px-3 py-1.5 text-xs font-semibold text-[#596579] hover:bg-[#F3F6FA]">
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
        <div key={row.activityId} className="flex flex-col gap-2 border-b border-[#EFF4FF] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1B2430]">
              {row.clientName} <span className="text-[#8A94A6]">&middot; {row.outcomeLabel}</span>
            </p>
            <p className="mt-0.5 text-xs text-[#596579]">{formatDateTime(row.processedAt)}</p>
          </div>
          <Link href={`/leads/${row.leadId}`} className="inline-flex shrink-0 items-center rounded-xl border border-[#E7ECF2] px-3 py-1.5 text-xs font-semibold text-[#596579] hover:bg-[#F3F6FA]">
            Open Lead
          </Link>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import type { User, FollowUpType, VisitStatus } from "@prisma/client";
import { Badge, FOLLOWUP_STATUS_TONE, VISIT_STATUS_TONE } from "@/components/ui/badge";
import { Select, Input, Textarea, Field } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, enumToLabel, timeAgo } from "@/lib/utils";
import { ArrowRightLeft, Send, Plus, MessageSquare, Building2, User as UserIcon, CheckCircle2, Zap, Gauge, FileText, CalendarPlus } from "lucide-react";
import { ConversationPanel } from "@/components/whatsapp/conversation-panel";
import { CataloguesTab } from "@/components/catalogues/catalogues-tab";
import { EntityDocumentPanel } from "@/components/documents/entity-document-panel";
import { HealthCard } from "@/components/rules/health-card";
import { SuggestionList } from "@/components/rules/suggestion-list";
import type { HealthScoreResult, Suggestion } from "@/lib/rules";
import { computeLeadTimelineSummary } from "@/lib/timeline-summary";
import { NewMatchesPanel } from "./new-matches-panel";
import { LeadPhonePicker, type PhoneOption } from "./lead-phone-picker";
import { HUMAN_FOLLOWUP_TYPES, DEFAULT_FOLLOWUP_TYPE } from "@/lib/follow-up-types";

/** Matches src/lib/user-select.ts's assignedToSelect - only what this UI ever renders (name, plus id for keys/selection). */
type UserSummary = Pick<User, "id" | "name">;

interface ScoreFactor {
  label: string;
  delta: number;
  reason: string;
}

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"];
const VISIT_STATUSES: VisitStatus[] = ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "COMPLETED", "RESCHEDULED", "CANCELLED", "CLIENT_NO_SHOW"];
const OUTCOMES = ["HIGHLY_INTERESTED", "INTERESTED", "NEEDS_TIME", "NOT_INTERESTED", "WANTS_ANOTHER_PROPERTY", "READY_FOR_NEGOTIATION"];

type LeadWithRelations = {
  id: string;
  leadCode: string;
  clientName: string;
  phone: string;
  phones: { id: string; phone: string; label: string | null; type: string }[];
  createdAt: Date;
  status: string;
  priority: string;
  assignedToId: string | null;
  assignedTo: UserSummary | null;
  assignmentStrategy: string | null;
  assignmentReason: string | null;
  autoAssignedAt: Date | null;
  score: number;
  scoreExplanation: string | null;
  scoreUpdatedAt: Date | null;
  notes: string | null;
  activities: { id: string; type: string; description: string; createdAt: Date; actor: UserSummary | null }[];
  followUps: { id: string; type: string; dueDate: Date; status: string; notes: string | null; owner: UserSummary | null }[];
  visits: { id: string; visitDate: Date; visitTime: string; status: string; outcome: string | null; property: { id: string; title: string }; assignedTo: UserSummary | null; employeeNotes: string | null }[];
  sharedProperties: { id: string; propertyIds: string; createdAt: Date; whatsappLink: string }[];
  matchRecommendations: React.ComponentProps<typeof NewMatchesPanel>["recommendations"];
  catalogueShares: React.ComponentProps<typeof NewMatchesPanel>["catalogues"];
};

const TABS = ["overview", "whatsapp", "catalogues", "documents", "activity", "followups", "visits", "shared"] as const;
type LeadTab = (typeof TABS)[number];
const TAB_LABELS: Record<LeadTab, string> = {
  overview: "Overview",
  whatsapp: "WhatsApp",
  catalogues: "Catalogues",
  documents: "Documents",
  activity: "Activity",
  followups: "Follow-ups",
  visits: "Visits",
  shared: "Shared",
};

export function LeadWorkspace({
  lead,
  employees,
  role,
  health,
  suggestions,
  visitSuggestions,
  providerSendConfigured,
}: {
  lead: LeadWithRelations;
  employees: UserSummary[];
  role: string;
  health: HealthScoreResult | null;
  suggestions: Suggestion[];
  visitSuggestions: Record<string, Suggestion[]>;
  providerSendConfigured: boolean;
}) {
  const [tab, setTab] = useState<LeadTab>("overview");
  const canManage = role === "ADMIN" || role === "DATA_MANAGER";

  return (
    <div>
      <PrimaryActionsBar leadId={lead.id} phone={lead.phone} phones={lead.phones} onNavigate={setTab} />

      <div className="mb-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white p-1.5 text-sm shadow-xs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-xl px-3.5 py-2 font-semibold transition-all ${
              tab === t ? "bg-[#3366FF] text-white shadow-xs" : "text-[#596579] hover:text-[#1B2430] hover:bg-[#F3F6FA]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab lead={lead} employees={employees} canManage={canManage} health={health} suggestions={suggestions} providerSendConfigured={providerSendConfigured} onTabAction={(t) => setTab(t as LeadTab)} />}
      {tab === "whatsapp" && <ConversationPanel leadId={lead.id} canManage={canManage || role === "FIELD_EXECUTIVE"} clientName={lead.clientName} />}
      {tab === "catalogues" && <CataloguesTab leadId={lead.id} canManage={canManage} canSend={true} />}
      {tab === "documents" && <EntityDocumentPanel entityType="LEAD" entityId={lead.id} title="Lead Documents" />}
      {tab === "activity" && <ActivityTab activities={lead.activities} createdAt={lead.createdAt} followUps={lead.followUps} />}
      {tab === "followups" && <FollowUpsTab leadId={lead.id} followUps={lead.followUps} employees={employees} />}
      {tab === "visits" && (
        <VisitsTab
          leadId={lead.id}
          visits={lead.visits}
          canManage={canManage}
          visitSuggestions={visitSuggestions}
          onTabAction={(t) => setTab(t as LeadTab)}
          employees={employees}
          candidateProperties={lead.matchRecommendations.map((r) => r.property)}
        />
      )}
      {tab === "shared" && <SharedTab shares={lead.sharedProperties} />}
    </div>
  );
}

/**
 * simplified-role-workflow (spec item 4) - always-visible primary actions so
 * the day-to-day flow (Call -> WhatsApp -> Note -> Send Catalogue ->
 * Follow-up -> Schedule Visit) never requires hunting through tabs first.
 * "Call" is the only action that leaves the page (tel: link, same pattern as
 * src/components/visits/visit-field-actions.tsx) - it also fires the
 * existing CALL_INITIATED activity log, never a WhatsApp send. Every other
 * button just jumps to the tab that already has the real form, so there is
 * no duplicated business logic here.
 */
function PrimaryActionsBar({
  leadId,
  phone,
  phones,
  onNavigate,
}: {
  leadId: string;
  phone: string;
  phones: { phone: string; label: string | null; type: string }[];
  onNavigate: (tab: LeadTab) => void;
}) {
  // simplified-role-workflow (spec item 6/7) - Call/WhatsApp become a small
  // picker once there's more than one number; a single number still acts
  // immediately (unchanged behavior). See lead-phone-picker.tsx for the
  // WhatsApp gap this deliberately does NOT try to paper over.
  const phoneOptions: PhoneOption[] = [
    { label: "Primary", number: phone, isPrimary: true },
    ...phones.map((p) => ({ label: p.label ?? (p.type === "PRIMARY" ? "Primary" : "Other"), number: p.phone, isPrimary: false })),
  ];

  function logCall(number: string) {
    // Fire-and-forget, same as visit-field-actions.tsx - never blocks the
    // phone dialer opening, and never triggers any WhatsApp send.
    fetch(`/api/leads/${leadId}/call-initiated`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: number }) }).catch(() => {});
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-[#E7ECF2] bg-white p-3 shadow-xs">
      <LeadPhonePicker phones={phoneOptions} action="call" onCall={logCall} onOpenWhatsAppPanel={() => onNavigate("whatsapp")} />
      <LeadPhonePicker phones={phoneOptions} action="whatsapp" onCall={logCall} onOpenWhatsAppPanel={() => onNavigate("whatsapp")} />
      <Button size="sm" variant="secondary" onClick={() => onNavigate("catalogues")}>
        <Send className="h-4 w-4" /> Send Catalogue
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onNavigate("followups")}>
        <Plus className="h-4 w-4" /> Add Follow-up
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onNavigate("overview")}>
        <FileText className="h-4 w-4" /> Add Note
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onNavigate("visits")}>
        <CalendarPlus className="h-4 w-4" /> Schedule Visit
      </Button>
    </div>
  );
}

function OverviewTab({
  lead,
  employees,
  canManage,
  health,
  suggestions,
  providerSendConfigured,
  onTabAction,
}: {
  lead: LeadWithRelations;
  employees: UserSummary[];
  canManage: boolean;
  health: HealthScoreResult | null;
  suggestions: Suggestion[];
  providerSendConfigured: boolean;
  onTabAction: (target: string) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(lead.status);
  const [priority, setPriority] = useState(lead.priority);
  const [note, setNote] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [saving, setSaving] = useState(false);

  async function updateField(field: "status" | "priority", value: string) {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(`Lead ${field} updated`);
      router.refresh();
    } else {
      toast.error(`Failed to update ${field}`);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Note added");
      setNote("");
      router.refresh();
    } else toast.error("Failed to add note");
  }

  async function assign(employeeId: string) {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId: employeeId }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Lead assigned");
      router.refresh();
    } else toast.error("Assignment failed");
  }

  async function runAutoAssign() {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/auto-assign`, { method: "POST" });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      toast.success(`Auto-assigned to ${data.assignedTo?.name ?? "employee"}`);
      router.refresh();
    } else toast.error("Auto-assign failed");
  }

  async function recalculateScore() {
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/recalculate-score`, { method: "POST" });
    setSaving(false);
    if (res.ok) {
      toast.success("Lead score recalculated");
      router.refresh();
    } else toast.error("Recalculation failed");
  }

  async function transfer() {
    if (!transferTo) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetEmployeeId: transferTo }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Lead transferred");
      setTransferTo("");
      router.refresh();
    } else toast.error("Transfer failed");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <NewMatchesPanel leadId={lead.id} recommendations={lead.matchRecommendations} catalogues={lead.catalogueShares} canManage={canManage} providerSendConfigured={providerSendConfigured} />
        <ScorePanel lead={lead} onRecalculate={recalculateScore} saving={saving} />
        {health && <HealthCard title="Lead Health" health={health} />}
        <SuggestionList suggestions={suggestions} onTabAction={onTabAction} />

        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Add Internal Note</h3>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type private lead notes..." />
          <div className="flex justify-end">
            <Button size="sm" onClick={addNote} loading={saving} disabled={!note.trim()}>
              Save Note
            </Button>
          </div>
        </div>

        {lead.notes && (
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">Existing Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-[#596579] bg-[#FAFBFC] p-3 rounded-xl border border-[#E7ECF2]">{lead.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Lead Controls</h3>
          <Field label="Status">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); updateField("status", e.target.value); }} disabled={saving}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{enumToLabel(s)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => { setPriority(e.target.value); updateField("priority", e.target.value); }} disabled={saving}>
              <option value="HOT">Hot</option>
              <option value="WARM">Warm</option>
              <option value="COLD">Cold</option>
            </Select>
          </Field>
        </div>

        {canManage && (
          <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
              <UserIcon className="h-4 w-4 text-[#3366FF]" /> Assignment Details
            </h3>
            <p className="text-sm text-[#596579]">Currently: <span className="font-bold text-[#1B2430]">{lead.assignedTo?.name ?? "Unassigned"}</span></p>
            {lead.assignmentReason && (
              <p className="rounded-xl bg-[#FAFBFC] p-3 text-xs text-[#596579] border border-[#E7ECF2]">
                {lead.assignmentStrategy && <Badge tone="indigo" className="mr-1.5 mb-1">{enumToLabel(lead.assignmentStrategy)}</Badge>}
                {lead.assignmentReason}
                {lead.autoAssignedAt && <span className="mt-1 block text-[#8A94A6]">{formatDateTime(lead.autoAssignedAt)}</span>}
              </p>
            )}
            {!lead.assignedToId && (
              <Button size="sm" variant="secondary" className="w-full justify-center" onClick={runAutoAssign} loading={saving}>
                <Zap className="h-3.5 w-3.5" /> Run Auto Assignment
              </Button>
            )}
            <Field label="Assign directly to">
              <Select defaultValue="" onChange={(e) => e.target.value && assign(e.target.value)} disabled={saving}>
                <option value="">Select executive...</option>
                {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
              </Select>
            </Field>
            {lead.assignedToId && (
              <div className="border-t border-[#EFF4FF] pt-3">
                <Field label="Transfer to executive">
                  <div className="flex gap-2">
                    <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                      <option value="">Select executive...</option>
                      {employees.filter((e) => e.id !== lead.assignedToId).map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
                    </Select>
                    <Button size="sm" variant="secondary" onClick={transfer} loading={saving}>
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Field>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScorePanel({ lead, onRecalculate, saving }: { lead: LeadWithRelations; onRecalculate: () => void; saving: boolean }) {
  const factors: ScoreFactor[] = lead.scoreExplanation ? JSON.parse(lead.scoreExplanation) : [];
  const tone = lead.score >= 70 ? "red" : lead.score >= 40 ? "amber" : "blue";

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
          <Gauge className="h-4 w-4 text-[#3366FF]" /> Lead Quality Score
        </h3>
        <button onClick={onRecalculate} disabled={saving} className="text-xs font-semibold text-[#3366FF] hover:text-[#2952CC] disabled:opacity-50">
          Recalculate
        </button>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-4xl font-extrabold text-[#1B2430]">{lead.score}</p>
        <Badge tone={tone}>{lead.priority}</Badge>
      </div>
      {lead.scoreUpdatedAt && <p className="mt-1 text-xs text-[#8A94A6]">Updated {timeAgo(lead.scoreUpdatedAt)}</p>}
      {factors.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[#EFF4FF] pt-3">
          {factors.map((f, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-[#596579]">{f.reason}</span>
              <span className={`shrink-0 font-bold ${f.delta >= 0 ? "text-[#1FA971]" : "text-[#E5484D]"}`}>{f.delta >= 0 ? "+" : ""}{f.delta}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab({ activities, createdAt, followUps }: { activities: LeadWithRelations["activities"]; createdAt: Date; followUps: LeadWithRelations["followUps"] }) {
  const summary = computeLeadTimelineSummary({
    createdAt,
    activities,
    hasOverdueFollowUp: followUps.some((f) => f.status === "OVERDUE"),
    hasPendingFollowUp: followUps.some((f) => f.status === "PENDING"),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
          <FileText className="h-4 w-4 text-[#3366FF]" /> Timeline Summary
        </h3>
        <ul className="space-y-1.5">
          {summary.lines.map((line) => (
            <li key={line.id} className="flex items-start gap-2 text-sm text-[#596579]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3366FF]" />
              {line.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#1B2430]">Activity Timeline</h3>
        {activities.length === 0 && <p className="text-sm text-[#8A94A6]">No activity recorded yet.</p>}
        <ol className="space-y-4">
          {activities.map((a) => (
            <li key={a.id} className="relative border-l-2 border-[#E7ECF2] pl-4">
              <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#3366FF]" />
              <p className="text-sm font-semibold text-[#1B2430]">{a.description}</p>
              <p className="text-xs text-[#8A94A6]">{a.actor ? `${a.actor.name} · ` : ""}{formatDateTime(a.createdAt)} ({timeAgo(a.createdAt)})</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function FollowUpsTab({ leadId, followUps, employees }: { leadId: string; followUps: LeadWithRelations["followUps"]; employees: UserSummary[] }) {
  const router = useRouter();
  // simplified-role-workflow (targeted fix pass, Blocker D) - this is the
  // main [Add Follow-up] flow (PrimaryActionsBar jumps straight to this
  // tab). Type is now exactly the 4 human-facing options from
  // src/lib/follow-up-types.ts - Call/WhatsApp/PHONE_CALL/WHATSAPP/
  // "Customer Expected / Coming"=VISIT_EXPECTED/"General Follow-up"=
  // GENERAL_FOLLOW_UP - no raw enum string shown. Date/Time are separate
  // fields (Date required, Time optional), matching the same pattern used
  // by the visit-completion "Next Action?" follow-up form.
  const [type, setType] = useState<FollowUpType>(DEFAULT_FOLLOWUP_TYPE);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!date) return toast.error("Date is required");
    setSaving(true);
    const dueDate = time ? `${date}T${time}` : date;
    const res = await fetch("/api/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, type, dueDate, ownerId: ownerId || null, notes: notes || null }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Follow-up scheduled");
      setDate(""); setTime(""); setNotes("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to schedule follow-up");
    }
  }

  async function complete(id: string) {
    const res = await fetch(`/api/follow-ups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    if (res.ok) { toast.success("Marked completed"); router.refresh(); } else toast.error("Failed");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Add Follow-up</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
            {HUMAN_FOLLOWUP_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="time" placeholder="Time (optional)" value={time} onChange={(e) => setTime(e.target.value)} />
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Assign to...</option>
            {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </Select>
          <Button onClick={create} loading={saving}><Plus className="h-4 w-4" /> Schedule</Button>
        </div>
        <Textarea rows={2} placeholder="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#1B2430]">Follow-up History</h3>
        {followUps.length === 0 && <p className="text-sm text-[#8A94A6]">No follow-ups scheduled.</p>}
        <div className="space-y-3">
          {followUps.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 border-b border-[#EFF4FF] pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-semibold text-[#1B2430]">{enumToLabel(f.type)} <span className="text-[#8A94A6] font-normal">&middot; {f.owner?.name ?? "Unassigned"}</span></p>
                <p className="text-xs text-[#8A94A6]">{formatDateTime(f.dueDate)}{f.notes ? ` · ${f.notes}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={FOLLOWUP_STATUS_TONE[f.status]}>{enumToLabel(f.status)}</Badge>
                {f.status !== "COMPLETED" && (
                  <button onClick={() => complete(f.id)} className="text-[#8A94A6] hover:text-[#1FA971] transition-colors" title="Mark completed">
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisitsTab({
  leadId,
  visits,
  canManage,
  visitSuggestions,
  onTabAction,
  employees,
  candidateProperties,
}: {
  leadId: string;
  visits: LeadWithRelations["visits"];
  canManage: boolean;
  visitSuggestions: Record<string, Suggestion[]>;
  onTabAction: (target: string) => void;
  employees: UserSummary[];
  candidateProperties: { id: string; title: string; area: string }[];
}) {
  const router = useRouter();
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [employeeNotes, setEmployeeNotes] = useState("");
  const [scheduling, setScheduling] = useState(false);

  async function updateVisit(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/visits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { toast.success("Visit updated"); router.refresh(); } else toast.error("Update failed");
  }

  async function scheduleVisit() {
    if (!propertyId || !visitDate || !visitTime) return toast.error("Property, date, and time are required");
    setScheduling(true);
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, propertyId, assignedToId: assignedToId || null, visitDate, visitTime, meetingLocation: meetingLocation || null, employeeNotes: employeeNotes || null }),
    });
    setScheduling(false);
    if (res.ok) {
      toast.success("Visit scheduled");
      setShowScheduleForm(false);
      setPropertyId(""); setAssignedToId(""); setVisitDate(""); setVisitTime(""); setMeetingLocation(""); setEmployeeNotes("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to schedule visit");
    }
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Site Visits</h3>
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={() => setShowScheduleForm((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
              <CalendarPlus className="h-3.5 w-3.5" /> {showScheduleForm ? "Cancel" : "Schedule Visit"}
            </button>
          )}
          <Link href="/visits" className="text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">Visits module &rarr;</Link>
        </div>
      </div>

      {canManage && showScheduleForm && (
        <div className="mb-4 space-y-3 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Property">
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">Select a property...</option>
                {candidateProperties.map((p) => (<option key={p.id} value={p.id}>{p.title} &middot; {p.area}</option>))}
              </Select>
            </Field>
            <Field label="Assign to field executive">
              <Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">Unassigned</option>
                {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Meeting location (optional)">
            <Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} placeholder="e.g. Property gate, sector 12" />
          </Field>
          <Textarea rows={2} placeholder="Notes for the field executive (optional)" value={employeeNotes} onChange={(e) => setEmployeeNotes(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" onClick={scheduleVisit} loading={scheduling}>Schedule Visit</Button>
          </div>
          {candidateProperties.length === 0 && <p className="text-xs text-[#8A94A6]">No matched properties yet - share a catalogue or run matching to get property options here.</p>}
        </div>
      )}

      {visits.length === 0 && <p className="text-sm text-[#8A94A6]">No visits scheduled yet.</p>}
      <div className="space-y-3">
        {visits.map((v) => (
          <div key={v.id} className="rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-[#1B2430]">
                  <Building2 className="h-4 w-4 text-[#3366FF]" /> {v.property.title}
                </p>
                <p className="text-xs text-[#8A94A6] mt-0.5">{formatDate(v.visitDate)} at {v.visitTime} &middot; {v.assignedTo?.name ?? "Unassigned"}</p>
              </div>
              <Badge tone={VISIT_STATUS_TONE[v.status]}>{enumToLabel(v.status)}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Select className="w-auto text-xs font-semibold" defaultValue={v.status} onChange={(e) => updateVisit(v.id, { status: e.target.value })}>
                {VISIT_STATUSES.map((s) => (<option key={s} value={s}>{enumToLabel(s)}</option>))}
              </Select>
              <Select className="w-auto text-xs font-semibold" defaultValue={v.outcome ?? ""} onChange={(e) => updateVisit(v.id, { outcome: e.target.value })}>
                <option value="">Outcome...</option>
                {OUTCOMES.map((o) => (<option key={o} value={o}>{enumToLabel(o)}</option>))}
              </Select>
            </div>
            {v.employeeNotes && <p className="mt-2 text-xs text-[#596579]">{v.employeeNotes}</p>}
            {(visitSuggestions[v.id]?.length ?? 0) > 0 && (
              <div className="mt-3">
                <SuggestionList title="Smart suggestion" suggestions={visitSuggestions[v.id]} onTabAction={onTabAction} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SharedTab({ shares }: { shares: LeadWithRelations["sharedProperties"] }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
        <MessageSquare className="h-4 w-4 text-[#25D366]" /> WhatsApp Share History
      </h3>
      {shares.length === 0 && <p className="text-sm text-[#8A94A6]">No properties shared yet.</p>}
      <div className="space-y-3">
        {shares.map((s) => {
          const ids: string[] = JSON.parse(s.propertyIds);
          return (
            <div key={s.id} className="rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-4">
              <p className="text-sm font-bold text-[#1B2430]">{ids.length} propert{ids.length > 1 ? "ies" : "y"} shared</p>
              <p className="text-xs text-[#8A94A6] mt-0.5">{formatDateTime(s.createdAt)}</p>
              <a href={s.whatsappLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#25D366] hover:underline">
                <Send className="h-3.5 w-3.5" /> Reopen WhatsApp message
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

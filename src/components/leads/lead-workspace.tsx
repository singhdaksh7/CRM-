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
import { ClientPreferencesPanel, type PreferenceCard, type CatalogueResponseSummary } from "./client-preferences-panel";
import { VisitScheduleWithCandidates } from "./visit-schedule-with-candidates";
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
  visits: { id: string; visitDate: Date; visitTime: string; status: string; outcome: string | null; property: { id: string; title: string } | null; properties?: { property: { id: string; title: string } }[]; assignedTo: UserSummary | null; employeeNotes: string | null }[];
  sharedProperties: { id: string; propertyIds: string; createdAt: Date; whatsappLink: string }[];
  matchRecommendations: React.ComponentProps<typeof NewMatchesPanel>["recommendations"];
  catalogueShares: React.ComponentProps<typeof NewMatchesPanel>["catalogues"];
};

const TABS = ["overview", "matches", "response", "followups", "visits", "more"] as const;
type LeadTab = (typeof TABS)[number];
const TAB_LABELS: Record<LeadTab, string> = {
  overview: "Overview",
  matches: "Matches",
  response: "Client Response",
  followups: "Follow-up",
  visits: "Visit",
  more: "More",
};

interface NextAction {
  label: string;
  description: string;
  buttonText: string;
  tab: LeadTab;
}

export function getNextAction(lead: LeadWithRelations, likedCount: number): NextAction | null {
  if (["CLOSED_WON", "CLOSED_LOST", "INVALID", "NOT_INTERESTED"].includes(lead.status)) {
    return null;
  }

  if (lead.status === "NEW") {
    return {
      label: "Complete Requirement",
      description: "Review and fill out the detailed property requirements for this client.",
      buttonText: "Update Requirements",
      tab: "overview",
    };
  }

  // An unresolved, past visit needs an outcome before the broker is guided
  // toward another share or routine follow-up. This is presentation priority
  // only; it does not alter the visit workflow or its status semantics.
  const pendingOutcomeVisit = lead.visits.find(
    (v) =>
      new Date(v.visitDate) < new Date() &&
      ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "RESCHEDULED"].includes(v.status) &&
      !v.outcome
  );
  if (pendingOutcomeVisit) {
    return {
      label: "Record Outcome",
      description: `Record the client feedback and outcome for the visit on ${formatDate(pendingOutcomeVisit.visitDate)}.`,
      buttonText: "Record Outcome",
      tab: "visits",
    };
  }

  if (lead.matchRecommendations.length === 0) {
    return {
      label: "No Matches Yet",
      description: "There are no pending property matches for this client. Update the requirement or add a matching property.",
      buttonText: "View Matches",
      tab: "matches",
    };
  }

  if (lead.sharedProperties.length === 0) {
    return {
      label: "Share Properties",
      description: "Send matched properties to the client via WhatsApp.",
      buttonText: "Go to Matches",
      tab: "matches",
    };
  }

  const futureVisit = lead.visits.find((v) => !["COMPLETED", "CANCELLED"].includes(v.status) && new Date(v.visitDate) >= new Date());
  if (likedCount > 0 && !futureVisit) {
    return {
      label: "Schedule Visit",
      description: "The client liked one or more properties. Schedule a site visit.",
      buttonText: "Schedule Visit",
      tab: "visits",
    };
  }

  const hasUpcomingFollowUp = lead.followUps.some((f) => f.status === "PENDING" && new Date(f.dueDate) >= new Date());
  if (!hasUpcomingFollowUp) {
    return {
      label: "Follow Up",
      description: "No upcoming follow-up scheduled. Set a reminder to contact the client.",
      buttonText: "Schedule Follow-up",
      tab: "followups",
    };
  }

  return null;
}

function ProgressTracker({
  matchesCount,
  sharedCount,
  interestedCount,
  visitsCount,
}: {
  matchesCount: number;
  sharedCount: number;
  interestedCount: number;
  visitsCount: number;
}) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Customer Journey Progress</h3>
      <div className="grid grid-cols-4 gap-4 text-center divide-x divide-slate-100">
        <div>
          <p className="text-xl sm:text-2xl font-bold text-slate-800">{matchesCount}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">Matches</p>
        </div>
        <div className="pl-2">
          <p className="text-xl sm:text-2xl font-bold text-slate-800">{sharedCount}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">Shared</p>
        </div>
        <div className="pl-2">
          <p className="text-xl sm:text-2xl font-bold text-green-600">{interestedCount}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">Liked</p>
        </div>
        <div className="pl-2">
          <p className="text-xl sm:text-2xl font-bold text-blue-600">{visitsCount}</p>
          <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">Visits</p>
        </div>
      </div>
    </div>
  );
}

export function LeadWorkspace({
  lead,
  employees,
  role,
  health,
  suggestions,
  visitSuggestions,
  providerSendConfigured,
  clientPreferences,
  catalogueSummaries,
  preselectedPropertyId,
  outcomeOverrideVisitId,
}: {
  lead: LeadWithRelations;
  employees: UserSummary[];
  role: string;
  health: HealthScoreResult | null;
  suggestions: Suggestion[];
  visitSuggestions: Record<string, Suggestion[]>;
  providerSendConfigured: boolean;
  clientPreferences?: { liked: PreferenceCard[]; notInterested: PreferenceCard[] };
  catalogueSummaries?: CatalogueResponseSummary[];
  preselectedPropertyId?: string | null;
  outcomeOverrideVisitId?: string | null;
}) {
  const [tab, setTab] = useState<LeadTab>(
    preselectedPropertyId || outcomeOverrideVisitId ? "visits" : "overview"
  );
  const canManage = role === "ADMIN" || role === "DATA_MANAGER";

  return (
    <div className="space-y-6">
      <PrimaryActionsBar leadId={lead.id} phone={lead.phone} phones={lead.phones} onNavigate={setTab} />

      <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white p-1.5 text-sm shadow-xs">
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

      {tab === "overview" && (
        <OverviewTab
          lead={lead}
          employees={employees}
          canManage={canManage}
          health={health}
          suggestions={suggestions}
          onTabAction={(t) => setTab(t as LeadTab)}
          clientPreferences={clientPreferences}
          catalogueSummaries={catalogueSummaries}
        />
      )}
      {tab === "matches" && (
        <div className="space-y-6">
          <NewMatchesPanel
            leadId={lead.id}
            recommendations={lead.matchRecommendations}
            catalogues={lead.catalogueShares}
            canManage={canManage}
            providerSendConfigured={providerSendConfigured}
          />
        </div>
      )}
      {tab === "response" && (
        <div className="space-y-6">
          {(clientPreferences || catalogueSummaries) && (
            <ClientPreferencesPanel
              liked={clientPreferences?.liked ?? []}
              notInterested={clientPreferences?.notInterested ?? []}
              catalogueSummaries={catalogueSummaries ?? []}
            />
          )}
          <SharedTab shares={lead.sharedProperties} />
        </div>
      )}
      {tab === "followups" && <FollowUpsTab leadId={lead.id} followUps={lead.followUps} employees={employees} />}
      {tab === "visits" && (
        <VisitsTab
          leadId={lead.id}
          visits={lead.visits}
          canManage={canManage}
          visitSuggestions={visitSuggestions}
          onTabAction={(t) => setTab(t as LeadTab)}
          employees={employees}
          preselectedPropertyId={preselectedPropertyId}
          outcomeOverrideVisitId={outcomeOverrideVisitId}
        />
      )}
      {tab === "more" && (
        <MoreTab
          lead={lead}
          role={role}
          canManage={canManage}
        />
      )}
    </div>
  );
}

function MoreTab({
  lead,
  role,
  canManage,
}: {
  lead: LeadWithRelations;
  role: string;
  canManage: boolean;
}) {
  const [subTab, setSubTab] = useState<"whatsapp" | "documents" | "activity">("whatsapp");

  return (
    <div className="space-y-6 bg-white border border-[#E7ECF2] p-5 rounded-2xl shadow-xs">
      <div className="flex gap-2 border-b border-[#E7ECF2] pb-3">
        <button
          onClick={() => setSubTab("whatsapp")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            subTab === "whatsapp" ? "bg-[#3366FF] text-white" : "text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430]"
          }`}
        >
          WhatsApp Chat
        </button>
        <button
          onClick={() => setSubTab("documents")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            subTab === "documents" ? "bg-[#3366FF] text-white" : "text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430]"
          }`}
        >
          Documents
        </button>
        <button
          onClick={() => setSubTab("activity")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            subTab === "activity" ? "bg-[#3366FF] text-white" : "text-[#596579] hover:bg-[#F3F6FA] hover:text-[#1B2430]"
          }`}
        >
          Activity Timeline
        </button>
      </div>

      <div>
        {subTab === "whatsapp" && (
          <ConversationPanel leadId={lead.id} canManage={canManage || role === "FIELD_EXECUTIVE"} clientName={lead.clientName} />
        )}
        {subTab === "documents" && (
          <EntityDocumentPanel entityType="LEAD" entityId={lead.id} title="Lead Documents" />
        )}
        {subTab === "activity" && (
          <ActivityTab activities={lead.activities} createdAt={lead.createdAt} followUps={lead.followUps} />
        )}
      </div>
    </div>
  );
}

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
  const phoneOptions: PhoneOption[] = [
    { label: "Primary", number: phone, isPrimary: true },
    ...phones.map((p) => ({ label: p.label ?? (p.type === "PRIMARY" ? "Primary" : "Other"), number: p.phone, isPrimary: false })),
  ];

  function logCall(number: string) {
    fetch(`/api/leads/${leadId}/call-initiated`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: number }) }).catch(() => {});
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-[#E7ECF2] bg-white p-3 shadow-xs">
      <LeadPhonePicker phones={phoneOptions} action="call" onCall={logCall} onOpenWhatsAppPanel={() => onNavigate("more")} />
      <LeadPhonePicker phones={phoneOptions} action="whatsapp" onCall={logCall} onOpenWhatsAppPanel={() => onNavigate("more")} />
      <Button size="sm" variant="secondary" onClick={() => onNavigate("matches")}>
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
  onTabAction,
  clientPreferences,
  catalogueSummaries,
}: {
  lead: LeadWithRelations;
  employees: UserSummary[];
  canManage: boolean;
  health: HealthScoreResult | null;
  suggestions: Suggestion[];
  onTabAction: (target: string) => void;
  clientPreferences?: { liked: PreferenceCard[]; notInterested: PreferenceCard[] };
  catalogueSummaries?: CatalogueResponseSummary[];
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

  const likedCount = clientPreferences?.liked.length ?? 0;
  const nextAction = getNextAction(lead, likedCount);
  const nextFollowUp = lead.followUps.find((f) => f.status === "PENDING" || f.status === "OVERDUE");
  const nextVisit = lead.visits.find((v) => !["COMPLETED", "CANCELLED"].includes(v.status) && new Date(v.visitDate) >= new Date());

  const matchesCount = lead.matchRecommendations.length;
  const sharedCount = catalogueSummaries ? catalogueSummaries.reduce((sum, s) => sum + s.totalProperties, 0) : lead.sharedProperties.length;
  const interestedCount = likedCount;
  const visitsCount = lead.visits.length;

  return (
    <div className="space-y-6">
      {nextAction ? (
        <div className="rounded-2xl border-2 border-[#3366FF] bg-[#EFF4FF]/30 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#3366FF] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white mb-2">Next Action Recommended</span>
            <h4 className="text-base font-bold text-[#1B2430]">{nextAction.label}</h4>
            <p className="text-sm text-[#596579] mt-0.5">{nextAction.description}</p>
          </div>
          <Button onClick={() => onTabAction(nextAction.tab)} className="shrink-0 bg-[#3366FF] hover:bg-[#2952CC] text-white font-bold">
            {nextAction.buttonText}
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-[#1B2430]">All caught up!</h4>
            <p className="text-xs text-slate-500 mt-0.5">No urgent recommendations pending.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onTabAction("followups")}>Schedule Follow-up</Button>
        </div>
      )}

      <ProgressTracker matchesCount={matchesCount} sharedCount={sharedCount} interestedCount={interestedCount} visitsCount={visitsCount} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Next Follow-up</h3>
              {nextFollowUp ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-slate-800">{enumToLabel(nextFollowUp.type)} &middot; {formatDate(nextFollowUp.dueDate)}</p>
                  <button onClick={() => onTabAction("followups")} className="text-xs text-[#3366FF] font-semibold hover:underline">Manage Follow-ups &rarr;</button>
                </div>
              ) : (
                <button onClick={() => onTabAction("followups")} className="text-xs text-[#3366FF] font-semibold hover:underline">+ Schedule Follow-up</button>
              )}
            </div>
            <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Next Site Visit</h3>
              {nextVisit ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-slate-800">{nextVisit.visitTime} &middot; {formatDate(nextVisit.visitDate)}</p>
                  <button onClick={() => onTabAction("visits")} className="text-xs text-[#3366FF] font-semibold hover:underline">Manage Visits &rarr;</button>
                </div>
              ) : (
                <button onClick={() => onTabAction("visits")} className="text-xs text-[#3366FF] font-semibold hover:underline">+ Schedule Visit</button>
              )}
            </div>
          </div>

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
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
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
  preselectedPropertyId,
  outcomeOverrideVisitId,
}: {
  leadId: string;
  visits: LeadWithRelations["visits"];
  canManage: boolean;
  visitSuggestions: Record<string, Suggestion[]>;
  onTabAction: (target: string) => void;
  employees: UserSummary[];
  preselectedPropertyId?: string | null;
  outcomeOverrideVisitId?: string | null;
}) {
  const router = useRouter();
  const [showScheduleForm, setShowScheduleForm] = useState(!!preselectedPropertyId);

  async function updateVisit(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/visits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Visit updated");
      router.refresh();
    } else toast.error("Update failed");
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Site Visits</h3>
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={() => setShowScheduleForm((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
              <CalendarPlus className="h-3.5 w-3.5" /> {showScheduleForm ? "Cancel" : "Schedule Visit"}
            </button>
          )}
          <Link href="/visits" className="text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
            Visits module &rarr;
          </Link>
        </div>
      </div>

      {canManage && showScheduleForm && (
        <div className="mb-4">
          <VisitScheduleWithCandidates leadId={leadId} employees={employees} preselectedPropertyId={preselectedPropertyId} />
        </div>
      )}

      {visits.length === 0 && !showScheduleForm && <p className="text-sm text-[#8A94A6]">No visits scheduled yet.</p>}

      <div className="space-y-3">
        {visits.map((v) => {
          const isHighlighted = v.id === outcomeOverrideVisitId;
          return (
            <div
              key={v.id}
              className={`rounded-xl border p-4 transition-colors ${
                isHighlighted ? "border-[#3366FF] bg-[#EFF4FF]/20 ring-1 ring-[#3366FF]" : "border-[#E7ECF2] bg-[#FAFBFC]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-start gap-2 text-sm font-bold text-[#1B2430]">
                    <Building2 className="h-4 w-4 text-[#3366FF] mt-0.5 shrink-0" />
                    <span>
                      {v.properties && v.properties.length > 0
                        ? v.properties.map((p) => p.property.title).join(", ")
                        : v.property?.title ?? "No property selected"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#8A94A6]">
                    {formatDate(v.visitDate)} at {v.visitTime} &middot; {v.assignedTo?.name ?? "Unassigned"}
                    {v.outcome ? ` · ${enumToLabel(v.outcome)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={VISIT_STATUS_TONE[v.status]}>{enumToLabel(v.status)}</Badge>
                  <Link href={`/visits/${v.id}`} className="text-xs font-semibold text-[#3366FF] hover:underline">
                    View
                  </Link>
                </div>
              </div>
              {canManage && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Select className="w-auto text-xs font-semibold" defaultValue={v.status} onChange={(e) => updateVisit(v.id, { status: e.target.value })}>
                    {VISIT_STATUSES.map((s) => <option key={s} value={s}>{enumToLabel(s)}</option>)}
                  </Select>
                  <Select className="w-auto text-xs font-semibold" defaultValue={v.outcome ?? ""} onChange={(e) => updateVisit(v.id, { outcome: e.target.value })}>
                    <option value="">Outcome...</option>
                    {OUTCOMES.map((o) => <option key={o} value={o}>{enumToLabel(o)}</option>)}
                  </Select>
                </div>
              )}
              {v.employeeNotes && <p className="mt-2 text-xs text-[#596579]">{v.employeeNotes}</p>}
              {(visitSuggestions[v.id]?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <SuggestionList title="Smart suggestion" suggestions={visitSuggestions[v.id]} onTabAction={onTabAction} />
                </div>
              )}
            </div>
          );
        })}
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
              <p className="text-sm font-bold text-[#1B2430]">
                {ids.length} propert{ids.length > 1 ? "ies" : "y"} shared
              </p>
              <p className="mt-0.5 text-xs text-[#8A94A6]">{formatDateTime(s.createdAt)}</p>
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

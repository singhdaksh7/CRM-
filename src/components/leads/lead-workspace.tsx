"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import type { User, FollowUpType, VisitStatus } from "@prisma/client";
import { Badge, FOLLOWUP_STATUS_TONE, VISIT_STATUS_TONE } from "@/components/ui/badge";
import { Select, Input, Textarea, Field } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { formatDate, formatDateTime, enumToLabel, timeAgo } from "@/lib/utils";
import { ArrowRightLeft, Send, Sparkles, Plus, MessageSquare, Building2, User as UserIcon, CheckCircle2, Zap, Gauge } from "lucide-react";
import { ConversationPanel } from "@/components/whatsapp/conversation-panel";
import { CataloguesTab } from "@/components/catalogues/catalogues-tab";
import { EntityDocumentPanel } from "@/components/documents/entity-document-panel";

interface ScoreFactor {
  label: string;
  delta: number;
  reason: string;
}

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"];
const FOLLOWUP_TYPES: FollowUpType[] = ["PHONE_CALL", "WHATSAPP", "PROPERTY_SHARING", "VISIT_CONFIRMATION", "NEGOTIATION", "DOCUMENTATION", "PAYMENT_REMINDER"];
const VISIT_STATUSES: VisitStatus[] = ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "COMPLETED", "RESCHEDULED", "CANCELLED", "CLIENT_NO_SHOW"];
const OUTCOMES = ["HIGHLY_INTERESTED", "INTERESTED", "NEEDS_TIME", "NOT_INTERESTED", "WANTS_ANOTHER_PROPERTY", "READY_FOR_NEGOTIATION"];

type LeadWithRelations = {
  id: string;
  leadCode: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  assignedTo: User | null;
  assignmentStrategy: string | null;
  assignmentReason: string | null;
  autoAssignedAt: Date | null;
  score: number;
  scoreExplanation: string | null;
  scoreUpdatedAt: Date | null;
  notes: string | null;
  activities: { id: string; type: string; description: string; createdAt: Date; actor: User | null }[];
  followUps: { id: string; type: string; dueDate: Date; status: string; notes: string | null; owner: User | null }[];
  visits: { id: string; visitDate: Date; visitTime: string; status: string; outcome: string | null; property: { id: string; title: string }; assignedTo: User | null; employeeNotes: string | null }[];
  sharedProperties: { id: string; propertyIds: string; createdAt: Date; whatsappLink: string }[];
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

export function LeadWorkspace({ lead, employees, role }: { lead: LeadWithRelations; employees: User[]; role: string }) {
  const [tab, setTab] = useState<LeadTab>("overview");
  const canManage = role === "ADMIN" || role === "DATA_MANAGER";

  return (
    <div>
      <div className="mb-6 flex gap-1.5 overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#11151F] p-1.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 font-semibold transition-all ${
              tab === t ? "bg-[#4F8CFF] text-white shadow-sm" : "text-[#94A3B8] hover:text-white hover:bg-[#1E2533]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab lead={lead} employees={employees} canManage={canManage} />}
      {tab === "whatsapp" && <ConversationPanel leadId={lead.id} canManage={canManage || role === "FIELD_EXECUTIVE"} />}
      {tab === "catalogues" && <CataloguesTab leadId={lead.id} canManage={canManage} canSend={true} />}
      {tab === "documents" && <EntityDocumentPanel entityType="LEAD" entityId={lead.id} title="Lead Documents" />}
      {tab === "activity" && <ActivityTab activities={lead.activities} />}
      {tab === "followups" && <FollowUpsTab leadId={lead.id} followUps={lead.followUps} employees={employees} />}
      {tab === "visits" && <VisitsTab leadId={lead.id} visits={lead.visits} canManage={canManage} />}
      {tab === "shared" && <SharedTab shares={lead.sharedProperties} />}
    </div>
  );
}

function OverviewTab({ lead, employees, canManage }: { lead: LeadWithRelations; employees: User[]; canManage: boolean }) {
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
        <ScorePanel lead={lead} onRecalculate={recalculateScore} saving={saving} />

        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">Add Internal Note</h3>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type private lead notes..." />
          <div className="flex justify-end">
            <Button size="sm" onClick={addNote} loading={saving} disabled={!note.trim()}>
              Save Note
            </Button>
          </div>
        </div>

        {lead.notes && (
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">Existing Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-[#CBD5E1] bg-[#11151F] p-3 rounded-lg border border-[rgba(255,255,255,0.06)]">{lead.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">Lead Controls</h3>
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
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">
              <UserIcon className="h-4 w-4 text-[#4F8CFF]" /> Assignment Details
            </h3>
            <p className="text-sm text-[#CBD5E1]">Currently: <span className="font-bold text-[#F8FAFC]">{lead.assignedTo?.name ?? "Unassigned"}</span></p>
            {lead.assignmentReason && (
              <p className="rounded-lg bg-[#11151F] p-3 text-xs text-[#94A3B8] border border-[rgba(255,255,255,0.06)]">
                {lead.assignmentStrategy && <Badge tone="indigo" className="mr-1.5 mb-1">{enumToLabel(lead.assignmentStrategy)}</Badge>}
                {lead.assignmentReason}
                {lead.autoAssignedAt && <span className="mt-1 block text-[#64748B]">{formatDateTime(lead.autoAssignedAt)}</span>}
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
              <div className="border-t border-[rgba(255,255,255,0.06)] pt-3">
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
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">
          <Gauge className="h-4 w-4 text-[#4F8CFF]" /> Lead Quality Score
        </h3>
        <button onClick={onRecalculate} disabled={saving} className="text-xs font-semibold text-[#4F8CFF] hover:text-[#6BA0FF] disabled:opacity-50">
          Recalculate
        </button>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-4xl font-extrabold text-[#F8FAFC]">{lead.score}</p>
        <Badge tone={tone}>{lead.priority}</Badge>
      </div>
      {lead.scoreUpdatedAt && <p className="mt-1 text-xs text-[#94A3B8]">Updated {timeAgo(lead.scoreUpdatedAt)}</p>}
      {factors.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-3">
          {factors.map((f, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-[#CBD5E1]">{f.reason}</span>
              <span className={`shrink-0 font-bold ${f.delta >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{f.delta >= 0 ? "+" : ""}{f.delta}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab({ activities }: { activities: LeadWithRelations["activities"] }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">Activity Timeline</h3>
      {activities.length === 0 && <p className="text-sm text-[#64748B]">No activity recorded yet.</p>}
      <ol className="space-y-4">
        {activities.map((a) => (
          <li key={a.id} className="relative border-l-2 border-[rgba(255,255,255,0.08)] pl-4">
            <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#4F8CFF]" />
            <p className="text-sm font-semibold text-[#F8FAFC]">{a.description}</p>
            <p className="text-xs text-[#94A3B8]">{a.actor ? `${a.actor.name} · ` : ""}{formatDateTime(a.createdAt)} ({timeAgo(a.createdAt)})</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FollowUpsTab({ leadId, followUps, employees }: { leadId: string; followUps: LeadWithRelations["followUps"]; employees: User[] }) {
  const router = useRouter();
  const [type, setType] = useState<FollowUpType>("PHONE_CALL");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!dueDate) return toast.error("Due date is required");
    setSaving(true);
    const res = await fetch("/api/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, type, dueDate, ownerId: ownerId || null, notes: notes || null }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Follow-up scheduled");
      setDueDate(""); setNotes("");
      router.refresh();
    } else toast.error("Failed to schedule follow-up");
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
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">Schedule Follow-up</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Select value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
            {FOLLOWUP_TYPES.map((t) => (<option key={t} value={t}>{enumToLabel(t)}</option>))}
          </Select>
          <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Assign to...</option>
            {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </Select>
          <Button onClick={create} loading={saving}><Plus className="h-4 w-4" /> Schedule</Button>
        </div>
        <Textarea rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">Follow-up History</h3>
        {followUps.length === 0 && <p className="text-sm text-[#64748B]">No follow-ups scheduled.</p>}
        <div className="space-y-3">
          {followUps.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.06)] pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-semibold text-[#F8FAFC]">{enumToLabel(f.type)} <span className="text-[#94A3B8] font-normal">&middot; {f.owner?.name ?? "Unassigned"}</span></p>
                <p className="text-xs text-[#94A3B8]">{formatDateTime(f.dueDate)}{f.notes ? ` · ${f.notes}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={FOLLOWUP_STATUS_TONE[f.status]}>{enumToLabel(f.status)}</Badge>
                {f.status !== "COMPLETED" && (
                  <button onClick={() => complete(f.id)} className="text-[#94A3B8] hover:text-[#22C55E] transition-colors" title="Mark completed">
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

function VisitsTab({ visits }: { leadId: string; visits: LeadWithRelations["visits"]; canManage: boolean }) {
  const router = useRouter();

  async function updateVisit(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/visits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { toast.success("Visit updated"); router.refresh(); } else toast.error("Update failed");
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">Site Visits</h3>
        <Link href="/visits" className="text-xs font-semibold text-[#4F8CFF] hover:text-[#6BA0FF]">Visits module &rarr;</Link>
      </div>
      {visits.length === 0 && <p className="text-sm text-[#64748B]">No visits scheduled yet.</p>}
      <div className="space-y-3">
        {visits.map((v) => (
          <div key={v.id} className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#11151F] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-[#F8FAFC]">
                  <Building2 className="h-4 w-4 text-[#4F8CFF]" /> {v.property.title}
                </p>
                <p className="text-xs text-[#94A3B8] mt-0.5">{formatDate(v.visitDate)} at {v.visitTime} &middot; {v.assignedTo?.name ?? "Unassigned"}</p>
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
            {v.employeeNotes && <p className="mt-2 text-xs text-[#CBD5E1]">{v.employeeNotes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SharedTab({ shares }: { shares: LeadWithRelations["sharedProperties"] }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">
        <MessageSquare className="h-4 w-4 text-[#25D366]" /> WhatsApp Share History
      </h3>
      {shares.length === 0 && <p className="text-sm text-[#64748B]">No properties shared yet.</p>}
      <div className="space-y-3">
        {shares.map((s) => {
          const ids: string[] = JSON.parse(s.propertyIds);
          return (
            <div key={s.id} className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#11151F] p-4">
              <p className="text-sm font-bold text-[#F8FAFC]">{ids.length} propert{ids.length > 1 ? "ies" : "y"} shared</p>
              <p className="text-xs text-[#94A3B8] mt-0.5">{formatDateTime(s.createdAt)}</p>
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

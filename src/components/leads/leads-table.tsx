"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge, LEAD_STATUS_TONE, LEAD_PRIORITY_TONE } from "@/components/ui/badge";
import { Select, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { CheckCircle2, XCircle, Download } from "lucide-react";
import type { User } from "@prisma/client";
import { HUMAN_FOLLOWUP_TYPES } from "@/lib/follow-up-types";

interface LeadRow {
  id: string;
  clientName: string;
  phone: string;
  requirementType: string;
  preferredBhk: number | null;
  preferredLocation: string;
  minBudget: number;
  maxBudget: number;
  source: string;
  assignedTo: { name: string } | null;
  status: string;
  priority: string;
  score: number;
  createdAt: Date;
}

const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"];

type BulkAction = "" | "ASSIGN" | "STATUS" | "FOLLOW_UP" | "CATALOGUE";

interface BulkResult {
  total: number;
  succeeded: number;
  failed: number;
  results: { id: string; success: boolean; error?: string }[];
}

export function LeadsTable({ leads, employees, canManage }: { leads: LeadRow[]; employees: Pick<User, "id" | "name">[]; canManage: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction>("");
  const [assignedToId, setAssignedToId] = useState("");
  const [status, setStatus] = useState(LEAD_STATUSES[0]);
  const [followUpType, setFollowUpType] = useState(HUMAN_FOLLOWUP_TYPES[0].value as string);
  const [dueDate, setDueDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const allSelected = leads.length > 0 && selected.size === leads.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function actionLabel(): string {
    switch (action) {
      case "ASSIGN":
        return `Assign ${selected.size} lead(s)`;
      case "STATUS":
        return `Change status of ${selected.size} lead(s)`;
      case "FOLLOW_UP":
        return `Schedule follow-up for ${selected.size} lead(s)`;
      case "CATALOGUE":
        return `Generate catalogues for ${selected.size} lead(s)`;
      default:
        return "";
    }
  }

  async function runAction() {
    setRunning(true);
    const ids = Array.from(selected);
    const body =
      action === "ASSIGN"
        ? { action, ids, assignedToId }
        : action === "STATUS"
          ? { action, ids, status }
          : action === "FOLLOW_UP"
            ? { action, ids, followUpType, dueDate: new Date(dueDate).toISOString() }
            : { action, ids };

    const res = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setRunning(false);
    if (res.ok) {
      const data: BulkResult = await res.json();
      setResult(data);
      setConfirmOpen(false);
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Bulk action failed");
    }
  }

  function exportSelected() {
    const ids = selected.size > 0 ? Array.from(selected).join(",") : "";
    window.open(`/api/leads/export${ids ? `?ids=${ids}` : ""}`, "_blank");
  }

  return (
    <div className="space-y-3">
      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3 shadow-2xs">
          <span className="text-xs font-semibold text-[#09090B]">{selected.size} selected</span>
          <Select value={action} onChange={(e) => setAction(e.target.value as BulkAction)} className="w-auto text-xs">
            <option value="">Bulk action...</option>
            <option value="ASSIGN">Assign</option>
            <option value="STATUS">Change Status</option>
            <option value="FOLLOW_UP">Schedule Follow-up</option>
            <option value="CATALOGUE">Generate Catalogue</option>
          </Select>
          {action === "ASSIGN" && (
            <Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="w-auto text-xs">
              <option value="">Choose employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          )}
          {action === "STATUS" && (
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto text-xs">
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{enumToLabel(s)}</option>
              ))}
            </Select>
          )}
          {action === "FOLLOW_UP" && (
            <>
              <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value)} className="w-auto text-xs">
                {HUMAN_FOLLOWUP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-auto text-xs" />
            </>
          )}
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={!action || (action === "ASSIGN" && !assignedToId) || (action === "FOLLOW_UP" && !dueDate)}
          >
            Apply
          </Button>
          <Button size="sm" variant="secondary" onClick={exportSelected}>
            <Download className="h-3.5 w-3.5" /> Export selected
          </Button>
        </div>
      )}

      {!canManage && selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-[#E4E4E7] bg-white p-3 shadow-2xs">
          <span className="text-xs font-semibold text-[#09090B]">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={exportSelected}>
            <Download className="h-3.5 w-3.5" /> Export selected
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#E4E4E7] bg-white shadow-2xs">
        <table className="min-w-full divide-y divide-[#E4E4E7] text-sm">
          <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A]">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 rounded border-[#E4E4E7] text-[#0A0A0A] focus:ring-[#0A0A0A]" />
              </th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Requirement</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E4E7] text-[#09090B]">
            {leads.map((l) => (
              <tr key={l.id} className={`hover:bg-[#FAFAFA] transition-colors ${selected.has(l.id) ? "bg-[#F4F4F5]" : ""}`}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} aria-label={`Select ${l.clientName}`} className="h-4 w-4 rounded border-[#E4E4E7] text-[#0A0A0A] focus:ring-[#0A0A0A]" />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/leads/${l.id}`} className="font-semibold text-[#09090B] hover:underline transition-colors">{l.clientName}</Link>
                  <p className="text-xs text-[#71717A] font-mono mt-0.5">{l.phone}</p>
                </td>
                <td className="px-4 py-3 text-[#52525B]">
                  {l.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {l.preferredBhk ? `${l.preferredBhk} BHK` : "Any"} &middot; {l.preferredLocation}
                </td>
                <td className="px-4 py-3 font-semibold text-[#09090B]">{formatINR(l.minBudget, { compact: true })} - {formatINR(l.maxBudget, { compact: true })}</td>
                <td className="px-4 py-3 text-[#71717A]">{enumToLabel(l.source)}</td>
                <td className="px-4 py-3 text-xs">{l.assignedTo?.name ?? <span className="font-medium text-[#D97706]">Unassigned</span>}</td>
                <td className="px-4 py-3"><Badge tone={LEAD_STATUS_TONE[l.status]}>{enumToLabel(l.status)}</Badge></td>
                <td className="px-4 py-3"><Badge tone={LEAD_PRIORITY_TONE[l.priority]}>{l.priority}</Badge></td>
                <td className="px-4 py-3 font-bold text-[#09090B]">{l.score}</td>
                <td className="px-4 py-3 text-xs text-[#71717A]">{formatDate(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm bulk action" description={actionLabel()}>
        <div className="space-y-4">
          <p className="text-sm text-[#52525B]">This will update {selected.size} lead{selected.size > 1 ? "s" : ""}. Partial failures will be reported individually.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={runAction} loading={running}>Confirm</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!result} onClose={() => setResult(null)} title="Bulk action complete" description={result ? `${result.succeeded} succeeded, ${result.failed} failed out of ${result.total}` : ""}>
        {result && (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {result.results.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                {r.success ? <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" /> : <XCircle className="h-3.5 w-3.5 text-[#DC2626]" />}
                <span className="font-mono text-[#71717A]">{r.id}</span>
                {r.error && <span className="text-[#DC2626]">{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}

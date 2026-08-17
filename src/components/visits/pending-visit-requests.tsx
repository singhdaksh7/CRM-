"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, CheckCircle2, Clock, Phone, ExternalLink } from "lucide-react";

/**
 * The Admin's pending catalogue visit-request queue.
 *
 * A client tapping "Request Visit" on the public catalogue books nothing - it
 * lands here. The Admin reviews the request (client, lead, catalogue,
 * requested properties, when they asked, contact), presses [Schedule Visit],
 * picks date / time / Field Executive / properties, reads a confirmation
 * summary, and only then does [Confirm Visit] create the real Visit +
 * VisitProperty rows via POST /api/catalogues/[id]/schedule-visit.
 *
 * Duplicate protection is belt-and-braces:
 *   * an already-confirmed request renders "Visit Scheduled - View Visit" and
 *     offers no Schedule/Confirm button at all;
 *   * the Confirm button is disabled while a submit is in flight;
 *   * and the server claims the request rows with a guarded updateMany inside
 *     the same transaction that creates the Visit, so even a genuine race
 *     (two admins, two tabs) yields exactly one Visit and a 409 for the
 *     loser - which this component surfaces and then refreshes on.
 */

export interface PendingVisitRequestProperty {
  propertyId: string;
  title: string;
  propertyCode: string;
  area: string;
  isSelectable: boolean;
  requested?: boolean;
}

export interface PendingVisitRequestItem {
  id: string;
  status: "PENDING" | "SCHEDULED";
  catalogueShareId: string;
  catalogueTitle: string;
  leadId: string;
  leadCode: string;
  clientName: string;
  clientPhone: string | null;
  requestedProperties: PendingVisitRequestProperty[];
  propertyCount: number;
  requestedAtLabel: string;
  preferredDate: string | null;
  preferredWindow: string | null;
  message: string | null;
  interactionIds: string[];
  scheduledVisitId: string | null;
}

export function PendingVisitRequests({
  requests,
  catalogueOptions,
  employees,
}: {
  requests: PendingVisitRequestItem[];
  /** catalogueShareId -> every active property of that catalogue. */
  catalogueOptions: Record<string, PendingVisitRequestProperty[]>;
  employees: { id: string; name: string }[];
}) {
  if (requests.length === 0) return null;

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Visit Requests</h2>
        <Badge tone={pendingCount > 0 ? "amber" : "slate"}>
          {pendingCount} pending
        </Badge>
      </div>
      <p className="mb-3 text-xs text-[#8A94A6]">
        Clients requested these visits from a shared catalogue. Nothing is booked until you confirm.
      </p>
      <div className="space-y-3">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            options={catalogueOptions[request.catalogueShareId] ?? request.requestedProperties}
            employees={employees}
          />
        ))}
      </div>
    </section>
  );
}

function RequestCard({
  request,
  options,
  employees,
}: {
  request: PendingVisitRequestItem;
  options: PendingVisitRequestProperty[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "schedule" | "review">("idle");
  const [busy, setBusy] = useState(false);

  const requestedIds = useMemo(() => request.requestedProperties.map((p) => p.propertyId), [request.requestedProperties]);
  // Pre-filled with EXACTLY what the client asked for. The Admin may remove
  // from this, and may add only from the catalogue's own active properties -
  // it is never silently widened.
  const [selected, setSelected] = useState<string[]>(requestedIds);
  const [form, setForm] = useState({
    visitDate: request.preferredDate ?? "",
    visitTime: defaultTimeForWindow(request.preferredWindow),
    assignedToId: "",
    meetingLocation: "",
  });

  const isScheduled = request.status === "SCHEDULED" && request.scheduledVisitId;
  const executiveName = employees.find((e) => e.id === form.assignedToId)?.name ?? "Unassigned";

  function toggle(propertyId: string) {
    setSelected((prev) => (prev.includes(propertyId) ? prev.filter((id) => id !== propertyId) : [...prev, propertyId]));
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/catalogues/${request.catalogueShareId}/schedule-visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyIds: selected,
          assignedToId: form.assignedToId || null,
          // IST-anchored instant so the stored visitDate lands on the intended
          // IST calendar day whatever timezone the server runs in.
          visitDate: `${form.visitDate}T${form.visitTime || "11:00"}:00+05:30`,
          visitTime: form.visitTime,
          meetingLocation: form.meetingLocation || null,
          requestInteractionIds: request.interactionIds,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "Could not confirm this visit");
        // A 409 means someone else already confirmed it - re-render so this
        // card flips to "Visit Scheduled" instead of inviting another click.
        if (res.status === 409) router.refresh();
        return;
      }
      toast.success("Visit confirmed and the executive has been notified");
      setMode("idle");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#1B2430]">
            {request.clientName}
            <Link href={`/leads/${request.leadId}`} className="ml-2 font-mono text-xs font-normal text-[#3366FF] hover:underline">
              {request.leadCode}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-[#596579]">
            Catalogue: {request.catalogueTitle} &middot; {request.propertyCount}{" "}
            {request.propertyCount === 1 ? "property" : "properties"} requested
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#8A94A6]">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Requested {request.requestedAtLabel}
            </span>
            {request.preferredDate && <span>Prefers {request.preferredDate}</span>}
            {request.preferredWindow && <span>{request.preferredWindow}</span>}
            {request.clientPhone && (
              <a href={`tel:${request.clientPhone}`} className="inline-flex items-center gap-1 font-semibold text-[#3366FF] hover:underline">
                <Phone className="h-3 w-3" /> {request.clientPhone}
              </a>
            )}
          </p>
          {request.message && <p className="mt-1.5 rounded-xl bg-[#EFF4FF] p-2 text-xs text-[#3366FF]">&ldquo;{request.message}&rdquo;</p>}
        </div>
        <Badge tone={isScheduled ? "green" : "amber"}>{isScheduled ? "Visit Scheduled" : "Awaiting confirmation"}</Badge>
      </div>

      <ul className="mt-2 space-y-1">
        {request.requestedProperties.map((p) => (
          <li key={p.propertyId} className="text-xs text-[#596579]">
            <span className="font-mono text-[#8A94A6]">{p.propertyCode}</span> &middot; {p.title} &middot; {p.area}
            {!p.isSelectable && <span className="ml-1 font-semibold text-[#E5484D]">no longer available</span>}
          </li>
        ))}
      </ul>

      {isScheduled ? (
        <div className="mt-3">
          <Link
            href={`/visits/${request.scheduledVisitId}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#B8F3D1] bg-[#E6F9EE] px-4 text-sm font-semibold text-[#1FA971]"
          >
            <CheckCircle2 className="h-4 w-4" /> Visit Scheduled &mdash; View Visit <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : mode === "idle" ? (
        <div className="mt-3">
          <button
            onClick={() => setMode("schedule")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#C2D1FF] bg-[#EFF4FF] px-4 text-sm font-semibold text-[#3366FF]"
          >
            <CalendarPlus className="h-4 w-4" /> Schedule Visit
          </button>
        </div>
      ) : mode === "schedule" ? (
        <div className="mt-3 space-y-3 rounded-xl border border-[#E7ECF2] bg-white p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <Input type="date" value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} />
            </Field>
            <Field label="Time" required>
              <Input type="time" value={form.visitTime} onChange={(e) => setForm({ ...form, visitTime: e.target.value })} />
            </Field>
          </div>
          <Field label="Field Executive">
            <Select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Meeting Location">
            <Input value={form.meetingLocation} onChange={(e) => setForm({ ...form, meetingLocation: e.target.value })} placeholder="Property site / landmark" />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[#596579]">
              Properties ({selected.length} selected) &mdash; pre-filled with what the client asked for
            </p>
            <div className="space-y-1.5">
              {options.map((p) => (
                <label key={p.propertyId} className="flex items-start gap-2 text-xs text-[#1B2430]">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.propertyId)}
                    disabled={!p.isSelectable && !selected.includes(p.propertyId)}
                    onChange={() => toggle(p.propertyId)}
                    aria-label={`Include ${p.title} in this visit`}
                    className="mt-0.5 h-4 w-4 rounded border-[#E7ECF2] text-[#3366FF] focus:ring-[#3366FF]"
                  />
                  <span>
                    <span className="font-mono text-[#8A94A6]">{p.propertyCode}</span> {p.title} &middot; {p.area}
                    {p.requested && <span className="ml-1 font-semibold text-[#3366FF]">requested</span>}
                    {!p.isSelectable && <span className="ml-1 font-semibold text-[#E5484D]">unavailable</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("idle")} className="flex-1">Back</Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => {
                if (!form.visitDate) return toast.error("Pick a date for the visit");
                if (selected.length === 0) return toast.error("Select at least one property");
                setMode("review");
              }}
            >
              Review
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3 rounded-xl border border-[#C2D1FF] bg-[#EFF4FF] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#3366FF]">Confirm this visit</p>
          <dl className="space-y-1 text-xs text-[#1B2430]">
            <SummaryRow label="Client" value={`${request.clientName} (${request.leadCode})`} />
            <SummaryRow label="Date and time" value={`${form.visitDate} at ${form.visitTime || "11:00"} IST`} />
            <SummaryRow label="Field Executive" value={executiveName} />
            <SummaryRow label="Properties" value={`${selected.length} ${selected.length === 1 ? "property" : "properties"}`} />
          </dl>
          <p className="text-[11px] text-[#596579]">
            Confirming creates the visit and notifies the assigned executive. No message is sent to the client from here.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("schedule")} className="flex-1" disabled={busy}>Back</Button>
            <Button type="button" className="flex-1" loading={busy} disabled={busy} onClick={confirm}>Confirm Visit</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#596579]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/**
 * The client states a rough window ("Morning"), not a time. Seed the picker
 * with the middle of that window so the Admin usually only has to confirm.
 */
function defaultTimeForWindow(window: string | null): string {
  switch ((window ?? "").toLowerCase()) {
    case "morning":
      return "10:00";
    case "afternoon":
      return "15:00";
    case "evening":
      return "18:00";
    default:
      return "11:00";
  }
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, CheckCircle2, Clock, Phone, ExternalLink } from "lucide-react";

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
  catalogueOptions: Record<string, PendingVisitRequestProperty[]>;
  employees: { id: string; name: string }[];
}) {
  if (requests.length === 0) return null;

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <section className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#71717A]">
          Visit Requests
        </h2>
        <Badge tone={pendingCount > 0 ? "amber" : "slate"}>
          {pendingCount} pending
        </Badge>
      </div>
      <p className="text-xs text-[#71717A]">
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

  const requestedIds = useMemo(
    () => request.requestedProperties.map((p) => p.propertyId),
    [request.requestedProperties]
  );
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
    setSelected((prev) =>
      prev.includes(propertyId) ? prev.filter((id) => id !== propertyId) : [...prev, propertyId]
    );
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
          visitDate: `${form.visitDate}T${form.visitTime || "11:00"}:00+05:30`,
          visitTime: form.visitTime,
          meetingLocation: form.meetingLocation || null,
          requestInteractionIds: request.interactionIds,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "Could not confirm this visit");
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
    <div className="rounded-lg border border-[#E4E4E7] bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#09090B]">
            {request.clientName}
            <Link
              href={`/leads/${request.leadId}`}
              className="ml-2 font-mono text-xs font-normal text-[#09090B] hover:underline"
            >
              {request.leadCode}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-[#52525B]">
            Catalogue: {request.catalogueTitle} &middot; {request.propertyCount}{" "}
            {request.propertyCount === 1 ? "property" : "properties"} requested
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#71717A]">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Requested {request.requestedAtLabel}
            </span>
            {request.preferredDate && <span>Prefers {request.preferredDate}</span>}
            {request.preferredWindow && <span>{request.preferredWindow}</span>}
            {request.clientPhone && (
              <a
                href={`tel:${request.clientPhone}`}
                className="inline-flex items-center gap-1 font-semibold text-[#09090B] hover:underline"
              >
                <Phone className="h-3 w-3" /> {request.clientPhone}
              </a>
            )}
          </p>
          {request.message && (
            <p className="mt-2 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] p-2.5 text-xs text-[#09090B]">
              &ldquo;{request.message}&rdquo;
            </p>
          )}
        </div>
        <Badge tone={isScheduled ? "green" : "amber"}>
          {isScheduled ? "Visit Scheduled" : "Awaiting confirmation"}
        </Badge>
      </div>

      <ul className="space-y-1">
        {request.requestedProperties.map((p) => (
          <li key={p.propertyId} className="text-xs text-[#52525B]">
            <span className="font-mono text-[#71717A]">{p.propertyCode}</span> &middot; {p.title} &middot; {p.area}
            {!p.isSelectable && <span className="ml-1 font-semibold text-red-600">no longer available</span>}
          </li>
        ))}
      </ul>

      {isScheduled ? (
        <div className="pt-2">
          <Link
            href={`/visits/${request.scheduledVisitId}`}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Visit Scheduled &mdash; View Visit <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : mode === "idle" ? (
        <div className="pt-2">
          <Button
            size="sm"
            onClick={() => setMode("schedule")}
          >
            <CalendarPlus className="h-4 w-4" /> Schedule Visit
          </Button>
        </div>
      ) : mode === "schedule" ? (
        <div className="mt-3 space-y-3 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <Input
                type="date"
                value={form.visitDate}
                onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
              />
            </Field>
            <Field label="Time" required>
              <Input
                type="time"
                value={form.visitTime}
                onChange={(e) => setForm({ ...form, visitTime: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Field Executive">
            <Select
              value={form.assignedToId}
              onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Meeting Location">
            <Input
              value={form.meetingLocation}
              onChange={(e) => setForm({ ...form, meetingLocation: e.target.value })}
              placeholder="Property site / landmark"
            />
          </Field>
          <div>
            <p className="mb-2 text-xs font-semibold text-[#52525B]">
              Properties ({selected.length} selected) &mdash; pre-filled with what the client asked for
            </p>
            <div className="space-y-2">
              {options.map((p) => (
                <label key={p.propertyId} className="flex items-start gap-2.5 text-xs text-[#09090B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.propertyId)}
                    disabled={!p.isSelectable && !selected.includes(p.propertyId)}
                    onChange={() => toggle(p.propertyId)}
                    aria-label={`Include ${p.title} in this visit`}
                    className="mt-0.5 h-4 w-4 rounded border-[#E4E4E7] text-[#0A0A0A] focus:ring-[#0A0A0A]"
                  />
                  <span>
                    <span className="font-mono text-[#71717A]">{p.propertyCode}</span> {p.title} &middot; {p.area}
                    {p.requested && <span className="ml-1 font-semibold text-[#09090B]">requested</span>}
                    {!p.isSelectable && <span className="ml-1 font-semibold text-red-600">unavailable</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setMode("idle")} className="flex-1">
              Back
            </Button>
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
        <div className="mt-3 space-y-3 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#09090B]">Confirm this visit</p>
          <dl className="space-y-1.5 text-xs text-[#09090B]">
            <SummaryRow label="Client" value={`${request.clientName} (${request.leadCode})`} />
            <SummaryRow label="Date and time" value={`${form.visitDate} at ${form.visitTime || "11:00"} IST`} />
            <SummaryRow label="Field Executive" value={executiveName} />
            <SummaryRow label="Properties" value={`${selected.length} ${selected.length === 1 ? "property" : "properties"}`} />
          </dl>
          <p className="text-[11px] text-[#71717A]">
            Confirming creates the visit and notifies the assigned executive. No message is sent to the client from here.
          </p>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setMode("schedule")} className="flex-1" disabled={busy}>
              Back
            </Button>
            <Button type="button" className="flex-1" loading={busy} disabled={busy} onClick={confirm}>
              Confirm Visit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#52525B]">{label}</dt>
      <dd className="font-semibold text-[#09090B]">{value}</dd>
    </div>
  );
}

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

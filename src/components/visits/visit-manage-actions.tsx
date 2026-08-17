"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { CalendarClock, XCircle } from "lucide-react";

/**
 * Admin / Data Manager controls on the visit detail page: reschedule
 * (date, time, and/or executive) and cancel with a reason. Both hit the
 * dedicated routes, which re-check the role server-side - this component
 * only decides what to render.
 */
export function VisitManageActions({
  visitId,
  visitDate,
  visitTime,
  assignedToId,
  employees,
}: {
  visitId: string;
  visitDate: string;
  visitTime: string;
  assignedToId: string;
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "reschedule" | "cancel">("none");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ visitDate, visitTime, assignedToId });
  const [reason, setReason] = useState("");

  async function post(path: string, body: unknown, message: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Something went wrong");
        return;
      }
      toast.success(message);
      setMode("none");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Manage</h2>

      {mode === "none" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMode("reschedule")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#E7ECF2] bg-white px-4 text-sm font-semibold text-[#3366FF]"
          >
            <CalendarClock className="h-4 w-4" /> Reschedule
          </button>
          <button
            onClick={() => setMode("cancel")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#FFC7C9] bg-white px-4 text-sm font-semibold text-[#E5484D]"
          >
            <XCircle className="h-4 w-4" /> Cancel Visit
          </button>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} />
            </Field>
            <Field label="Time">
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
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("none")} className="flex-1">Back</Button>
            <Button
              type="button"
              loading={busy}
              className="flex-1"
              onClick={() =>
                post(
                  "reschedule",
                  // Send the date as an IST-noon instant so the stored
                  // visitDate lands on the intended IST calendar day no
                  // matter what timezone the server runs in.
                  { visitDate: `${form.visitDate}T${form.visitTime || "11:00"}:00+05:30`, visitTime: form.visitTime, assignedToId: form.assignedToId || null },
                  "Visit rescheduled"
                )
              }
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="space-y-3">
          <Field label="Reason" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this visit being cancelled?" />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("none")} className="flex-1">Back</Button>
            <Button
              type="button"
              loading={busy}
              className="flex-1"
              onClick={() => {
                if (reason.trim().length < 3) return toast.error("A cancellation reason is required");
                post("cancel", { reason: reason.trim() }, "Visit cancelled");
              }}
            >
              Confirm Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

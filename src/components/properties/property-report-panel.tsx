"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Select, Textarea, Field } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Flag, FileWarning } from "lucide-react";

const REPORT_TYPES = ["WRONG_RENT", "WRONG_PHOTOS", "WRONG_AREA", "OWNER_NOT_RESPONDING", "DUPLICATE_LISTING", "PROPERTY_CLOSED", "ALREADY_RENTED", "ALREADY_SOLD", "NEEDS_NEW_PHOTOS", "REQUIRES_VERIFICATION"];
const AVAILABILITY_REASONS = ["ALREADY_RENTED", "ALREADY_SOLD", "PROPERTY_LOCKED", "OWNER_UNREACHABLE", "OTHER"];

/** Objectives 7 & 10 - executive-facing report submission from the property detail page. */
export function PropertyReportPanel({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "report" | "unavailable">("none");
  const [submitting, setSubmitting] = useState(false);

  // Report Data Issue state
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [reportNote, setReportNote] = useState("");

  // Report Unavailable state (Change 3 - photo required)
  const [reason, setReason] = useState(AVAILABILITY_REASONS[0]);
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  async function submitReport() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: reportType, note: reportNote || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to submit report");
      toast.success("Report submitted for admin review");
      setMode("none");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUnavailable() {
    if (!photo) {
      toast.error("A photo is required to report a property unavailable");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("file", photo);
      form.set("purpose", "AVAILABILITY_REPORT");
      const uploadRes = await fetch(`/api/properties/${propertyId}/images`, { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? "Failed to upload photo");
      const { image } = await uploadRes.json();

      const res = await fetch(`/api/properties/${propertyId}/availability-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: availabilityNote || null, photoId: image.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to submit availability report");
      toast.success("Availability report submitted - property marked pending verification");
      setMode("none");
      setPhoto(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Report an Issue</h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="touch" variant="secondary" className="flex-1" onClick={() => setMode("report")}>
          <Flag className="h-4 w-4" /> Report Data Issue
        </Button>
        <Button size="touch" variant="danger" className="flex-1" onClick={() => setMode("unavailable")}>
          <FileWarning className="h-4 w-4" /> Report Unavailable
        </Button>
      </div>

      <Dialog open={mode === "report"} onClose={() => setMode("none")} title="Report Data Issue">
        <div className="space-y-3">
          <Field label="Issue Type">
            <Select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              {REPORT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Textarea rows={3} value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode("none")}>Cancel</Button>
            <Button onClick={submitReport} disabled={submitting}>{submitting ? "Submitting..." : "Submit Report"}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={mode === "unavailable"} onClose={() => setMode("none")} title="Report Property Unavailable" description="A photo is required to prevent fake reports.">
        <div className="space-y-3">
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {AVAILABILITY_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </Select>
          </Field>
          <Field label="Evidence Photo" required>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </Field>
          <Field label="Note (optional)">
            <Textarea rows={2} value={availabilityNote} onChange={(e) => setAvailabilityNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode("none")}>Cancel</Button>
            <Button variant="danger" onClick={submitUnavailable} disabled={submitting}>{submitting ? "Submitting..." : "Submit Report"}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

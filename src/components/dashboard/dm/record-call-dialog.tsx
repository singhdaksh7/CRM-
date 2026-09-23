"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/form";
import { PhoneDisplay } from "./phone-display";
import { PhoneCall, PhoneOff } from "lucide-react";
import {
  CALL_OUTCOME_LABELS,
  NO_ANSWER_OUTCOMES,
  SPOKE_OUTCOMES,
  outcomeRequiresCallback,
  outcomeRequiresVisitExpected,
  outcomeRequiresLostReason,
  outcomeRequiresNote,
  type CallOutcome,
} from "@/lib/dm-call-outcomes";
import { enumToLabel } from "@/lib/utils";

const LOST_REASON_CATEGORIES = ["PRICE", "LOCATION", "COMPETITION", "BUDGET", "LOAN_REJECTED", "OWNER_ISSUE", "CLIENT_NOT_INTERESTED", "OTHER"] as const;

type Step = "ASK" | "OUTCOME" | "DETAIL";

export function RecordCallDialog({ open, onClose, leadId, clientName, phone }: { open: boolean; onClose: () => void; leadId: string; clientName: string; phone: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("ASK");
  const [spokeWithCustomer, setSpokeWithCustomer] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [note, setNote] = useState("");
  const [lostReasonCategory, setLostReasonCategory] = useState<(typeof LOST_REASON_CATEGORIES)[number]>("CLIENT_NOT_INTERESTED");
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOutcome, setSavedOutcome] = useState<CallOutcome | null>(null);

  function reset() {
    setStep("ASK");
    setSpokeWithCustomer(null);
    setOutcome(null);
    setCallbackDate("");
    setCallbackTime("");
    setNote("");
    setLostReasonCategory("CLIENT_NOT_INTERESTED");
    setLostReasonDetail("");
    setSavedOutcome(null);
  }

  function close() {
    reset();
    onClose();
  }

  function chooseSpoke(spoke: boolean) {
    setSpokeWithCustomer(spoke);
    setStep("OUTCOME");
  }

  function chooseOutcome(value: CallOutcome) {
    setOutcome(value);
    setStep("DETAIL");
  }

  const needsCallback = outcome ? outcomeRequiresCallback(outcome) : false;
  const needsVisitExpected = outcome ? outcomeRequiresVisitExpected(outcome) : false;
  const needsLostReason = outcome ? outcomeRequiresLostReason(outcome) : false;
  const needsNote = outcome ? outcomeRequiresNote(outcome) : false;
  const needsDateTime = needsCallback || needsVisitExpected;

  async function save() {
    if (!outcome || spokeWithCustomer === null) return;
    if (needsDateTime && (!callbackDate || !callbackTime)) {
      toast.error(needsVisitExpected ? "Enter when the customer will come" : "Enter a callback date and time");
      return;
    }
    if (needsLostReason && lostReasonCategory === "OTHER" && !lostReasonDetail.trim()) {
      toast.error("Add a short detail when reason is Other");
      return;
    }
    if (needsNote && !note.trim()) {
      toast.error("Add a short comment describing what happened");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/record-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spokeWithCustomer,
        outcome,
        callbackDate: needsDateTime ? callbackDate : null,
        callbackTime: needsDateTime ? callbackTime : null,
        note: note.trim() || null,
        lostReasonCategory: needsLostReason ? lostReasonCategory : null,
        lostReasonDetail: needsLostReason ? lostReasonDetail.trim() || null : null,
      }),
    });
    setSaving(false);

    if (res.ok) {
      setSavedOutcome(outcome);
      toast.success("Call recorded");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to save - the lead has not moved, please try again");
    }
  }

  return (
    <Dialog open={open} onClose={close} title={`Record Call — ${clientName}`} description="This records the call outcome only. It does not place a call or send WhatsApp.">
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2">
          <PhoneDisplay phone={phone} />
        </div>

        {savedOutcome ? (
          <SavedSummary outcome={savedOutcome} leadId={leadId} onClose={close} />
        ) : step === "ASK" ? (
          <div>
            <p className="mb-3 text-sm font-semibold text-[#09090B]">Did you speak with the customer?</p>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" size="lg" className="justify-center" onClick={() => chooseSpoke(true)}>
                <PhoneCall className="h-4 w-4 text-[#16A34A]" /> Yes
              </Button>
              <Button type="button" variant="secondary" size="lg" className="justify-center" onClick={() => chooseSpoke(false)}>
                <PhoneOff className="h-4 w-4 text-[#DC2626]" /> No
              </Button>
            </div>
          </div>
        ) : step === "OUTCOME" ? (
          <div>
            <p className="mb-3 text-sm font-semibold text-[#09090B]">{spokeWithCustomer ? "What did the customer say?" : "What happened?"}</p>
            <div className="grid gap-2">
              {(spokeWithCustomer ? SPOKE_OUTCOMES : NO_ANSWER_OUTCOMES).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseOutcome(value)}
                  className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-2.5 text-left text-sm font-medium text-[#09090B] hover:border-[#09090B] hover:bg-[#F4F4F5] transition-colors cursor-pointer"
                >
                  {CALL_OUTCOME_LABELS[value]}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStep("ASK")} className="mt-3 text-xs font-semibold text-[#71717A] hover:text-[#09090B] cursor-pointer">
              &larr; Back
            </button>
          </div>
        ) : outcome ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[#09090B]">{CALL_OUTCOME_LABELS[outcome]}</p>

            {needsDateTime && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={needsVisitExpected ? "Coming on" : "Callback date"} required>
                  <Input type="date" value={callbackDate} onChange={(e) => setCallbackDate(e.target.value)} required />
                </Field>
                <Field label="Time" required>
                  <Input type="time" value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} required />
                </Field>
              </div>
            )}

            {needsLostReason && (
              <Field label="Reason" required>
                <Select value={lostReasonCategory} onChange={(e) => setLostReasonCategory(e.target.value as (typeof LOST_REASON_CATEGORIES)[number])}>
                  {LOST_REASON_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {enumToLabel(c)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {needsLostReason && lostReasonCategory === "OTHER" && (
              <Field label="Detail" required>
                <Input value={lostReasonDetail} maxLength={500} onChange={(e) => setLostReasonDetail(e.target.value)} placeholder="Short detail" />
              </Field>
            )}

            <Field label="Customer comments" required={needsNote} hint={needsNote ? undefined : "Optional"}>
              <Textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "What happened?" : "Optional note"} />
            </Field>

            {outcome === "VISIT_REQUIRED" && (
              <p className="text-xs text-[#71717A]">
                This records the interaction only. Open the lead to pick a property and schedule the visit.
              </p>
            )}

            <div className="flex justify-between items-center gap-2 pt-2">
              <button type="button" onClick={() => setStep("OUTCOME")} className="text-xs font-semibold text-[#71717A] hover:text-[#09090B] cursor-pointer">
                &larr; Back
              </button>
              <Button type="button" onClick={save} loading={saving}>
                Save Call
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function SavedSummary({ outcome, leadId, onClose }: { outcome: CallOutcome; leadId: string; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[#52525B]">
        Recorded as <span className="font-semibold text-[#09090B]">{CALL_OUTCOME_LABELS[outcome]}</span>.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        {outcome === "VISIT_REQUIRED" && (
          <Link href={`/leads/${leadId}`} className="inline-flex items-center rounded-lg border border-[#E4E4E7] bg-white px-3.5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5]">
            Schedule Visit
          </Link>
        )}
        <Link href={`/leads/${leadId}`} className="inline-flex items-center rounded-lg border border-[#E4E4E7] bg-white px-3.5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5]">
          Open Lead
        </Link>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

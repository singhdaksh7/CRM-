"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Navigation, Phone, CheckCircle2, SkipForward, Star, AlertTriangle, ChevronRight, Play, Flag } from "lucide-react";
import { Badge, VISIT_PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bestDirectionsUrl } from "@/lib/external-directions";
import { enumToLabel } from "@/lib/utils";
// Pure helpers only - importing from @/lib/visits here would pull Prisma and
// the notification/auth stack into the client bundle.
import { RATING_DESCRIPTIONS } from "@/lib/visit-progress";
import { HUMAN_FOLLOWUP_TYPES } from "@/lib/follow-up-types";
import type { VisitDetailDTO, VisitDetailProperty } from "@/lib/visit-detail-dto";
import type { FollowUpType } from "@prisma/client";
import { CaptureLocationButton } from "@/components/properties/capture-location-button";

/**
 * The Field Executive's on-site workflow, in one client component.
 *
 * Mobile-first by construction: every action is a full-width (or near
 * full-width) control with a min-height of 48px, comfortably above the 44px
 * touch-target floor, and the star row uses 44x44 hit areas. It follows the
 * card + rounded-xl + #0A0A0A accent conventions the rest of the app
 * already uses rather than introducing a new visual language.
 */
export function VisitPropertyWorkflow({
  visit,
  likedPropertyIds = [],
  coverUrls = {},
}: {
  visit: VisitDetailDTO;
  likedPropertyIds?: string[];
  coverUrls?: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Which property currently has its reaction form open. Opening happens
  // automatically right after [Mark as Visited], per the required flow.
  const [reactionFor, setReactionFor] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const notStarted = visit.status === "SCHEDULED" || visit.status === "CONFIRMED" || visit.status === "CLIENT_REACHED" || visit.status === "EMPLOYEE_REACHED";
  const isDone = visit.status === "COMPLETED" || visit.status === "CANCELLED";

  async function call(url: string, init: RequestInit, successMessage: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Something went wrong");
        return false;
      }
      toast.success(successMessage);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function startVisit() {
    await call(`/api/visits/${visit.id}/start`, { method: "POST" }, "Visit started");
  }

  async function markVisited(property: VisitDetailProperty) {
    const ok = await call(
      `/api/visits/${visit.id}/properties/${property.propertyId}`,
      { method: "PATCH", body: JSON.stringify({ status: "VISITED" }) },
      `${property.title} marked as visited`
    );
    // Requirement: marking a property visited immediately opens the
    // client-reaction form.
    if (ok) setReactionFor(property.propertyId);
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#09090B]">{visit.progress.label}</p>
            <p className="mt-0.5 text-xs text-[#71717A]">
              {visit.progress.resolved} of {visit.progress.total} resolved
              {visit.progress.averageRating !== null && <> &middot; avg reaction {visit.progress.averageRating}/5</>}
            </p>
          </div>
          <Badge tone="slate">{enumToLabel(visit.status)}</Badge>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F4F4F5]">
          <div
            className="h-full rounded-full bg-[#0A0A0A] transition-all"
            style={{ width: `${visit.progress.total === 0 ? 0 : Math.round((visit.progress.resolved / visit.progress.total) * 100)}%` }}
          />
        </div>
      </div>

      {/* Start Visit */}
      {notStarted && (
        <button
          onClick={startVisit}
          disabled={busy}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] px-5 text-base font-bold text-white shadow-xs transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          <Play className="h-5 w-5" /> Start Visit
        </button>
      )}

      {/* Properties */}
      <div className="space-y-3">
        {visit.properties.map((p) => (
          <PropertyCard
            key={p.visitPropertyId}
            visitId={visit.id}
            property={p}
            busy={busy}
            locked={isDone}
            reactionOpen={reactionFor === p.propertyId}
            onOpenReaction={() => setReactionFor(p.propertyId)}
            onCloseReaction={() => setReactionFor(null)}
            onMarkVisited={() => markVisited(p)}
            call={call}
            liked={likedPropertyIds.includes(p.propertyId)}
            coverUrl={coverUrls[p.propertyId]}
            fromCatalogue={Boolean(visit.catalogue)}
          />
        ))}
      </div>

      {/* Complete Visit */}
      {!isDone && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          {!visit.progress.allResolved ? (
            <p className="text-sm text-zinc-500">
              {visit.progress.remaining} propert{visit.progress.remaining === 1 ? "y" : "ies"} still pending. Mark each one visited or skipped to finish the visit.
            </p>
          ) : completing ? (
            <CompleteVisitForm visit={visit} busy={busy} onCancel={() => setCompleting(false)} />
          ) : (
            <button
              onClick={() => setCompleting(true)}
              disabled={busy}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1FA971] px-5 text-base font-bold text-white shadow-xs transition-colors hover:bg-[#178A5C] disabled:opacity-50"
            >
              <Flag className="h-5 w-5" /> Complete Visit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type CallFn = (url: string, init: RequestInit, successMessage: string) => Promise<boolean>;

function PropertyCard({
  visitId,
  property,
  busy,
  locked,
  reactionOpen,
  onOpenReaction,
  onCloseReaction,
  onMarkVisited,
  call,
  liked,
  coverUrl,
  fromCatalogue,
}: {
  visitId: string;
  property: VisitDetailProperty;
  busy: boolean;
  locked: boolean;
  reactionOpen: boolean;
  onOpenReaction: () => void;
  onCloseReaction: () => void;
  onMarkVisited: () => void;
  call: CallFn;
  liked?: boolean;
  coverUrl?: string;
  fromCatalogue?: boolean;
}) {
  const [skipping, setSkipping] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const resolved = property.status !== "PENDING";

  return (
    <div className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-white shadow-xs">
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="h-40 w-full object-cover bg-[#F4F4F5]" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#09090B]">
              <span className="mr-1.5 text-[#71717A]">{property.sequence + 1}.</span>
              {property.title}
            </p>
            <p className="mt-0.5 text-xs text-[#52525B]">
              {property.area}
              {property.floorNumber !== null && <> &middot; Floor {property.floorNumber}</>}
              {" "}&middot; {property.builtUpAreaSqft} sqft{property.assetClass === "COMMERCIAL" ? <> &middot; {enumToLabel(property.propertyType)}</> : <> &middot; {property.bhk} BHK</>}
            </p>
            <p className="mt-0.5 text-xs text-[#71717A]">{property.address}</p>
            <p className="mt-1 text-sm font-semibold text-[#09090B]">{property.price ?? "Price on request"}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#71717A]">
              {liked ? "❤️ Liked by Client" : fromCatalogue ? "Shared in Catalogue" : "Added Manually"}
            </p>
            <a href={`/properties/${property.propertyId}`} className="mt-1 inline-block text-xs font-semibold text-[#09090B] hover:underline">
              Open Property
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={VISIT_PROPERTY_STATUS_TONE[property.status] ?? "slate"}>{enumToLabel(property.status)}</Badge>
              <Badge tone={property.isAvailable ? "green" : "red"}>{enumToLabel(property.availabilityStatus)}</Badge>
              <Badge tone="slate">{property.inventorySource}</Badge>
              {property.isPreferred && <Badge tone="purple">Client preferred</Badge>}
            </div>
          </div>
        </div>

        {/* Contact instructions - only rendered when the server put them in the DTO. */}
        {(property.ownerPhone || property.partnerPhone || property.keyAvailability || property.entryInstructions) && (
          <div className="mt-3 rounded-xl bg-[#FAFAFA] border border-[#E4E4E7] p-3 text-xs text-[#52525B]">
            {property.ownerName && <p><span className="font-semibold text-[#09090B]">Owner:</span> {property.ownerName}</p>}
            {property.partnerName && <p><span className="font-semibold text-[#09090B]">Partner:</span> {property.partnerName}</p>}
            {property.keyAvailability && <p className="mt-0.5"><span className="font-semibold text-[#09090B]">Keys:</span> {property.keyAvailability}</p>}
            {property.entryInstructions && <p className="mt-0.5"><span className="font-semibold text-[#09090B]">Entry:</span> {property.entryInstructions}</p>}
          </div>
        )}

        {/* Recorded reaction */}
        {property.reactionRating !== null && (
          <div className="mt-3 rounded-xl bg-[#FAFAFA] border border-[#E4E4E7] p-3">
            <StarDisplay rating={property.reactionRating} />
            <p className="mt-1 text-xs font-semibold text-[#09090B]">{RATING_DESCRIPTIONS[property.reactionRating]}</p>
            {property.reactionNote && <p className="mt-1 text-xs text-[#52525B]">{property.reactionNote}</p>}
          </div>
        )}
        {property.skipReason && <p className="mt-2 text-xs text-amber-700">Reason: {property.skipReason}</p>}
      </div>

      {/* Actions */}
      <div className="border-t border-[#E4E4E7] bg-[#FAFAFA] p-3">
        <div className="flex flex-wrap gap-2">
          <a
            href={bestDirectionsUrl({ latitude: property.latitude, longitude: property.longitude, address: property.directionsAddress })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm font-semibold text-[#09090B] hover:bg-zinc-50"
          >
            <Navigation className="h-4 w-4" /> Navigate
          </a>
          {(property.ownerPhone || property.partnerPhone) && (
            <a
              href={`tel:${property.ownerPhone ?? property.partnerPhone}`}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm font-semibold text-[#52525B] hover:bg-zinc-50"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          )}
          <CaptureLocationButton propertyId={property.propertyId} />
        </div>

        {!locked && (
          <div className="mt-2 space-y-2">
            {!resolved && (
              <>
                <button
                  onClick={onMarkVisited}
                  disabled={busy}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] px-4 text-sm font-bold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-5 w-5" /> Mark as Visited
                </button>
                {!skipping ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSkipping(true)}
                      disabled={busy}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm font-semibold text-[#52525B] hover:bg-zinc-50 disabled:opacity-50"
                    >
                      <SkipForward className="h-4 w-4" /> Skip
                    </button>
                    <button
                      onClick={() =>
                        call(
                          `/api/visits/${visitId}/properties/${property.propertyId}`,
                          { method: "PATCH", body: JSON.stringify({ status: "UNAVAILABLE", skipReason: "Reported unavailable on site" }) },
                          "Marked as could not be shown"
                        )
                      }
                      disabled={busy}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <AlertTriangle className="h-4 w-4" /> Unavailable
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      className="min-h-[48px] w-full rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm text-[#09090B]"
                    >
                      <option value="">Reason (optional)</option>
                      <option value="Client changed mind">Client changed mind</option>
                      <option value="Property unavailable">Property unavailable</option>
                      <option value="Owner unavailable">Owner unavailable</option>
                      <option value="Ran out of time">Ran out of time</option>
                      <option value="Location rejected by client">Location rejected by client</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSkipping(false)}
                        className="min-h-[44px] flex-1 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm font-semibold text-[#52525B]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await call(
                            `/api/visits/${visitId}/properties/${property.propertyId}`,
                            { method: "PATCH", body: JSON.stringify({ status: "SKIPPED", skipReason: skipReason || null }) },
                            "Property skipped"
                          );
                          if (ok) setSkipping(false);
                        }}
                        disabled={busy}
                        className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Confirm Skip
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {resolved && !reactionOpen && (
              <button
                onClick={onOpenReaction}
                disabled={busy}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm font-semibold text-[#09090B] hover:bg-zinc-50 disabled:opacity-50"
              >
                <Star className="h-4 w-4" /> {property.reactionRating === null ? "Add client reaction" : "Edit client reaction"}
              </button>
            )}

            {reactionOpen && (
              <ReactionForm
                visitId={visitId}
                property={property}
                busy={busy}
                call={call}
                onDone={onCloseReaction}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 1-5 star capture plus an optional note. The note is never required. */
function ReactionForm({
  visitId,
  property,
  busy,
  call,
  onDone,
}: {
  visitId: string;
  property: VisitDetailProperty;
  busy: boolean;
  call: CallFn;
  onDone: () => void;
}) {
  const [rating, setRating] = useState<number | null>(property.reactionRating);
  const [note, setNote] = useState(property.reactionNote ?? "");
  const [saved, setSaved] = useState(false);

  if (saved) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
        <p className="text-sm font-semibold text-emerald-700">Reaction saved.</p>
        <button
          onClick={onDone}
          className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#0A0A0A] px-4 text-sm font-bold text-white hover:bg-zinc-800"
        >
          Next Property <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3">
      <p className="text-sm font-bold text-[#09090B]">How did the client react to this property?</p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"} - ${RATING_DESCRIPTIONS[n]}`}
            onClick={() => setRating(n)}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-zinc-200"
          >
            <Star className={`h-7 w-7 ${rating !== null && n <= rating ? "fill-amber-500 text-amber-500" : "text-zinc-300"}`} />
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs font-semibold text-[#09090B]">{rating !== null ? RATING_DESCRIPTIONS[rating] : "Tap a star"}</p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Client feedback or your notes (optional)"
        className="mt-2 w-full rounded-xl border border-[#E4E4E7] bg-white p-3 text-sm text-[#09090B] placeholder:text-[#71717A]"
      />

      <div className="mt-2 flex gap-2">
        <button onClick={onDone} className="min-h-[48px] flex-1 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm font-semibold text-[#52525B] hover:bg-zinc-50">
          Skip for now
        </button>
        <button
          onClick={async () => {
            const ok = await call(
              `/api/visits/${visitId}/properties/${property.propertyId}`,
              {
                method: "PATCH",
                body: JSON.stringify({ status: property.status === "PENDING" ? "VISITED" : property.status, reactionRating: rating, reactionNote: note.trim() || null }),
              },
              "Reaction saved"
            );
            if (ok) setSaved(true);
          }}
          disabled={busy}
          className="min-h-[48px] flex-1 rounded-xl bg-[#0A0A0A] px-3 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Save Reaction
        </button>
      </div>
    </div>
  );
}

/**
 * Overall interest + optional summary + preferred-property shortlist, then
 * (spec item 11) a "Next Action?" step before the page refreshes into the
 * COMPLETED state - None / Call / WhatsApp / Add Follow-up / Schedule
 * another visit. A follow-up created here goes through the SAME
 * POST /api/follow-ups route the lead workspace uses, so it surfaces in
 * Today's Work exactly like any other follow-up (spec item 12) - this is
 * pure CRM state, no WhatsApp/call is ever sent automatically.
 */
function CompleteVisitForm({ visit, busy, onCancel }: { visit: VisitDetailDTO; busy: boolean; onCancel: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [preferred, setPreferred] = useState<string[]>(visit.properties.filter((p) => p.isPreferred).map((p) => p.propertyId));
  const visited = visit.properties.filter((p) => p.status === "VISITED");
  const [justCompleted, setJustCompleted] = useState(false);

  async function confirmComplete() {
    const res = await fetch(`/api/visits/${visit.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overallRating: rating, summary: summary.trim() || null, preferredPropertyIds: preferred }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to complete visit");
      return;
    }
    toast.success("Visit completed");
    // Deliberately does NOT router.refresh() yet - "Next Action?" is shown
    // first so the field executive isn't dropped straight into the
    // now-locked COMPLETED view without a chance to act on it.
    setJustCompleted(true);
  }

  if (justCompleted) {
    return <NextActionAfterComplete leadId={visit.client.leadId} clientPhone={visit.client.phone} clientName={visit.client.name} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[#09090B]">Overall, how interested was the client?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"} overall - ${RATING_DESCRIPTIONS[n]}`}
            onClick={() => setRating(n)}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-zinc-200"
          >
            <Star className={`h-7 w-7 ${rating !== null && n <= rating ? "fill-amber-500 text-amber-500" : "text-zinc-300"}`} />
          </button>
        ))}
      </div>
      <p className="text-xs font-semibold text-[#09090B]">{rating !== null ? RATING_DESCRIPTIONS[rating] : "Optional"}</p>

      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={3}
        placeholder="Visit summary (optional)"
        className="w-full rounded-xl border border-[#E4E4E7] bg-white p-3 text-sm text-[#09090B] placeholder:text-[#71717A]"
      />

      {visited.length > 0 && (
        <div>
          <p className="text-sm font-bold text-[#09090B]">Client&apos;s preferred properties</p>
          <p className="text-xs text-[#71717A]">Optional. Tap any the client shortlisted.</p>
          <div className="mt-2 space-y-1.5">
            {visited.map((p) => {
              const on = preferred.includes(p.propertyId);
              return (
                <button
                  key={p.propertyId}
                  type="button"
                  onClick={() => setPreferred(on ? preferred.filter((id) => id !== p.propertyId) : [...preferred, p.propertyId])}
                  className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors ${on ? "border-[#0A0A0A] bg-zinc-100 text-[#09090B]" : "border-[#E4E4E7] bg-white text-[#52525B] hover:bg-zinc-50"}`}
                >
                  <span className="truncate">{p.title}</span>
                  {p.reactionRating !== null && <span className="shrink-0 text-xs">{p.reactionRating}/5</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="min-h-[52px] flex-1 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm font-semibold text-[#52525B] hover:bg-zinc-50">
          Back
        </button>
        <Button onClick={confirmComplete} loading={busy} className="min-h-[52px] flex-1">
          Confirm Complete
        </Button>
      </div>
    </div>
  );
}

/**
 * spec item 11 - "Next Action?" after [Complete Visit]: None / Call /
 * WhatsApp / Add Follow-up / Schedule another visit. Follow-up creation
 * posts to the existing POST /api/follow-ups (same route/validation the
 * lead workspace uses) so it appears in Today's Work like any other
 * follow-up. Call/WhatsApp are real links, never an automatic send.
 * "Schedule another visit" and "Done" both hand off to the lead workspace,
 * which already has the full Schedule Visit form - not duplicated here.
 */
function NextActionAfterComplete({ leadId, clientPhone, clientName }: { leadId: string; clientPhone: string | null; clientName: string }) {
  const router = useRouter();
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [followUpType, setFollowUpType] = useState<FollowUpType>("GENERAL_FOLLOW_UP");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // Feature 4 (daily-ops hardening): a completed visit shouldn't leave the
  // lead without a next action, but it also shouldn't nudge a broker into
  // creating an accidental duplicate. `null` = still checking, `undefined`
  // once checked and none exists.
  const [existingUpcoming, setExistingUpcoming] = useState<{ type: FollowUpType; dueDate: string } | null | undefined>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/follow-ups?leadId=${leadId}&status=PENDING`)
      .then((res) => (res.ok ? res.json() : { followUps: [] }))
      .then((data) => {
        if (cancelled) return;
        const upcoming = (data.followUps ?? []).find((f: { dueDate: string }) => new Date(f.dueDate).getTime() >= Date.now());
        setExistingUpcoming(upcoming ? { type: upcoming.type, dueDate: upcoming.dueDate } : undefined);
      })
      .catch(() => !cancelled && setExistingUpcoming(undefined));
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  function done() {
    router.refresh();
  }

  async function saveFollowUp() {
    if (!date) return toast.error("Pick a date");
    setSaving(true);
    const dueDate = time ? `${date}T${time}` : date;
    const res = await fetch("/api/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, type: followUpType, dueDate, notes: note.trim() || null }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Follow-up created");
      done();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to create follow-up");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3">
      <p className="text-sm font-bold text-[#09090B]">Visit completed. What&apos;s next for {clientName}?</p>

      {/* Feature 4 (daily-ops hardening): surfaces whether this lead already
          has an upcoming open follow-up (avoids nudging toward a duplicate)
          or has none at all (a clear, non-blocking warning - completion is
          never blocked on this). */}
      {existingUpcoming === undefined && !addingFollowUp && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          No next follow-up scheduled yet for {clientName}.
        </p>
      )}
      {existingUpcoming && (
        <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">
          Already has a follow-up scheduled for {new Date(existingUpcoming.dueDate).toLocaleString("en-IN")}.
        </p>
      )}

      {!addingFollowUp ? (
        <div className="grid grid-cols-2 gap-2">
          {clientPhone && (
            <a href={`tel:${clientPhone}`} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-semibold text-[#09090B] hover:bg-zinc-50">
              Call Client
            </a>
          )}
          {clientPhone && (
            <a href={`https://wa.me/${clientPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-semibold text-[#25D366] hover:bg-zinc-50">
              WhatsApp Client
            </a>
          )}
          <button onClick={() => setAddingFollowUp(true)} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-semibold text-[#09090B] hover:bg-zinc-50">
            {existingUpcoming ? "Add Another Follow-up" : "Add Follow-up"}
          </button>
          <a href={`/leads/${leadId}`} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-semibold text-[#52525B] hover:bg-zinc-50">
            Schedule Another Visit
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          <select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)} className="min-h-[44px] w-full rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm">
            {HUMAN_FOLLOWUP_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[44px] flex-1 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="min-h-[44px] flex-1 rounded-xl border border-[#E4E4E7] bg-white px-3 text-sm" />
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className="w-full rounded-xl border border-[#E4E4E7] bg-white p-2.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => setAddingFollowUp(false)} className="min-h-[44px] flex-1 rounded-xl border border-[#E4E4E7] bg-white text-sm font-semibold text-[#52525B]">
              Back
            </button>
            <Button onClick={saveFollowUp} loading={saving} className="min-h-[44px] flex-1">
              Save Follow-up
            </Button>
          </div>
        </div>
      )}

      <button onClick={done} className="w-full text-center text-xs font-semibold text-[#71717A] hover:text-[#09090B]">
        None - Done
      </button>
    </div>
  );
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-4 w-4 ${n <= rating ? "fill-[#E6A23C] text-[#E6A23C]" : "text-[#C9D2DE]"}`} />
      ))}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  BedDouble,
  Bath,
  Ruler,
  Phone,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  CalendarPlus,
  HelpCircle,
  Navigation,
  Clock,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PublicCatalogueDTO, PublicCatalogueProperty } from "@/lib/catalogues";
import { catalogueSpecChips } from "@/lib/catalogue-specs";

function recordPageInteraction(token: string, type: "CALL_REQUESTED" | "WHATSAPP_REQUESTED") {
  const body = JSON.stringify({ type });
  const url = `/api/catalogues/public/${token}/interactions`;
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    if (sent) return;
  }
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

export function PublicCatalogueView({ catalogue, token }: { catalogue: PublicCatalogueDTO; token: string }) {
  const brokerPhone = catalogue.brokerageContactPhone?.replace(/\D/g, "") || null;
  const whatsappHref = brokerPhone
    ? `https://wa.me/${brokerPhone}?text=${encodeURIComponent(`Hi, I'm ${catalogue.clientFirstName}, following up on the "${catalogue.title}" catalogue.`)}`
    : null;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDone, setBulkDone] = useState<Set<string>>(new Set());

  function toggleSelected(propertyId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  }

  useEffect(() => {
    if (catalogue.status !== "ACTIVE") return;
    fetch(`/api/catalogues/public/${token}/view`, { method: "POST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (catalogue.status !== "ACTIVE") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-8">
        <p className="text-lg font-bold text-[#1B2430]">
          This catalogue is {catalogue.status === "EXPIRED" ? "no longer available" : "no longer active"}.
        </p>
        <p className="mt-2 text-sm text-[#596579]">Please contact your broker for updated options.</p>
        {catalogue.brokerageContactPhone && (
          <a href={`tel:${catalogue.brokerageContactPhone}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#3366FF] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#2952CC]">
            <Phone className="h-4 w-4" /> Call {catalogue.brokerageName}
          </a>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <h1 className="text-xl font-bold text-[#1B2430]">{catalogue.title}</h1>
        <p className="mt-1 text-sm text-[#596579]">Hi {catalogue.clientFirstName}, {catalogue.introMessage || `here are properties matching ${catalogue.requirementSummary}.`}</p>
        {catalogue.expiresAt && <p className="mt-1 text-xs text-[#8A94A6]">This link expires on {new Date(catalogue.expiresAt).toLocaleDateString("en-IN")}</p>}
      </div>

      {catalogue.properties.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[#8A94A6]">No properties in this catalogue.</p>
      ) : (
        <div className="mt-4 space-y-4 pb-24">
          {catalogue.properties.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              token={token}
              selected={selectedIds.has(p.id)}
              onToggleSelected={p.isAvailable ? () => toggleSelected(p.id) : undefined}
              bulkRequested={bulkDone.has(p.id)}
            />
          ))}
        </div>
      )}

      {(catalogue.brokerageContactPhone || whatsappHref) && (
        <div className="mt-6 rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <p className="mb-3 text-sm font-bold text-[#1B2430]">Have questions or ready to move forward?</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {catalogue.brokerageContactPhone && (
              <a
                href={`tel:${catalogue.brokerageContactPhone}`}
                onClick={() => recordPageInteraction(token, "CALL_REQUESTED")}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white border border-[#E7ECF2] px-4 py-2.5 text-sm font-semibold text-[#1B2430] hover:bg-[#F3F6FA]"
              >
                <Phone className="h-4 w-4" /> Call Broker
              </a>
            )}
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => recordPageInteraction(token, "WHATSAPP_REQUESTED")}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20bd5a]"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp Broker
              </a>
            )}
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <BulkVisitBar
          token={token}
          selectedIds={selectedIds}
          onDone={(ids) => setBulkDone((prev) => new Set([...prev, ...ids]))}
        />
      )}
    </main>
  );
}

function BulkVisitBar({
  token,
  selectedIds,
  onDone,
}: {
  token: string;
  selectedIds: Set<string>;
  onDone: (ids: string[]) => void;
}) {
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredWindow, setPreferredWindow] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.all(
      ids.map((propertyId) =>
        fetch(`/api/catalogues/public/${token}/interactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "VISIT_REQUESTED", propertyId, preferredDate, preferredWindow, message }),
        }).then((res) => res.ok)
      )
    );
    setSubmitting(false);
    const succeeded = ids.filter((_, i) => results[i]);
    if (succeeded.length > 0) {
      onDone(succeeded);
      toast.success(`Visit requested for ${succeeded.length} ${succeeded.length === 1 ? "property" : "properties"}.`);
    }
    if (succeeded.length < ids.length) {
      toast.error("Some requests couldn't be sent - please try again.");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E7ECF2] bg-white p-4 shadow-lg">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-sm font-bold text-[#1B2430]">Request visits for selected properties ({selectedIds.size})</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            className="flex-1 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] px-2 py-1.5 text-xs text-[#1B2430]"
          />
          <select
            value={preferredWindow}
            onChange={(e) => setPreferredWindow(e.target.value)}
            className="flex-1 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] px-2 py-1.5 text-xs text-[#1B2430]"
          >
            <option value="">Any time</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Evening">Evening</option>
          </select>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional message"
            className="flex-1 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] px-2 py-1.5 text-xs text-[#1B2430]"
          />
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-xl bg-[#3366FF] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#2952CC]"
          >
            {submitting ? "Requesting…" : "Request Visits"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[#8A94A6]">We&apos;ll have the broker contact you to confirm these visits - they aren&apos;t booked automatically.</p>
      </div>
    </div>
  );
}

/**
 * Public catalogue's per-property image gallery. `images` is the full
 * ordered ACTIVE-image URL list already resolved server-side (see
 * getPublicOrderedImageUrls / withResolvedCoverImages in catalogues.ts) -
 * only ever short-lived signed URLs or the legacy Property.images URLs,
 * never a storageKey/bucket/credential. Falls back to just `coverImage`
 * when the gallery list is empty (older catalogues / properties without
 * PropertyImage rows), and to a plain "No photo available" state when
 * there's nothing at all. A single broken image (expired signed URL,
 * network hiccup) is swapped for the placeholder in place - it never takes
 * down the rest of the catalogue.
 */
function PropertyGallery({ images, coverImage, title, area }: { images: string[]; coverImage: string | null; title: string; area: string }) {
  const gallery = images.length > 0 ? images : coverImage ? [coverImage] : [];
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const touchStartX = useRef<number | null>(null);

  const safeIndex = Math.min(index, Math.max(gallery.length - 1, 0));
  const current = gallery[safeIndex];
  const currentFailed = failed.has(safeIndex);

  function go(delta: number) {
    setIndex((i) => {
      const next = i + delta;
      if (next < 0) return gallery.length - 1;
      if (next >= gallery.length) return 0;
      return next;
    });
  }

  if (gallery.length === 0 || !current) {
    return <div className="flex h-full w-full items-center justify-center text-xs text-[#8A94A6]">No photo available</div>;
  }

  return (
    <div
      className="relative h-full w-full touch-pan-y"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 40) return;
        go(delta > 0 ? -1 : 1);
      }}
    >
      {/* A broken image never removes Previous/Next/dots - the viewer can
          always navigate away from it to a working photo, rather than
          getting stuck on a dead end. */}
      {currentFailed ? (
        <div className="flex h-full w-full items-center justify-center text-xs text-[#8A94A6]">Photo unavailable</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- external signed/legacy URLs, loaded lazily
        <img
          src={current}
          alt={`${title} in ${area}${gallery.length > 1 ? ` - photo ${safeIndex + 1} of ${gallery.length}` : ""}`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed((prev) => new Set(prev).add(safeIndex))}
        />
      )}
      {gallery.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            {safeIndex + 1} / {gallery.length}
          </span>
          <div className="absolute bottom-2 left-2 flex gap-1">
            {gallery.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === safeIndex}
                className={`h-1.5 w-1.5 rounded-full ${i === safeIndex ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PropertyCard({
  property,
  token,
  selected,
  onToggleSelected,
  bulkRequested,
}: {
  property: PublicCatalogueProperty;
  token: string;
  selected: boolean;
  onToggleSelected?: () => void;
  bulkRequested: boolean;
}) {
  const [expanded, setExpanded] = useState<"visit" | "question" | "not-interested" | null>(null);
  const [message, setMessage] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredWindow, setPreferredWindow] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [preference, setPreference] = useState<"LIKED" | "NOT_INTERESTED" | "UNDECIDED">("UNDECIDED");

  useEffect(() => {
    fetch(`/api/catalogues/public/${token}/preferences`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const row = data?.preferences?.find((p: { propertyId: string }) => p.propertyId === property.id);
        if (row?.status === "LIKED" || row?.status === "NOT_INTERESTED") setPreference(row.status);
      })
      .catch(() => {});
  }, [token, property.id]);

  async function setPropertyPreference(status: "LIKED" | "NOT_INTERESTED", note?: string) {
    setSubmitting(true);
    const res = await fetch(`/api/catalogues/public/${token}/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: property.id, status, note }),
    });
    setSubmitting(false);
    if (res.ok) {
      setPreference(status);
      setExpanded(null);
      setMessage("");
      toast.success(status === "LIKED" ? "Marked as interested." : "Marked as not interested.");
    } else {
      toast.error("Something went wrong - please try again.");
    }
  }

  async function interact(type: string, extra: Record<string, string | undefined> = {}) {
    setSubmitting(true);
    const res = await fetch(`/api/catalogues/public/${token}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, propertyId: property.id, ...extra }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone((prev) => new Set(prev).add(type));
      setExpanded(null);
      setMessage("");
      toast.success("Thanks! The broker will be notified.");
    } else {
      toast.error("Something went wrong - please try again.");
    }
  }

  const mapsUrl = property.latitude && property.longitude ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}` : null;
  const isAvailable = property.isAvailable;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-xs ${isAvailable ? "border-[#E7ECF2]" : "border-[#E7ECF2] opacity-75"}`}>
      <div className="relative h-56 w-full bg-[#FAFBFC]">
        <PropertyGallery images={property.images} coverImage={property.coverImage} title={property.title} area={property.area} />
        {!isAvailable && (
          <div className="absolute left-2 top-2">
            <Badge tone="slate">{property.status === "RENTED" ? "Already Rented" : property.status === "SOLD" ? "Already Sold" : "No Longer Available"}</Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-[#1B2430]">{property.title}</h3>
          {onToggleSelected && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#596579]">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                aria-label={`Select ${property.title} for a bulk visit request`}
                className="h-4 w-4 rounded border-[#E7ECF2] text-[#3366FF] focus:ring-[#3366FF]"
              />
              Select
            </label>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-[#596579]">
          <MapPin className="h-3.5 w-3.5 text-[#3366FF]" /> {property.address ?? property.area}, Delhi
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#596579]">
          {catalogueSpecChips(property).map((chip) => (
            <span key={chip.label} className="flex items-center gap-1">
              {chip.kind === "bhk" ? <BedDouble className="h-3.5 w-3.5" /> : chip.kind === "bath" ? <Bath className="h-3.5 w-3.5" /> : chip.kind === "area" ? <Ruler className="h-3.5 w-3.5" /> : <BriefcaseBusiness className="h-3.5 w-3.5" />} {chip.label}
            </span>
          ))}
        </div>
        {property.price && <p className="mt-2 text-lg font-bold text-[#3366FF]">{property.price}</p>}
        {property.brokerage && <p className="text-xs text-[#8A94A6]">Brokerage: {property.brokerage}</p>}
        <p className="mt-1 text-xs text-[#596579]">{property.furnishing.replace(/_/g, " ")}</p>
        {property.availableFrom && (
          <p className="mt-1 flex items-center gap-1 text-xs text-[#8A94A6]">
            <Clock className="h-3 w-3" /> Available from {new Date(property.availableFrom).toLocaleDateString("en-IN")}
          </p>
        )}
        {property.customNote && <p className="mt-2 rounded-xl bg-[#EFF4FF] p-2 text-xs text-[#3366FF]">{property.customNote}</p>}

        {property.amenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {property.amenities.slice(0, 6).map((a) => (
              <Badge key={a} tone="slate">{a}</Badge>
            ))}
          </div>
        )}

        {isAvailable && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1B2430] border border-[#E7ECF2] hover:bg-[#F3F6FA]">
                  <Navigation className="h-3.5 w-3.5" /> {property.locationDisclosure === "APPROXIMATE" ? "Open Approximate Area" : "Open in Maps"}
                </a>
              )}
              <ActionButton
                icon={ThumbsUp}
                label="Interested"
                done={preference === "LIKED"}
                onClick={() => setPropertyPreference("LIKED")}
                loading={submitting}
                tone="green"
              />
              <ActionButton
                icon={ThumbsDown}
                label="Not Interested"
                done={preference === "NOT_INTERESTED"}
                onClick={() => setExpanded(expanded === "not-interested" ? null : "not-interested")}
                tone="slate"
              />
              <ActionButton icon={CalendarPlus} label="Request Visit" done={done.has("VISIT_REQUESTED") || bulkRequested} onClick={() => setExpanded(expanded === "visit" ? null : "visit")} tone="indigo" lockWhenDone />
              <ActionButton icon={HelpCircle} label="Ask a Question" done={done.has("QUESTION_ASKED")} onClick={() => setExpanded(expanded === "question" ? null : "question")} tone="amber" lockWhenDone />
            </div>

            {expanded === "not-interested" && (
              <InlineForm
                placeholder="Optional: tell us why (e.g. too far, over budget)"
                message={message}
                setMessage={setMessage}
                onSubmit={() => setPropertyPreference("NOT_INTERESTED", message)}
                submitting={submitting}
              />
            )}
            {expanded === "question" && (
              <InlineForm
                placeholder="What would you like to know about this property?"
                message={message}
                setMessage={setMessage}
                onSubmit={() => interact("QUESTION_ASKED", { message })}
                submitting={submitting}
                required
              />
            )}
            {expanded === "visit" && (
              <div className="mt-3 space-y-2 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-3">
                <div className="flex gap-2">
                  <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="flex-1 rounded-xl border border-[#E7ECF2] bg-white px-2 py-1.5 text-xs text-[#1B2430]" />
                  <select value={preferredWindow} onChange={(e) => setPreferredWindow(e.target.value)} className="flex-1 rounded-xl border border-[#E7ECF2] bg-white px-2 py-1.5 text-xs text-[#1B2430]">
                    <option value="">Any time</option>
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Evening">Evening</option>
                  </select>
                </div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message" rows={2} className="w-full rounded-xl border border-[#E7ECF2] bg-white px-2 py-1.5 text-xs text-[#1B2430]" />
                <button
                  onClick={() => interact("VISIT_REQUESTED", { preferredDate, preferredWindow, message })}
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#3366FF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#2952CC]"
                >
                  Confirm Visit Request
                </button>
                <p className="text-[11px] text-[#8A94A6]">We&apos;ll have the broker contact you to confirm this visit - it isn&apos;t booked automatically.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
  done,
  tone,
  lockWhenDone = false,
}: {
  icon: typeof ThumbsUp;
  label: string;
  onClick: () => void;
  loading?: boolean;
  done: boolean;
  tone: "green" | "slate" | "indigo" | "amber";
  lockWhenDone?: boolean;
}) {
  const toneClasses: Record<string, string> = {
    green: "text-[#1FA971] border-[#B8F3D1] bg-[#E6F9EE]",
    slate: "text-[#596579] border-[#E7ECF2] bg-white",
    indigo: "text-[#3366FF] border-[#C2D1FF] bg-[#EFF4FF]",
    amber: "text-[#E6A23C] border-[#FCE6C3] bg-[#FFF8EE]",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading || (lockWhenDone && done)}
      aria-pressed={done}
      className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold border disabled:opacity-60 ${toneClasses[tone]} ${done ? "ring-1 ring-offset-1 ring-current" : ""}`}
    >
      <Icon className="h-3.5 w-3.5" /> {lockWhenDone && done ? "Recorded" : label}
    </button>
  );
}

function InlineForm({
  placeholder,
  message,
  setMessage,
  onSubmit,
  submitting,
  required,
}: {
  placeholder: string;
  message: string;
  setMessage: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  required?: boolean;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-3">
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={placeholder} rows={2} className="w-full rounded-xl border border-[#E7ECF2] bg-white px-2 py-1.5 text-xs text-[#1B2430]" />
      <button
        onClick={onSubmit}
        disabled={submitting || (required && !message.trim())}
        className="w-full rounded-xl bg-[#3366FF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#2952CC]"
      >
        Submit
      </button>
    </div>
  );
}

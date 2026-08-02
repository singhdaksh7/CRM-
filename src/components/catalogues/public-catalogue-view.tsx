"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import type { PublicCatalogueDTO, PublicCatalogueProperty } from "@/lib/catalogues";

export function PublicCatalogueView({ catalogue, token }: { catalogue: PublicCatalogueDTO; token: string }) {
  const brokerPhone = catalogue.brokerageContactPhone.replace(/\D/g, "");
  const whatsappHref = `https://wa.me/${brokerPhone}?text=${encodeURIComponent(`Hi, I'm ${catalogue.clientFirstName}, following up on the "${catalogue.title}" catalogue.`)}`;

  useEffect(() => {
    // Records the page view once on mount; the route handler owns
    // viewer-identity (cookie) + dedup, so this is a fire-and-forget call.
    if (catalogue.status !== "ACTIVE") return;
    fetch(`/api/catalogues/${token}/view`, { method: "POST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (catalogue.status !== "ACTIVE") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-8">
        <p className="text-lg font-semibold text-slate-700">
          This catalogue is {catalogue.status === "EXPIRED" ? "no longer available" : "no longer active"}.
        </p>
        <p className="mt-2 text-sm text-slate-500">Please contact your broker for updated options.</p>
        <a href={`tel:${catalogue.brokerageContactPhone}`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white">
          <Phone className="h-4 w-4" /> Call {catalogue.brokerageName}
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{catalogue.title}</h1>
        <p className="mt-1 text-sm text-slate-500">Hi {catalogue.clientFirstName}, {catalogue.introMessage || `here are properties matching ${catalogue.requirementSummary}.`}</p>
        {catalogue.expiresAt && <p className="mt-1 text-xs text-slate-400">This link expires on {new Date(catalogue.expiresAt).toLocaleDateString("en-IN")}</p>}
      </div>

      {catalogue.properties.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">No properties in this catalogue.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {catalogue.properties.map((p) => (
            <PropertyCard key={p.id} property={p} token={token} />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-800">Have questions or ready to move forward?</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={`tel:${catalogue.brokerageContactPhone}`} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
            <Phone className="h-4 w-4" /> Call Broker
          </a>
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500">
            <MessageCircle className="h-4 w-4" /> WhatsApp Broker
          </a>
        </div>
      </div>
    </main>
  );
}

function PropertyCard({ property, token }: { property: PublicCatalogueProperty; token: string }) {
  const [expanded, setExpanded] = useState<"visit" | "question" | "not-interested" | null>(null);
  const [message, setMessage] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredWindow, setPreferredWindow] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());

  async function interact(type: string, extra: Record<string, string | undefined> = {}) {
    setSubmitting(true);
    const res = await fetch(`/api/catalogues/${token}/interactions`, {
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
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm ${isAvailable ? "border-slate-200" : "border-slate-200 opacity-75"}`}>
      <div className="relative h-56 w-full bg-slate-100">
        {property.coverImage && <img src={property.coverImage} alt={property.title} className="h-full w-full object-cover" />}
        {!isAvailable && (
          <div className="absolute left-2 top-2">
            <Badge tone="slate">{property.status === "RENTED" ? "Already Rented" : property.status === "SOLD" ? "Already Sold" : "No Longer Available"}</Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold text-slate-900">{property.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5" /> {property.address ?? property.area}, Delhi
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {property.bhk} BHK</span>
          <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" /> {property.bathrooms} Bath</span>
          <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> {property.builtUpAreaSqft} sqft</span>
        </div>
        {property.price && <p className="mt-2 text-lg font-semibold text-indigo-600">{property.price}</p>}
        {property.brokerage && <p className="text-xs text-slate-400">Brokerage: {property.brokerage}</p>}
        <p className="mt-1 text-xs text-slate-500">{property.furnishing.replace(/_/g, " ")}</p>
        {property.availableFrom && (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" /> Available from {new Date(property.availableFrom).toLocaleDateString("en-IN")}
          </p>
        )}
        {property.customNote && <p className="mt-2 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-700">{property.customNote}</p>}

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
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  <Navigation className="h-3.5 w-3.5" /> Open in Maps
                </a>
              )}
              <ActionButton icon={ThumbsUp} label="Interested" done={done.has("INTERESTED")} onClick={() => interact("INTERESTED")} loading={submitting} tone="green" />
              <ActionButton icon={ThumbsDown} label="Not Interested" done={done.has("NOT_INTERESTED")} onClick={() => setExpanded(expanded === "not-interested" ? null : "not-interested")} tone="slate" />
              <ActionButton icon={CalendarPlus} label="Request Visit" done={done.has("VISIT_REQUESTED")} onClick={() => setExpanded(expanded === "visit" ? null : "visit")} tone="indigo" />
              <ActionButton icon={HelpCircle} label="Ask a Question" done={done.has("QUESTION_ASKED")} onClick={() => setExpanded(expanded === "question" ? null : "question")} tone="amber" />
            </div>

            {expanded === "not-interested" && (
              <InlineForm
                placeholder="Optional: tell us why (e.g. too far, over budget)"
                message={message}
                setMessage={setMessage}
                onSubmit={() => interact("NOT_INTERESTED", { message })}
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
              <div className="mt-3 space-y-2 rounded-lg border border-slate-100 p-3">
                <div className="flex gap-2">
                  <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="flex-1 rounded-lg border-0 px-2 py-1.5 text-xs ring-1 ring-inset ring-slate-300" />
                  <select value={preferredWindow} onChange={(e) => setPreferredWindow(e.target.value)} className="flex-1 rounded-lg border-0 px-2 py-1.5 text-xs ring-1 ring-inset ring-slate-300">
                    <option value="">Any time</option>
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Evening">Evening</option>
                  </select>
                </div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message" rows={2} className="w-full rounded-lg border-0 px-2 py-1.5 text-xs ring-1 ring-inset ring-slate-300" />
                <button
                  onClick={() => interact("VISIT_REQUESTED", { preferredDate, preferredWindow, message })}
                  disabled={submitting}
                  className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Confirm Visit Request
                </button>
                <p className="text-[11px] text-slate-400">We&apos;ll have the broker contact you to confirm this visit - it isn&apos;t booked automatically.</p>
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
}: {
  icon: typeof ThumbsUp;
  label: string;
  onClick: () => void;
  loading?: boolean;
  done: boolean;
  tone: "green" | "slate" | "indigo" | "amber";
}) {
  const toneClasses: Record<string, string> = {
    green: "text-emerald-700 ring-emerald-300 bg-emerald-50",
    slate: "text-slate-700 ring-slate-300 bg-white",
    indigo: "text-indigo-700 ring-indigo-300 bg-indigo-50",
    amber: "text-amber-700 ring-amber-300 bg-amber-50",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading || done}
      className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset disabled:opacity-60 ${toneClasses[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" /> {done ? "Recorded" : label}
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
    <div className="mt-3 space-y-2 rounded-lg border border-slate-100 p-3">
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={placeholder} rows={2} className="w-full rounded-lg border-0 px-2 py-1.5 text-xs ring-1 ring-inset ring-slate-300" />
      <button
        onClick={onSubmit}
        disabled={submitting || (required && !message.trim())}
        className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        Submit
      </button>
    </div>
  );
}

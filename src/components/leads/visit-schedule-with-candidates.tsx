"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Input, Field } from "@/components/ui/form";
import { formatINR, enumToLabel } from "@/lib/utils";
import { Heart, Search } from "lucide-react";

type Candidate = {
  propertyId: string;
  title: string;
  location: string;
  price: number | null;
  listingType: string;
  bhk: number;
  available: boolean;
  preference: "LIKED" | "NOT_INTERESTED" | "UNDECIDED" | null;
  catalogueTitle: string | null;
  thumbnailUrl: string | null;
  source: "liked" | "shared" | "manual";
};

/** Field Executive or Admin only - who a visit can actually be assigned to. */
type VisitAssignee = { id: string; name: string; role: string };

/**
 * DM/Admin visit scheduling with Liked / Shared / Manual groups.
 * Persists exact selected propertyIds via existing POST /api/visits → VisitProperty.
 */
export function VisitScheduleWithCandidates({
  leadId,
  visitAssignees,
  preselectedPropertyId,
}: {
  leadId: string;
  visitAssignees: VisitAssignee[];
  preselectedPropertyId?: string | null;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState<Candidate[]>([]);
  const [shared, setShared] = useState<Candidate[]>([]);
  const [manual, setManual] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [manualQuery, setManualQuery] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [employeeNotes, setEmployeeNotes] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/leads/${leadId}/visit-property-candidates`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setLiked(data.liked ?? []);
        setShared(data.shared ?? []);
        setManual(data.manual ?? []);
        // Available liked properties are suggested but not forced.
        let defaultSelected = (data.liked ?? []).filter((c: Candidate) => c.available).map((c: Candidate) => c.propertyId);
        if (preselectedPropertyId && !defaultSelected.includes(preselectedPropertyId)) {
          defaultSelected = [...defaultSelected, preselectedPropertyId];
        }
        setSelected(defaultSelected);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [leadId, preselectedPropertyId]);

  function toggle(id: string, available: boolean) {
    if (!available) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function remove(id: string) {
    setSelected((prev) => prev.filter((x) => x !== id));
  }

  async function schedule() {
    if (selected.length === 0) return toast.error("Select at least one property");
    if (!visitDate || !visitTime) return toast.error("Date and time are required");
    setScheduling(true);
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        propertyId: selected[0],
        propertyIds: selected,
        assignedToId: assignedToId || null,
        visitDate,
        visitTime,
        meetingLocation: meetingLocation || null,
        employeeNotes: employeeNotes || null,
      }),
    });
    setScheduling(false);
    if (res.ok) {
      toast.success("Visit scheduled");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      if (body.requiresOverride) toast.error("Scheduling conflict - resolve in Visits module");
      else toast.error(body.error ?? "Failed to schedule visit");
    }
  }

  const allById = new Map<string, Candidate>();
  for (const c of [...liked, ...shared, ...manual]) allById.set(c.propertyId, c);

  const filteredManual = manual.filter(
    (c) => !manualQuery || c.title.toLowerCase().includes(manualQuery.toLowerCase()) || c.location.toLowerCase().includes(manualQuery.toLowerCase())
  );

  if (!loaded) return <p className="text-sm text-zinc-400">Loading property candidates…</p>;

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
      <CandidateGroup
        title="Liked by Client"
        badge="❤️ Liked by Client"
        items={liked}
        selected={selected}
        onToggle={toggle}
      />
      <CandidateGroup title="Shared with Client" items={shared} selected={selected} onToggle={toggle} />
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Add Manually</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} placeholder="Search available properties…" className="pl-8 text-xs" />
        </div>
        <CandidateGroup title="" items={filteredManual.slice(0, 12)} selected={selected} onToggle={toggle} compact />
      </div>

      {selected.length > 0 && (
        <div className="space-y-1 rounded-xl border border-zinc-900/10 bg-zinc-900/[0.04] p-3">
          <p className="text-xs font-bold text-zinc-900">Selected ({selected.length})</p>
          {selected.map((id) => {
            const c = allById.get(id);
            return (
              <div key={id} className="flex items-center justify-between text-xs text-zinc-900">
                <span className="truncate">{c?.title ?? id}</span>
                <button type="button" className="font-semibold text-rose-600 hover:underline" onClick={() => remove(id)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Assigned To">
          <Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Unassigned</option>
            {visitAssignees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {enumToLabel(e.role)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Meeting location (optional)">
          <Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes (optional)">
        <Input value={employeeNotes} onChange={(e) => setEmployeeNotes(e.target.value)} />
      </Field>
      <Button onClick={schedule} loading={scheduling} disabled={selected.length === 0}>
        Schedule Visit ({selected.length})
      </Button>
    </div>
  );
}

function CandidateGroup({
  title,
  badge,
  items,
  selected,
  onToggle,
  compact,
}: {
  title: string;
  badge?: string;
  items: Candidate[];
  selected: string[];
  onToggle: (id: string, available: boolean) => void;
  compact?: boolean;
}) {
  if (items.length === 0 && !compact) {
    return title ? <p className="text-xs text-zinc-400">{title}: none yet</p> : null;
  }
  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{title}</p>}
      {items.map((c) => {
        const price = c.listingType === "RENT" ? formatINR(c.price, { suffix: "month" }) : formatINR(c.price, { compact: true });
        const checked = selected.includes(c.propertyId);
        return (
          <label
            key={c.propertyId}
            className={`flex cursor-pointer gap-3 rounded-xl border bg-white p-2.5 transition-colors ${c.available ? "border-zinc-200 hover:border-zinc-300" : "border-rose-200 opacity-75"}`}
          >
            <input
              type="checkbox"
              className="mt-1 accent-zinc-900"
              checked={checked}
              disabled={!c.available}
              onChange={() => onToggle(c.propertyId, c.available)}
            />
            <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
              {c.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-900">{c.title}</p>
              <p className="text-xs text-zinc-500">
                {c.location} · {c.bhk} BHK · {price}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                {badge && c.source === "liked" && (
                  <span className="inline-flex items-center gap-0.5 text-rose-600">
                    <Heart className="h-3 w-3" /> {badge}
                  </span>
                )}
                {!c.available && <span className="text-rose-600">Unavailable</span>}
                {c.catalogueTitle && <span className="text-zinc-400">{c.catalogueTitle}</span>}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

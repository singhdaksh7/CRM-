"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, Textarea, Checkbox, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { PropertyPickerDialog, type PickerProperty } from "@/components/properties/property-picker-dialog";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import {
  Sparkles,
  Copy,
  Send,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  ImageOff,
  ShieldCheck,
  Star,
  Camera,
  RefreshCw,
  AlertTriangle,
  Eye,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types mirroring the /api/leads/[id]/match response shape (dates arrive as
// ISO strings once serialized through JSON, unlike the Prisma types).
// ---------------------------------------------------------------------------

interface MatchReason {
  label: string;
  matched: boolean;
  detail: string;
}

export interface ClientMatchProperty {
  id: string;
  propertyCode: string;
  title: string;
  area: string;
  address: string;
  listingType: "RENT" | "SALE";
  status: string;
  propertyType: string;
  bhk: number;
  bathrooms: number;
  furnishing: string;
  builtUpAreaSqft: number;
  floorNumber: number | null;
  totalFloors: number | null;
  monthlyRent: number | null;
  maintenanceCharge: number | null;
  salePrice: number | null;
  coverImage: string | null;
  images: string;
  amenities: string;
  availableFrom: string | null;
  createdAt: string;
}

interface MatchResult {
  property: ClientMatchProperty;
  score: number;
  reasons: MatchReason[];
  aboveBudget: boolean;
  overagePct: number;
  budgetTier: string;
  locationMatchKind: "exact" | "nearby" | "none";
  verified: boolean;
  hasImages: boolean;
}

interface SectionedMatches {
  bestMatches: MatchResult[];
  nearBudget: MatchResult[];
  nearbyLocalities: MatchResult[];
  slightlyAboveBudget: MatchResult[];
  otherSuggestions: MatchResult[];
}

type SectionKey = keyof SectionedMatches;

const SECTION_META: { key: SectionKey; label: string; hint: string }[] = [
  { key: "bestMatches", label: "Best Matches", hint: "High score, within budget, exact locality" },
  { key: "nearBudget", label: "Near Your Budget", hint: "Within budget, other criteria vary" },
  { key: "nearbyLocalities", label: "Nearby Localities", hint: "Adjacent localities to the preferred one" },
  { key: "slightlyAboveBudget", label: "Slightly Above Budget", hint: "Within the selected tolerance" },
  { key: "otherSuggestions", label: "Other Suggestions", hint: "Still qualifies, weaker overall match" },
];

/** Common shape a shortlist entry's property needs for display - a subset both a real MatchResult.property and a manually-picked PickerProperty can satisfy. */
interface ShortlistProperty {
  id: string;
  propertyCode: string;
  title: string;
  area: string;
  address: string | null;
  listingType: "RENT" | "SALE";
  status: string;
  bhk: number;
  furnishing: string;
  builtUpAreaSqft: number | null;
  floorNumber: number | null;
  monthlyRent: number | null;
  maintenanceCharge: number | null;
  salePrice: number | null;
  coverImage: string | null;
}

interface ShortlistEntry {
  propertyId: string;
  property: ShortlistProperty;
  matchScore: number | null; // null = manually added, no synthetic score
  reasons: MatchReason[];
  aboveBudget: boolean;
  addedManually: boolean;
  addedByUserName: string | null;
  customNote: string;
  internalNote: string;
  priceVisible: boolean;
  addressVisible: boolean;
  brokerageVisible: boolean;
  isTopPick: boolean;
}

interface LeadSummary {
  id: string;
  clientName: string;
  phone: string;
  preferredLocation: string;
  preferredBhk: number | null;
  minBudget: number;
  maxBudget: number;
  requirementType: string;
}

interface CreatedCatalogue {
  id: string;
  token: string;
  previewMessage: string;
  publicUrl: string;
}

function priceOf(p: { listingType: "RENT" | "SALE"; monthlyRent: number | null; salePrice: number | null }): number {
  return p.listingType === "RENT" ? p.monthlyRent ?? 0 : p.salePrice ?? 0;
}

function formatPrice(p: { listingType: "RENT" | "SALE"; monthlyRent: number | null; salePrice: number | null }): string {
  return p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true });
}

function parseAmenities(json: string): string[] {
  try {
    const parsed = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function PropertyMatchingWorkspace({
  lead,
  currentUserId,
  currentUserName,
}: {
  lead: LeadSummary;
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();

  const [tolerance, setTolerance] = useState("0.2");
  const [radius, setRadius] = useState("0");
  const [sort, setSort] = useState<"score" | "price_asc" | "price_desc" | "newest">("score");
  const [sections, setSections] = useState<SectionedMatches | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(["bestMatches"]));

  // Client-side filters over the already-fetched result set.
  const [exactLocalityOnly, setExactLocalityOnly] = useState(false);
  const [includeNearby, setIncludeNearby] = useState(true);
  const [bhkFilter, setBhkFilter] = useState("");
  const [furnishingFilter, setFurnishingFilter] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [imagesOnly, setImagesOnly] = useState(false);
  const [immediateOnly, setImmediateOnly] = useState(false);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("");
  const [amenityFilter, setAmenityFilter] = useState<Set<string>>(new Set());

  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [title, setTitle] = useState(`Shortlist for ${lead.clientName}`);
  const [introMessage, setIntroMessage] = useState("");
  const [includePrice, setIncludePrice] = useState(true);
  const [includeAddress, setIncludeAddress] = useState(false);
  const [includeBrokerage, setIncludeBrokerage] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedCatalogue | null>(null);
  const [sending, setSending] = useState(false);

  function fetchMatches() {
    setLoading(true);
    fetch(`/api/leads/${lead.id}/match?tolerance=${tolerance}&radius=${radius}`)
      .then((r) => r.json())
      .then((data: { sections: SectionedMatches }) => {
        setSections(data.sections);
        const order: SectionKey[] = ["bestMatches", "nearBudget", "nearbyLocalities", "slightlyAboveBudget", "otherSuggestions"];
        const firstNonEmpty = order.find((k) => (data.sections?.[k]?.length ?? 0) > 0);
        setOpenSections(firstNonEmpty ? new Set([firstNonEmpty]) : new Set());
      })
      .catch(() => toast.error("Failed to load matching properties"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and whenever tolerance/radius change
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, tolerance, radius]);

  const allMatchesById = useMemo(() => {
    const map = new Map<string, MatchResult>();
    if (sections) {
      for (const meta of SECTION_META) {
        for (const m of sections[meta.key]) map.set(m.property.id, m);
      }
    }
    return map;
  }, [sections]);

  const totalMatchCount = useMemo(() => {
    if (!sections) return 0;
    return SECTION_META.reduce((sum, meta) => sum + sections[meta.key].length, 0);
  }, [sections]);

  const availableAmenities = useMemo(() => {
    if (!sections) return [];
    const set = new Set<string>();
    for (const meta of SECTION_META) {
      for (const m of sections[meta.key]) parseAmenities(m.property.amenities).forEach((a) => set.add(a));
    }
    return Array.from(set).sort();
  }, [sections]);

  function passesFilters(m: MatchResult): boolean {
    if (exactLocalityOnly && m.locationMatchKind !== "exact") return false;
    if (!includeNearby && m.locationMatchKind === "nearby") return false;
    if (bhkFilter && String(m.property.bhk) !== bhkFilter) return false;
    if (furnishingFilter && m.property.furnishing !== furnishingFilter) return false;
    const price = priceOf(m.property);
    if (minPrice && price < Number(minPrice)) return false;
    if (maxPrice && price > Number(maxPrice)) return false;
    if (verifiedOnly && !m.verified) return false;
    if (imagesOnly && !m.hasImages) return false;
    if (immediateOnly && m.property.availableFrom && new Date(m.property.availableFrom) > new Date()) return false;
    if (propertyTypeFilter && m.property.propertyType !== propertyTypeFilter) return false;
    if (amenityFilter.size > 0) {
      const amenities = parseAmenities(m.property.amenities);
      if (!amenities.some((a) => amenityFilter.has(a))) return false;
    }
    return true;
  }

  function sortList(list: MatchResult[]): MatchResult[] {
    const copy = [...list];
    if (sort === "price_asc") copy.sort((a, b) => priceOf(a.property) - priceOf(b.property));
    else if (sort === "price_desc") copy.sort((a, b) => priceOf(b.property) - priceOf(a.property));
    else if (sort === "newest") copy.sort((a, b) => new Date(b.property.createdAt).getTime() - new Date(a.property.createdAt).getTime());
    else copy.sort((a, b) => b.score - a.score);
    return copy;
  }

  const filteredSections = useMemo(() => {
    if (!sections) return null;
    const result = {} as SectionedMatches;
    for (const meta of SECTION_META) {
      result[meta.key] = sortList(sections[meta.key].filter(passesFilters));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, exactLocalityOnly, includeNearby, bhkFilter, furnishingFilter, minPrice, maxPrice, verifiedOnly, imagesOnly, immediateOnly, propertyTypeFilter, amenityFilter, sort]);

  const allEmpty = sections !== null && totalMatchCount === 0;

  const shortlistIds = useMemo(() => new Set(shortlist.map((s) => s.propertyId)), [shortlist]);

  function toggleShortlist(m: MatchResult) {
    if (shortlistIds.has(m.property.id)) {
      setShortlist((prev) => prev.filter((s) => s.propertyId !== m.property.id));
      return;
    }
    setShortlist((prev) => [
      ...prev,
      {
        propertyId: m.property.id,
        property: m.property,
        matchScore: m.score,
        reasons: m.reasons,
        aboveBudget: m.aboveBudget,
        addedManually: false,
        addedByUserName: null,
        customNote: "",
        internalNote: "",
        priceVisible: true,
        addressVisible: false,
        brokerageVisible: false,
        isTopPick: false,
      },
    ]);
  }

  function addManualProperty(p: PickerProperty) {
    if (shortlistIds.has(p.id)) return;
    const price = p.listingType === "RENT" ? p.monthlyRent : p.salePrice;
    const aboveBudget = lead.requirementType === (p.listingType === "RENT" ? "RENT" : "BUY") && price !== null && price > lead.maxBudget;
    setShortlist((prev) => [
      ...prev,
      {
        propertyId: p.id,
        property: {
          id: p.id,
          propertyCode: p.propertyCode,
          title: p.title,
          area: p.area,
          address: null,
          listingType: p.listingType,
          status: p.status,
          bhk: p.bhk,
          furnishing: p.furnishing,
          builtUpAreaSqft: null,
          floorNumber: null,
          monthlyRent: p.monthlyRent,
          maintenanceCharge: null,
          salePrice: p.salePrice,
          coverImage: p.coverImage,
        },
        matchScore: null,
        reasons: [],
        aboveBudget,
        addedManually: true,
        addedByUserName: currentUserName,
        customNote: "",
        internalNote: "",
        priceVisible: true,
        addressVisible: false,
        brokerageVisible: false,
        isTopPick: false,
      },
    ]);
    setPickerOpen(false);
    toast.success("Added to shortlist");
  }

  function move(index: number, direction: -1 | 1) {
    setShortlist((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(propertyId: string) {
    setShortlist((prev) => prev.filter((s) => s.propertyId !== propertyId));
  }

  function toggleTopPick(propertyId: string) {
    setShortlist((prev) => {
      const current = prev.find((s) => s.propertyId === propertyId);
      const turningOn = !current?.isTopPick;
      return prev.map((s) => ({ ...s, isTopPick: turningOn && s.propertyId === propertyId }));
    });
  }

  function updateEntry(propertyId: string, patch: Partial<ShortlistEntry>) {
    setShortlist((prev) => prev.map((s) => (s.propertyId === propertyId ? { ...s, ...patch } : s)));
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) {
          toast.error("You can compare up to 3 properties at a time");
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  const comparedMatches = useMemo(() => Array.from(compareIds).map((id) => allMatchesById.get(id)).filter((m): m is MatchResult => Boolean(m)), [compareIds, allMatchesById]);

  function warningsFor(entry: ShortlistEntry): string[] {
    const warnings: string[] = [];
    if (entry.property.status !== "AVAILABLE") warnings.push(`Property status is ${enumToLabel(entry.property.status)}, not Available`);
    if (!entry.property.coverImage) warnings.push("No cover image set for this property");
    if (entry.addressVisible && includeAddress) warnings.push("Exact address will be visible to the client");
    if (entry.aboveBudget) warnings.push("Priced above the client's stated budget");
    // "Price differs from when it was added" is intentionally not computed -
    // this session-only builder doesn't capture a price-at-add-time
    // snapshot, and fabricating one would be misleading. The dedicated
    // PROPERTY_PRICE_CHANGED_AFTER_SHARE hook (Workstream F) covers this
    // once a catalogue has actually been sent.
    return warnings;
  }

  const validShortlistCount = shortlist.filter((s) => s.property.status === "AVAILABLE").length;

  async function createCatalogue() {
    if (shortlist.length === 0) return toast.error("Select at least one property");
    if (!title.trim()) return toast.error("Title is required");
    if (validShortlistCount === 0) {
      return toast.error("All shortlisted properties are unavailable - add at least one active property before creating a catalogue");
    }

    setCreating(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/catalogues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          introMessage: introMessage || null,
          includePrice,
          includeAddress,
          includeBrokerage,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          properties: shortlist.map((s, i) => ({
            propertyId: s.propertyId,
            sortOrder: i,
            customNote: s.customNote || null,
            internalNote: s.internalNote || null,
            priceVisible: s.priceVisible,
            addressVisible: s.addressVisible,
            brokerageVisible: s.brokerageVisible,
            isTopPick: s.isTopPick,
            addedManually: s.addedManually,
            addedByUserId: s.addedManually ? currentUserId : null,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create catalogue");
      }
      const { catalogue } = await res.json();
      const previewRes = await fetch(`/api/leads/${lead.id}/catalogues/${catalogue.id}`);
      const previewData = await previewRes.json();
      setCreated({ id: catalogue.id, token: catalogue.token, previewMessage: previewData.previewMessage, publicUrl: `${window.location.origin}/share/catalogue/${catalogue.token}` });
      setReviewOpen(false);
      toast.success("Catalogue created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create catalogue");
    } finally {
      setCreating(false);
    }
  }

  async function sendNow() {
    if (!created) return;
    setSending(true);
    const res = await fetch(`/api/leads/${lead.id}/catalogues/${created.id}/send`, { method: "POST" });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      if (data.clickToChatUrl) window.open(data.clickToChatUrl, "_blank");
      toast.success("Catalogue sent");
      router.push(`/leads/${lead.id}`);
      router.refresh();
    } else {
      toast.error("Failed to send catalogue");
    }
  }

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ---- Send screen (after catalogue creation) --------------------------
  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-xl border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] p-5 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#22C55E]" />
          <p className="mt-2 text-sm font-semibold text-[#22C55E]">Catalogue created</p>
          <p className="text-xs text-[#94A3B8]">Share it now, or copy the link/message for later.</p>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-[#94A3B8]">Message Preview</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-[#11151F] p-3 font-mono text-xs text-[#CBD5E1]">{created.previewMessage}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(created.publicUrl); toast.success("Link copied"); }}>
              <Copy className="h-3.5 w-3.5" /> Copy Link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(created.previewMessage); toast.success("Message copied"); }}>
              <Copy className="h-3.5 w-3.5" /> Copy Message
            </Button>
            <a href={created.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#1E2533] px-2.5 py-1.5 text-xs font-medium text-[#CBD5E1] ring-1 ring-inset ring-[rgba(255,255,255,0.1)] hover:bg-[#252D3D]">
              <ExternalLink className="h-3.5 w-3.5" /> Preview Public Page
            </a>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={sendNow} loading={sending} className="flex-1 justify-center">
            <Send className="h-4 w-4" /> Send Now
          </Button>
          <LinkButton href={`/leads/${lead.id}`} variant="secondary">Back to Lead</LinkButton>
        </div>
      </div>
    );
  }

  // ---- Main workspace ----------------------------------------------------
  return (
    <div className="space-y-4 pb-24 lg:pb-4">
      {/* Header */}
      <div className="space-y-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#F8FAFC]">{lead.clientName}</h2>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              {lead.phone} &middot; {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any BHK"} &middot; {lead.preferredLocation} &middot;{" "}
              {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}
            </p>
          </div>
          <Badge tone="indigo">{loading ? "..." : totalMatchCount} match{totalMatchCount === 1 ? "" : "es"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#94A3B8]">
            Budget tolerance
            <Select value={tolerance} onChange={(e) => setTolerance(e.target.value)} className="w-auto text-xs font-semibold">
              <option value="0">Strict (0%)</option>
              <option value="0.1">±10%</option>
              <option value="0.2">±20%</option>
              <option value="0.3">±30%</option>
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#94A3B8]">
            Locality radius
            <Select value={radius} onChange={(e) => setRadius(e.target.value)} className="w-auto text-xs font-semibold">
              <option value="0">Exact only</option>
              <option value="3000">+3km</option>
              <option value="5000">+5km</option>
              <option value="10000">+10km</option>
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#94A3B8]">
            Sort
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto text-xs font-semibold">
              <option value="score">Best match</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest listed</option>
            </Select>
          </label>
          <Button size="sm" variant="secondary" onClick={fetchMatches} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add More Properties
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {!loading && sections && !allEmpty && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-3 shadow-sm">
          <Checkbox label="Exact locality only" checked={exactLocalityOnly} onChange={(e) => setExactLocalityOnly(e.target.checked)} />
          <Checkbox label="Include nearby localities" checked={includeNearby} onChange={(e) => setIncludeNearby(e.target.checked)} />
          <Checkbox label="Verified only" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          <Checkbox label="Has photos" checked={imagesOnly} onChange={(e) => setImagesOnly(e.target.checked)} />
          <Checkbox label="Immediately available" checked={immediateOnly} onChange={(e) => setImmediateOnly(e.target.checked)} />
          <Select value={bhkFilter} onChange={(e) => setBhkFilter(e.target.value)} className="w-auto text-xs">
            <option value="">Any BHK</option>
            {[1, 2, 3, 4, 5].map((b) => (<option key={b} value={b}>{b} BHK</option>))}
          </Select>
          <Select value={furnishingFilter} onChange={(e) => setFurnishingFilter(e.target.value)} className="w-auto text-xs">
            <option value="">Any Furnishing</option>
            <option value="FURNISHED">Furnished</option>
            <option value="SEMI_FURNISHED">Semi-Furnished</option>
            <option value="UNFURNISHED">Unfurnished</option>
          </Select>
          <Select value={propertyTypeFilter} onChange={(e) => setPropertyTypeFilter(e.target.value)} className="w-auto text-xs">
            <option value="">Any Type</option>
            {["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE", "PG"].map((t) => (
              <option key={t} value={t}>{enumToLabel(t)}</option>
            ))}
          </Select>
          <Input type="number" placeholder="Min price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-28 text-xs" />
          <Input type="number" placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-28 text-xs" />
          {availableAmenities.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {availableAmenities.slice(0, 12).map((a) => {
                const active = amenityFilter.has(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() =>
                      setAmenityFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(a)) next.delete(a);
                        else next.add(a);
                        return next;
                      })
                    }
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${active ? "bg-[#4F8CFF] text-white" : "bg-[#1E2533] text-[#94A3B8] hover:text-white"}`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && <LoadingState label="Computing property match scores..." />}

      {!loading && allEmpty && (
        <EmptyState
          title="No suitable matches found for this requirement yet"
          description="Try widening the budget tolerance or locality radius above, or use Add More Properties to manually shortlist something outside the current match criteria."
        />
      )}

      {!loading && sections && !allEmpty && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {SECTION_META.map((meta) => {
              const list = filteredSections?.[meta.key] ?? [];
              const isOpen = openSections.has(meta.key);
              return (
                <div key={meta.key} className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] shadow-sm">
                  <button type="button" onClick={() => toggleSection(meta.key)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-bold text-[#F8FAFC]">
                        {meta.label} <Badge tone="slate">{list.length}</Badge>
                      </p>
                      <p className="text-xs text-[#94A3B8]">{meta.hint}</p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 shrink-0 text-[#94A3B8]" />}
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-[rgba(255,255,255,0.06)] p-3">
                      {list.length === 0 ? (
                        <p className="py-4 text-center text-xs text-[#94A3B8]">No properties in this section{sections[meta.key].length > 0 ? " match the current filters" : ""}.</p>
                      ) : (
                        list.map((m) => (
                          <MatchCard
                            key={m.property.id}
                            match={m}
                            inShortlist={shortlistIds.has(m.property.id)}
                            onToggleShortlist={() => toggleShortlist(m)}
                            compareChecked={compareIds.has(m.property.id)}
                            onToggleCompare={() => toggleCompare(m.property.id)}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="sticky top-20 space-y-4">
              {compareIds.size > 0 && (
                <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => setCompareOpen(true)}>
                  <Eye className="h-3.5 w-3.5" /> Compare {compareIds.size} Selected
                </Button>
              )}

              <ShortlistPanel
                shortlist={shortlist}
                move={move}
                remove={remove}
                toggleTopPick={toggleTopPick}
                updateEntry={updateEntry}
                title={title}
                setTitle={setTitle}
                introMessage={introMessage}
                setIntroMessage={setIntroMessage}
                includePrice={includePrice}
                setIncludePrice={setIncludePrice}
                includeAddress={includeAddress}
                setIncludeAddress={setIncludeAddress}
                includeBrokerage={includeBrokerage}
                setIncludeBrokerage={setIncludeBrokerage}
                expiresAt={expiresAt}
                setExpiresAt={setExpiresAt}
                onReview={() => setReviewOpen(true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sticky mobile action bar */}
      {shortlist.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-3 shadow-lg lg:hidden">
          <Button className="w-full justify-center" onClick={() => setReviewOpen(true)}>
            Review Shortlist ({shortlist.length})
          </Button>
        </div>
      )}

      <PropertyPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={addManualProperty} excludeIds={shortlistIds} />

      <Dialog open={compareOpen} onClose={() => setCompareOpen(false)} title="Compare Properties" wide>
        {comparedMatches.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">No properties selected for comparison.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <tbody>
                <CompareRow label="Property" cells={comparedMatches.map((m) => m.property.title)} bold />
                <CompareRow label="Score" cells={comparedMatches.map((m) => `${m.score}%`)} />
                <CompareRow label="Price" cells={comparedMatches.map((m) => formatPrice(m.property))} />
                <CompareRow label="BHK" cells={comparedMatches.map((m) => `${m.property.bhk} BHK`)} />
                <CompareRow label="Furnishing" cells={comparedMatches.map((m) => enumToLabel(m.property.furnishing))} />
                <CompareRow label="Area" cells={comparedMatches.map((m) => `${m.property.builtUpAreaSqft} sqft`)} />
                <CompareRow label="Floor" cells={comparedMatches.map((m) => (m.property.floorNumber !== null ? `${m.property.floorNumber}${m.property.totalFloors ? ` / ${m.property.totalFloors}` : ""}` : "-"))} />
              </tbody>
            </table>
          </div>
        )}
      </Dialog>

      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Shortlist Review" description={`For ${lead.clientName} · ${lead.phone}`} wide>
        <div className="space-y-3">
          {shortlist.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No properties in the shortlist yet.</p>
          ) : (
            <>
              {validShortlistCount === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-xs text-[#EF4444]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  All shortlisted properties are unavailable. Remove them or add at least one active property before creating a catalogue.
                </div>
              )}
              <div className="space-y-2">
                {shortlist.map((s) => {
                  const warnings = warningsFor(s);
                  return (
                    <div key={s.propertyId} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#11151F] p-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-[#181E2A]">
                          {s.property.coverImage ? (
                            <Image src={s.property.coverImage} alt={s.property.title} fill className="object-cover" unoptimized />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#64748B]"><ImageOff className="h-4 w-4" /></div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-[#F8FAFC]">
                            {s.isTopPick && <Star className="h-3.5 w-3.5 shrink-0 fill-[#F59E0B] text-[#F59E0B]" />}
                            {s.property.title}
                          </p>
                          <p className="truncate text-xs text-[#94A3B8]">
                            {s.property.area} &middot; {includePrice ? formatPrice(s.property) : "Price hidden"} &middot; {includeAddress && s.addressVisible ? s.property.address ?? "No address on file" : "Location only"}
                          </p>
                          {s.customNote && <p className="mt-0.5 text-xs italic text-[#94A3B8]">&ldquo;{s.customNote}&rdquo;</p>}
                        </div>
                      </div>
                      {warnings.length > 0 && (
                        <ul className="mt-2 space-y-0.5 border-t border-[rgba(255,255,255,0.06)] pt-2">
                          {warnings.map((w, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[11px] text-[#F59E0B]"><AlertTriangle className="h-3 w-3 shrink-0" /> {w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setReviewOpen(false)}>Keep Editing</Button>
                <Button onClick={createCatalogue} loading={creating} disabled={validShortlistCount === 0}>
                  Create Catalogue
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function CompareRow({ label, cells, bold }: { label: string; cells: string[]; bold?: boolean }) {
  return (
    <tr className="border-b border-[rgba(255,255,255,0.06)]">
      <td className="py-1.5 pr-3 font-semibold text-[#94A3B8]">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className={`py-1.5 pr-3 ${bold ? "font-semibold text-[#F8FAFC]" : "text-[#CBD5E1]"}`}>{c}</td>
      ))}
    </tr>
  );
}

function MatchCard({
  match,
  inShortlist,
  onToggleShortlist,
  compareChecked,
  onToggleCompare,
}: {
  match: MatchResult;
  inShortlist: boolean;
  onToggleShortlist: () => void;
  compareChecked: boolean;
  onToggleCompare: () => void;
}) {
  const p = match.property;
  const imageCount = parseAmenities(p.images).length;

  return (
    <div className={`overflow-hidden rounded-xl border transition-all ${inShortlist ? "border-[#4F8CFF] bg-[#1E2533]" : "border-[rgba(255,255,255,0.08)] bg-[#11151F]"}`}>
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-40 shrink-0 bg-[#181E2A] sm:h-auto sm:w-48">
          {p.coverImage ? (
            <Image src={p.coverImage} alt={p.title} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#64748B]">
              <ImageOff className="h-6 w-6" />
              <span className="text-[10px]">No Image</span>
            </div>
          )}
          <label className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
            <input type="checkbox" checked={compareChecked} onChange={onToggleCompare} className="h-3 w-3" /> Compare
          </label>
        </div>

        <div className="flex flex-1 flex-col justify-between p-4">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono text-[10px] text-[#94A3B8]">{p.propertyCode}</span>
                <h3 className="truncate text-sm font-bold leading-snug text-[#F8FAFC]">{p.title}</h3>
              </div>
              <span className="shrink-0 text-sm font-extrabold text-[#4F8CFF]">{formatPrice(p)}</span>
            </div>

            <p className="mt-1 text-xs font-medium text-[#94A3B8]">
              {p.area}, Delhi &middot; {p.bhk} BHK &middot; {enumToLabel(p.furnishing)} &middot; {p.builtUpAreaSqft} sqft
              {p.floorNumber !== null && ` · Floor ${p.floorNumber}${p.totalFloors ? `/${p.totalFloors}` : ""}`}
              {p.maintenanceCharge && p.listingType === "RENT" && ` · +${formatINR(p.maintenanceCharge, { compact: true })} maint.`}
            </p>
            {p.availableFrom && <p className="mt-0.5 text-[11px] text-[#64748B]">Available from {formatDate(p.availableFrom)}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={match.score >= 80 ? "green" : match.score >= 50 ? "amber" : "slate"}>{match.score}% Match</Badge>
              {match.aboveBudget && <Badge tone="amber">{match.budgetTier}</Badge>}
              {match.verified && (
                <Badge tone="blue"><ShieldCheck className="mr-0.5 inline h-3 w-3" /> Verified</Badge>
              )}
              {match.hasImages && (
                <Badge tone="purple"><Camera className="mr-0.5 inline h-3 w-3" /> {imageCount > 0 ? imageCount : ""} Photos</Badge>
              )}
            </div>

            {match.reasons.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-[rgba(255,255,255,0.06)] pt-2.5 text-[11px] sm:grid-cols-2">
                {match.reasons.map((r, i) => (
                  <span key={i} className={`flex items-start gap-1 font-medium ${r.matched ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                    {r.matched ? "✓" : "✗"} {r.detail}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={inShortlist ? "secondary" : "primary"} onClick={onToggleShortlist}>
              {inShortlist ? "Remove from Shortlist" : "Add to Shortlist"}
            </Button>
            <LinkButton href={`/properties/${p.id}`} variant="ghost" size="sm">
              <ExternalLink className="h-3.5 w-3.5" /> Open Property
            </LinkButton>
            <LinkButton href="/visits" variant="ghost" size="sm">
              Schedule Visit
            </LinkButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortlistPanel({
  shortlist,
  move,
  remove,
  toggleTopPick,
  updateEntry,
  title,
  setTitle,
  introMessage,
  setIntroMessage,
  includePrice,
  setIncludePrice,
  includeAddress,
  setIncludeAddress,
  includeBrokerage,
  setIncludeBrokerage,
  expiresAt,
  setExpiresAt,
  onReview,
}: {
  shortlist: ShortlistEntry[];
  move: (index: number, direction: -1 | 1) => void;
  remove: (propertyId: string) => void;
  toggleTopPick: (propertyId: string) => void;
  updateEntry: (propertyId: string, patch: Partial<ShortlistEntry>) => void;
  title: string;
  setTitle: (v: string) => void;
  introMessage: string;
  setIntroMessage: (v: string) => void;
  includePrice: boolean;
  setIncludePrice: (v: boolean) => void;
  includeAddress: boolean;
  setIncludeAddress: (v: boolean) => void;
  includeBrokerage: boolean;
  setIncludeBrokerage: (v: boolean) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  onReview: () => void;
}) {
  return (
    <>
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-[#F8FAFC]">Catalogue Details</h3>
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Intro Message" hint="Optional - overrides the default requirement summary line">
          <Textarea rows={2} value={introMessage} onChange={(e) => setIntroMessage(e.target.value)} />
        </Field>
        <Field label="Expires On" hint="Optional">
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
        <div className="mt-2 space-y-2">
          <Checkbox label="Include price" checked={includePrice} onChange={(e) => setIncludePrice(e.target.checked)} />
          <Checkbox label="Include approximate address" checked={includeAddress} onChange={(e) => setIncludeAddress(e.target.checked)} />
          <Checkbox label="Include brokerage" checked={includeBrokerage} onChange={(e) => setIncludeBrokerage(e.target.checked)} />
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-[#F8FAFC]">Shortlist ({shortlist.length})</h3>
        {shortlist.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">Add properties from the matches on the left, or use &ldquo;Add More Properties&rdquo; to search the full inventory.</p>
        ) : (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {shortlist.map((s, i) => (
              <div key={s.propertyId} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#11151F] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-[#F8FAFC]">
                    {i + 1}. {s.property.title}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[#64748B] hover:text-[#4F8CFF] disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === shortlist.length - 1} className="text-[#64748B] hover:text-[#4F8CFF] disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(s.propertyId)} className="text-[#64748B] hover:text-[#EF4444]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                  {s.matchScore !== null ? (
                    <>Match score: {s.matchScore}%</>
                  ) : (
                    <>Added manually{s.addedByUserName ? ` by ${s.addedByUserName}` : ""}</>
                  )}
                </p>

                <button
                  type="button"
                  onClick={() => toggleTopPick(s.propertyId)}
                  className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${s.isTopPick ? "text-[#F59E0B]" : "text-[#64748B] hover:text-[#F59E0B]"}`}
                >
                  <Star className={`h-3 w-3 ${s.isTopPick ? "fill-[#F59E0B]" : ""}`} /> {s.isTopPick ? "Top Pick" : "Mark as Top Pick"}
                </button>

                <Input
                  value={s.customNote}
                  onChange={(e) => updateEntry(s.propertyId, { customNote: e.target.value })}
                  placeholder="Client-facing note (optional)"
                  className="mt-1.5 text-xs"
                />
                <Textarea
                  rows={2}
                  value={s.internalNote}
                  onChange={(e) => updateEntry(s.propertyId, { internalNote: e.target.value })}
                  placeholder="Internal only - never shown to client"
                  className="mt-1.5 text-xs"
                />

                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Checkbox label="Price visible" checked={s.priceVisible} onChange={(e) => updateEntry(s.propertyId, { priceVisible: e.target.checked })} />
                  <Checkbox label="Address visible" checked={s.addressVisible} onChange={(e) => updateEntry(s.propertyId, { addressVisible: e.target.checked })} />
                  <Checkbox label="Brokerage visible" checked={s.brokerageVisible} onChange={(e) => updateEntry(s.propertyId, { brokerageVisible: e.target.checked })} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={onReview} disabled={shortlist.length === 0} className="hidden w-full justify-center lg:flex">
        Review Shortlist
      </Button>
    </>
  );
}

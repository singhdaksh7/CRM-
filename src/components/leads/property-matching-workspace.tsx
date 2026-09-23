"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, Textarea, Checkbox, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { PropertyPickerDialog, type PickerProperty } from "@/components/properties/property-picker-dialog";
import { formatINR, enumToLabel } from "@/lib/utils";
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
  furnishing: string | null;
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
  matchedRequirement?: { id: string; localities: Array<{ locality: { name: string } }>; bhkValues: Array<{ bhk: number }> };
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

interface ShortlistProperty {
  id: string;
  propertyCode: string;
  title: string;
  area: string;
  address: string | null;
  listingType: "RENT" | "SALE";
  status: string;
  bhk: number;
  furnishing: string | null;
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
  matchScore: number | null;
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

  const fetchMatches = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    fetch(`/api/leads/${lead.id}/match?tolerance=${tolerance}&radius=${radius}`, { signal })
      .then((r) => r.json())
      .then((data: { sections: SectionedMatches }) => {
        if (signal?.aborted) return;
        setSections(data.sections);
        const order: SectionKey[] = ["bestMatches", "nearBudget", "nearbyLocalities", "slightlyAboveBudget", "otherSuggestions"];
        const firstNonEmpty = order.find((k) => (data.sections?.[k]?.length ?? 0) > 0);
        setOpenSections(firstNonEmpty ? new Set([firstNonEmpty]) : new Set());
      })
      .catch(() => {
        if (!signal?.aborted) toast.error("Failed to load matching properties");
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, [lead.id, radius, tolerance]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => fetchMatches(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchMatches]);

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

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center shadow-xs">
          <Sparkles className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 text-sm font-semibold text-emerald-900">Catalogue created successfully</p>
          <p className="text-xs text-emerald-700">Share it now, or copy the link/message for later.</p>
        </div>
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
          <p className="mb-2 text-xs font-semibold text-[#52525B] uppercase tracking-wider">Message Preview</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-[#FAFAFA] p-3.5 font-mono text-xs text-[#09090B] border border-[#E4E4E7]">{created.previewMessage}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(created.publicUrl); toast.success("Link copied"); }}>
              <Copy className="h-3.5 w-3.5" /> Copy Link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(created.previewMessage); toast.success("Message copied"); }}>
              <Copy className="h-3.5 w-3.5" /> Copy Message
            </Button>
            <a href={created.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] border border-[#E4E4E7] hover:bg-[#F4F4F5] transition-colors">
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

  return (
    <div className="space-y-4 pb-24 lg:pb-4">
      {/* Header */}
      <div className="space-y-3 rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#09090B]">{lead.clientName}</h2>
            <p className="mt-0.5 text-xs text-[#52525B]">
              {lead.phone} &middot; {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any BHK"} &middot; {lead.preferredLocation} &middot;{" "}
              {formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F4F4F5] border border-[#E4E4E7] text-[#09090B]">
            {loading ? "..." : totalMatchCount} match{totalMatchCount === 1 ? "" : "es"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#F4F4F5]">
          <label className="flex items-center gap-1.5 text-xs font-medium text-[#52525B]">
            Budget tolerance
            <Select value={tolerance} onChange={(e) => setTolerance(e.target.value)} className="w-auto text-xs py-1">
              <option value="0">Strict (0%)</option>
              <option value="0.1">±10%</option>
              <option value="0.2">±20%</option>
              <option value="0.3">±30%</option>
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-[#52525B]">
            Locality radius
            <Select value={radius} onChange={(e) => setRadius(e.target.value)} className="w-auto text-xs py-1">
              <option value="0">Exact only</option>
              <option value="3000">+3km</option>
              <option value="5000">+5km</option>
              <option value="10000">+10km</option>
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-[#52525B]">
            Sort
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto text-xs py-1">
              <option value="score">Best match</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest listed</option>
            </Select>
          </label>
          <Button size="sm" variant="secondary" onClick={() => fetchMatches()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add More Properties
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {!loading && sections && !allEmpty && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E4E4E7] bg-white p-3.5 shadow-xs">
          <Checkbox label="Exact locality only" checked={exactLocalityOnly} onChange={(e) => setExactLocalityOnly(e.target.checked)} />
          <Checkbox label="Include nearby localities" checked={includeNearby} onChange={(e) => setIncludeNearby(e.target.checked)} />
          <Checkbox label="Verified only" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          <Checkbox label="Has photos" checked={imagesOnly} onChange={(e) => setImagesOnly(e.target.checked)} />
          <Checkbox label="Immediately available" checked={immediateOnly} onChange={(e) => setImmediateOnly(e.target.checked)} />
          <Select value={bhkFilter} onChange={(e) => setBhkFilter(e.target.value)} className="w-auto text-xs py-1">
            <option value="">Any BHK</option>
            {[1, 2, 3, 4, 5].map((b) => (<option key={b} value={b}>{b} BHK</option>))}
          </Select>
          <Select value={furnishingFilter} onChange={(e) => setFurnishingFilter(e.target.value)} className="w-auto text-xs py-1">
            <option value="">Any Furnishing</option>
            <option value="FURNISHED">Furnished</option>
            <option value="SEMI_FURNISHED">Semi-Furnished</option>
            <option value="UNFURNISHED">Unfurnished</option>
          </Select>
          <Select value={propertyTypeFilter} onChange={(e) => setPropertyTypeFilter(e.target.value)} className="w-auto text-xs py-1">
            <option value="">Any Type</option>
            {["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE", "PG"].map((t) => (
              <option key={t} value={t}>{enumToLabel(t)}</option>
            ))}
          </Select>
          <Input type="number" placeholder="Min price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-28 text-xs py-1" />
          <Input type="number" placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-28 text-xs py-1" />
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
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${active ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "bg-white text-[#52525B] border-[#E4E4E7] hover:bg-[#F4F4F5]"}`}
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

      {!loading && sections && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {allEmpty ? (
              <EmptyState
                title="No suitable matches found for this requirement yet"
                description="Try widening the budget tolerance or locality radius above, or use Add More Properties to manually shortlist something outside the current match criteria."
              />
            ) : (
              SECTION_META.map((meta) => {
                const list = filteredSections?.[meta.key] ?? [];
                const isOpen = openSections.has(meta.key);
                return (
                  <div key={meta.key} className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-white shadow-xs">
                    <button type="button" onClick={() => toggleSection(meta.key)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[#FAFAFA] transition-colors">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-[#09090B]">
                          {meta.label} <span className="rounded-full bg-[#F4F4F5] border border-[#E4E4E7] px-2 py-0.2 text-xs text-[#52525B]">{list.length}</span>
                        </p>
                        <p className="text-xs text-[#71717A]">{meta.hint}</p>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-[#71717A]" /> : <ChevronDown className="h-4 w-4 shrink-0 text-[#71717A]" />}
                    </button>
                    {isOpen && (
                      <div className="space-y-3 border-t border-[#F4F4F5] p-3.5">
                        {list.length === 0 ? (
                          <p className="py-4 text-center text-xs text-[#71717A]">No properties in this section{sections[meta.key].length > 0 ? " match the current filters" : ""}.</p>
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
              })
            )}
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

      {shortlist.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E4E4E7] bg-white p-3 shadow-lg lg:hidden">
          <Button className="w-full justify-center" onClick={() => setReviewOpen(true)}>
            Review Shortlist ({shortlist.length})
          </Button>
        </div>
      )}

      <PropertyPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={addManualProperty} excludeIds={shortlistIds} />

      <Dialog open={compareOpen} onClose={() => setCompareOpen(false)} title="Compare Properties" wide>
        {comparedMatches.length === 0 ? (
          <p className="text-sm text-[#71717A]">No properties selected for comparison.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <tbody>
                <CompareRow label="Property" cells={comparedMatches.map((m) => m.property.title)} bold />
                <CompareRow label="Score" cells={comparedMatches.map((m) => `${m.score}%`)} />
                <CompareRow label="Price" cells={comparedMatches.map((m) => formatPrice(m.property))} />
                <CompareRow label="BHK" cells={comparedMatches.map((m) => `${m.property.bhk} BHK`)} />
                <CompareRow label="Furnishing" cells={comparedMatches.map((m) => (m.property.furnishing ? enumToLabel(m.property.furnishing) : "-"))} />
                <CompareRow label="Area" cells={comparedMatches.map((m) => `${m.property.builtUpAreaSqft} sqft`)} />
                <CompareRow label="Floor" cells={comparedMatches.map((m) => (m.property.floorNumber !== null ? `${m.property.floorNumber}${m.property.totalFloors ? ` / ${m.property.totalFloors}` : ""}` : "-"))} />
              </tbody>
            </table>
          </div>
        )}
      </Dialog>

      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Shortlist Review" description={`For ${lead.clientName} · ${lead.phone}`} wide>
        <div className="space-y-4">
          {shortlist.length === 0 ? (
            <p className="text-sm text-[#71717A]">No properties in the shortlist yet.</p>
          ) : (
            <>
              {validShortlistCount === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  All shortlisted properties are unavailable. Remove them or add at least one active property before creating a catalogue.
                </div>
              )}
              <div className="space-y-2.5">
                {shortlist.map((s) => {
                  const warnings = warningsFor(s);
                  return (
                    <div key={s.propertyId} className="rounded-lg border border-[#E4E4E7] bg-white p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-[#F4F4F5]">
                          {s.property.coverImage ? (
                            <Image src={s.property.coverImage} alt={s.property.title} fill className="object-cover" unoptimized />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#A1A1AA]"><ImageOff className="h-4 w-4" /></div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[#09090B]">
                            {s.isTopPick && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" />}
                            {s.property.title}
                          </p>
                          <p className="truncate text-xs text-[#52525B]">
                            {s.property.area} &middot; {includePrice ? formatPrice(s.property) : "Price hidden"} &middot; {includeAddress && s.addressVisible ? s.property.address ?? "No address on file" : "Location only"}
                          </p>
                          {s.customNote && <p className="mt-0.5 text-xs italic text-[#71717A]">&ldquo;{s.customNote}&rdquo;</p>}
                        </div>
                      </div>
                      {warnings.length > 0 && (
                        <ul className="mt-2 space-y-0.5 border-t border-[#F4F4F5] pt-2">
                          {warnings.map((w, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[11px] text-amber-700"><AlertTriangle className="h-3 w-3 shrink-0" /> {w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 border-t border-[#E4E4E7] pt-4">
                <Button variant="secondary" onClick={() => setReviewOpen(false)}>Back to Workspace</Button>
                <Button onClick={createCatalogue} loading={creating} disabled={validShortlistCount === 0}>Create & Share Catalogue</Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
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
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const p = match.property;
  const imageCount = useMemo(() => {
    try {
      const arr = JSON.parse(p.images || "[]");
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  }, [p.images]);

  return (
    <div className={`rounded-lg border p-4 transition-colors ${inShortlist ? "border-[#0A0A0A] bg-[#FAFAFA]" : "border-[#E4E4E7] bg-white hover:border-[#D4D4D8]"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3.5">
          <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-[#F4F4F5]">
            {p.coverImage ? (
              <Image src={p.coverImage} alt={p.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#A1A1AA]"><ImageOff className="h-5 w-5" /></div>
            )}
            {imageCount > 0 && (
              <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                <Camera className="h-2.5 w-2.5" /> {imageCount}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-[#09090B] text-sm">{p.title}</span>
              {match.verified && (
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
            <p className="text-xs text-[#52525B]">
              {p.area} &middot; {p.bhk} BHK &middot; {enumToLabel(p.furnishing)} &middot; {p.builtUpAreaSqft} sqft
            </p>
            <p className="text-sm font-semibold text-[#09090B]">{formatPrice(p)}</p>
            {match.matchedRequirement && (
              <p className="text-[11px] font-medium text-[#71717A]">
                Matched requirement: {match.matchedRequirement.bhkValues.map((value) => `${value.bhk} BHK`).join(" / ") || "Any BHK"}
                {match.matchedRequirement.localities.length ? ` · ${match.matchedRequirement.localities.map((value) => value.locality.name).join(" / ")}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-row sm:flex-col items-end justify-between sm:justify-start gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#71717A]">Score</span>
            <span className="rounded-md bg-[#0A0A0A] px-2 py-0.5 text-xs font-semibold text-white">{match.score}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={inShortlist ? "primary" : "secondary"} onClick={onToggleShortlist}>
              {inShortlist ? "Shortlisted" : "+ Shortlist"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#F4F4F5] pt-2.5 text-xs">
        <button type="button" onClick={() => setReasonsOpen((v) => !v)} className="flex items-center gap-1 font-medium text-[#52525B] hover:text-[#09090B] transition-colors">
          {reasonsOpen ? "Hide match breakdown" : "Why it matched"} {reasonsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <Checkbox label="Compare" checked={compareChecked} onChange={onToggleCompare} />
      </div>

      {reasonsOpen && (
        <div className="mt-2.5 space-y-1.5 rounded-lg bg-[#FAFAFA] p-3 text-xs border border-[#E4E4E7]">
          {match.reasons.map((r, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className={r.matched ? "text-[#09090B]" : "text-[#71717A]"}>{r.label}</span>
              <span className={`font-semibold ${r.matched ? "text-emerald-600" : "text-red-600"}`}>{r.detail}</span>
            </div>
          ))}
        </div>
      )}
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
    <div className="space-y-4 rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#09090B]">Selected Shortlist</h3>
        <span className="rounded-full bg-[#F4F4F5] border border-[#E4E4E7] px-2 py-0.5 text-xs font-semibold text-[#09090B]">
          {shortlist.length}
        </span>
      </div>

      {shortlist.length === 0 ? (
        <p className="py-6 text-center text-xs text-[#71717A]">No properties shortlisted yet. Click &ldquo;+ Shortlist&rdquo; on any property card.</p>
      ) : (
        <div className="space-y-3">
          <Field label="Catalogue Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Client Note (Optional)">
            <Textarea rows={2} placeholder="Add a custom message..." value={introMessage} onChange={(e) => setIntroMessage(e.target.value)} />
          </Field>

          <div className="space-y-2 border-t border-[#F4F4F5] pt-3">
            {shortlist.map((s, idx) => (
              <div key={s.propertyId} className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-[#09090B]">{s.property.title}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => toggleTopPick(s.propertyId)} className={`p-1 rounded ${s.isTopPick ? "text-amber-500" : "text-[#A1A1AA] hover:text-[#09090B]"}`}>
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </button>
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 text-[#A1A1AA] hover:text-[#09090B] disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === shortlist.length - 1} className="p-1 text-[#A1A1AA] hover:text-[#09090B] disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(s.propertyId)} className="p-1 text-[#A1A1AA] hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Input
                  placeholder="Custom note for client..."
                  value={s.customNote}
                  onChange={(e) => updateEntry(s.propertyId, { customNote: e.target.value })}
                  className="text-xs py-1"
                />
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-[#F4F4F5] pt-3 text-xs">
            <Checkbox label="Show prices" checked={includePrice} onChange={(e) => setIncludePrice(e.target.checked)} />
            <Checkbox label="Show address" checked={includeAddress} onChange={(e) => setIncludeAddress(e.target.checked)} />
            <Checkbox label="Show brokerage" checked={includeBrokerage} onChange={(e) => setIncludeBrokerage(e.target.checked)} />
          </div>

          <Button className="w-full justify-center" onClick={onReview}>
            Review & Create Catalogue
          </Button>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, cells, bold }: { label: string; cells: React.ReactNode[]; bold?: boolean }) {
  return (
    <tr className="border-b border-[#F4F4F5]">
      <td className="py-2.5 pr-4 font-medium text-[#71717A]">{label}</td>
      {cells.map((cell, i) => (
        <td key={i} className={`py-2.5 px-4 text-[#09090B] ${bold ? "font-semibold" : ""}`}>
          {cell}
        </td>
      ))}
    </tr>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge, PROPERTY_STATUS_TONE } from "@/components/ui/badge";
import { Select, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatINR, formatDate, enumToLabel } from "@/lib/utils";
import { CheckCircle2, XCircle, Download } from "lucide-react";

interface PropertyRow {
  id: string;
  propertyCode: string;
  title: string;
  area: string;
  listingType: string;
  bhk: number;
  monthlyRent: number | null;
  salePrice: number | null;
  status: string;
  inventorySource: string;
  partnerId: string | null;
  pendingVerification: boolean;
  createdAt: Date;
}

const PROPERTY_STATUSES = ["AVAILABLE", "RESERVED", "RENTED", "SOLD", "INACTIVE"];

type BulkAction = "" | "AVAILABILITY" | "VERIFY" | "ADD_TAGS" | "PARTNER" | "NEEDS_VERIFICATION" | "LOCALITY" | "PRICE";

interface BulkResult {
  total: number;
  succeeded: number;
  failed: number;
  results: { id: string; success: boolean; error?: string }[];
}

/**
 * Table-view rendering with checkbox selection + a bulk action toolbar,
 * extracted from the properties list page - card view is unaffected
 * (bulk selection is table-view only in this pass; see completion report).
 */
export function PropertiesTable({ properties, canManage }: { properties: PropertyRow[]; canManage: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction>("");
  const [status, setStatus] = useState(PROPERTY_STATUSES[0]);
  const [tagsInput, setTagsInput] = useState("");
  const [areaInput, setAreaInput] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [priceMode, setPriceMode] = useState<"SET" | "PERCENT">("SET");
  const [priceValue, setPriceValue] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const allSelected = properties.length > 0 && selected.size === properties.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(properties.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAction() {
    setRunning(true);
    const ids = Array.from(selected);
    const body =
      action === "AVAILABILITY"
        ? { action, ids, status }
        : action === "ADD_TAGS"
          ? { action, ids, tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean) }
          : action === "PARTNER" ? { action, ids, partnerId }
          : action === "LOCALITY" ? { action, ids, area: areaInput }
          : action === "PRICE" ? { action, ids, priceMode, priceValue: Number(priceValue) }
          : { action, ids };

    const res = await fetch("/api/properties/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setRunning(false);
    if (res.ok) {
      const data: BulkResult = await res.json();
      setResult(data);
      setConfirmOpen(false);
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Bulk action failed");
    }
  }

  async function chooseAction(next: BulkAction) {
    setAction(next);
    if (next === "PARTNER" && partners.length === 0) {
      const response = await fetch("/api/inventory-partners?isActive=true&take=100");
      if (response.ok) setPartners((await response.json()).inventoryPartners);
    }
  }

  const selectedProperties = properties.filter((property) => selected.has(property.id));
  const pricePreview = action === "PRICE" && Number(priceValue)
    ? selectedProperties.slice(0, 8).map((property) => { const before = property.listingType === "RENT" ? property.monthlyRent : property.salePrice; const after = priceMode === "SET" ? Number(priceValue) : before == null ? null : Math.round(before * (1 + Number(priceValue) / 100)); return `${property.propertyCode}: ${before ?? "blank"} → ${after ?? "invalid"}`; }) : [];

  function exportSelected() {
    const ids = selected.size > 0 ? Array.from(selected).join(",") : "";
    window.open(`/api/properties/export${ids ? `?ids=${ids}` : ""}`, "_blank");
  }

  return (
    <div className="space-y-3">
      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#CCE0FF] bg-[#EFF4FF] p-3">
          <span className="text-xs font-bold text-[#1B2430]">{selected.size} selected</span>
          <Select value={action} onChange={(e) => void chooseAction(e.target.value as BulkAction)} className="w-auto text-xs font-semibold">
            <option value="">Bulk action...</option>
            <option value="AVAILABILITY">Change Availability</option>
            <option value="VERIFY">Verify Owner</option>
            <option value="ADD_TAGS">Add Tags</option>
            <option value="PARTNER">Change Indirect Partner</option>
            <option value="NEEDS_VERIFICATION">Mark Needs Verification</option>
            <option value="LOCALITY">Assign Locality</option>
            <option value="PRICE">Bulk Price Adjustment</option>
          </Select>
          {action === "AVAILABILITY" && (
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto text-xs font-semibold">
              {PROPERTY_STATUSES.map((s) => (
                <option key={s} value={s}>{enumToLabel(s)}</option>
              ))}
            </Select>
          )}
          {action === "ADD_TAGS" && (
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="tag1, tag2..." className="w-48 text-xs" />
          )}
          {action === "PARTNER" && <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-56 text-xs"><option value="">Choose partner</option>{partners.map((partner)=><option key={partner.id} value={partner.id}>{partner.name}{partner.company ? ` · ${partner.company}` : ""}</option>)}</Select>}
          {action === "LOCALITY" && <Input value={areaInput} onChange={(e)=>setAreaInput(e.target.value)} placeholder="New locality" className="w-48 text-xs"/>}
          {action === "PRICE" && <><Select value={priceMode} onChange={(e)=>setPriceMode(e.target.value as "SET"|"PERCENT")} className="w-auto text-xs"><option value="SET">Set exact price</option><option value="PERCENT">Adjust by %</option></Select><Input type="number" value={priceValue} onChange={(e)=>setPriceValue(e.target.value)} placeholder={priceMode === "SET" ? "Amount" : "% (+/-)"} className="w-32 text-xs"/></>}
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!action || (action === "ADD_TAGS" && !tagsInput.trim()) || (action === "PARTNER" && !partnerId) || (action === "LOCALITY" && !areaInput.trim()) || (action === "PRICE" && (!Number(priceValue) || (priceMode === "SET" && Number(priceValue) <= 0)))}>
            Apply
          </Button>
          <Button size="sm" variant="secondary" onClick={exportSelected}>
            <Download className="h-3.5 w-3.5" /> Export selected
          </Button>
        </div>
      )}

      {!canManage && selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#E7ECF2] bg-white p-3">
          <span className="text-xs font-bold text-[#1B2430]">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={exportSelected}>
            <Download className="h-3.5 w-3.5" /> Export selected
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white shadow-xs">
        <table className="min-w-full divide-y divide-[#E7ECF2] text-sm">
          <thead className="bg-[#F8F9FF] text-left text-xs font-semibold uppercase tracking-wider text-[#596579]">
            <tr>
              <th className="px-4 py-3.5 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-4 py-3.5">Code</th>
              <th className="px-4 py-3.5">Title</th>
              <th className="px-4 py-3.5">Location</th>
              <th className="px-4 py-3.5">Type</th>
              <th className="px-4 py-3.5">BHK</th>
              <th className="px-4 py-3.5">Price</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFF4FF] text-[#1B2430]">
            {properties.map((p) => (
              <tr key={p.id} className={`hover:bg-[#F3F6FA] transition-colors ${selected.has(p.id) ? "bg-[#EFF4FF]" : ""}`}>
                <td className="px-4 py-3.5">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Select ${p.title}`} />
                </td>
                <td className="px-4 py-3.5 font-mono text-xs text-[#8A94A6]">{p.propertyCode}</td>
                <td className="px-4 py-3.5 font-semibold text-[#1B2430]">
                  <Link href={`/properties/${p.id}`} className="hover:text-[#3366FF] transition-colors">{p.title}</Link>
                </td>
                <td className="px-4 py-3.5">{p.area}</td>
                <td className="px-4 py-3.5">{p.listingType === "RENT" ? "Rent" : "Sale"}</td>
                <td className="px-4 py-3.5">{p.bhk} BHK</td>
                <td className="px-4 py-3.5 font-bold text-[#3366FF]">
                  {p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true })}
                </td>
                <td className="px-4 py-3.5"><Badge tone={PROPERTY_STATUS_TONE[p.status]}>{enumToLabel(p.status)}</Badge></td>
                <td className="px-4 py-3.5 text-xs text-[#8A94A6]">{formatDate(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm bulk action" description={`This will update ${selected.size} propert${selected.size > 1 ? "ies" : "y"}.`}>
        <div className="space-y-4">
          <p className="text-sm text-[#596579]">Partial failures will be reported individually.</p>
          {pricePreview.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><strong>Price preview</strong>{pricePreview.map((line)=><p key={line}>{line}</p>)}{selected.size > pricePreview.length && <p>…and {selected.size-pricePreview.length} more</p>}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={runAction} loading={running}>Confirm</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!result} onClose={() => setResult(null)} title="Bulk action complete" description={result ? `${result.succeeded} succeeded, ${result.failed} failed out of ${result.total}` : ""}>
        {result && (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {result.results.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                {r.success ? <CheckCircle2 className="h-3.5 w-3.5 text-[#1FA971]" /> : <XCircle className="h-3.5 w-3.5 text-[#E5484D]" />}
                <span className="font-mono text-[#8A94A6]">{r.id}</span>
                {r.error && <span className="text-[#E5484D]">{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}

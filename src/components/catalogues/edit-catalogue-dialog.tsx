"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/states";
import { formatINR } from "@/lib/utils";
import { ArrowUp, ArrowDown, Trash2, Plus, ImageOff } from "lucide-react";
import { PropertyPickerDialog, type PickerProperty } from "@/components/properties/property-picker-dialog";

interface EditableEntry {
  propertyId: string;
  sortOrder: number;
  customNote: string | null;
  internalNote: string | null;
  priceVisible: boolean;
  addressVisible: boolean;
  brokerageVisible: boolean;
  isTopPick: boolean;
  addedManually: boolean;
  addedByUserId: string | null;
  property: {
    id: string;
    title: string;
    propertyCode: string;
    area: string;
    coverImage: string | null;
    listingType: "RENT" | "SALE";
    monthlyRent: number | null;
    salePrice: number | null;
  };
}

/**
 * Reopens an already-created, ACTIVE catalogue for editing - reuses the
 * existing CatalogueShare/CatalogueShareProperty models and the same
 * PATCH /api/leads/[id]/catalogues/[catalogueId] (updateCatalogue) full-
 * replace endpoint the create flow's schema already supports, and the same
 * PropertyPickerDialog (with its locality filter) used to add unmatched
 * properties during initial creation. The public token/link never changes -
 * updateCatalogue only replaces the CatalogueShareProperty rows under the
 * existing CatalogueShare id, so the same share link immediately reflects
 * the new selection.
 */
export function EditCatalogueDialog({
  open,
  onClose,
  leadId,
  catalogueId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  catalogueId: string;
  onSaved: () => void;
}) {
  const { data: session } = useSession();
  const [entries, setEntries] = useState<EditableEntry[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the dialog closes so a reopen never shows stale data
      setEntries(null);
      return;
    }
    fetch(`/api/leads/${leadId}/catalogues/${catalogueId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const sorted = [...data.catalogue.properties].sort((a, b) => a.sortOrder - b.sortOrder);
        setEntries(
          sorted.map((p) => ({
            propertyId: p.propertyId,
            sortOrder: p.sortOrder,
            customNote: p.customNote,
            internalNote: p.internalNote,
            priceVisible: p.priceVisible,
            addressVisible: p.addressVisible,
            brokerageVisible: p.brokerageVisible,
            isTopPick: p.isTopPick,
            addedManually: p.addedManually,
            addedByUserId: p.addedByUserId,
            property: {
              id: p.property.id,
              title: p.property.title,
              propertyCode: p.property.propertyCode,
              area: p.property.area,
              coverImage: p.property.coverImage,
              listingType: p.property.listingType,
              monthlyRent: p.property.monthlyRent,
              salePrice: p.property.salePrice,
            },
          }))
        );
      })
      .catch(() => {
        toast.error("Could not load this catalogue");
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId, catalogueId]);

  function remove(propertyId: string) {
    setEntries((prev) => (prev ? prev.filter((e) => e.propertyId !== propertyId) : prev));
  }

  function move(propertyId: string, direction: -1 | 1) {
    setEntries((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((e) => e.propertyId === propertyId);
      const swapWith = idx + direction;
      if (idx < 0 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  function addFromPicker(p: PickerProperty) {
    setEntries((prev) => [
      ...(prev ?? []),
      {
        propertyId: p.id,
        sortOrder: prev?.length ?? 0,
        customNote: null,
        internalNote: null,
        priceVisible: true,
        addressVisible: false,
        brokerageVisible: false,
        isTopPick: false,
        addedManually: true,
        addedByUserId: session?.user?.id ?? null,
        property: {
          id: p.id,
          title: p.title,
          propertyCode: p.propertyCode,
          area: p.area,
          coverImage: p.coverImage,
          listingType: p.listingType,
          monthlyRent: p.monthlyRent,
          salePrice: p.salePrice,
        },
      },
    ]);
    setPickerOpen(false);
  }

  async function save() {
    if (!entries) return;
    if (entries.length === 0) {
      toast.error("A catalogue must contain at least one property");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}/catalogues/${catalogueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: entries.map((e, i) => ({
          propertyId: e.propertyId,
          sortOrder: i,
          customNote: e.customNote,
          internalNote: e.internalNote,
          priceVisible: e.priceVisible,
          addressVisible: e.addressVisible,
          brokerageVisible: e.brokerageVisible,
          isTopPick: e.isTopPick,
          addedManually: e.addedManually,
          addedByUserId: e.addedByUserId,
        })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Catalogue updated");
      onSaved();
      onClose();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Could not update catalogue");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit Catalogue" description="The same public link stays live - it reflects this selection as soon as you save." wide>
      {entries === null ? (
        <LoadingState label="Loading catalogue..." />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1B2430]">Selected Properties ({entries.length})</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Other Properties
            </Button>
          </div>

          {entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#8A94A6]">No properties selected - add at least one before saving.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e, idx) => {
                const price = e.property.listingType === "RENT" ? formatINR(e.property.monthlyRent, { suffix: "month" }) : formatINR(e.property.salePrice, { compact: true });
                return (
                  <li key={e.propertyId} className="flex items-center gap-3 rounded-xl border border-[#E7ECF2] bg-white p-2.5">
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-[#FAFBFC]">
                      {e.property.coverImage ? (
                        <Image src={e.property.coverImage} alt={e.property.title} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#8A94A6]"><ImageOff className="h-4 w-4" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#1B2430]">{e.property.title}</p>
                      <p className="truncate text-xs text-[#596579]">
                        {e.property.propertyCode} &middot; {e.property.area} &middot; {price}
                        {e.addedManually && <span className="ml-1.5 text-[#3366FF]">&middot; manually added</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => move(e.propertyId, -1)} disabled={idx === 0} aria-label="Move up" className="rounded-lg p-1.5 text-[#8A94A6] hover:bg-[#F3F6FA] hover:text-[#1B2430] disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => move(e.propertyId, 1)} disabled={idx === entries.length - 1} aria-label="Move down" className="rounded-lg p-1.5 text-[#8A94A6] hover:bg-[#F3F6FA] hover:text-[#1B2430] disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => remove(e.propertyId)} aria-label={`Remove ${e.property.title}`} className="rounded-lg p-1.5 text-[#8A94A6] hover:bg-[#FFF1F0] hover:text-[#E5484D]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end gap-2 border-t border-[#EFF4FF] pt-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} loading={saving}>
              Save Changes
            </Button>
          </div>
        </div>
      )}

      <PropertyPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addFromPicker}
        excludeIds={new Set((entries ?? []).map((e) => e.propertyId))}
      />
    </Dialog>
  );
}

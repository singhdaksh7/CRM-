"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { LocalityCombobox } from "@/components/properties/locality-combobox";
import {
  allowedUnitsForListingType,
  formatIndianMoney,
  fromINR,
  pickDefaultUnit,
  toINR,
  UNIT_LABELS,
  type MoneyUnit,
} from "@/lib/money";

type Locality = { id: string; name: string };
type Requirement = {
  id: string;
  assetClass: string;
  transactionType: string;
  propertyType: string | null;
  minBudget: number | null;
  maxBudget: number | null;
  minAreaSqft: number | null;
  maxAreaSqft: number | null;
  floorPreference: string | null;
  furnishingPreference: string | null;
  possessionPreference: string | null;
  status: string;
  liftPreference: string;
  parkingPreference: string;
  notes: string | null;
  localities: { locality: Locality }[];
  bhkValues: { bhk: number }[];
};

type Form = {
  assetClass: string;
  transactionType: string;
  propertyType: string;
  localities: Locality[];
  bhks: number[];
  minBudget: string;
  minBudgetUnit: MoneyUnit;
  maxBudget: string;
  maxBudgetUnit: MoneyUnit;
  minAreaSqft: string;
  maxAreaSqft: string;
  floorPreference: string;
  liftPreference: string;
  parkingPreference: string;
  furnishingPreference: string;
  possessionPreference: string;
  notes: string;
};

const fresh = (): Form => ({
  assetClass: "RESIDENTIAL",
  transactionType: "SALE",
  propertyType: "",
  localities: [],
  bhks: [],
  minBudget: "",
  minBudgetUnit: allowedUnitsForListingType("SALE")[0],
  maxBudget: "",
  maxBudgetUnit: allowedUnitsForListingType("SALE")[0],
  minAreaSqft: "",
  maxAreaSqft: "",
  floorPreference: "",
  liftPreference: "NO_PREFERENCE",
  parkingPreference: "NO_PREFERENCE",
  furnishingPreference: "",
  possessionPreference: "",
  notes: "",
});

export function LeadRequirementsPanel({ leadId }: { leadId: string }) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [form, setForm] = useState<Form>(fresh);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localityQuery, setLocalityQuery] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/leads/${leadId}/requirements`);
    if (response.ok) setRequirements((await response.json()).requirements);
  }, [leadId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function toggleBhk(bhk: number) {
    setForm((v) => ({
      ...v,
      bhks: v.bhks.includes(bhk)
        ? v.bhks.filter((item) => item !== bhk)
        : [...v.bhks, bhk],
    }));
  }

  function edit(r: Requirement) {
    setEditingId(r.id);
    const allowedUnits = allowedUnitsForListingType(
      r.transactionType === "RENT" ? "RENT" : "SALE"
    );
    const minBudgetUnit = pickDefaultUnit(r.minBudget, allowedUnits);
    const maxBudgetUnit = pickDefaultUnit(r.maxBudget, allowedUnits);
    setForm({
      assetClass: r.assetClass,
      transactionType: r.transactionType,
      propertyType: r.propertyType ?? "",
      localities: r.localities.map((x) => x.locality),
      bhks: r.bhkValues.map((x) => x.bhk),
      minBudget:
        r.minBudget != null ? String(fromINR(r.minBudget, minBudgetUnit)) : "",
      minBudgetUnit,
      maxBudget:
        r.maxBudget != null ? String(fromINR(r.maxBudget, maxBudgetUnit)) : "",
      maxBudgetUnit,
      minAreaSqft: String(r.minAreaSqft ?? ""),
      maxAreaSqft: String(r.maxAreaSqft ?? ""),
      floorPreference: r.floorPreference ?? "",
      liftPreference: r.liftPreference,
      parkingPreference: r.parkingPreference,
      furnishingPreference: r.furnishingPreference ?? "",
      possessionPreference: r.possessionPreference ?? "",
      notes: r.notes ?? "",
    });
    setLocalityQuery("");
    setOpen(true);
  }

  function setTransactionType(next: string) {
    const allowedUnits = allowedUnitsForListingType(
      next === "RENT" ? "RENT" : "SALE"
    );
    setForm((v) => ({
      ...v,
      transactionType: next,
      minBudget: "",
      maxBudget: "",
      minBudgetUnit: allowedUnits[0],
      maxBudgetUnit: allowedUnits[0],
    }));
  }

  async function save() {
    setSaving(true);
    const { localities, minBudgetUnit, maxBudgetUnit, ...rest } = form;
    const response = await fetch(
      editingId
        ? `/api/leads/${leadId}/requirements/${editingId}`
        : `/api/leads/${leadId}/requirements`,
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          localityIds: localities.map((l) => l.id),
          propertyType: form.propertyType || null,
          minBudget: form.minBudget
            ? toINR(Number(form.minBudget), minBudgetUnit)
            : null,
          maxBudget: form.maxBudget
            ? toINR(Number(form.maxBudget), maxBudgetUnit)
            : null,
          minAreaSqft: form.minAreaSqft ? Number(form.minAreaSqft) : null,
          maxAreaSqft: form.maxAreaSqft ? Number(form.maxAreaSqft) : null,
          floorPreference: form.floorPreference || null,
          furnishingPreference: form.furnishingPreference || null,
          possessionPreference: form.possessionPreference || null,
          notes: form.notes || null,
        }),
      }
    );
    setSaving(false);
    if (response.ok) {
      setOpen(false);
      setEditingId(null);
      setForm(fresh());
      setLocalityQuery("");
      await load();
    }
  }

  async function status(id: string, next: string) {
    const response = await fetch(`/api/leads/${leadId}/requirements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (response.ok) await load();
  }

  function addLocality(locality: Locality) {
    const normalized = locality.name.trim().toLowerCase();
    setForm((v) =>
      v.localities.some((l) => l.name.trim().toLowerCase() === normalized)
        ? v
        : { ...v, localities: [...v.localities, locality] }
    );
    setLocalityQuery("");
  }

  function removeLocality(id: string) {
    setForm((v) => ({
      ...v,
      localities: v.localities.filter((l) => l.id !== id),
    }));
  }

  return (
    <section className="space-y-4 rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#71717A]">
            Property Requirements
          </h3>
          <p className="text-xs text-[#71717A]">
            Independent briefs are matched separately.
          </p>
        </div>
        <Button
          size="sm"
          variant={open ? "outline" : "primary"}
          onClick={() => {
            setEditingId(null);
            setForm(fresh());
            setLocalityQuery("");
            setOpen((v) => !v);
          }}
        >
          {open ? "Cancel" : "+ Add Requirement"}
        </Button>
      </div>

      {requirements.map((r, i) => (
        <div
          key={r.id}
          className="rounded-lg border border-[#E4E4E7] p-4 text-sm bg-white hover:border-[#D4D4D8] transition-colors"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm font-semibold text-[#09090B]">
              Requirement #{i + 1}
            </strong>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs font-medium text-[#09090B] hover:underline"
                onClick={() => edit(r)}
              >
                Edit
              </button>
              <Select
                className="w-auto text-xs py-1"
                value={r.status}
                onChange={(e) => void status(r.id, e.target.value)}
              >
                {["ACTIVE", "PAUSED", "FULFILLED", "CANCELLED"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  )
                )}
              </Select>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-[#52525B]">
            {r.transactionType === "RENT" ? "Renting" : "Buying"} ·{" "}
            {r.minBudget != null ? formatIndianMoney(r.minBudget) : "—"}–
            {r.maxBudget != null ? formatIndianMoney(r.maxBudget) : "—"}
          </p>
          <p className="mt-1 text-xs text-[#52525B]">
            {r.localities.map((x) => x.locality.name).join(" · ") ||
              "Any locality"}
          </p>
          <p className="mt-1 text-xs text-[#52525B]">
            {r.bhkValues.map((x) => `${x.bhk} BHK`).join(" · ") || "Any BHK"}{" "}
            · Lift {r.liftPreference.replaceAll("_", " ")} · Parking{" "}
            {r.parkingPreference.replaceAll("_", " ")}
          </p>
          <div className="mt-3 pt-2 border-t border-[#F4F4F5]">
            <Link
              className="inline-flex items-center text-xs font-semibold text-[#09090B] hover:underline"
              href={`/leads/${leadId}/match`}
            >
              Find Matching Properties →
            </Link>
          </div>
        </div>
      ))}

      {!requirements.length && !open && (
        <p className="text-sm text-[#71717A] py-2">
          No normalized requirement yet; existing lead preferences remain the matching fallback.
        </p>
      )}

      {open && (
        <div className="grid gap-4 rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] p-4 sm:grid-cols-2">
          <Field label="Asset class">
            <Select
              value={form.assetClass}
              onChange={(e) =>
                setForm({
                  ...form,
                  assetClass: e.target.value,
                  propertyType: "",
                })
              }
            >
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
            </Select>
          </Field>
          <Field label="Looking for">
            <Select
              value={form.transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
            >
              <option value="SALE">Buy</option>
              <option value="RENT">Rent</option>
            </Select>
          </Field>
          <Field label="Property type">
            <Select
              value={form.propertyType}
              onChange={(e) =>
                setForm({ ...form, propertyType: e.target.value })
              }
            >
              <option value="">Any type</option>
              {(form.assetClass === "COMMERCIAL"
                ? [
                    "COMMERCIAL_SHOP",
                    "COMMERCIAL_OFFICE",
                    "OFFICE",
                    "SHOP",
                    "SHOWROOM",
                    "WAREHOUSE",
                    "INDUSTRIAL",
                    "COMMERCIAL_LAND",
                    "CO_WORKING",
                    "RESTAURANT_SPACE",
                    "SCO",
                    "OTHER_COMMERCIAL",
                  ]
                : [
                    "APARTMENT",
                    "INDEPENDENT_HOUSE",
                    "VILLA",
                    "BUILDER_FLOOR",
                    "PLOT",
                    "PG",
                    "STUDIO",
                    "FARM_HOUSE",
                    "CO_LIVING",
                    "OTHER",
                  ]
              ).map((x) => (
                <option key={x}>{x.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Preferred localities">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.localities.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E4E4E7] px-2.5 py-0.5 text-xs text-[#09090B]"
                >
                  {l.name}
                  <button
                    type="button"
                    aria-label={`Remove ${l.name}`}
                    className="font-bold leading-none text-[#71717A] hover:text-[#09090B]"
                    onClick={() => removeLocality(l.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div>
              <LocalityCombobox
                value={localityQuery}
                onChange={setLocalityQuery}
                onSelectLocality={addLocality}
                placeholder="+ Add Locality"
                aria-label="Add preferred locality"
              />
            </div>
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-[#52525B] uppercase tracking-wider">
              BHK
            </p>
            <div className="flex flex-wrap gap-3">
              {[1, 2, 3, 4, 5].map((bhk) => (
                <Checkbox
                  key={bhk}
                  label={`${bhk}${bhk === 5 ? "+" : ""}`}
                  checked={form.bhks.includes(bhk)}
                  onChange={() => toggleBhk(bhk)}
                />
              ))}
            </div>
          </div>
          <Field label="Minimum budget">
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                className="flex-1"
                value={form.minBudget}
                onChange={(e) =>
                  setForm({ ...form, minBudget: e.target.value })
                }
              />
              <Select
                className="w-32"
                value={form.minBudgetUnit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    minBudgetUnit: e.target.value as MoneyUnit,
                  })
                }
              >
                {allowedUnitsForListingType(
                  form.transactionType === "RENT" ? "RENT" : "SALE"
                ).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </div>
            {form.minBudget && (
              <p className="mt-1 text-xs text-[#71717A]">
                = ₹
                {toINR(
                  Number(form.minBudget) || 0,
                  form.minBudgetUnit
                ).toLocaleString("en-IN")}
              </p>
            )}
          </Field>
          <Field label="Maximum budget">
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                className="flex-1"
                value={form.maxBudget}
                onChange={(e) =>
                  setForm({ ...form, maxBudget: e.target.value })
                }
              />
              <Select
                className="w-32"
                value={form.maxBudgetUnit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxBudgetUnit: e.target.value as MoneyUnit,
                  })
                }
              >
                {allowedUnitsForListingType(
                  form.transactionType === "RENT" ? "RENT" : "SALE"
                ).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </div>
            {form.maxBudget && (
              <p className="mt-1 text-xs text-[#71717A]">
                = ₹
                {toINR(
                  Number(form.maxBudget) || 0,
                  form.maxBudgetUnit
                ).toLocaleString("en-IN")}
              </p>
            )}
          </Field>
          <Field label="Minimum area (sq ft)">
            <Input
              inputMode="numeric"
              value={form.minAreaSqft}
              onChange={(e) =>
                setForm({ ...form, minAreaSqft: e.target.value })
              }
            />
          </Field>
          <Field label="Maximum area (sq ft)">
            <Input
              inputMode="numeric"
              value={form.maxAreaSqft}
              onChange={(e) =>
                setForm({ ...form, maxAreaSqft: e.target.value })
              }
            />
          </Field>
          <Field label="Floor preference">
            <Input
              value={form.floorPreference}
              onChange={(e) =>
                setForm({ ...form, floorPreference: e.target.value })
              }
            />
          </Field>
          <Field label="Furnishing">
            <Select
              value={form.furnishingPreference}
              onChange={(e) =>
                setForm({ ...form, furnishingPreference: e.target.value })
              }
            >
              <option value="">No preference</option>
              {["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"].map((x) => (
                <option key={x}>{x.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Lift">
            <Select
              value={form.liftPreference}
              onChange={(e) =>
                setForm({ ...form, liftPreference: e.target.value })
              }
            >
              {["NO_PREFERENCE", "PREFERRED", "REQUIRED"].map((x) => (
                <option key={x}>{x.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Parking">
            <Select
              value={form.parkingPreference}
              onChange={(e) =>
                setForm({ ...form, parkingPreference: e.target.value })
              }
            >
              {["NO_PREFERENCE", "PREFERRED", "REQUIRED"].map((x) => (
                <option key={x}>{x.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Possession">
            <Input
              value={form.possessionPreference}
              onChange={(e) =>
                setForm({ ...form, possessionPreference: e.target.value })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Internal requirement notes">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm({ ...form, notes: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="sm:col-span-2 pt-2">
            <Button onClick={() => void save()} loading={saving}>
              {editingId ? "Save changes" : "Save Requirement"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

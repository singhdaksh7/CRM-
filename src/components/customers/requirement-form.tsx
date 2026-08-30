"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import type { CustomerRequirement, CustomerRequirementInput } from "@/lib/demand-pool/types";
import { parseLocalities } from "@/lib/demand-pool/format";

const RESIDENTIAL_TYPES = ["APARTMENT", "BUILDER_FLOOR", "INDEPENDENT_HOUSE", "VILLA", "STUDIO", "FARM_HOUSE", "PLOT", "PG", "OTHER"];
const COMMERCIAL_TYPES = ["OFFICE", "SHOP", "SHOWROOM", "WAREHOUSE", "INDUSTRIAL", "COMMERCIAL_LAND", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL"];

function toInput(requirement?: CustomerRequirement | null): CustomerRequirementInput {
  if (!requirement) {
    return {
      assetClass: "RESIDENTIAL",
      transactionType: "RENT",
      preferredLocalities: [],
      active: true,
      priority: "MEDIUM",
    };
  }
  return {
    assetClass: requirement.assetClass,
    transactionType: requirement.transactionType,
    propertyType: requirement.propertyType,
    commercialPropertyType: requirement.commercialPropertyType,
    preferredLocalities: parseLocalities(requirement.preferredLocalities),
    minBudget: requirement.minBudget,
    maxBudget: requirement.maxBudget,
    minArea: requirement.minArea,
    maxArea: requirement.maxArea,
    bhk: requirement.bhk,
    floorPreference: requirement.floorPreference,
    furnishing: requirement.furnishing,
    parkingRequired: requirement.parkingRequired,
    liftRequired: requirement.liftRequired,
    commercialFitOutPref: requirement.commercialFitOutPref,
    workstations: requirement.workstations,
    cabins: requirement.cabins,
    possession: requirement.possession,
    notes: requirement.notes,
    active: requirement.active,
    priority: requirement.priority,
  };
}

export function RequirementForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: CustomerRequirement | null;
  submitting?: boolean;
  error?: string;
  onSubmit: (value: CustomerRequirementInput) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<CustomerRequirementInput>(() => toInput(initial));
  const commercial = value.assetClass === "COMMERCIAL";

  function set<K extends keyof CustomerRequirementInput>(key: K, next: CustomerRequirementInput[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payload: CustomerRequirementInput = {
          ...value,
          bhk: commercial ? null : value.bhk,
          commercialPropertyType: commercial ? value.commercialPropertyType : null,
          propertyType: commercial ? null : value.propertyType,
        };
        void onSubmit(payload);
      }}
    >
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Property Category" required>
          <Select
            aria-label="Property Category"
            value={value.assetClass}
            onChange={(e) => set("assetClass", e.target.value as CustomerRequirementInput["assetClass"])}
          >
            <option value="RESIDENTIAL">Residential</option>
            <option value="COMMERCIAL">Commercial</option>
          </Select>
        </Field>
        <Field label="Rent / Sale" required>
          <Select
            aria-label="Rent / Sale"
            value={value.transactionType}
            onChange={(e) => set("transactionType", e.target.value as CustomerRequirementInput["transactionType"])}
          >
            <option value="RENT">Rent</option>
            <option value="SALE">Sale</option>
          </Select>
        </Field>
      </div>

      {!commercial ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Property type">
            <Select aria-label="Property type" value={value.propertyType ?? ""} onChange={(e) => set("propertyType", e.target.value || null)}>
              <option value="">Select type</option>
              {RESIDENTIAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="BHK">
            <Select aria-label="BHK" value={value.bhk ?? ""} onChange={(e) => set("bhk", e.target.value ? Number(e.target.value) : null)}>
              <option value="">Any</option>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Studio / 0" : `${n} BHK`}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <Field label="Commercial subtype" required>
          <Select
            aria-label="Commercial subtype"
            value={value.commercialPropertyType ?? ""}
            onChange={(e) => set("commercialPropertyType", e.target.value || null)}
          >
            <option value="">Select subtype</option>
            {COMMERCIAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Localities" hint="Comma-separated preferred areas">
        <Input
          aria-label="Preferred localities"
          value={(value.preferredLocalities ?? []).join(", ")}
          onChange={(e) =>
            set(
              "preferredLocalities",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          placeholder="Rajouri Garden, Punjabi Bagh"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Min budget">
          <Input aria-label="Minimum budget" type="number" min={0} value={value.minBudget ?? ""} onChange={(e) => set("minBudget", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Max budget">
          <Input aria-label="Maximum budget" type="number" min={0} value={value.maxBudget ?? ""} onChange={(e) => set("maxBudget", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Min area (sq ft)">
          <Input aria-label="Minimum area" type="number" min={0} value={value.minArea ?? ""} onChange={(e) => set("minArea", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Max area (sq ft)">
          <Input aria-label="Maximum area" type="number" min={0} value={value.maxArea ?? ""} onChange={(e) => set("maxArea", e.target.value ? Number(e.target.value) : null)} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Floor preference">
          <Input aria-label="Floor preference" value={value.floorPreference ?? ""} onChange={(e) => set("floorPreference", e.target.value || null)} />
        </Field>
        <Field label="Possession">
          <Input aria-label="Possession" value={value.possession ?? ""} onChange={(e) => set("possession", e.target.value || null)} />
        </Field>
      </div>

      {!commercial ? (
        <Field label="Furnishing">
          <Select aria-label="Furnishing" value={value.furnishing ?? ""} onChange={(e) => set("furnishing", e.target.value || null)}>
            <option value="">Any</option>
            <option value="FURNISHED">Furnished</option>
            <option value="SEMI_FURNISHED">Semi furnished</option>
            <option value="UNFURNISHED">Unfurnished</option>
          </Select>
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fit-out">
            <Select aria-label="Fit-out" value={value.commercialFitOutPref ?? ""} onChange={(e) => set("commercialFitOutPref", e.target.value || null)}>
              <option value="">Any</option>
              <option value="FURNISHED">Furnished</option>
              <option value="SEMI_FURNISHED">Semi furnished</option>
              <option value="BARE_SHELL">Bare shell</option>
            </Select>
          </Field>
          <Field label="Workstations">
            <Input aria-label="Workstations" type="number" min={0} value={value.workstations ?? ""} onChange={(e) => set("workstations", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Cabins">
            <Input aria-label="Cabins" type="number" min={0} value={value.cabins ?? ""} onChange={(e) => set("cabins", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <Checkbox label="Parking required" checked={Boolean(value.parkingRequired)} onChange={(e) => set("parkingRequired", e.target.checked)} />
        <Checkbox label="Lift required" checked={Boolean(value.liftRequired)} onChange={(e) => set("liftRequired", e.target.checked)} />
        <Checkbox label="Active" checked={value.active !== false} onChange={(e) => set("active", e.target.checked)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Priority">
          <Select aria-label="Priority" value={value.priority ?? "MEDIUM"} onChange={(e) => set("priority", e.target.value as CustomerRequirementInput["priority"])}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea aria-label="Requirement notes" rows={3} value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submitting}>
          Save requirement
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

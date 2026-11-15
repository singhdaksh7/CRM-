"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { User } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PropertyPickerDialog, type PickerProperty } from "@/components/properties/property-picker-dialog";
import { Building2, CheckCircle2 } from "lucide-react";
import { enumToLabel } from "@/lib/utils";

type EmployeeOption = Pick<User, "id" | "name"> & { role?: string };

interface MarkDealClosedDialogProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadClientName: string;
  leadOwnerName?: string;
  employees: EmployeeOption[];
  defaultClosedById?: string | null;
  defaultProperty?: { id: string; title: string; propertyCode?: string } | null;
  onSuccess?: () => void;
}

export function MarkDealClosedDialog({
  open,
  onClose,
  leadId,
  leadClientName,
  leadOwnerName,
  employees,
  defaultClosedById,
  defaultProperty,
  onSuccess,
}: MarkDealClosedDialogProps) {
  const router = useRouter();

  // Find initial closer: default to defaultClosedById if present in employees, else first employee
  const [closedByUserId, setClosedByUserId] = useState<string>(() => {
    if (defaultClosedById && employees.some((e) => e.id === defaultClosedById)) {
      return defaultClosedById;
    }
    return employees[0]?.id ?? "";
  });

  const [property, setProperty] = useState<PickerProperty | null>(() => {
    if (defaultProperty) {
      return {
        id: defaultProperty.id,
        title: defaultProperty.title,
        propertyCode: defaultProperty.propertyCode ?? "",
        area: "",
        listingType: "RENT",
        salePrice: null,
        monthlyRent: null,
        bhk: 0,
        furnishing: null,
        coverImage: null,
        status: "AVAILABLE",
      };
    }
    return null;
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [closedDate, setClosedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!closedByUserId) {
      toast.error("Please select who closed the deal");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/close-deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closedByUserId,
          propertyId: property ? property.id : null,
          closedAt: closedDate ? `${closedDate}T12:00:00.000Z` : new Date().toISOString(),
          notes: notes.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Deal successfully marked Won!");
        onClose();
        if (onSuccess) onSuccess();
        router.refresh();
      } else {
        toast.error(body.error ?? "Failed to mark deal closed");
      }
    } catch {
      toast.error("Failed to mark deal closed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Mark Deal Closed / Won">
      <form onSubmit={submit} className="space-y-4 pt-1">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-emerald-950 space-y-1">
          <div className="flex items-center gap-2 font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Operational Deal Attribution
          </div>
          <p className="text-[11px] text-emerald-800/90 leading-relaxed">
            Record closure for <strong>{leadClientName}</strong>. Specify who actually closed the deal to ensure accurate operational tracking and Team Report attribution.
          </p>
          <div className="pt-1 text-[11px] text-emerald-900 flex gap-4">
            <span>Lead Owner: <strong>{leadOwnerName || "Unassigned"}</strong></span>
          </div>
        </div>

        <Field label="Deal Closed By (Employee)">
          <Select
            value={closedByUserId}
            onChange={(e) => setClosedByUserId(e.target.value)}
            disabled={saving}
            required
          >
            <option value="">Select Employee...</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} {emp.role ? `(${enumToLabel(emp.role)})` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Property Involved (Optional)">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex-1 rounded-lg border border-[#E4E4E7] bg-white px-3 py-2 text-left text-xs font-medium text-[#09090B] hover:bg-[#FAFAFA] transition-colors"
            >
              {property ? (
                <span>
                  <strong>{property.title}</strong>
                  {property.propertyCode ? ` (${property.propertyCode})` : ""}
                </span>
              ) : (
                <span className="text-[#71717A] flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Pick a property...
                </span>
              )}
            </button>
            {property && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setProperty(null)}
              >
                Clear
              </Button>
            )}
          </div>
        </Field>

        <Field label="Closed Date">
          <Input
            type="date"
            value={closedDate}
            onChange={(e) => setClosedDate(e.target.value)}
            disabled={saving}
            required
          />
        </Field>

        <Field label="Closure Note (Optional)">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Operational notes regarding this closure..."
            disabled={saving}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#E4E4E7]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Confirm Deal Won
          </Button>
        </div>
      </form>

      <PropertyPickerDialog
        open={pickerOpen}
        excludeIds={new Set(property ? [property.id] : [])}
        onClose={() => setPickerOpen(false)}
        onSelect={(p) => {
          setProperty(p);
          setPickerOpen(false);
        }}
      />
    </Dialog>
  );
}

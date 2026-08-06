"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { InventoryPartner } from "@prisma/client";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

const LOCALITIES_POOL = ["Janakpuri", "Dwarka", "Rajouri Garden", "Uttam Nagar", "Rohini", "Pitampura", "Vasant Kunj", "Saket", "Greater Kailash", "Lajpat Nagar", "Karol Bagh", "Paschim Vihar"];

type FormValues = {
  name: string;
  company: string;
  phone: string;
  alternatePhone: string;
  localities: string[];
  notes: string;
  commissionSplitPct: string;
  isActive: boolean;
};

function toFormValues(p?: InventoryPartner): FormValues {
  return {
    name: p?.name ?? "",
    company: p?.company ?? "",
    phone: p?.phone ?? "",
    alternatePhone: p?.alternatePhone ?? "",
    localities: p?.localities ? JSON.parse(p.localities) : [],
    notes: p?.notes ?? "",
    commissionSplitPct: p?.commissionSplitPct?.toString() ?? "",
    isActive: p?.isActive ?? true,
  };
}

export function InventoryPartnerForm({ partner }: { partner?: InventoryPartner }) {
  const router = useRouter();
  const isEdit = !!partner;
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({ defaultValues: toFormValues(partner) });
  const localities = watch("localities");

  function toggleLocality(l: string) {
    setValue("localities", localities.includes(l) ? localities.filter((x) => x !== l) : [...localities, l]);
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const blankToNull = (v: string) => (v.trim() === "" ? null : v.trim());
    const payload = {
      name: values.name.trim(),
      company: blankToNull(values.company),
      phone: values.phone.trim(),
      alternatePhone: blankToNull(values.alternatePhone),
      localities: values.localities,
      notes: blankToNull(values.notes),
      commissionSplitPct: values.commissionSplitPct ? Number(values.commissionSplitPct) : null,
      isActive: values.isActive,
    };

    try {
      const res = await fetch(isEdit ? `/api/inventory-partners/${partner!.id}` : "/api/inventory-partners", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        const issues = Array.isArray(err.issues) ? (err.issues as { path: (string | number)[]; message: string }[]) : [];
        if (issues.length > 0) {
          for (const issue of issues) {
            const field = issue.path[0];
            if (typeof field === "string" && field in values) {
              setError(field as keyof FormValues, { type: "server", message: issue.message });
            }
          }
          throw new Error(issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
        }
        throw new Error(err.error ?? "Failed to save inventory partner");
      }
      const { inventoryPartner: saved } = await res.json();
      toast.success(isEdit ? "Inventory partner updated" : "Inventory partner added");
      router.push(`/inventory-partners/${saved.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name?.message}>
            <Input {...register("name", { required: "Name is required", minLength: { value: 2, message: "Name is too short" } })} placeholder="Sharma Real Estate Dealers" />
          </Field>
          <Field label="Company / Firm" error={errors.company?.message}>
            <Input {...register("company")} placeholder="e.g. builder, society office, dealer firm" />
          </Field>
          <Field label="Phone" required error={errors.phone?.message}>
            <Input {...register("phone", { required: "Phone is required", minLength: { value: 8, message: "Phone looks too short" } })} placeholder="9876543210" />
          </Field>
          <Field label="Alternate Phone" error={errors.alternatePhone?.message}>
            <Input {...register("alternatePhone")} placeholder="Optional" />
          </Field>
          <Field label="Commission Split %" error={errors.commissionSplitPct?.message}>
            <Input type="number" step="0.1" min="0" max="100" {...register("commissionSplitPct")} placeholder="e.g. 50" />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox {...register("isActive")} label="Active" />
          </div>
        </div>

        <Field label="Localities Covered">
          <div className="flex flex-wrap gap-2">
            {LOCALITIES_POOL.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLocality(l)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  localities.includes(l) ? "border-[#3366FF] bg-[#3366FF]/10 text-[#3366FF]" : "border-[#E7ECF2] text-[#596579] hover:border-[#3366FF]/40"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notes" error={errors.notes?.message}>
          <Textarea {...register("notes")} rows={3} placeholder="Any internal notes about this partner" />
        </Field>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Inventory Partner"}</Button>
      </div>
    </form>
  );
}

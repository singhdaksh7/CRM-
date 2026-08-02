"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { User } from "@prisma/client";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

const AREAS = ["Janakpuri", "Dwarka", "Rajouri Garden", "Uttam Nagar", "Rohini", "Pitampura", "Vasant Kunj", "Saket", "Greater Kailash", "Lajpat Nagar", "Karol Bagh", "Paschim Vihar"];

type FormValues = {
  clientName: string;
  phone: string;
  email: string;
  source: string;
  requirementType: "RENT" | "BUY";
  preferredLocation: string;
  minBudget: string;
  maxBudget: string;
  preferredBhk: string;
  furnishingPref: string;
  moveInDate: string;
  additionalRequirements: string;
  assignedToId: string;
  priority: string;
  notes: string;
};

export function LeadForm({ employees }: { employees: User[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      source: "MANUAL",
      requirementType: "RENT",
      preferredLocation: AREAS[0],
      priority: "WARM",
      furnishingPref: "",
      assignedToId: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          minBudget: Number(values.minBudget),
          maxBudget: Number(values.maxBudget),
          preferredBhk: values.preferredBhk ? Number(values.preferredBhk) : null,
          furnishingPref: values.furnishingPref || null,
          moveInDate: values.moveInDate || null,
          assignedToId: values.assignedToId || null,
          additionalRequirements: values.additionalRequirements || null,
          notes: values.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create lead");
      }
      const { lead } = await res.json();
      toast.success("Lead created");
      router.push(`/leads/${lead.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Client Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client Name" required><Input {...register("clientName", { required: true })} placeholder="Rahul Sharma" /></Field>
          <Field label="Phone Number" required><Input {...register("phone", { required: true })} placeholder="+91 98765 43210" /></Field>
          <Field label="Email"><Input type="email" {...register("email")} placeholder="rahul@example.com" /></Field>
          <Field label="Lead Source" required>
            <Select {...register("source")}>
              {["MANUAL", "ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Requirement</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Requirement Type" required>
            <Select {...register("requirementType")}>
              <option value="RENT">Rent</option>
              <option value="BUY">Buy</option>
            </Select>
          </Field>
          <Field label="Preferred Location" required>
            <Select {...register("preferredLocation")}>
              {AREAS.map((a) => (<option key={a} value={a}>{a}</option>))}
            </Select>
          </Field>
          <Field label="Preferred BHK">
            <Select {...register("preferredBhk")}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((b) => (<option key={b} value={b}>{b} BHK</option>))}
            </Select>
          </Field>
          <Field label="Minimum Budget (₹)" required><Input type="number" {...register("minBudget", { required: true })} /></Field>
          <Field label="Maximum Budget (₹)" required><Input type="number" {...register("maxBudget", { required: true })} /></Field>
          <Field label="Furnishing Preference">
            <Select {...register("furnishingPref")}>
              <option value="">Any</option>
              <option value="FURNISHED">Furnished</option>
              <option value="SEMI_FURNISHED">Semi-Furnished</option>
              <option value="UNFURNISHED">Unfurnished</option>
            </Select>
          </Field>
          <Field label="Move-in Date"><Input type="date" {...register("moveInDate")} /></Field>
        </div>
        <Field label="Additional Requirements">
          <Textarea rows={2} {...register("additionalRequirements")} placeholder="e.g. Needs property near metro station" />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Assignment & Priority</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Assign To">
            <Select {...register("assignedToId")}>
              <option value="">Unassigned</option>
              {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select {...register("priority")}>
              <option value="HOT">Hot</option>
              <option value="WARM">Warm</option>
              <option value="COLD">Cold</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={submitting}>Create Lead</Button>
      </div>
    </form>
  );
}

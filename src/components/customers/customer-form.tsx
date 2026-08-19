"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import type { CustomerContact, CustomerContactInput, LeadSource } from "@/lib/demand-pool/types";
import { parseTags } from "@/lib/demand-pool/format";

const SOURCES: LeadSource[] = [
  "MANUAL",
  "WHATSAPP",
  "PHONE_CALL",
  "REFERRAL",
  "WALK_IN",
  "WEBSITE",
  "ACRES_99",
  "MAGICBRICKS",
  "HOUSING_COM",
  "OTHER",
];

function toInput(contact?: CustomerContact | null): CustomerContactInput {
  if (!contact) {
    return {
      name: "",
      phone: "",
      email: "",
      source: "MANUAL",
      notes: "",
      tags: [],
      status: "ACTIVE",
      doNotContact: false,
      whatsAppOptOut: false,
    };
  }
  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email ?? "",
    source: contact.source,
    notes: contact.notes ?? "",
    tags: parseTags(contact.tags),
    status: contact.status,
    doNotContact: contact.doNotContact,
    whatsAppOptOut: contact.whatsAppOptOut,
  };
}

export function CustomerForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: CustomerContact | null;
  submitting?: boolean;
  error?: string;
  onSubmit: (value: CustomerContactInput) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<CustomerContactInput>(() => toInput(initial));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          ...value,
          email: value.email || null,
          whatsAppOptOut: value.whatsAppOptOut,
          doNotContact: value.doNotContact || value.status === "DO_NOT_CONTACT",
        });
      }}
    >
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <Input aria-label="Customer name" required value={value.name} onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))} />
        </Field>
        <Field label="Phone" required>
          <Input aria-label="Phone" required value={value.phone} onChange={(e) => setValue((v) => ({ ...v, phone: e.target.value }))} />
        </Field>
        <Field label="Email">
          <Input aria-label="Email" type="email" value={value.email ?? ""} onChange={(e) => setValue((v) => ({ ...v, email: e.target.value }))} />
        </Field>
        <Field label="Source">
          <Select aria-label="Source" value={value.source ?? "MANUAL"} onChange={(e) => setValue((v) => ({ ...v, source: e.target.value as LeadSource }))}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Tags" hint="Comma-separated">
        <Input
          aria-label="Tags"
          value={(value.tags ?? []).join(", ")}
          onChange={(e) =>
            setValue((v) => ({
              ...v,
              tags: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }))
          }
        />
      </Field>

      <Field label="Notes">
        <Textarea aria-label="Notes" rows={3} value={value.notes ?? ""} onChange={(e) => setValue((v) => ({ ...v, notes: e.target.value }))} />
      </Field>

      <div className="rounded-xl border border-[#E7ECF2] bg-[#F8FAFC] p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#596579]">Contact preferences</p>
        <Checkbox
          label="WhatsApp allowed"
          checked={!value.whatsAppOptOut}
          onChange={(e) => setValue((v) => ({ ...v, whatsAppOptOut: !e.target.checked }))}
        />
        <Checkbox
          label="Do Not Contact"
          checked={Boolean(value.doNotContact)}
          onChange={(e) =>
            setValue((v) => ({
              ...v,
              doNotContact: e.target.checked,
              status: e.target.checked ? "DO_NOT_CONTACT" : v.status === "DO_NOT_CONTACT" ? "ACTIVE" : v.status,
            }))
          }
        />
        <Field label="Status">
          <Select aria-label="Status" value={value.status ?? "ACTIVE"} onChange={(e) => setValue((v) => ({ ...v, status: e.target.value as CustomerContactInput["status"] }))}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="DO_NOT_CONTACT">Do Not Contact / Opted out</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submitting}>
          Save customer
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

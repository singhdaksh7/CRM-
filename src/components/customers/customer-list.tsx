"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDate } from "@/lib/utils";
import {
  lastContactedLabel,
  parseLocalities,
  parseTags,
  summarizeRequirement,
} from "@/lib/demand-pool/format";
import type { CustomerContact } from "@/lib/demand-pool/types";
import { AssetClassBadge, TransactionBadge } from "./badges";

export function CustomerList({ contacts }: { contacts: CustomerContact[] }) {
  if (contacts.length === 0) {
    return (
      <EmptyState
        title="No customers in the database"
        description="Import a spreadsheet or add a customer to start matching inventory against requirements."
      />
    );
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-xl border border-[#E4E4E7] bg-white shadow-xs">
        <table className="min-w-full text-sm">
          <thead className="bg-[#FAFAFA] border-b border-[#E4E4E7] text-left text-xs uppercase tracking-wider text-[#71717A]">
            <tr>
              {["Customer", "Contact", "Requirements", "Budget / Localities", "Lead", "Last contact", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => {
              const active = (contact.requirements ?? []).filter((r) => r.active);
              const primary = active[0];
              const localities = primary ? parseLocalities(primary.preferredLocalities) : [];
              return (
                <tr key={contact.id} className="border-t border-[#E4E4E7] align-top hover:bg-[#FAFAFA] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${contact.id}`} className="font-semibold text-[#09090B] hover:underline">
                      {contact.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {parseTags(contact.tags).slice(0, 3).map((tag) => (
                        <Badge key={tag} tone="slate">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#52525B]">
                    <div>{contact.phone}</div>
                    <div className="text-xs text-[#71717A]">{contact.email || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#09090B]">{active.length} active</div>
                    {primary && (
                      <div className="mt-1 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <AssetClassBadge assetClass={primary.assetClass} />
                          <TransactionBadge transactionType={primary.transactionType} />
                        </div>
                        <p className="text-xs text-[#52525B]">{summarizeRequirement(primary)}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#52525B]">
                    {primary ? (
                      <>
                        <div className="font-medium text-[#09090B]">
                          {formatINR(primary.minBudget, { compact: true })}–{formatINR(primary.maxBudget, { compact: true })}
                        </div>
                        <div className="text-[#71717A]">{localities.join(", ") || "—"}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(contact.leads ?? []).length > 0 ? (
                      <Link className="font-semibold text-[#09090B] hover:underline" href={`/leads/${contact.leads![0].id}`}>
                        {contact.leads![0].leadCode}
                      </Link>
                    ) : (
                      <span className="text-[#71717A]">No lead</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#52525B]">
                    <div>{lastContactedLabel(contact.lastContactedAt)}</div>
                    <div className="text-[#71717A]">Sent: {contact.lastPropertySentAt ? formatDate(contact.lastPropertySentAt) : "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={contact.doNotContact || contact.status === "DO_NOT_CONTACT" ? "red" : contact.whatsAppOptOut ? "amber" : "green"}>
                      {contact.doNotContact || contact.status === "DO_NOT_CONTACT" ? "DNC" : contact.whatsAppOptOut ? "Opted out" : contact.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {contacts.map((contact) => {
          const active = (contact.requirements ?? []).filter((r) => r.active);
          const primary = active[0];
          return (
            <Link key={contact.id} href={`/customers/${contact.id}`} className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-xs block hover:border-[#D4D4D8] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#09090B]">{contact.name}</p>
                  <p className="text-sm text-[#52525B]">{contact.phone}</p>
                </div>
                <Badge tone={contact.doNotContact ? "red" : "green"}>{contact.status}</Badge>
              </div>
              {primary && (
                <div className="mt-3 space-y-1">
                  <div className="flex flex-wrap gap-1">
                    <AssetClassBadge assetClass={primary.assetClass} />
                    <TransactionBadge transactionType={primary.transactionType} />
                  </div>
                  <p className="text-xs text-[#52525B]">{summarizeRequirement(primary)}</p>
                  <p className="text-xs text-[#71717A]">{active.length} active · {lastContactedLabel(contact.lastContactedAt)}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}

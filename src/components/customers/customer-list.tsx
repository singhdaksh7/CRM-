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
        title="No customers in the demand pool"
        description="Import a spreadsheet or add a customer to start matching inventory against requirements."
      />
    );
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white shadow-xs">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wider text-[#8A94A6]">
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
                <tr key={contact.id} className="border-t border-[#E7ECF2] align-top hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${contact.id}`} className="font-semibold text-[#3366FF]">
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
                  <td className="px-4 py-3 text-[#596579]">
                    <div>{contact.phone}</div>
                    <div className="text-xs">{contact.email || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#1B2430]">{active.length} active</div>
                    {primary && (
                      <div className="mt-1 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          <AssetClassBadge assetClass={primary.assetClass} />
                          <TransactionBadge transactionType={primary.transactionType} />
                        </div>
                        <p className="text-xs text-[#596579]">{summarizeRequirement(primary)}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#596579]">
                    {primary ? (
                      <>
                        <div>
                          {formatINR(primary.minBudget, { compact: true })}–{formatINR(primary.maxBudget, { compact: true })}
                        </div>
                        <div>{localities.join(", ") || "—"}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(contact.leads ?? []).length > 0 ? (
                      <Link className="font-semibold text-[#3366FF]" href={`/leads/${contact.leads![0].id}`}>
                        {contact.leads![0].leadCode}
                      </Link>
                    ) : (
                      <span className="text-[#8A94A6]">No lead</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#596579]">
                    <div>{lastContactedLabel(contact.lastContactedAt)}</div>
                    <div>Sent: {contact.lastPropertySentAt ? formatDate(contact.lastPropertySentAt) : "—"}</div>
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
            <Link key={contact.id} href={`/customers/${contact.id}`} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs block">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#1B2430]">{contact.name}</p>
                  <p className="text-sm text-[#596579]">{contact.phone}</p>
                </div>
                <Badge tone={contact.doNotContact ? "red" : "green"}>{contact.status}</Badge>
              </div>
              {primary && (
                <div className="mt-3 space-y-1">
                  <div className="flex flex-wrap gap-1">
                    <AssetClassBadge assetClass={primary.assetClass} />
                    <TransactionBadge transactionType={primary.transactionType} />
                  </div>
                  <p className="text-xs text-[#596579]">{summarizeRequirement(primary)}</p>
                  <p className="text-xs text-[#8A94A6]">{active.length} active · {lastContactedLabel(contact.lastContactedAt)}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}

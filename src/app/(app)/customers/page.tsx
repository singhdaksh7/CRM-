import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const STATUS_TONE: Record<string, "green" | "slate" | "red" | "amber"> = {
  ACTIVE: "green",
  INACTIVE: "slate",
  DO_NOT_CONTACT: "red",
  ARCHIVED: "slate",
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const organizationId = getOrganizationId(session!.user.id);

  const where: Prisma.CustomerContactWhereInput = { organizationId };
  if (sp.q) where.OR = [{ name: { contains: sp.q } }, { phone: { contains: sp.q } }, { email: { contains: sp.q } }];
  if (sp.status) where.status = sp.status as never;
  if (sp.whatsAppOptOut === "true") where.whatsAppOptOut = true;
  if (sp.neverContacted === "true") where.lastContactedAt = null;
  if (sp.hasLead === "true") where.leads = { some: {} };
  if (sp.hasLead === "false") where.leads = { none: {} };
  if (sp.assetClass || sp.transactionType || sp.locality) {
    where.requirements = {
      some: {
        active: true,
        ...(sp.assetClass ? { assetClass: sp.assetClass as never } : {}),
        ...(sp.transactionType ? { transactionType: sp.transactionType as never } : {}),
        ...(sp.locality ? { preferredLocalities: { contains: sp.locality } } : {}),
      },
    };
  }

  const [contacts, total] = await Promise.all([
    prisma.customerContact.findMany({
      where,
      include: { requirements: { where: { active: true } }, leads: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.customerContact.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2430]">Demand Pool</h1>
          <p className="text-sm text-[#596579]">Long-term customer database with reusable requirements - separate from the active Lead pipeline. {total} contact{total === 1 ? "" : "s"}.</p>
        </div>
      </div>

      <form className="flex flex-wrap gap-2 rounded-xl border border-[#E7ECF2] bg-white p-3">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, phone, email, locality..." className="min-w-[240px] flex-1 rounded-lg border border-[#E7ECF2] px-3 py-2 text-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-[#E7ECF2] px-3 py-2 text-sm">
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="DO_NOT_CONTACT">Do Not Contact</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select name="assetClass" defaultValue={sp.assetClass ?? ""} className="rounded-lg border border-[#E7ECF2] px-3 py-2 text-sm">
          <option value="">Residential/Commercial</option>
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
        </select>
        <select name="transactionType" defaultValue={sp.transactionType ?? ""} className="rounded-lg border border-[#E7ECF2] px-3 py-2 text-sm">
          <option value="">Rent/Sale</option>
          <option value="RENT">Rent</option>
          <option value="SALE">Sale</option>
        </select>
        <select name="hasLead" defaultValue={sp.hasLead ?? ""} className="rounded-lg border border-[#E7ECF2] px-3 py-2 text-sm">
          <option value="">Any lead linkage</option>
          <option value="true">Linked to a Lead</option>
          <option value="false">No linked Lead</option>
        </select>
        <label className="flex items-center gap-1.5 rounded-lg border border-[#E7ECF2] px-3 py-2 text-sm">
          <input type="checkbox" name="neverContacted" value="true" defaultChecked={sp.neverContacted === "true"} /> Never contacted
        </label>
        <label className="flex items-center gap-1.5 rounded-lg border border-[#E7ECF2] px-3 py-2 text-sm">
          <input type="checkbox" name="whatsAppOptOut" value="true" defaultChecked={sp.whatsAppOptOut === "true"} /> WhatsApp opt-out
        </label>
        <button type="submit" className="rounded-lg bg-[#3366FF] px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>

      <div className="overflow-hidden rounded-xl border border-[#E7ECF2] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#F7F9FC] text-left text-xs font-semibold uppercase tracking-wide text-[#596579]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Active Requirements</th>
              <th className="px-4 py-3">Last Contacted</th>
              <th className="px-4 py-3">Last Property Sent</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7ECF2]">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-[#F7F9FC]">
                <td className="px-4 py-3">
                  <Link href={`/customers/${contact.id}`} className="font-semibold text-[#3366FF] hover:underline">{contact.name}</Link>
                </td>
                <td className="px-4 py-3 text-[#596579]">{contact.phone}</td>
                <td className="px-4 py-3">
                  {contact.requirements.length === 0 ? <span className="text-[#96A2B3]">None</span> : (
                    <div className="flex flex-wrap gap-1">
                      {contact.requirements.slice(0, 2).map((r) => (
                        <span key={r.id} className="rounded-full bg-[#F0F4FF] px-2 py-0.5 text-xs text-[#3366FF]">
                          {r.assetClass === "COMMERCIAL" ? "Commercial" : `${r.bhk ?? "?"} BHK`} {r.transactionType === "RENT" ? "Rent" : "Sale"}
                          {r.maxBudget ? ` - up to ${formatINR(r.maxBudget, { compact: true })}` : ""}
                        </span>
                      ))}
                      {contact.requirements.length > 2 && <span className="text-xs text-[#96A2B3]">+{contact.requirements.length - 2} more</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-[#596579]">{contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleDateString("en-IN") : "Never"}</td>
                <td className="px-4 py-3 text-[#596579]">{contact.lastPropertySentAt ? new Date(contact.lastPropertySentAt).toLocaleDateString("en-IN") : "-"}</td>
                <td className="px-4 py-3">{contact.leads.length > 0 ? <Badge tone="green">Linked</Badge> : <span className="text-[#96A2B3]">-</span>}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[contact.status] ?? "slate"}>{contact.status.replace(/_/g, " ")}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 && <div className="p-8 text-center text-sm text-[#96A2B3]">No customers match these filters.</div>}
      </div>
    </div>
  );
}

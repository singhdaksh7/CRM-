"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { Select, Textarea } from "@/components/ui/form";
import { demandPoolApi, DemandPoolApiError } from "@/lib/demand-pool/api";
import { lastContactedLabel, parseTags } from "@/lib/demand-pool/format";
import { canManageDemandPool, canConvertToLead } from "@/lib/demand-pool/permissions";
import type {
  CustomerContact,
  CustomerResponseOutcome,
  CustomerRequirement,
  PropertyRecommendation,
} from "@/lib/demand-pool/types";
import { formatDate } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { CustomerForm } from "./customer-form";
import { RequirementCard } from "./requirement-card";
import { RequirementForm } from "./requirement-form";
import { MatchExplanation } from "./match-explanation";
import { MatchTierBadge } from "./badges";

const RESPONSE_OPTIONS: CustomerResponseOutcome[] = [
  "INTERESTED",
  "NOT_INTERESTED",
  "VISIT_REQUESTED",
  "BUDGET_TOO_HIGH",
  "LOCATION_NOT_SUITABLE",
  "ALREADY_PURCHASED",
  "DO_NOT_CONTACT",
];

export function CustomerDetailWorkspace({
  contact: initial,
  role,
}: {
  contact: CustomerContact;
  role: Role;
}) {
  const router = useRouter();
  const [contact, setContact] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [addRequirementOpen, setAddRequirementOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<CustomerRequirement | null>(null);
  const [matchRows, setMatchRows] = useState<PropertyRecommendation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const canManage = canManageDemandPool(role);

  const requirements = useMemo(
    () => [...(contact.requirements ?? [])].sort((a, b) => Number(b.active) - Number(a.active)),
    [contact.requirements]
  );

  async function refresh() {
    const data = await demandPoolApi.getCustomer(contact.id);
    setContact(data.contact);
    router.refresh();
  }

  async function findMatches(requirementId: string) {
    setBusy(true);
    setError("");
    try {
      if (canManage) await demandPoolApi.rematchRequirement(requirementId);
      const data = await demandPoolApi.getRequirementMatches(requirementId);
      setMatchRows(data.recommendations);
    } catch (err) {
      setError(err instanceof DemandPoolApiError ? err.message : "Could not load matches");
    } finally {
      setBusy(false);
    }
  }

  async function convert(requirement: CustomerRequirement) {
    if (!window.confirm(`Convert ${contact.name}'s requirement to a Lead?`)) return;
    setBusy(true);
    try {
      const result = await demandPoolApi.convertRequirementToLead(requirement.id);
      toast.success(result.alreadyConverted ? "Already linked to a lead" : "Lead created");
      await refresh();
      if (result.lead?.id) router.push(`/leads/${result.lead.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-[#E7ECF2] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2430]">{contact.name}</h1>
          <p className="mt-1 text-sm text-[#596579]">
            {contact.phone}
            {contact.email ? ` · ${contact.email}` : ""} · {contact.source.replace(/_/g, " ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={contact.doNotContact ? "red" : "green"}>{contact.status}</Badge>
            {contact.whatsAppOptOut && <Badge tone="amber">WhatsApp opted out</Badge>}
            {parseTags(contact.tags).map((tag) => (
              <Badge key={tag} tone="slate">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                Edit Customer
              </Button>
              <Button onClick={() => setAddRequirementOpen(true)}>Add Requirement</Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-2 lg:col-span-1">
          <h2 className="font-semibold text-[#1B2430]">Contact</h2>
          <p className="text-sm text-[#596579]">Source: {contact.source.replace(/_/g, " ")}</p>
          <p className="text-sm text-[#596579]">Last contacted: {lastContactedLabel(contact.lastContactedAt)}</p>
          <p className="text-sm text-[#596579]">Last property sent: {contact.lastPropertySentAt ? formatDate(contact.lastPropertySentAt) : "—"}</p>
          {contact.notes && <p className="text-sm text-[#596579] whitespace-pre-wrap">{contact.notes}</p>}
        </div>

        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-[#1B2430]">Requirements</h2>
            <span className="text-xs text-[#8A94A6]">{requirements.filter((r) => r.active).length} active</span>
          </div>
          {requirements.length === 0 ? (
            <EmptyState title="No requirements" description="Add a residential or commercial requirement to start matching." />
          ) : (
            <div className="grid gap-3">
              {requirements.map((requirement) => (
                <RequirementCard
                  key={requirement.id}
                  requirement={requirement}
                  role={role}
                  busy={busy}
                  onConfirm={() => {
                    void demandPoolApi
                      .updateRequirement(requirement.id, { confirm: true })
                      .then(refresh)
                      .then(() => toast.success("Requirement confirmed"))
                      .catch((err) => toast.error(err instanceof Error ? err.message : "Confirm failed"));
                  }}
                  onEdit={() => setEditingRequirement(requirement)}
                  onFindMatches={() => void findMatches(requirement.id)}
                  onConvertToLead={canConvertToLead(role) ? () => void convert(requirement) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
        <h2 className="font-semibold text-[#1B2430]">Linked Leads</h2>
        {(contact.leads ?? []).length === 0 ? (
          <p className="text-sm text-[#8A94A6]">No linked CRM leads yet.</p>
        ) : (
          <ul className="space-y-2">
            {(contact.leads ?? []).map((lead) => (
              <li key={lead.id}>
                <Link className="font-semibold text-[#3366FF]" href={`/leads/${lead.id}`}>
                  {lead.leadCode}
                </Link>{" "}
                <span className="text-xs text-[#8A94A6]">{lead.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
        <h2 className="font-semibold text-[#1B2430]">Property History</h2>
        {(contact.recommendations ?? []).length === 0 ? (
          <EmptyState title="No recommendations yet" description="Property recommendations sent to this customer will appear here." />
        ) : (
          <ul className="space-y-3">
            {(contact.recommendations ?? []).map((rec) => (
              <li key={rec.id} className="rounded-xl border border-[#E7ECF2] p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#8A94A6]">{formatDate(rec.sentAt ?? rec.createdAt)}</span>
                  <MatchTierBadge tier={rec.tier} />
                  <Badge tone="slate">{rec.status}</Badge>
                  {rec.responseOutcome && <Badge tone="blue">{rec.responseOutcome.replace(/_/g, " ")}</Badge>}
                </div>
                <p className="text-sm font-semibold text-[#1B2430]">
                  {rec.property ? `${rec.property.title} · ${rec.property.area}` : "Property"}
                </p>
                <MatchExplanation tier={rec.tier} score={rec.score} reasons={rec.reasons} />
                {canManage && rec.responseOutcome === "VISIT_REQUESTED" && (contact.leads ?? []).length > 0 && (
                  <Link
                    href={`/visits?leadId=${contact.leads![0].id}&propertyId=${rec.propertyId}`}
                    className="inline-flex w-fit items-center rounded-lg bg-[#3366FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2952CC]"
                  >
                    Schedule Visit
                  </Link>
                )}
                {canManage && rec.status === "SENT" && !rec.responseOutcome && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="flex-1 text-xs font-semibold uppercase tracking-wider text-[#596579]">
                      Record response
                      <Select
                        aria-label="Customer response"
                        className="mt-1"
                        defaultValue=""
                        onChange={(e) => {
                          const outcome = e.target.value as CustomerResponseOutcome;
                          if (!outcome) return;
                          void demandPoolApi
                            .respondToRecommendation(rec.id, outcome)
                            .then(refresh)
                            .then(() => toast.success("Response recorded"))
                            .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"));
                        }}
                      >
                        <option value="">Select outcome</option>
                        {RESPONSE_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o.replace(/_/g, " ")}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <Textarea
                      aria-label="Optional response note"
                      placeholder="Optional note (not written to requirement fields)"
                      rows={2}
                      value={responseNote}
                      onChange={(e) => setResponseNote(e.target.value)}
                      className="sm:w-64"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {matchRows && (
        <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[#1B2430]">Matching Properties</h2>
            <Button size="sm" variant="ghost" onClick={() => setMatchRows(null)}>
              Close
            </Button>
          </div>
          {matchRows.length === 0 ? (
            <EmptyState title="No matching properties" description="Try confirming the requirement or broadening localities/budget." />
          ) : (
            <div className="grid gap-3">
              {matchRows
                .filter((r) => r.tier !== "LOW")
                .map((row) => (
                  <article key={row.id} className="rounded-xl border border-[#E7ECF2] p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="font-semibold text-[#3366FF]" href={`/properties/${row.propertyId}`}>
                        {row.property?.title ?? "Property"}
                      </Link>
                      <MatchTierBadge tier={row.tier} />
                      <span className="text-xs text-[#596579]">{row.score}%</span>
                    </div>
                    <p className="text-xs text-[#8A94A6]">
                      {row.property?.area} · {row.property?.propertyCode}
                    </p>
                    <MatchExplanation tier={row.tier} score={row.score} reasons={row.reasons} />
                  </article>
                ))}
            </div>
          )}
        </section>
      )}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit customer">
        <CustomerForm
          initial={contact}
          submitting={busy}
          error={error}
          onCancel={() => setEditOpen(false)}
          onSubmit={async (value) => {
            setBusy(true);
            setError("");
            try {
              await demandPoolApi.updateCustomer(contact.id, value);
              toast.success("Customer updated");
              setEditOpen(false);
              await refresh();
            } catch (err) {
              setError(err instanceof DemandPoolApiError ? err.message : "Update failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Dialog>

      <Dialog open={addRequirementOpen} onClose={() => setAddRequirementOpen(false)} title="Add requirement">
        <RequirementForm
          submitting={busy}
          error={error}
          onCancel={() => setAddRequirementOpen(false)}
          onSubmit={async (value) => {
            setBusy(true);
            setError("");
            try {
              await demandPoolApi.createRequirement(contact.id, value);
              toast.success("Requirement added");
              setAddRequirementOpen(false);
              await refresh();
            } catch (err) {
              setError(err instanceof DemandPoolApiError ? err.message : "Could not add requirement");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Dialog>

      <Dialog open={Boolean(editingRequirement)} onClose={() => setEditingRequirement(null)} title="Edit requirement">
        {editingRequirement && (
          <RequirementForm
            initial={editingRequirement}
            submitting={busy}
            error={error}
            onCancel={() => setEditingRequirement(null)}
            onSubmit={async (value) => {
              setBusy(true);
              setError("");
              try {
                await demandPoolApi.updateRequirement(editingRequirement.id, value);
                toast.success("Requirement updated");
                setEditingRequirement(null);
                await refresh();
              } catch (err) {
                setError(err instanceof DemandPoolApiError ? err.message : "Could not update requirement");
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

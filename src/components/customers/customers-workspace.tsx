"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, LoadingState, PermissionState } from "@/components/ui/states";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { CustomerForm } from "@/components/customers/customer-form";
import { CustomerList } from "@/components/customers/customer-list";
import { demandPoolApi, DemandPoolApiError } from "@/lib/demand-pool/api";
import { canImportCustomers, canManageDemandPool, canViewDemandPool } from "@/lib/demand-pool/permissions";
import type { CustomerContact, CustomerListFilters } from "@/lib/demand-pool/types";
import type { Role } from "@prisma/client";

function CustomersWorkspaceInner({ role }: { role: Role }) {
  const sp = useSearchParams();
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const filters: CustomerListFilters = {
    q: sp.get("q") ?? "",
    assetClass: (sp.get("assetClass") as CustomerListFilters["assetClass"]) ?? "",
    transactionType: (sp.get("transactionType") as CustomerListFilters["transactionType"]) ?? "",
    locality: sp.get("locality") ?? "",
    bhk: sp.get("bhk") ?? "",
    commercialSubtype: sp.get("commercialSubtype") ?? "",
    budgetMin: sp.get("budgetMin") ?? "",
    budgetMax: sp.get("budgetMax") ?? "",
    activeRequirement: (sp.get("activeRequirement") as CustomerListFilters["activeRequirement"]) ?? "",
    hasLead: (sp.get("hasLead") as CustomerListFilters["hasLead"]) ?? "",
    neverContacted: (sp.get("neverContacted") as CustomerListFilters["neverContacted"]) ?? "",
    contactedRecently: (sp.get("contactedRecently") as CustomerListFilters["contactedRecently"]) ?? "",
    whatsAppEligible: (sp.get("whatsAppEligible") as CustomerListFilters["whatsAppEligible"]) ?? "",
    doNotContact: (sp.get("doNotContact") as CustomerListFilters["doNotContact"]) ?? "",
    whatsAppOptOut: (sp.get("whatsAppOptOut") as CustomerListFilters["whatsAppOptOut"]) ?? "",
  };

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL-backed filters require a loading reset before the list refetch completes
    setLoading(true);
    setError(null);
    void demandPoolApi
      .listCustomers(filters)
      .then((data) => {
        if (cancelled) return;
        setContacts(data.contacts);
        setTotal(data.total);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof DemandPoolApiError && err.status === 404) {
          setError("Demand Pool APIs are not available on this deployment yet. Waiting on backend merge.");
        } else if (err instanceof DemandPoolApiError && err.status === 403) {
          setError("permission");
        } else {
          setError(err instanceof Error ? err.message : "Failed to load customers");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed to URL search string
  }, [sp.toString()]);

  if (!canViewDemandPool(role)) {
    return <PermissionState description="Your role cannot access the customer demand pool." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-[#E7ECF2] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2430]">Customers</h1>
          <p className="mt-1 text-sm text-[#596579]">Demand pool workspace · {total} contacts</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImportCustomers(role) && (
            <Link href="/customers/import" className="inline-flex items-center rounded-xl border border-[#E7ECF2] px-3 py-2 text-sm font-semibold">
              Import
            </Link>
          )}
          {canManageDemandPool(role) && (
            <Button onClick={() => setCreateOpen(true)}>+ Add Customer</Button>
          )}
        </div>
      </div>

      <CustomerFilters />

      {loading && <LoadingState label="Loading customers..." />}
      {error === "permission" && <PermissionState />}
      {error && error !== "permission" && (
        <ErrorState title="Could not load customers" description={error} />
      )}
      {!loading && !error && <CustomerList contacts={contacts} />}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add customer">
        <CustomerForm
          submitting={busy}
          error={formError}
          onCancel={() => setCreateOpen(false)}
          onSubmit={async (value) => {
            setBusy(true);
            setFormError("");
            try {
              const result = await demandPoolApi.createCustomer(value);
              toast.success(result.deduped ? "Existing contact reused" : "Customer created");
              setCreateOpen(false);
              window.location.href = `/customers/${result.contact.id}`;
            } catch (err) {
              setFormError(err instanceof DemandPoolApiError ? err.message : "Create failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Dialog>
    </div>
  );
}

export function CustomersWorkspace({ role }: { role: Role }) {
  return (
    <Suspense fallback={<LoadingState label="Loading customers..." />}>
      <CustomersWorkspaceInner role={role} />
    </Suspense>
  );
}

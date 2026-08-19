"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CustomerDetailWorkspace } from "@/components/customers/customer-detail-workspace";
import { ErrorState, LoadingState, PermissionState } from "@/components/ui/states";
import { demandPoolApi, DemandPoolApiError } from "@/lib/demand-pool/api";
import type { CustomerContact } from "@/lib/demand-pool/types";
import type { Role } from "@prisma/client";

export function CustomerDetailLoader({ role }: { role: Role }) {
  const params = useParams<{ id: string }>();
  const [contact, setContact] = useState<CustomerContact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading when the customer id changes before the fetch settles
    setLoading(true);
    void demandPoolApi
      .getCustomer(params.id)
      .then((data) => {
        if (!cancelled) setContact(data.contact);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof DemandPoolApiError && err.status === 403) setError("permission");
        else if (err instanceof DemandPoolApiError && err.status === 404) setError("Customer not found (or Demand Pool API not merged yet).");
        else setError(err instanceof Error ? err.message : "Failed to load customer");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) return <LoadingState label="Loading customer..." />;
  if (error === "permission") return <PermissionState />;
  if (error || !contact) return <ErrorState title="Customer unavailable" description={error ?? "Not found"} />;
  return <CustomerDetailWorkspace contact={contact} role={role} />;
}

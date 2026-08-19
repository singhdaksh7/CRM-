"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AssetClassBadge, RequirementLifecycleBadge, TransactionBadge } from "./badges";
import {
  daysSinceConfirmed,
  requirementLifecycleStatus,
  summarizeRequirement,
  DEFAULT_REQUIREMENT_STALE_AFTER_DAYS,
} from "@/lib/demand-pool/format";
import type { CustomerRequirement } from "@/lib/demand-pool/types";
import { canConvertToLead, canManageDemandPool } from "@/lib/demand-pool/permissions";
import type { Role } from "@prisma/client";

export function RequirementCard({
  requirement,
  role,
  staleAfterDays = DEFAULT_REQUIREMENT_STALE_AFTER_DAYS,
  busy,
  onConfirm,
  onEdit,
  onFindMatches,
  onConvertToLead,
}: {
  requirement: CustomerRequirement;
  role: Role;
  staleAfterDays?: number;
  busy?: boolean;
  onConfirm?: () => void;
  onEdit?: () => void;
  onFindMatches?: () => void;
  onConvertToLead?: () => void;
}) {
  const status = requirementLifecycleStatus(requirement, staleAfterDays);
  const days = daysSinceConfirmed(requirement.lastConfirmedAt);
  const canManage = canManageDemandPool(role);

  return (
    <article className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <AssetClassBadge assetClass={requirement.assetClass} />
            <TransactionBadge transactionType={requirement.transactionType} />
            <RequirementLifecycleBadge status={status} />
            <span className="inline-flex items-center rounded-full border border-[#E7ECF2] px-2.5 py-0.5 text-xs font-semibold text-[#596579]">
              {requirement.priority}
            </span>
          </div>
          <p className="text-sm font-semibold text-[#1B2430]">{summarizeRequirement(requirement)}</p>
          {status === "STALE" && (
            <p className="text-xs font-medium text-[#E6A23C]">Last confirmed {days} days ago</p>
          )}
          {status === "ACTIVE" && (
            <p className="text-xs text-[#8A94A6]">Last confirmed {days === 0 ? "today" : `${days} days ago`}</p>
          )}
        </div>
      </div>

      {requirement.convertedLeadId && requirement.convertedLead && (
        <p className="text-xs text-[#596579]">
          Linked lead:{" "}
          <Link className="font-semibold text-[#3366FF]" href={`/leads/${requirement.convertedLead.id}`}>
            {requirement.convertedLead.leadCode}
          </Link>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canManage && status === "STALE" && onConfirm && (
          <Button size="sm" variant="secondary" loading={busy} onClick={onConfirm}>
            Mark Confirmed
          </Button>
        )}
        {canManage && onEdit && (
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit Requirement
          </Button>
        )}
        {onFindMatches && (
          <Button size="sm" onClick={onFindMatches}>
            Find Matching Properties
          </Button>
        )}
        {canConvertToLead(role) && onConvertToLead && !requirement.convertedLeadId && (
          <Button size="sm" variant="secondary" loading={busy} onClick={onConvertToLead}>
            Convert to Lead
          </Button>
        )}
        {requirement.convertedLeadId && requirement.convertedLead && (
          <Link
            href={`/leads/${requirement.convertedLead.id}`}
            className="inline-flex items-center rounded-xl border border-[#E7ECF2] px-2.5 py-1.5 text-xs font-semibold text-[#1B2430]"
          >
            View Lead
          </Link>
        )}
      </div>
    </article>
  );
}

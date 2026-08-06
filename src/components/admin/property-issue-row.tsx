"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enumToLabel, formatDate } from "@/lib/utils";

export interface PropertyIssueRowData {
  id: string;
  issueType: "AVAILABILITY" | "REPORT";
  label: string;
  note: string | null;
  property: { id: string; title: string; area: string; propertyCode: string };
  reportedBy: { id: string; name: string } | null;
  createdAt: string;
}

const REASON_TONE: Record<string, "amber" | "red" | "slate"> = {
  ALREADY_RENTED: "red",
  ALREADY_SOLD: "red",
  PROPERTY_LOCKED: "amber",
  OWNER_UNREACHABLE: "amber",
  OTHER: "slate",
};

export function PropertyIssueRow({ issue }: { issue: PropertyIssueRowData }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function reviewAvailability(decision: "APPROVE" | "REJECT") {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${issue.property.id}/availability-report/${issue.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to review");
      toast.success(decision === "APPROVE" ? "Approved" : "Rejected");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveReport(status: "RESOLVED" | "DISMISSED") {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${issue.property.id}/report/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to resolve");
      toast.success(status === "RESOLVED" ? "Resolved" : "Dismissed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/properties/${issue.property.id}`} className="font-semibold text-[#1B2430] hover:text-[#3366FF]">{issue.property.title}</Link>
          <p className="text-xs text-[#596579] mt-0.5">{issue.property.area} - {issue.property.propertyCode}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={issue.issueType === "AVAILABILITY" ? (REASON_TONE[issue.label] ?? "amber") : "blue"}>{enumToLabel(issue.label)}</Badge>
          <span className="text-[10px] uppercase tracking-wide text-[#8A94A6]">{issue.issueType === "AVAILABILITY" ? "Availability" : "Data Quality"}</span>
        </div>
      </div>
      {issue.note && <p className="text-xs text-[#596579] bg-[#F5F7FA] rounded-lg p-2">{issue.note}</p>}
      <p className="text-xs text-[#8A94A6]">Reported by {issue.reportedBy?.name ?? "Unknown"} on {formatDate(issue.createdAt)}</p>
      <div className="flex gap-2 pt-2 border-t border-[#EFF4FF]">
        {issue.issueType === "AVAILABILITY" ? (
          <>
            <Button size="sm" variant="primary" disabled={submitting} onClick={() => reviewAvailability("APPROVE")}>Approve</Button>
            <Button size="sm" variant="secondary" disabled={submitting} onClick={() => reviewAvailability("REJECT")}>Reject</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" disabled={submitting} onClick={() => resolveReport("RESOLVED")}>Resolve</Button>
            <Button size="sm" variant="secondary" disabled={submitting} onClick={() => resolveReport("DISMISSED")}>Dismiss</Button>
          </>
        )}
      </div>
    </div>
  );
}

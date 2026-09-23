"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export type FailedOperation = {
  id: string;
  provider: string;
  operationType: string;
  status: "PENDING" | "RETRYABLE" | "SUCCEEDED" | "DEAD_LETTER";
  attemptCount: number;
  failureReason: string | null;
  lastAttemptAt: string | null;
  retryEligibleAt: string | null;
};

export function FailedOperationsPanel({ operations, canRetry }: { operations: FailedOperation[]; canRetry: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/portal-operations/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Unable to retry");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to retry");
    } finally {
      setBusy(null);
    }
  }

  if (!operations.length) return <p className="text-sm text-zinc-500">No failed operations.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {operations.map((op) => {
        const notYetEligible = Boolean(op.retryEligibleAt && new Date(op.retryEligibleAt) > new Date());
        const disabled = op.status === "DEAD_LETTER" || notYetEligible || busy === op.id;
        return (
          <div key={op.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 text-sm">
            <div>
              <Badge tone={op.status === "DEAD_LETTER" ? "red" : "amber"}>{op.status.replaceAll("_", " ")}</Badge>{" "}
              <span className="font-medium text-zinc-900">{op.provider.replaceAll("_", " ")}</span> · {op.operationType} · attempt {op.attemptCount}
              <br />
              <span className="text-xs text-zinc-500">{op.failureReason ?? "No failure detail"} {op.lastAttemptAt ? `· ${new Date(op.lastAttemptAt).toLocaleString("en-IN")}` : ""}</span>
              {op.status === "DEAD_LETTER" && <div className="text-xs text-red-700 font-medium">Dead-letter: exceeded retry attempts, requires manual investigation.</div>}
              {notYetEligible && op.status !== "DEAD_LETTER" && <div className="text-xs text-zinc-400">Retry eligible at {new Date(op.retryEligibleAt!).toLocaleString("en-IN")}</div>}
            </div>
            {canRetry && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => retry(op.id)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy === op.id ? "Retrying…" : "Retry"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

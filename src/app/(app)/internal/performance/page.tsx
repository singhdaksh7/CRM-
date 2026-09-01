import { notFound } from "next/navigation";
import { requireSession } from "@/lib/api-auth";
import { performanceDiagnosticsEnabled } from "@/lib/performance-diagnostics";
import { PerformanceDiagnosticClient } from "./performance-diagnostic-client";

/** TEMPORARY PERFORMANCE DIAGNOSTIC — remove before any production merge. */
export const dynamic = "force-dynamic";

export default async function PerformanceDiagnosticPage() {
  if (!performanceDiagnosticsEnabled()) notFound();

  try {
    await requireSession(["ADMIN"]);
  } catch {
    notFound();
  }

  return <PerformanceDiagnosticClient previewDeployment={process.env.VERCEL_URL ?? "Preview deployment"} />;
}

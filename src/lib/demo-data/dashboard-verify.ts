import { prisma } from "../prisma";

/**
 * Seed-safe, standalone-tsx-safe replacement for verify.ts's old call to
 * the real getDashboardData() (src/lib/dashboard-data.ts). That function
 * internally calls resolveOrganizationIdForUser() (src/lib/organization.ts),
 * which does `import "server-only"` - fine inside the Next.js app, fatal
 * for a plain `tsx scripts/seed-demo.ts` process (confirmed: throws "This
 * module cannot be imported from a Client Component module" at import
 * time, before any database call). See scripts/seed-demo.import-safety.test.ts
 * for the regression test guarding against this dependency being
 * reintroduced.
 *
 * verify.ts's old dashboard check never actually asserted on any field of
 * getDashboardData()'s return value - it only checked
 * `Boolean(data && typeof data === "object")`, i.e. "the call didn't
 * throw", then separately re-queried totalLeads/totalProperties directly
 * via Prisma anyway. This helper reproduces that same guarantee - real,
 * organization-scoped aggregate queries against the tables the dashboard
 * itself reads, succeeding without throwing - directly via Prisma, with
 * organizationId passed in explicitly (from the seed context, after
 * assertDemoSeedSafe() has already run) rather than resolved from a
 * session. It deliberately does NOT reimplement getDashboardData's full
 * KPI panel set, caching, or query-concurrency limiting - those exist to
 * serve the live dashboard UI, not to verify a seed run.
 */
export interface DemoVerificationMetrics {
  totalProperties: number;
  availableProperties: number;
  totalLeads: number;
  catalogueSharesCount: number;
  notificationsCount: number;
}

export async function getDemoVerificationMetrics(organizationId: string): Promise<DemoVerificationMetrics> {
  const [totalProperties, availableProperties, totalLeads, catalogueSharesCount, notificationsCount] = await Promise.all([
    prisma.property.count({ where: { organizationId } }),
    prisma.property.count({ where: { organizationId, status: "AVAILABLE" } }),
    prisma.lead.count({ where: { organizationId } }),
    prisma.catalogueShare.count({ where: { organizationId } }),
    prisma.notification.count({ where: { organizationId } }),
  ]);
  return { totalProperties, availableProperties, totalLeads, catalogueSharesCount, notificationsCount };
}

import { HANDOVER_ORGANIZATION_ID, REQUIRED_EXECUTE_CONFIRMATION } from "./constants";
import { DELETION_PLAN, type ResetTransactionClient } from "./deletion-plan";
import { runPreflight, type PreflightClient, type PreflightOptions } from "./preflight";
import type { DryRunReport, ExecuteResult, UserSummary } from "./types";

export class HandoverResetAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoverResetAbortedError";
  }
}

/** The subset of the shared Prisma client this whole tool ever needs - full read/write access, but every write is confined to executeReset()'s single $transaction. */
export interface ResetClient extends PreflightClient {
  user: PreflightClient["user"] & {
    findMany(args: unknown): Promise<UserSummary[]>;
  };
  propertyImage: { findMany(args: unknown): Promise<{ storageKey: string; thumbnailKey: string | null }[]> };
  document: { findMany(args: unknown): Promise<{ storageKey: string | null }[]> };
  $transaction<T>(fn: (tx: ResetTransactionClient) => Promise<T>): Promise<T>;
}

/**
 * Read-only. Computes exactly what `--execute` would do without writing
 * anything - no code path here calls .deleteMany()/.create()/.update(), only
 * .findMany()/.count(). Safe (and the default) to run at any time.
 */
export async function computeDryRunReport(client: ResetClient, options: PreflightOptions = {}): Promise<DryRunReport> {
  const preflight = await runPreflight(client, options);

  const allUsers = await client.user.findMany({
    where: { organizationId: HANDOVER_ORGANIZATION_ID },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  const usersToPreserve = allUsers.filter((u) => u.id === preflight.handoverAdminId);
  const usersToDelete = allUsers.filter((u) => u.id !== preflight.handoverAdminId);

  const deletionCounts: Record<string, number> = {};
  const warnings: string[] = [];
  for (const step of DELETION_PLAN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (client as any)[step.model];
      deletionCounts[step.model] = await model.count({ where: step.where(HANDOVER_ORGANIZATION_ID) });
    } catch (error) {
      warnings.push(`Could not count ${step.model}: ${error instanceof Error ? error.message : String(error)}`);
      deletionCounts[step.model] = 0;
    }
  }

  // Object keys owned by property images / documents about to be deleted -
  // this is the ONLY input the separate R2 cleanup stage is ever allowed to
  // consume (see r2-cleanup.ts's allow-list builder). Gathered here, before
  // any DB write, so a dry run can show exactly what R2 cleanup would later
  // target.
  const objectKeysDiscovered: string[] = [];
  try {
    const images = await client.propertyImage.findMany({
      where: { organizationId: HANDOVER_ORGANIZATION_ID },
      select: { storageKey: true, thumbnailKey: true },
    });
    for (const img of images) {
      if (img.storageKey) objectKeysDiscovered.push(img.storageKey);
      if (img.thumbnailKey) objectKeysDiscovered.push(img.thumbnailKey);
    }
    const documents = await client.document.findMany({
      where: { organizationId: HANDOVER_ORGANIZATION_ID },
      select: { storageKey: true },
    });
    for (const doc of documents) {
      if (doc.storageKey) objectKeysDiscovered.push(doc.storageKey);
    }
  } catch (error) {
    warnings.push(`Could not enumerate object keys: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (preflight.portalConnections.length > 0) {
    warnings.push(
      `${preflight.portalConnections.length} PropertyPortalConnection row(s) exist and will be preserved untouched - review manually if they are demo/test connections.`
    );
  }
  if (!preflight.passed) {
    warnings.push("Preflight has FAILING checks - --execute would abort with zero writes until every check above passes.");
  }

  return {
    preflight,
    organizationId: HANDOVER_ORGANIZATION_ID,
    totalUserCount: allUsers.length,
    usersToDelete,
    usersToPreserve,
    deletionCounts,
    deletionOrder: DELETION_PLAN.map((s) => s.model),
    preservedTables: ["organizations", "system_configs", "property_portal_connections", "_prisma_migrations", "users (handover admin only)"],
    objectKeysDiscovered,
    warnings,
  };
}

export interface ExecuteOptions extends PreflightOptions {
  /** Must equal REQUIRED_EXECUTE_CONFIRMATION exactly. Any other value (missing, typo, different casing) aborts with zero writes. */
  confirm: string | undefined;
}

/**
 * Performs the reset. Aborts (throwing HandoverResetAbortedError, having
 * made ZERO writes) unless:
 *   1. options.confirm === REQUIRED_EXECUTE_CONFIRMATION exactly, and
 *   2. every preflight check in preflight.ts passes.
 *
 * Every delete below runs inside ONE Prisma interactive $transaction - if
 * any step throws, Prisma rolls back everything already written in this
 * call, so a reset either fully completes or leaves the database exactly as
 * it was found. (Documented exception: PropertyPortalConnection is never
 * touched at all, R2 object deletion is a fully separate stage that never
 * shares this transaction - see r2-cleanup.ts - so a partial success there,
 * by design, can never roll back a DB write and vice versa; each stage's
 * own atomicity is independent and is reported separately.)
 */
export async function executeReset(client: ResetClient, options: ExecuteOptions): Promise<ExecuteResult> {
  if (options.confirm !== REQUIRED_EXECUTE_CONFIRMATION) {
    throw new HandoverResetAbortedError(
      `Refusing to execute: --confirm must equal exactly "${REQUIRED_EXECUTE_CONFIRMATION}". No writes were made.`
    );
  }

  const preflight = await runPreflight(client, options);
  if (!preflight.passed) {
    const failing = preflight.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);
    throw new HandoverResetAbortedError(`Refusing to execute - preflight failed. No writes were made.\n${failing.join("\n")}`);
  }
  const preservedAdminId = preflight.handoverAdminId;
  if (!preservedAdminId) {
    // Unreachable if preflight.passed is true, but never trust that invariant blindly this close to a destructive write.
    throw new HandoverResetAbortedError("Refusing to execute - no verified handover admin id. No writes were made.");
  }

  const startedAt = Date.now();
  const deletionCounts: Record<string, number> = {};
  let deletedUserCount = 0;

  await client.$transaction(async (tx) => {
    for (const step of DELETION_PLAN) {
      const { count } = await tx[step.model].deleteMany({ where: step.where(HANDOVER_ORGANIZATION_ID) });
      deletionCounts[step.model] = count;
    }
    // Users last, and only after every table above that has a required FK
    // into User has already been cleared - see deletion-plan.ts's ordering
    // notes. Every remaining optional FK into a deleted user (SystemConfig.
    // updatedById, etc.) defaults to Prisma's SetNull-for-optional-relations
    // behavior and needs no separate handling here.
    const { count } = await tx.user.deleteMany({
      where: { organizationId: HANDOVER_ORGANIZATION_ID, id: { not: preservedAdminId } },
    });
    deletedUserCount = count;
  });

  return {
    deletionCounts,
    deletedUserCount,
    preservedAdminId,
    durationMs: Date.now() - startedAt,
  };
}

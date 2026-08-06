import { PrismaClient } from "@prisma/client";

/**
 * "Unexpected write is detected" as an actual runtime guarantee, not just
 * "trust that this script only calls .count()/.findUnique()". Wraps a
 * dedicated PrismaClient (never the shared src/lib/prisma.ts singleton -
 * this must never leak into normal request handling) so that ANY write
 * operation - by a bug in this script, a future edit, or a write hiding
 * inside a helper this script calls - throws instead of silently
 * succeeding. Used by scripts/seed-demo-dry-run.ts and
 * scripts/seed-demo-verify.ts, both of which must never write anything.
 */
const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "executeRaw",
  "executeRawUnsafe",
]);

export class UnexpectedWriteError extends Error {
  constructor(model: string | undefined, operation: string) {
    super(`Unexpected write detected: ${model ?? "(raw)"}.${operation}() was called on a read-only guarded Prisma client.`);
    this.name = "UnexpectedWriteError";
  }
}

export function createReadOnlyClient() {
  const client = new PrismaClient();
  return client.$extends({
    name: "read-only-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (WRITE_OPERATIONS.has(operation)) {
            throw new UnexpectedWriteError(model, operation);
          }
          return query(args);
        },
      },
    },
  });
}

export type ReadOnlyPrismaClient = ReturnType<typeof createReadOnlyClient>;

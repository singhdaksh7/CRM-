import { PrismaClient } from "@prisma/client";
import { recordPrismaOperation } from "./performance-diagnostic-context";

/**
 * Prisma 6 removed the legacy `$use` middleware API. A client extension is
 * the supported interception point and, unlike the optional middleware hook,
 * is always present on the generated client. It is a transparent wrapper: it
 * changes neither the query arguments nor returned value.
 */
function createPrismaClient() {
  return new PrismaClient().$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const started = performance.now();
        try {
          const result = await query(args);
          recordPrismaOperation(model, operation, performance.now() - started, result, args);
          return result;
        } catch (error) {
          // Failed operations are still useful to correlate a slow branch,
          // but retain no error text or arguments in diagnostic output.
          recordPrismaOperation(model, operation, performance.now() - started, null, args);
          throw error;
        }
      },
    },
  });
}

// Keep the exported surface as PrismaClient. A few existing transactional
// helpers explicitly accept Prisma.TransactionClient, and exposing Prisma's
// extension-only type would make that otherwise-compatible client fail
// structural typing. The runtime instance remains the extension above.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = (globalForPrisma.prisma ?? createPrismaClient()) as unknown as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

import { PrismaClient } from "@prisma/client";

/**
 * A reset execute is a long-lived, interactive transaction. It must not use
 * the application's transaction-pooler URL: a transaction pooler can swap or
 * release its backing session while Prisma is still issuing statements on the
 * transaction-scoped client.  The application continues to use DATABASE_URL;
 * this factory is intentionally reachable only from the handover CLI's
 * explicit execute path.
 */
export function requireHandoverResetDirectUrl(directUrl: string | undefined): string {
  if (!directUrl || directUrl.trim() === "") {
    throw new Error("Refusing reset execute: DIRECT_URL is required for the dedicated transactional connection.");
  }
  return directUrl;
}

export function getHandoverResetDirectUrl(): string {
  return requireHandoverResetDirectUrl(process.env.DIRECT_URL);
}

export function getHandoverResetExecuteClientOptions(directUrl = getHandoverResetDirectUrl()) {
  return {
    datasources: {
      db: {
        url: requireHandoverResetDirectUrl(directUrl),
      },
    },
  };
}

/**
 * Builds a one-purpose client whose datasource is the direct/session database
 * connection. Do not add transaction timeout overrides here: the production
 * failure is a connection-mode issue, and extending time limits without a
 * measured need would weaken the failure boundary.
 */
export function createHandoverResetExecuteClient(directUrl = getHandoverResetDirectUrl()): PrismaClient {
  return new PrismaClient(getHandoverResetExecuteClientOptions(directUrl));
}

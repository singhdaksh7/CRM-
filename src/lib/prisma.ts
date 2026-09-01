import { PrismaClient } from "@prisma/client";
import { recordPrismaOperation } from "./performance-diagnostic-context";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Instrument only when a Preview diagnostic request has an active async
// context. The collector stores model/action/timing/result category only.
// It never retains Prisma arguments, SQL, IDs, or rows.
(prisma as PrismaClient & { $use?: (middleware: (params: { model?: string; action: string }, next: (params: unknown) => Promise<unknown>) => Promise<unknown>) => void }).$use?.(async (params, next) => {
  const started = performance.now();
  const result = await next(params);
  recordPrismaOperation(params.model, params.action, performance.now() - started, result);
  return result;
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

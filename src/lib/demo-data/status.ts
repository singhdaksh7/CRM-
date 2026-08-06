import { prisma } from "../prisma";
import { DEMO_ID_PREFIX } from "./constants";

/**
 * Cheap, schema-change-free way to answer "is the KP-DEMO- dataset currently
 * loaded" - checked by the ADMIN-only dashboard banner. Looks for demo
 * employees specifically (always exactly 8, always created first, deleted
 * last) rather than any single demo table, so a partially-torn-down seed
 * still reads as "loaded" until the reset script actually finishes.
 */
export async function isDemoDataLoaded(): Promise<boolean> {
  const count = await prisma.user.count({ where: { id: { startsWith: `${DEMO_ID_PREFIX}emp-` } } });
  return count > 0;
}

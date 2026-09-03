import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Finds or creates the reusable, organization-scoped PropertyLocality for a
 * given `area` string, and returns its id (or null for a blank/whitespace
 * area, which some legacy rows have). This is the ONLY way a
 * PropertyLocality row gets created - there is no separate "manage
 * localities" admin UI; the reusable list simply accumulates from whatever
 * locality names staff already type into a property's `area` field, so
 * existing Mansarovar-Garden/Kirti-Nagar/Basai-Darapur-style entries become
 * reusable and duplicate-protected without changing the property form.
 *
 * `tx` lets callers run this inside the same transaction as the
 * property create/update (optional - falls back to the default client).
 */
export async function resolveOrCreatePropertyLocality(
  organizationId: string,
  area: string,
  actorId: string | null,
  tx: Pick<typeof prisma, "propertyLocality"> = prisma
): Promise<string | null> {
  const normalizedName = normalize(area);
  if (!normalizedName) return null;

  const existing = await tx.propertyLocality.findUnique({
    where: { organizationId_normalizedName: { organizationId, normalizedName } },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await tx.propertyLocality.create({
      data: { organizationId, name: area.trim(), normalizedName, createdById: actorId },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    // Race: two properties created with the same new locality at once.
    // The unique constraint on (organizationId, normalizedName) is the
    // real duplicate protection - this just recovers gracefully from it
    // instead of failing the property create/update.
    if (isUniqueConstraintViolation(err)) {
      const winner = await tx.propertyLocality.findUnique({
        where: { organizationId_normalizedName: { organizationId, normalizedName } },
        select: { id: true },
      });
      if (winner) return winner.id;
    }
    throw err;
  }
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002");
}

/**
 * Org-scoped, name-searchable read of the reusable locality list - the
 * counterpart read path to resolveOrCreatePropertyLocality's write-only
 * accumulation. Powers the searchable/addable locality picker (property
 * form, lead form, inventory filter) instead of each of those hand-copying
 * its own hardcoded area array.
 */
export async function searchPropertyLocalities(
  organizationId: string,
  query: string | null,
  take: number,
  tx: Pick<typeof prisma, "propertyLocality"> = prisma
): Promise<{ id: string; name: string }[]> {
  const trimmed = query?.trim();
  return tx.propertyLocality.findMany({
    where: {
      organizationId,
      ...(trimmed ? { name: { contains: trimmed, mode: "insensitive" } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take,
  });
}

export type PropertyLocalityDelegate = Prisma.PropertyLocalityDelegate;

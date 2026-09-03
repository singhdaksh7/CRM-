import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { readTake } from "@/lib/pagination";
import { searchPropertyLocalities, resolveOrCreatePropertyLocality } from "@/lib/property-locality";
import { prisma } from "@/lib/prisma";

/**
 * Read side of the reusable, organization-scoped locality list (see
 * src/lib/property-locality.ts) - powers the searchable "Area / Locality"
 * picker on the property form, inventory filter, and lead form, so none of
 * them needs its own hardcoded area array. Any authenticated role may
 * search/list - selecting a locality (for a property, a filter, or a lead
 * preference) is not a privileged action; only *creating* a brand-new one
 * is (see POST below).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q");
    const take = readTake(sp, 20);

    const localities = await searchPropertyLocalities(organizationId, q, take);
    return NextResponse.json({ localities });
  } catch (err) {
    return handleApiError(err);
  }
}

const createLocalitySchema = z.object({ name: z.string().trim().min(2).max(100) });

/**
 * Explicit "+ Add" affordance for the locality picker - ADMIN/DATA_MANAGER
 * only (consistent with who may create/edit properties and leads; a
 * FIELD_EXECUTIVE never gets locality-management access, matching existing
 * role architecture). Reuses the exact same resolve-or-create/normalize/
 * duplicate-protection path that a property save already goes through, so
 * a locality added here behaves identically to one that accumulates
 * organically from a property's `area` field.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { name } = createLocalitySchema.parse(await req.json());

    const localityId = await resolveOrCreatePropertyLocality(organizationId, name, session.user.id);
    const locality = await prisma.propertyLocality.findUnique({ where: { id: localityId! }, select: { id: true, name: true } });

    return NextResponse.json({ locality }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

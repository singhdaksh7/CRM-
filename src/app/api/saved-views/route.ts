import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const ENTITY_TYPES = ["LEAD", "PROPERTY"] as const;

const createSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  name: z.string().trim().min(1).max(60),
  /** Plain string key/value filter params mirroring the page's own URL query params - never executable code. */
  filters: z.record(z.string(), z.string()),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const entityType = req.nextUrl.searchParams.get("entityType");
    if (!entityType || !ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number])) {
      throw new ApiError(400, "entityType must be LEAD or PROPERTY");
    }

    const views = await prisma.savedView.findMany({
      where: { organizationId, userId: session.user.id, entityType: entityType as (typeof ENTITY_TYPES)[number] },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ views: views.map((v) => ({ ...v, filters: JSON.parse(v.filters) })) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const body = createSchema.parse(await req.json());

    const view = await prisma.savedView.create({
      data: {
        organizationId,
        userId: session.user.id,
        entityType: body.entityType,
        name: body.name,
        filters: JSON.stringify(body.filters),
      },
    });

    await recordAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "SavedView",
      entityId: view.id,
      newValues: { name: view.name, entityType: view.entityType },
    });

    return NextResponse.json({ ...view, filters: body.filters });
  } catch (err) {
    return handleApiError(err);
  }
}

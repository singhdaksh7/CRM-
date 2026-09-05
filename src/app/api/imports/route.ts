import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, requireSession, handleApiError } from "@/lib/api-auth";
import { createImportJobSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { runImport } from "@/lib/imports";
import { readTake, readSkip } from "@/lib/pagination";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const sp = req.nextUrl.searchParams;
    const take = readTake(sp);
    const skip = readSkip(sp);
    const entityTypeParam = sp.get("entityType");
    const ALLOWED_ENTITY_TYPES = new Set(["PROPERTIES", "LEADS", "OWNERS", "EMPLOYEES", "CONTACTS", "HOUSING_LEADS"]);
    const where = { organizationId, ...(entityTypeParam && ALLOWED_ENTITY_TYPES.has(entityTypeParam) ? { entityType: entityTypeParam as never } : {}) };
    const [jobs, total] = await Promise.all([
      prisma.importJob.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.importJob.count({ where }),
    ]);
    return NextResponse.json({ jobs, total, take, skip });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkRateLimit("import", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const body = await req.json();
    const data = createImportJobSchema.parse(body);
    if (data.entityType === "PROPERTIES") {
      throw new ApiError(400, "Property imports must use the inventory import preview and confirmation workflow");
    }

    const { job, outcomes } = await runImport({
      entityType: data.entityType,
      fileName: data.fileName,
      rows: data.rows,
      columnMapping: data.columnMapping,
      actorId: session.user.id,
      organizationId: getOrganizationId(session.user),
    });

    return NextResponse.json({ job, outcomes }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

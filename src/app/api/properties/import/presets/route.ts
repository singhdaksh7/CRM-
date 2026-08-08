import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { headerSignature } from "@/lib/inventory-import-core";

const schema = z.object({ name: z.string().trim().min(2).max(100), headers: z.array(z.string()).min(1), mapping: z.record(z.string(), z.string()) });
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]); const organizationId = getOrganizationId(session.user.id);
    const signature = req.nextUrl.searchParams.get("signature");
    const presets = await prisma.importMappingPreset.findMany({ where: { organizationId, entityType: "PROPERTIES", ...(signature ? { headerSignature: signature } : {}) }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ presets: presets.map((preset) => ({ ...preset, mapping: JSON.parse(preset.columnMapping) })) });
  } catch (error) { return handleApiError(error); }
}
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]); const organizationId = getOrganizationId(session.user.id); const data = schema.parse(await req.json());
    const preset = await prisma.importMappingPreset.create({ data: { organizationId, name: data.name, headerSignature: headerSignature(data.headers), columnMapping: JSON.stringify(data.mapping), createdById: session.user.id } });
    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}

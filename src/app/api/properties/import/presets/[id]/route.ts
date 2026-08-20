import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]); const organizationId = getOrganizationId(session.user); const { id } = await params;
    const existing = await prisma.importMappingPreset.findFirst({ where: { id, organizationId } }); if (!existing) throw new ApiError(404, "Mapping preset not found");
    const data = z.object({ name: z.string().trim().min(2).max(100) }).parse(await req.json());
    return NextResponse.json({ preset: await prisma.importMappingPreset.update({ where: { id }, data }) });
  } catch (error) { return handleApiError(error); }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]); const organizationId = getOrganizationId(session.user); const { id } = await params;
    const result = await prisma.importMappingPreset.deleteMany({ where: { id, organizationId } }); if (!result.count) throw new ApiError(404, "Mapping preset not found");
    return NextResponse.json({ success: true });
  } catch (error) { return handleApiError(error); }
}

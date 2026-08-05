import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  filters: z.record(z.string(), z.string()).optional(),
});

/** Cross-user/cross-org denial: a saved view can only be read/edited/deleted by the user who owns it, within their own organization. */
async function loadOwnedView(id: string, organizationId: string, userId: string) {
  const view = await prisma.savedView.findFirst({ where: { id, organizationId, userId } });
  if (!view) throw new ApiError(404, "Saved view not found");
  return view;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);
    const { id } = await params;
    const existing = await loadOwnedView(id, organizationId, session.user.id);
    const body = updateSchema.parse(await req.json());

    const view = await prisma.savedView.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.filters ? { filters: JSON.stringify(body.filters) } : {}),
      },
    });

    await recordAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "SavedView",
      entityId: view.id,
      oldValues: { name: existing.name },
      newValues: { name: view.name },
    });

    return NextResponse.json({ ...view, filters: JSON.parse(view.filters) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);
    const { id } = await params;
    const existing = await loadOwnedView(id, organizationId, session.user.id);

    await prisma.savedView.delete({ where: { id } });

    await recordAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "SavedView",
      entityId: id,
      oldValues: { name: existing.name },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

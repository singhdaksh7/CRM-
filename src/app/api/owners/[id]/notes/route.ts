import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { ownerNoteSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordOwnerActivity } from "@/lib/owners";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const owner = await prisma.owner.findFirst({ where: { id, organizationId } });
    if (!owner) throw new ApiError(404, "Owner not found");

    const { note } = ownerNoteSchema.parse(await req.json());

    const activity = await recordOwnerActivity({
      ownerId: id,
      type: "OWNER_NOTE_ADDED",
      description: note,
      actorId: session.user.id,
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

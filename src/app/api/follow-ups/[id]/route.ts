import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { followUpSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const existing = await prisma.followUp.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Follow-up not found");

    const body = await req.json();
    const data = followUpSchema.partial().parse(body);

    const followUp = await prisma.followUp.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        completedAt: data.status === "COMPLETED" ? new Date() : data.status ? null : undefined,
      },
    });

    if (data.status === "COMPLETED" && existing.status !== "COMPLETED" && existing.leadId) {
      await logActivity({ leadId: existing.leadId, type: "FOLLOW_UP_COMPLETED", description: "Follow-up marked completed", actorId: session.user.id });
    }

    return NextResponse.json({ followUp });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { paymentSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { updatePaymentStatus } from "@/lib/payments";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const payment = await prisma.payment.findFirst({
      where: { id, organizationId },
      include: { deal: { select: { id: true, dealCode: true } }, documents: true },
    });
    if (!payment) throw new ApiError(404, "Payment not found");
    return NextResponse.json({ payment });
  } catch (err) {
    return handleApiError(err);
  }
}

const paymentUpdateSchema = paymentSchema.partial().extend({
  status: z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.payment.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Payment not found");

    const body = await req.json();
    const { status, dueDate, ...data } = paymentUpdateSchema.parse(body);

    let payment = await prisma.payment.update({
      where: { id },
      data: {
        ...data,
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
    });

    if (status && status !== existing.status) {
      payment = await updatePaymentStatus({ paymentId: id, status, actorId: session.user.id, organizationId });
    } else {
      await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "Payment", entityId: id, oldValues: existing, newValues: data });
    }

    return NextResponse.json({ payment });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.payment.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Payment not found");

    const payment = await prisma.payment.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({ userId: session.user.id, action: "DELETE", entityType: "Payment", entityId: id, oldValues: existing });

    return NextResponse.json({ payment });
  } catch (err) {
    return handleApiError(err);
  }
}

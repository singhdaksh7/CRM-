import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { paymentSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { assertPaymentWithinOutstandingBalance, generateReceiptNumber } from "@/lib/payments";
import { recordDealActivity } from "@/lib/deals";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const deal = await prisma.deal.findFirst({ where: { id, organizationId } });
    if (!deal) throw new ApiError(404, "Deal not found");

    const payments = await prisma.payment.findMany({ where: { dealId: id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ payments });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkRateLimit("payment", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const deal = await prisma.deal.findFirst({ where: { id, organizationId } });
    if (!deal) throw new ApiError(404, "Deal not found");

    const body = await req.json();
    const data = paymentSchema.parse(body);

    if (data.status === "PAID") {
      await assertPaymentWithinOutstandingBalance({ dealId: id, amount: data.amount, direction: data.direction });
    }

    let payment;
    for (let attempt = 0; attempt < 5; attempt++) {
      const receiptNumber = data.status === "PAID" ? await generateReceiptNumber() : null;
      try {
        payment = await prisma.payment.create({
          data: {
            organizationId,
            dealId: id,
            direction: data.direction,
            amount: data.amount,
            method: data.method,
            status: data.status,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            paidAt: data.status === "PAID" ? new Date(data.paidAt ?? Date.now()) : null,
            receiptNumber,
            referenceNote: data.referenceNote,
            recordedById: session.user.id,
          },
        });
        break;
      } catch (err) {
        const isReceiptConflict = err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002";
        if (isReceiptConflict && attempt < 4) continue;
        throw err;
      }
    }
    if (!payment) throw new ApiError(500, "Failed to allocate a unique receipt number");

    if (data.status === "PAID") {
      await recordDealActivity({
        dealId: id,
        type: "PAYMENT_RECORDED",
        description: `Payment of ₹${payment.amount} recorded as PAID (receipt ${payment.receiptNumber}) on deal ${deal.dealCode}`,
        actorId: session.user.id,
        metadata: { paymentId: payment.id, amount: payment.amount, receiptNumber: payment.receiptNumber },
      });
    }

    await recordAudit({ userId: session.user.id, action: "CREATE", entityType: "Payment", entityId: payment.id, newValues: data });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

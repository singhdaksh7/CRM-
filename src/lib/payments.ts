import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { recordDealActivity } from "./deals";
import { recordAudit } from "./audit";
import { Prisma, type PaymentStatus } from "@prisma/client";
import { checkOverpayment } from "./payments-calc";
import { logger } from "./logger";
import { runAutomationRules } from "./automation-rules";

/** Sequential, human-readable receipt numbers, e.g. RCPT-00001. Only assigned once a payment is marked PAID. */
export async function generateReceiptNumber(): Promise<string> {
  const count = await prisma.payment.count({ where: { receiptNumber: { not: null } } });
  return `RCPT-${String(count + 1).padStart(5, "0")}`;
}

const isUniqueConstraintError = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * Marks a payment PAID and assigns a receipt number. `receiptNumber` is
 * generated from a COUNT, so two concurrent "mark PAID" requests can compute
 * the same next number - the column's @unique constraint then rejects the
 * loser, which we catch and retry with a freshly recomputed number (bounded
 * retries; SQLite/Postgres both serialize this fine at low concurrency).
 */
export async function updatePaymentStatus(params: {
  paymentId: string;
  status: PaymentStatus;
  actorId: string;
  organizationId: string;
  paidAt?: Date | null;
}) {
  const organizationId = params.organizationId;
  const payment = await prisma.payment.findFirst({ where: { id: params.paymentId, organizationId }, include: { deal: true } });
  if (!payment) throw new ApiError(404, "Payment not found");

  const isNowPaid = params.status === "PAID" && payment.status !== "PAID";
  if (isNowPaid) {
    await assertPaymentWithinOutstandingBalance({ dealId: payment.dealId, amount: payment.amount, direction: payment.direction, excludePaymentId: payment.id });
  }

  let updated;
  for (let attempt = 0; attempt < 5; attempt++) {
    const receiptNumber = isNowPaid && !payment.receiptNumber ? await generateReceiptNumber() : payment.receiptNumber;
    try {
      updated = await prisma.payment.update({
        where: { id: params.paymentId },
        data: {
          status: params.status,
          paidAt: params.status === "PAID" ? params.paidAt ?? new Date() : payment.paidAt,
          receiptNumber,
        },
      });
      break;
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < 4) continue;
      throw err;
    }
  }
  if (!updated) throw new ApiError(500, "Failed to allocate a unique receipt number");

  if (isNowPaid) {
    await recordDealActivity({
      dealId: payment.dealId,
      type: "PAYMENT_RECEIVED",
      description: `Payment of ₹${payment.amount} recorded as PAID (receipt ${updated.receiptNumber}) on deal ${payment.deal.dealCode}`,
      actorId: params.actorId,
      metadata: { paymentId: payment.id, amount: payment.amount, receiptNumber: updated.receiptNumber },
    });
    logger.info("payment_marked_paid", { paymentId: payment.id, dealId: payment.dealId, amount: payment.amount, receiptNumber: updated.receiptNumber, actorId: params.actorId });
    await runAutomationRules({ trigger: "PAYMENT_RECEIVED", paymentId: payment.id, dealId: payment.dealId, organizationId });
  }

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Payment",
    entityId: params.paymentId,
    oldValues: { status: payment.status },
    newValues: { status: params.status, receiptNumber: updated.receiptNumber },
  });

  return updated;
}

export async function computeDealOutstandingBalance(dealId: string): Promise<{ totalPaid: number; outstandingBalance: number }> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { payments: true } });
  if (!deal) throw new ApiError(404, "Deal not found");
  const totalPaid = deal.payments.filter((p) => p.status === "PAID" && p.direction === "RECEIVABLE").reduce((sum, p) => sum + p.amount, 0);
  const outstandingBalance = Math.max((deal.brokerageAmount ?? 0) - totalPaid, 0);
  return { totalPaid, outstandingBalance };
}

/**
 * Rejects a RECEIVABLE payment that would push total PAID collections past
 * the deal's brokerage amount. `excludePaymentId` lets a status-update on an
 * existing payment re-check itself without double counting its own row.
 */
export async function assertPaymentWithinOutstandingBalance(params: {
  dealId: string;
  amount: number;
  direction: "RECEIVABLE" | "PAYABLE";
  excludePaymentId?: string;
}) {
  const deal = await prisma.deal.findUnique({ where: { id: params.dealId }, include: { payments: true } });
  if (!deal) return;

  const alreadyPaid = deal.payments
    .filter((p) => p.status === "PAID" && p.direction === "RECEIVABLE" && p.id !== params.excludePaymentId)
    .reduce((sum, p) => sum + p.amount, 0);

  const result = checkOverpayment({ brokerageAmount: deal.brokerageAmount, alreadyPaid, amount: params.amount, direction: params.direction });
  if (!result.allowed) throw new ApiError(400, result.reason!);
}

/**
 * Pure payment/outstanding-balance math - no I/O, safe to unit test without
 * a database or next-auth (see brokerage-calc.ts for the same pattern).
 */
export function computeOutstanding(brokerageAmount: number, alreadyPaid: number): number {
  return Math.max(brokerageAmount - alreadyPaid, 0);
}

export interface OverpaymentCheck {
  allowed: boolean;
  outstandingBeforePayment: number;
  reason?: string;
}

/** A RECEIVABLE payment is rejected if it would push total PAID collections past the deal's brokerage amount. */
export function checkOverpayment(params: { brokerageAmount: number | null; alreadyPaid: number; amount: number; direction: "RECEIVABLE" | "PAYABLE" }): OverpaymentCheck {
  if (params.direction !== "RECEIVABLE" || params.brokerageAmount === null) {
    return { allowed: true, outstandingBeforePayment: params.brokerageAmount === null ? Infinity : computeOutstanding(params.brokerageAmount, params.alreadyPaid) };
  }
  const outstandingBeforePayment = computeOutstanding(params.brokerageAmount, params.alreadyPaid);
  if (params.amount > outstandingBeforePayment) {
    return {
      allowed: false,
      outstandingBeforePayment,
      reason: `Payment of ₹${params.amount} would exceed the outstanding balance of ₹${outstandingBeforePayment}`,
    };
  }
  return { allowed: true, outstandingBeforePayment };
}

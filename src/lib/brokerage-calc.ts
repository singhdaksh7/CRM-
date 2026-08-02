import type { BrokerageType } from "@prisma/client";

export interface BrokerageInput {
  type: BrokerageType;
  baseAmount: number; // monthly rent for RENTAL, sale price for SALE
  brokeragePct?: number | null; // % of baseAmount. RENTAL commonly one month's rent (~100%); SALE commonly 1-2%.
  splitPct?: number | null; // % of gross brokerage shared with another broker
  discountPct?: number | null; // % discount off gross brokerage given to the client
  taxPct?: number | null; // GST etc, applied on the post-discount, post-split brokerage
  employeeIncentivePct?: number | null; // % of net brokerage paid out as employee incentive
}

export interface BrokerageResult {
  grossBrokerage: number;
  splitAmount: number;
  discountAmount: number;
  taxAmount: number;
  netBrokerage: number;
  employeeIncentiveAmount: number;
}

function round(amount: number): number {
  return Math.round(amount);
}

/**
 * Pure brokerage calculator - no I/O, fully deterministic, safe to unit test
 * without pulling in next-auth (kept out of brokerage.ts on purpose - see
 * that file's top comment / catalogue-dto.ts for the same pattern).
 *
 * Order of operations: gross -> subtract broker split -> subtract discount ->
 * add tax -> net. Employee incentive is computed as a % of net brokerage and
 * is informational (it does not reduce netBrokerage - it is paid out of it).
 */
export function calculateBrokerage(input: BrokerageInput): BrokerageResult {
  if (input.baseAmount <= 0) throw new Error("Base amount must be positive");

  const brokeragePct = input.brokeragePct ?? (input.type === "SALE" ? 2 : 100);
  const grossBrokerage = round(input.baseAmount * (brokeragePct / 100));

  const splitAmount = input.splitPct ? round(grossBrokerage * (input.splitPct / 100)) : 0;
  const afterSplit = grossBrokerage - splitAmount;

  const discountAmount = input.discountPct ? round(afterSplit * (input.discountPct / 100)) : 0;
  const afterDiscount = afterSplit - discountAmount;

  const taxAmount = input.taxPct ? round(afterDiscount * (input.taxPct / 100)) : 0;
  const netBrokerage = afterDiscount + taxAmount;

  const employeeIncentiveAmount = input.employeeIncentivePct ? round(netBrokerage * (input.employeeIncentivePct / 100)) : 0;

  return { grossBrokerage, splitAmount, discountAmount, taxAmount, netBrokerage, employeeIncentiveAmount };
}

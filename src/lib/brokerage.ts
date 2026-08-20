import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { calculateBrokerage, type BrokerageInput } from "./brokerage-calc";

export { calculateBrokerage };
export type { BrokerageInput, BrokerageResult } from "./brokerage-calc";

export async function recordBrokerageCalculation(params: {
  dealId: string;
  actorId: string;
  organizationId: string;
  input: BrokerageInput;
  splitWithUserId?: string | null;
  employeeId?: string | null;
  notes?: string | null;
}) {
  const organizationId = params.organizationId;
  const deal = await prisma.deal.findFirst({ where: { id: params.dealId, organizationId } });
  if (!deal) throw new ApiError(404, "Deal not found");

  let result;
  try {
    result = calculateBrokerage(params.input);
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : "Invalid brokerage input");
  }

  const calculation = await prisma.brokerageCalculation.create({
    data: {
      organizationId,
      dealId: params.dealId,
      type: params.input.type,
      baseAmount: params.input.baseAmount,
      brokeragePct: params.input.brokeragePct ?? null,
      grossBrokerage: result.grossBrokerage,
      splitPct: params.input.splitPct ?? null,
      splitWithUserId: params.splitWithUserId ?? null,
      splitAmount: result.splitAmount,
      discountPct: params.input.discountPct ?? null,
      discountAmount: result.discountAmount,
      taxPct: params.input.taxPct ?? null,
      taxAmount: result.taxAmount,
      netBrokerage: result.netBrokerage,
      employeeIncentivePct: params.input.employeeIncentivePct ?? null,
      employeeIncentiveAmount: result.employeeIncentiveAmount,
      employeeId: params.employeeId ?? null,
      notes: params.notes ?? null,
      calculatedById: params.actorId,
    },
  });

  await prisma.deal.update({
    where: { id: params.dealId },
    data: { brokerageAmount: result.netBrokerage, brokeragePct: params.input.brokeragePct ?? null },
  });

  return calculation;
}

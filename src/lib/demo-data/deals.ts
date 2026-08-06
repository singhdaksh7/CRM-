import type { Deal, DealStage, Lead, Owner, Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { calculateBrokerage } from "../brokerage-calc";
import { demoId, demoCode, DEMO_ORGANIZATION_ID } from "./constants";

/** Not one of the task's explicit counts - kept small, exists only to give "Payment Pending" and dashboard revenue numbers something real to show. */
export const DEAL_COUNT = 12;

const STAGE_WEIGHTS: [DealStage, number][] = [
  ["INQUIRY", 6], ["NEGOTIATION", 5], ["AGREEMENT", 3], ["TOKEN_RECEIVED", 2],
  ["DOCUMENTATION", 2], ["REGISTRATION", 2], ["CLOSED_WON", 6], ["CLOSED_LOST", 4],
];
/**
 * Deal.lostReasonCategory (a Phase 3 "brokerage intelligence dashboard"
 * field) is not present on this branch's schema - lostReason (a plain
 * string, already on this branch) carries the same information without it.
 */
const LOST_REASONS = [
  "Price - client found a cheaper option.",
  "Location - client chose a different area.",
  "Competition - lost to another broker.",
  "Budget - client's budget changed.",
  "Loan rejected by the bank.",
  "Owner issue - owner withdrew or changed terms.",
  "Client no longer interested.",
  "Other reason.",
];

export interface DemoDealSet {
  all: Deal[];
  staleNegotiationScenarioId: string;
  overduePaymentScenarioId: string;
}

export async function createDemoDeals(
  rng: Rng,
  leads: Lead[],
  properties: Property[],
  owners: Owner[],
  employees: { admin: User; dataManagers: User[]; fieldExecutives: User[] },
  count: number = DEAL_COUNT
): Promise<DemoDealSet> {
  const deals: Deal[] = [];
  const staffAll = [employees.admin, ...employees.dataManagers];

  for (let i = 1; i <= count; i++) {
    const lead = leads[(i * 11) % leads.length];
    const property = properties[(i * 13) % properties.length];
    const owner = owners[(i * 17) % owners.length];
    const assignedTo = rng.pick(employees.fieldExecutives);
    const creator = rng.pick(staffAll);

    // notifyStaleNegotiations: stage NEGOTIATION, status OPEN, updatedAt > 7 days ago, leadId set.
    const isStaleNegotiationScenario = i === 1;
    const stage: DealStage = isStaleNegotiationScenario ? "NEGOTIATION" : rng.weightedPick(STAGE_WEIGHTS);
    const isSale = property.listingType === "SALE";
    const baseAmount = isSale ? property.salePrice ?? 5000000 : property.monthlyRent ?? 20000;
    const status: Deal["status"] = stage === "CLOSED_WON" ? "WON" : stage === "CLOSED_LOST" ? "LOST" : "OPEN";
    const updatedAt = isStaleNegotiationScenario ? rng.pastDate(9, 14) : rng.pastDate(0, 6);

    const deal = await prisma.deal.create({
      data: {
        id: demoId("deal", i),
        organizationId: DEMO_ORGANIZATION_ID,
        dealCode: demoCode("DEAL", i),
        dealType: isSale ? "SALE" : "RENTAL",
        stage,
        status,
        leadId: lead.id,
        propertyId: property.id,
        ownerId: owner.id,
        agreedAmount: baseAmount,
        assignedToId: assignedTo.id,
        expectedCloseDate: rng.daysFromNow(rng.int(5, 30)),
        closedAt: status !== "OPEN" ? rng.pastDate(0, 5) : null,
        lostReason: status === "LOST" ? rng.pick(LOST_REASONS) : null,
        notes: rng.bool(0.4) ? "Client is in active negotiation on final price." : null,
        createdById: creator.id,
        updatedAt,
      },
    });
    deals.push(deal);

    await prisma.activity.create({
      data: { dealId: deal.id, type: "DEAL_CREATED", description: `Deal ${deal.dealCode} created`, actorId: creator.id },
    });

    if (status === "WON") {
      const brokeragePct = isSale ? rng.pick([1, 1.5, 2]) : 100;
      const brokerage = calculateBrokerage({ type: isSale ? "SALE" : "RENTAL", baseAmount, brokeragePct, taxPct: 18 });
      await prisma.brokerageCalculation.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          dealId: deal.id,
          type: isSale ? "SALE" : "RENTAL",
          baseAmount,
          brokeragePct,
          grossBrokerage: brokerage.grossBrokerage,
          taxPct: 18,
          taxAmount: brokerage.taxAmount,
          netBrokerage: brokerage.netBrokerage,
          calculatedById: creator.id,
        },
      });
      await prisma.deal.update({ where: { id: deal.id }, data: { brokerageAmount: brokerage.netBrokerage, brokeragePct } });
      await prisma.activity.create({
        data: { dealId: deal.id, type: "DEAL_WON", description: `Deal ${deal.dealCode} closed won`, actorId: assignedTo.id },
      });

      // notifyOverduePayments scenario: a PENDING payment whose dueDate is already in the past.
      const isOverduePaymentScenario = i === 2;
      const half = Math.round(brokerage.netBrokerage / 2);
      await prisma.payment.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          dealId: deal.id,
          direction: "RECEIVABLE",
          amount: half,
          method: "BANK_TRANSFER",
          status: "PAID",
          paidAt: rng.pastDate(0, 5),
          receiptNumber: `DEMO-RCPT-${String(i).padStart(5, "0")}`,
          recordedById: creator.id,
        },
      });
      await prisma.payment.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          dealId: deal.id,
          direction: "RECEIVABLE",
          amount: brokerage.netBrokerage - half,
          method: "UPI",
          status: isOverduePaymentScenario ? "PENDING" : rng.pick(["PENDING", "PAID"] as const),
          dueDate: isOverduePaymentScenario ? rng.pastDate(3, 10) : rng.daysFromNow(rng.int(3, 14)),
          recordedById: creator.id,
        },
      });
    } else if (status === "LOST") {
      await prisma.activity.create({
        data: { dealId: deal.id, type: "DEAL_LOST", description: `Deal ${deal.dealCode} closed lost`, actorId: assignedTo.id },
      });
    }
  }

  return {
    all: deals,
    staleNegotiationScenarioId: demoId("deal", 1),
    overduePaymentScenarioId: demoId("deal", 2),
  };
}

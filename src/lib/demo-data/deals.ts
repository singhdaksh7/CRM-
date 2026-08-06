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
/** Paired 1:1 by index with LOST_REASON_CATEGORIES so seeded deals get both a human-readable lostReason and a matching lostReasonCategory (Phase 3 field, reconciled back in after the merge with main - main's schema predates it). */
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
const LOST_REASON_CATEGORIES: NonNullable<Deal["lostReasonCategory"]>[] = ["PRICE", "LOCATION", "COMPETITION", "BUDGET", "LOAN_REJECTED", "OWNER_ISSUE", "CLIENT_NOT_INTERESTED", "OTHER"];

export interface DemoDealSet {
  all: Deal[];
  staleNegotiationScenarioId: string;
  overduePaymentScenarioId: string;
  /** Deal #3 - always CLOSED_WON with a normal (non-overdue) fully-recorded payment pair, so Brokerage Analytics / Owner Dashboard "Brokerage Received" always has real, non-edge-case data to show - not left to the weighted-random stage draw, which can (and on at least one production run, did) land zero deals on CLOSED_WON out of 10. */
  wonDealScenarioId: string;
  /** Deal #4 - always CLOSED_LOST with a deterministic lostReasonCategory, so Lost Deal Analysis always has real data - same rationale as wonDealScenarioId. */
  lostDealScenarioId: string;
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
    // notifyOverduePayments scenario: a PENDING payment whose dueDate is already in the past - requires this deal to actually be WON (payments only exist on WON deals below), so the stage is forced here rather than left to chance.
    const isOverduePaymentScenario = i === 2;
    // Guarantees at least one "normal" WON deal (full, non-overdue payment pair) so Brokerage Analytics / Owner Dashboard always have real collected-brokerage data, regardless of how the weighted-random draw below happens to land.
    const isGuaranteedWonScenario = i === 3;
    // Guarantees at least one LOST deal (with a deterministic lostReasonCategory) so Lost Deal Analysis always has real data to show.
    const isGuaranteedLostScenario = i === 4;
    const stage: DealStage = isStaleNegotiationScenario
      ? "NEGOTIATION"
      : isOverduePaymentScenario || isGuaranteedWonScenario
        ? "CLOSED_WON"
        : isGuaranteedLostScenario
          ? "CLOSED_LOST"
          : rng.weightedPick(STAGE_WEIGHTS);
    const isSale = property.listingType === "SALE";
    const baseAmount = isSale ? property.salePrice ?? 5000000 : property.monthlyRent ?? 20000;
    const status: Deal["status"] = stage === "CLOSED_WON" ? "WON" : stage === "CLOSED_LOST" ? "LOST" : "OPEN";
    const updatedAt = isStaleNegotiationScenario ? rng.pastDate(9, 14) : rng.pastDate(0, 6);
    // Single shared index so lostReason and lostReasonCategory stay semantically paired (e.g. both "Price" / PRICE), rather than two independent rng.pick() calls landing on unrelated reasons. Deterministic (not rng-drawn) for the guaranteed-lost scenario so it's always PRICE, matching a believable "lost to a cheaper option" story.
    const lostReasonIndex = status === "LOST" ? (isGuaranteedLostScenario ? 0 : rng.int(0, LOST_REASONS.length - 1)) : -1;

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
        lostReason: status === "LOST" ? LOST_REASONS[lostReasonIndex] : null,
        lostReasonCategory: status === "LOST" ? LOST_REASON_CATEGORIES[lostReasonIndex] : null,
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
    wonDealScenarioId: demoId("deal", 3),
    lostDealScenarioId: demoId("deal", 4),
  };
}

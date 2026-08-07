import type { DealStage, DealStatus } from "@prisma/client";

/** Terminal stages close the deal's status/closedAt automatically. Pure - no I/O, safe to unit test. */
const TERMINAL_STAGES: Partial<Record<DealStage, "WON" | "LOST">> = {
  CLOSED_WON: "WON",
  CLOSED_LOST: "LOST",
};

export function terminalStatusFor(stage: DealStage): "WON" | "LOST" | null {
  return TERMINAL_STAGES[stage] ?? null;
}

export function isDealOpenForTransition(status: DealStatus): boolean {
  return status === "OPEN";
}

export interface StageTransitionCheck {
  allowed: boolean;
  reason?: string;
}

const ORDER: DealStage[] = ["INQUIRY", "NEGOTIATION", "AGREEMENT", "TOKEN_RECEIVED", "DOCUMENTATION", "REGISTRATION", "CLOSED_WON"];
/** Prevents backwards/terminal transitions while preserving legacy intermediate stages. */
export function validateStageTransition(params: { currentStatus: DealStatus; currentStage?: DealStage; nextStage: DealStage; lostReason?: string | null }): StageTransitionCheck {
  if (!isDealOpenForTransition(params.currentStatus)) {
    return { allowed: false, reason: `Deal is already ${params.currentStatus.toLowerCase()} and cannot change stage` };
  }
  if (params.nextStage === "CLOSED_LOST" && !params.lostReason) {
    return { allowed: false, reason: "lostReason is required when moving a deal to CLOSED_LOST" };
  }
  if (params.currentStage && params.nextStage !== "CLOSED_LOST" && ORDER.indexOf(params.nextStage) < ORDER.indexOf(params.currentStage)) return { allowed: false, reason: "Deal stages cannot move backwards" };
  return { allowed: true };
}

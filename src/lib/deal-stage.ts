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

/** Validates a proposed stage change against the deal's current status (not the stage itself - any stage->stage move is allowed while OPEN, matching a flexible real-world pipeline). */
export function validateStageTransition(params: { currentStatus: DealStatus; nextStage: DealStage; lostReason?: string | null }): StageTransitionCheck {
  if (!isDealOpenForTransition(params.currentStatus)) {
    return { allowed: false, reason: `Deal is already ${params.currentStatus.toLowerCase()} and cannot change stage` };
  }
  if (params.nextStage === "CLOSED_LOST" && !params.lostReason) {
    return { allowed: false, reason: "lostReason is required when moving a deal to CLOSED_LOST" };
  }
  return { allowed: true };
}

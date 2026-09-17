import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import type { Prisma } from "@prisma/client";
import {
  CALL_OUTCOME_LABELS,
  outcomeRequiresCallback,
  outcomeRequiresVisitExpected,
  outcomeRequiresLostReason,
  outcomeRequiresNote,
  type CallOutcome,
} from "./dm-call-outcomes";

export interface RecordCallInput {
  leadId: string;
  organizationId: string;
  actorId: string;
  spokeWithCustomer: boolean;
  outcome: CallOutcome;
  callbackDate?: string | null; // "YYYY-MM-DD", interpreted on the IST wall clock
  callbackTime?: string | null; // "HH:MM"
  note?: string | null;
  lostReasonCategory?: string | null;
  lostReasonDetail?: string | null;
}

function combineIstDateTime(date: string, time: string, label: string): Date {
  const dt = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(dt.getTime())) throw new ApiError(400, `Enter a valid ${label}`);
  return dt;
}

/**
 * simplified-data-manager-workflow - the single orchestration point for the
 * "Record Call" popup. Atomically (one prisma $transaction, so a client
 * never sees a half-applied result):
 *   1. Logs one Activity (type PHONE_CALL_MADE - the same type the existing
 *      manual Interaction Composer already uses for a logged call) - this
 *      is what removes a lead from "Pending Calls" (see src/lib/dm-queues.ts).
 *   2. Creates or reschedules the ONE active PHONE_CALL / VISIT_EXPECTED
 *      FollowUp for this lead (never a second, duplicate row - upsertFollowUp
 *      below always reuses an existing PENDING/OVERDUE row of the same type).
 *   3. Applies the same NOT_INTERESTED + lostReasonCategory rule the lead
 *      workspace's status dropdown already enforces (PATCH /api/leads/[id]).
 *   4. Bumps a still-NEW lead to CONTACTED - the canonical "first contact
 *      made" transition already recognised elsewhere (LeadStatus.CONTACTED).
 *   5. Sets Lead.lastContactedAt only when the customer was actually reached
 *      (spokeWithCustomer) - an unanswered attempt is not "contact" for the
 *      scoring/health modules that already read this field.
 *
 * No schema change: every write targets an existing model/column.
 */
export async function recordCall(input: RecordCallInput) {
  const needsCallback = outcomeRequiresCallback(input.outcome);
  const needsVisitExpected = outcomeRequiresVisitExpected(input.outcome);
  const needsLostReason = outcomeRequiresLostReason(input.outcome);
  const needsNote = outcomeRequiresNote(input.outcome);

  let callbackAt: Date | null = null;
  if (needsCallback) {
    if (!input.callbackDate || !input.callbackTime) throw new ApiError(400, "Enter a callback date and time");
    callbackAt = combineIstDateTime(input.callbackDate, input.callbackTime, "callback date and time");
  } else if (needsVisitExpected) {
    if (!input.callbackDate || !input.callbackTime) throw new ApiError(400, "Enter when the customer will come");
    callbackAt = combineIstDateTime(input.callbackDate, input.callbackTime, "date and time");
  }

  if (needsLostReason) {
    if (!input.lostReasonCategory) throw new ApiError(400, "A reason is required when marking a lead Not Interested");
    if (input.lostReasonCategory === "OTHER" && !input.lostReasonDetail?.trim()) {
      throw new ApiError(400, "Please add a short detail when reason is Other");
    }
  }

  if (needsNote && !input.note?.trim()) {
    throw new ApiError(400, "Add a short comment describing what happened");
  }

  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    if (!lead || lead.organizationId !== input.organizationId) throw new ApiError(404, "Lead not found");

    const note = input.note?.trim() || null;
    const outcomeLabel = CALL_OUTCOME_LABELS[input.outcome];

    const activity = await tx.activity.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        actorId: input.actorId,
        type: "PHONE_CALL_MADE",
        description: `Call recorded — ${outcomeLabel}${note ? ` — ${note}` : ""}`,
        metadata: JSON.stringify({
          interactionType: "CALL",
          outcome: outcomeLabel,
          notes: note,
          dmCallOutcome: input.outcome,
          spokeWithCustomer: input.spokeWithCustomer,
        }),
      },
    });

    let followUp = null;
    if (needsCallback && callbackAt) {
      followUp = await upsertFollowUp(tx, {
        organizationId: input.organizationId,
        leadId: input.leadId,
        ownerId: input.actorId,
        type: "PHONE_CALL",
        dueDate: callbackAt,
        notes: note,
      });
      await tx.activity.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.leadId,
          actorId: input.actorId,
          type: "FOLLOW_UP_SCHEDULED",
          description: `Call-back scheduled for ${callbackAt.toLocaleString("en-IN")}`,
        },
      });
    } else if (needsVisitExpected && callbackAt) {
      followUp = await upsertFollowUp(tx, {
        organizationId: input.organizationId,
        leadId: input.leadId,
        ownerId: input.actorId,
        type: "VISIT_EXPECTED",
        dueDate: callbackAt,
        notes: note,
      });
      await tx.activity.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.leadId,
          actorId: input.actorId,
          type: "FOLLOW_UP_SCHEDULED",
          description: `Customer expected on ${callbackAt.toLocaleString("en-IN")}`,
        },
      });
    }

    const leadUpdate: Prisma.LeadUpdateInput = {};
    if (needsLostReason) {
      leadUpdate.status = "NOT_INTERESTED";
      leadUpdate.lostReasonCategory = input.lostReasonCategory as never;
      leadUpdate.lostReasonDetail = input.lostReasonDetail?.trim() || null;
    } else if (lead.status === "NEW") {
      leadUpdate.status = "CONTACTED";
    }
    if (input.spokeWithCustomer) {
      leadUpdate.lastContactedAt = new Date();
    }

    let updatedLead = lead;
    if (Object.keys(leadUpdate).length > 0) {
      updatedLead = await tx.lead.update({ where: { id: input.leadId }, data: leadUpdate });
      if (needsLostReason) {
        await tx.activity.create({
          data: {
            organizationId: input.organizationId,
            leadId: input.leadId,
            actorId: input.actorId,
            type: "STATUS_CHANGED",
            description: `Status changed from ${lead.status} to NOT_INTERESTED - reason: ${input.lostReasonCategory}${input.lostReasonDetail?.trim() ? ` (${input.lostReasonDetail.trim()})` : ""}`,
            metadata: JSON.stringify({ lostReasonCategory: input.lostReasonCategory, lostReasonDetail: input.lostReasonDetail?.trim() || null }),
          },
        });
      }
    }

    return { activity, followUp, lead: updatedLead };
  });
}

/** Reuses the SAME active row rather than creating a second one - a lead never ends up with two open PHONE_CALL (or two open VISIT_EXPECTED) follow-ups from repeated Record Call submissions. */
async function upsertFollowUp(
  tx: Prisma.TransactionClient,
  params: { organizationId: string; leadId: string; ownerId: string; type: "PHONE_CALL" | "VISIT_EXPECTED"; dueDate: Date; notes: string | null }
) {
  const existing = await tx.followUp.findFirst({
    where: { organizationId: params.organizationId, leadId: params.leadId, type: params.type, status: { in: ["PENDING", "OVERDUE"] } },
    orderBy: { dueDate: "asc" },
  });
  if (existing) {
    return tx.followUp.update({
      where: { id: existing.id },
      data: { dueDate: params.dueDate, notes: params.notes ?? existing.notes, status: "PENDING", ownerId: params.ownerId },
    });
  }
  return tx.followUp.create({
    data: {
      organizationId: params.organizationId,
      leadId: params.leadId,
      ownerId: params.ownerId,
      type: params.type,
      dueDate: params.dueDate,
      notes: params.notes,
      status: "PENDING",
    },
  });
}

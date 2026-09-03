import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { prisma } from "@/lib/prisma";
import { leadInteractionSchema } from "@/lib/validators";

const ACTIVITY_TYPES = {
  CALL: "PHONE_CALL_MADE",
  // A manual interaction log must not imply that the CRM transmitted a
  // WhatsApp message. Actual sends use their dedicated provider workflow.
  WHATSAPP: "NOTE_ADDED",
  MEETING: "NOTE_ADDED",
  OFFICE_VISIT: "NOTE_ADDED",
  OTHER: "NOTE_ADDED",
} as const;

/**
 * Records a broker's internal CRM interaction. This endpoint deliberately
 * performs no external WhatsApp/call action; those have their own explicit
 * workflows and consent/audit controls.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: leadId } = await params;
    const interaction = leadInteractionSchema.parse(await req.json());
    const lead = await assertLeadAccessible(session, leadId);
    const label = interaction.type.replace(/_/g, " ").toLowerCase();
    const details = [interaction.outcome && `Outcome: ${interaction.outcome}`, interaction.notes].filter(Boolean).join(" · ");
    const activity = await prisma.activity.create({
      data: {
        organizationId: lead.organizationId,
        leadId: lead.id,
        actorId: session.user.id,
        type: ACTIVITY_TYPES[interaction.type],
        description: `Internal ${label} logged${details ? ` — ${details}` : ""}`,
        metadata: JSON.stringify({ interactionType: interaction.type, outcome: interaction.outcome ?? null, notes: interaction.notes ?? null }),
      },
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

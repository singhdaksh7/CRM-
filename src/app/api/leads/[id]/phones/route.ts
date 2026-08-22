import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { assertLeadAccessible } from "@/lib/lead-access";
import { addLeadPhone, listLeadPhones } from "@/lib/lead-phones";
import { logActivity } from "@/lib/activity";
import { z } from "zod";

const addPhoneSchema = z.object({
  phone: z.string().min(1),
  type: z.enum(["PRIMARY", "ALTERNATE"]).optional(),
  label: z.string().trim().max(100).optional(),
});

/** GET/POST additional phone numbers for a lead (spec item 5). Same access rule as every other per-lead route: assertLeadAccessible. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);
    const phones = await listLeadPhones(organizationId, id);
    return NextResponse.json({ phones });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    const lead = await assertLeadAccessible(session, id);
    // Writes stay stricter than the read-only "Unassigned Leads" browsing tab:
    // a field executive may add a phone number only to a lead already
    // assigned to them, not to an org-wide unassigned lead.
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const body = addPhoneSchema.parse(await req.json());
    const organizationId = getOrganizationId(session.user);
    const created = await addLeadPhone({
      organizationId,
      leadId: id,
      phone: body.phone,
      type: body.type,
      label: body.label ?? null,
      createdById: session.user.id,
    });

    await logActivity({ leadId: id, type: "NOTE_ADDED", description: `Added ${created.type === "PRIMARY" ? "primary" : "alternate"} phone number ${created.phone}${body.label ? ` (${body.label})` : ""}`, actorId: session.user.id });

    return NextResponse.json({ phone: created }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

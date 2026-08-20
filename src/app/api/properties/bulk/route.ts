import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { bulkUpdatePropertyAvailability, bulkVerifyPropertyOwners, bulkAddPropertyTags, bulkManageInventory } from "@/lib/bulk-operations";
import { z } from "zod";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("AVAILABILITY"), ids: z.array(z.string()).min(1).max(500), status: z.enum(["AVAILABLE", "RESERVED", "RENTED", "SOLD", "INACTIVE"]) }),
  z.object({ action: z.literal("VERIFY"), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("ADD_TAGS"), ids: z.array(z.string()).min(1), tags: z.array(z.string().trim().min(1)).min(1) }),
  z.object({ action: z.literal("PARTNER"), ids: z.array(z.string()).min(1).max(500), partnerId: z.string().min(1) }),
  z.object({ action: z.literal("NEEDS_VERIFICATION"), ids: z.array(z.string()).min(1).max(500) }),
  z.object({ action: z.literal("LOCALITY"), ids: z.array(z.string()).min(1).max(500), area: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("PRICE"), ids: z.array(z.string()).min(1).max(500), priceMode: z.enum(["SET", "PERCENT"]), priceValue: z.number().finite().refine((value) => value !== 0) }),
]);

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const body = bulkSchema.parse(await req.json());

    switch (body.action) {
      case "AVAILABILITY":
        return NextResponse.json(await bulkUpdatePropertyAvailability(body.ids, body.status as never, organizationId, session.user.id));
      case "VERIFY":
        return NextResponse.json(await bulkVerifyPropertyOwners(body.ids, organizationId, session.user.id));
      case "ADD_TAGS":
        return NextResponse.json(await bulkAddPropertyTags(body.ids, body.tags, organizationId, session.user.id));
      case "PARTNER": case "NEEDS_VERIFICATION": case "LOCALITY": case "PRICE":
        return NextResponse.json(await bulkManageInventory({ ...body, organizationId, actorUserId: session.user.id }));
    }
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { bulkUpdatePropertyAvailability, bulkVerifyPropertyOwners, bulkAddPropertyTags } from "@/lib/bulk-operations";
import { z } from "zod";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("AVAILABILITY"), ids: z.array(z.string()).min(1), status: z.string() }),
  z.object({ action: z.literal("VERIFY"), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("ADD_TAGS"), ids: z.array(z.string()).min(1), tags: z.array(z.string().trim().min(1)).min(1) }),
]);

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const body = bulkSchema.parse(await req.json());

    switch (body.action) {
      case "AVAILABILITY":
        return NextResponse.json(await bulkUpdatePropertyAvailability(body.ids, body.status as never, organizationId, session.user.id));
      case "VERIFY":
        return NextResponse.json(await bulkVerifyPropertyOwners(body.ids, organizationId, session.user.id));
      case "ADD_TAGS":
        return NextResponse.json(await bulkAddPropertyTags(body.ids, body.tags, organizationId, session.user.id));
    }
  } catch (err) {
    return handleApiError(err);
  }
}

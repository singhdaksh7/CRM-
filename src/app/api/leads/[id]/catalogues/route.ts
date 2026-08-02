import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { createCatalogueSchema } from "@/lib/validators";
import { createCatalogue, listCataloguesForLead } from "@/lib/catalogues";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await assertLeadAccessible(session, id);

    const catalogues = await listCataloguesForLead(id);
    return NextResponse.json({ catalogues });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    await assertLeadAccessible(session, id);

    const data = createCatalogueSchema.parse(await req.json());
    const catalogue = await createCatalogue({
      leadId: id,
      createdByUserId: session.user.id,
      title: data.title,
      introMessage: data.introMessage,
      includePrice: data.includePrice,
      includeAddress: data.includeAddress,
      includeBrokerage: data.includeBrokerage,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      properties: data.properties,
    });

    return NextResponse.json({ catalogue }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { ownerVerificationSchema } from "@/lib/validators";
import { verifyOwner } from "@/lib/owners";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const body = await req.json();
    const data = ownerVerificationSchema.parse(body);

    const owner = await verifyOwner({
      ownerId: id,
      status: data.verificationStatus,
      notes: data.notes,
      actorId: session.user.id,
    });

    return NextResponse.json({ owner });
  } catch (err) {
    return handleApiError(err);
  }
}

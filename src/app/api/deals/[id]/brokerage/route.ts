import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { brokerageCalculationSchema } from "@/lib/validators";
import { recordBrokerageCalculation } from "@/lib/brokerage";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const body = await req.json();
    const data = brokerageCalculationSchema.parse(body);

    const calculation = await recordBrokerageCalculation({
      dealId: id,
      actorId: session.user.id,
      input: data,
      splitWithUserId: data.splitWithUserId,
      employeeId: data.employeeId,
      notes: data.notes,
    });

    return NextResponse.json({ calculation }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

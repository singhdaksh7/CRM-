import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const leadId = req.nextUrl.searchParams.get("leadId");
    const activities = await prisma.activity.findMany({
      where: leadId ? { leadId } : undefined,
      include: { actor: true, lead: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ activities });
  } catch (err) {
    return handleApiError(err);
  }
}

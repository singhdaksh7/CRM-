import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";

const RECENTLY_VIEWED_LIMIT = 20;
// Over-fetch raw log rows (a user may view the same property repeatedly)
// then de-duplicate by propertyId in memory, keeping the most recent view -
// bounded, never an unbounded scan.
const RAW_FETCH_LIMIT = 100;

export async function GET() {
  try {
    const session = await requireSession();
    const logs = await prisma.propertyViewLog.findMany({
      where: { userId: session.user.id },
      orderBy: { viewedAt: "desc" },
      take: RAW_FETCH_LIMIT,
      include: { property: { select: { id: true, title: true, area: true, propertyCode: true, coverImage: true, status: true, monthlyRent: true, salePrice: true, listingType: true } } },
    });

    const seen = new Set<string>();
    const recentlyViewed: typeof logs[number]["property"][] = [];
    for (const log of logs) {
      if (seen.has(log.propertyId)) continue;
      seen.add(log.propertyId);
      recentlyViewed.push(log.property);
      if (recentlyViewed.length >= RECENTLY_VIEWED_LIMIT) break;
    }

    return NextResponse.json({ recentlyViewed });
  } catch (err) {
    return handleApiError(err);
  }
}

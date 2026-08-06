import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";

export async function GET() {
  try {
    const session = await requireSession();
    const favorites = await prisma.propertyFavorite.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { property: { select: { id: true, title: true, area: true, propertyCode: true, coverImage: true, status: true, monthlyRent: true, salePrice: true, listingType: true } } },
    });
    return NextResponse.json({ favorites: favorites.map((f) => f.property) });
  } catch (err) {
    return handleApiError(err);
  }
}

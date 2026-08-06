import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { createPropertySchema } from "@/lib/validators";
import { generateCode } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = {};

    const q = sp.get("q");
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { area: { contains: q } },
        { address: { contains: q } },
        { propertyCode: { contains: q } },
      ];
    }
    const listingType = sp.get("listingType");
    if (listingType) where.listingType = listingType;
    const status = sp.get("status");
    if (status) where.status = status;
    const area = sp.get("area");
    if (area) where.area = area;
    const bhk = sp.get("bhk");
    if (bhk) where.bhk = Number(bhk);
    const furnishing = sp.get("furnishing");
    if (furnishing) where.furnishing = furnishing;
    const inventorySource = sp.get("inventorySource");
    if (inventorySource) where.inventorySource = inventorySource;
    const minBudget = sp.get("minBudget");
    const maxBudget = sp.get("maxBudget");
    if (minBudget || maxBudget) {
      const priceField = listingType === "SALE" ? "salePrice" : "monthlyRent";
      where[priceField] = {
        ...(minBudget ? { gte: Number(minBudget) } : {}),
        ...(maxBudget ? { lte: Number(maxBudget) } : {}),
      };
    }

    const sort = sp.get("sort") ?? "newest";
    const orderBy =
      sort === "oldest"
        ? { createdAt: "asc" as const }
        : sort === "price_low"
        ? [{ monthlyRent: "asc" as const }, { salePrice: "asc" as const }]
        : sort === "price_high"
        ? [{ monthlyRent: "desc" as const }, { salePrice: "desc" as const }]
        : { createdAt: "desc" as const };

    const properties = await prisma.property.findMany({ where, orderBy: orderBy as never });
    return NextResponse.json({ properties });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const body = await req.json();
    const data = createPropertySchema.parse(body);
    const count = await prisma.property.count();

    const property = await prisma.property.create({
      data: {
        ...data,
        propertyCode: generateCode("PROP", count + 1),
        amenities: JSON.stringify(data.amenities),
        images: JSON.stringify(data.images),
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        createdById: session.user.id,
        // A coordinate submitted alongside a placeId came from the address
        // search's confirmed geocode result (see property-address-search.tsx)
        // - record it the same way the dedicated /geocode route would.
        ...(data.latitude != null && data.placeId ? { geocodeStatus: "SUCCESS" as const, geocodedAt: new Date() } : {}),
      },
    });
    return NextResponse.json({ property }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { propertySchema } from "@/lib/validators";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) throw new ApiError(404, "Property not found");
    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const body = await req.json();
    const { amenities, images, availableFrom, ...data } = propertySchema.partial().parse(body);
    const property = await prisma.property.update({
      where: { id },
      data: {
        ...data,
        ...(amenities ? { amenities: JSON.stringify(amenities) } : {}),
        ...(images ? { images: JSON.stringify(images) } : {}),
        ...(availableFrom !== undefined ? { availableFrom: availableFrom ? new Date(availableFrom) : null } : {}),
      },
    });
    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    await prisma.property.update({ where: { id }, data: { status: "INACTIVE" } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

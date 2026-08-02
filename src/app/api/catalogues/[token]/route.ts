import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { getCatalogueByToken, toPublicCatalogueDTO } from "@/lib/catalogues";

/** Public, unauthenticated - returns only the public-safe DTO, never the raw Prisma records. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const catalogue = await getCatalogueByToken(token);
    return NextResponse.json({ catalogue: toPublicCatalogueDTO(catalogue) });
  } catch (err) {
    return handleApiError(err);
  }
}
